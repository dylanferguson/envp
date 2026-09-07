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

	"github.com/dylanferguson/envp/internal/obs"
	"github.com/dylanferguson/envp/internal/server"
	"github.com/dylanferguson/envp/internal/store"
	"github.com/dylanferguson/envp/internal/webui"
)

type config struct {
	port   int
	dbPath string
	http   server.Config
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	logger := slog.New(obs.LogHandler(slog.NewJSONHandler(os.Stderr, nil)))
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
	if err := obs.CheckHealth(ctx, "http://127.0.0.1:"+strconv.Itoa(cfg.port)); err != nil {
		return 1
	}
	return 0
}

func loadConfig() (config, error) {
	c := config{port: 8080, dbPath: "./data/shares.db"}
	if value, ok := os.LookupEnv("PORT"); ok {
		port, err := strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return c, errors.New("PORT must be between 1 and 65535")
		}
		c.port = port
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
	rec, err := obs.New(obs.Options{DB: db.Ping})
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
	listener, err := net.Listen("tcp", net.JoinHostPort("", strconv.Itoa(cfg.port)))
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	httpServer := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	maintenance, stopMaintenance := context.WithCancel(ctx)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sweepLoop(maintenance, db, rec, logger)
	}()
	defer func() { stopMaintenance(); wg.Wait() }()
	serveErr := make(chan error, 1)
	go func() { serveErr <- httpServer.Serve(listener) }()
	logger.Info("listening", "address", listener.Addr().String())
	select {
	case err := <-serveErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
	}
	logger.Info("shutting down")
	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdown); err != nil {
		return errors.Join(fmt.Errorf("shutdown: %w", err), httpServer.Close())
	}
	return nil
}

func sweepLoop(ctx context.Context, db *store.Store, rec *obs.Recorder, logger *slog.Logger) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n, err := db.Sweep(ctx)
			if err != nil && ctx.Err() == nil {
				logger.ErrorContext(ctx, "sweep failed", "error", err)
				continue
			}
			rec.Swept(n)
		}
	}
}
