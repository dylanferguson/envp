package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	storage, err := configuredStore()
	if err != nil {
		log.Fatal(err)
	}
	defer storage.Close()

	cleanupCtx, stopCleanup := context.WithCancel(context.Background())
	defer stopCleanup()
	go cleanupLoop(cleanupCtx, storage, time.Now, time.Hour, 1000, func(err error) {
		log.Printf("cleanup: %v", err)
	})

	server := &http.Server{
		Addr:              envOr("ADDR", ":8080"),
		Handler:           newAPI(storage, os.Getenv("APP_ORIGIN")),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	errCh := make(chan error, 1)
	go func() { errCh <- server.ListenAndServe() }()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	select {
	case sig := <-signals:
		log.Printf("received %s; shutting down", sig)
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}
	stopCleanup()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func configuredStore() (store, error) {
	switch envOr("STORE", "memory") {
	case "memory":
		return newMemoryStore(), nil
	case "sqlite":
		return newSQLiteStore(envOr("SQLITE_PATH", "shares.db"))
	default:
		return nil, errors.New("STORE must be memory or sqlite")
	}
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
