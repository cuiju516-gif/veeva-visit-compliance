// Command server runs the field-visit compliance service: JSON API plus the
// embedded single-page frontend, backed by Postgres.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/api"
	"github.com/cuiju516-gif/veeva-visit-compliance/internal/config"
	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
	"github.com/cuiju516-gif/veeva-visit-compliance/web"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// JSON logs in a container, human-readable text on a developer's terminal.
	var handler slog.Handler
	if os.Getenv("LOG_FORMAT") == "text" {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel})
	} else {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel})
	}
	log := slog.New(handler).With("service", "field-visit-compliance")

	// Signals cancel this context, which also aborts a slow startup.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	repo, err := store.NewPostgres(ctx, cfg.PostgresDSN, log)
	if err != nil {
		return err
	}
	defer repo.Close()

	srv := api.New(repo, log, cfg.Thresholds, webui.Handler())

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", httpServer.Addr,
			"min_duration_s", cfg.Thresholds.MinDurationSeconds,
			"max_distance_m", cfg.Thresholds.MaxDistanceMeters)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
	}

	// Give in-flight requests a chance to finish before the process exits.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}
