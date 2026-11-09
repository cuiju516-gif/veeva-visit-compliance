package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// Config is everything the process needs, read once at boot.
//
// The compliance thresholds are deliberately *not* here any more: they live in
// rule_version and change at runtime through the admin API. Environment
// variables would have been a second source of truth, and the one thing this
// system must not have is two answers to "what is the minimum stay".
type Config struct {
	Port        string
	PostgresDSN string
	LogLevel    slog.Level

	// SweepInterval is how often the timeout sweep runs in the background.
	// Zero disables it, which leaves convergence to the read path — acceptable
	// for a single-user demo, not for anything that reports on the data.
	SweepInterval time.Duration
}

// Load reads the environment, applying documented defaults.
func Load() (Config, error) {
	c := Config{
		Port:          env("PORT", "8080"),
		PostgresDSN:   env("POSTGRES_DSN", ""),
		LogLevel:      slog.LevelInfo,
		SweepInterval: 30 * time.Second,
	}

	if c.PostgresDSN == "" {
		return c, fmt.Errorf("POSTGRES_DSN is required")
	}

	if raw := os.Getenv("TIMEOUT_SWEEP_INTERVAL"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil {
			return c, fmt.Errorf("TIMEOUT_SWEEP_INTERVAL: %w", err)
		}
		if d < 0 {
			return c, fmt.Errorf("TIMEOUT_SWEEP_INTERVAL: must not be negative")
		}
		c.SweepInterval = d
	}

	switch strings.ToLower(env("LOG_LEVEL", "info")) {
	case "debug":
		c.LogLevel = slog.LevelDebug
	case "warn":
		c.LogLevel = slog.LevelWarn
	case "error":
		c.LogLevel = slog.LevelError
	}

	return c, nil
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
