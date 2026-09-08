package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/dylanferguson/envp/internal/metrics"
	"github.com/dylanferguson/envp/internal/server"
	"github.com/dylanferguson/envp/internal/store"
	"github.com/dylanferguson/envp/internal/webui"
)

var commit = "unknown"

type config struct {
	port    int
	obsPort int
	dbPath  string
	http    server.Config
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func healthcheck() int {
	cfg, err := loadConfig()
	if err != nil {
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := metrics.CheckHealth(ctx, "http://127.0.0.1:"+strconv.Itoa(cfg.obsPort)); err != nil {
		return 1
	}
	return 0
}

func loadConfig() (config, error) {
	c := config{port: 8080, obsPort: 9090, dbPath: "./data/shares.db"}
	port, err := envPort("PORT", c.port)
	if err != nil {
		return c, err
	}
	c.port = port
	obsPort, err := envPort("OBS_PORT", c.obsPort)
	if err != nil {
		return c, err
	}
	c.obsPort = obsPort
	if c.port == c.obsPort {
		return c, errors.New("OBS_PORT must differ from PORT")
	}
	if value, ok := os.LookupEnv("DB_PATH"); ok {
		if value == "" {
			return c, errors.New("DB_PATH must not be empty")
		}
		c.dbPath = value
	}
	origin, err := server.ParseOrigin(os.Getenv("PUBLIC_ORIGIN"))
	if err != nil {
		return c, err
	}
	c.http.PublicOrigin = origin
	c.http.TrustProxy = os.Getenv("TRUST_PROXY") == "true"
	return c, nil
}

func envPort(key string, fallback int) (int, error) {
	value, ok := os.LookupEnv(key)
	if !ok {
		return fallback, nil
	}
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("%s must be between 1 and 65535", key)
	}
	return port, nil
}

func run(ctx context.Context, logger *slog.Logger) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	db, err := store.Open(startup, cfg.dbPath)
	if err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			logger.Error("close database", "error", err)
		}
	}()
	id := commit
	if len(id) > 7 {
		id = id[:7]
	}
	rec, err := metrics.New(metrics.Options{DB: db.Ping, ReleaseID: id})
	if err != nil {
		return err
	}
	if n, err := db.Sweep(startup); err != nil {
		return err
	} else {
		rec.Swept(n)
	}
	handler, err := server.New(db, webui.Files(), cfg.http, logger, rec)
	if err != nil {
		return err
	}
	publicLn, err := net.Listen("tcp", net.JoinHostPort("", strconv.Itoa(cfg.port)))
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	obsLn, err := net.Listen("tcp", net.JoinHostPort("", strconv.Itoa(cfg.obsPort)))
	if err != nil {
		_ = publicLn.Close()
		return fmt.Errorf("listen obs: %w", err)
	}
	publicServer := newHTTPServer(handler, logger)
	obsServer := newHTTPServer(rec.Handler(), logger)
	maintenance, stopMaintenance := context.WithCancel(ctx)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sweepLoop(maintenance, db, rec, logger)
	}()
	defer func() { stopMaintenance(); wg.Wait() }()
	serveErr := make(chan error, 2)
	go func() { serveErr <- publicServer.Serve(publicLn) }()
	go func() { serveErr <- obsServer.Serve(obsLn) }()
	logger.Info("listening", "address", publicLn.Addr().String(), "obs", obsLn.Addr().String())
	select {
	case err := <-serveErr:
		shutdownErr := shutdownHTTP(publicServer, obsServer)
		if !errors.Is(err, http.ErrServerClosed) {
			return errors.Join(err, shutdownErr)
		}
		return shutdownErr
	case <-ctx.Done():
	}
	logger.Info("shutting down")
	return shutdownHTTP(publicServer, obsServer)
}

func newHTTPServer(handler http.Handler, logger *slog.Logger) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
}

func shutdownHTTP(servers ...*http.Server) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var err error
	for _, srv := range servers {
		if shutErr := srv.Shutdown(ctx); shutErr != nil {
			err = errors.Join(err, shutErr, srv.Close())
		}
	}
	return err
}

func sweepLoop(ctx context.Context, db *store.Store, rec *metrics.Recorder, logger *slog.Logger) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n, err := db.Sweep(ctx)
			if err != nil && ctx.Err() == nil {
				logger.Error("sweep failed", "error", err)
				continue
			}
			rec.Swept(n)
		}
	}
}
