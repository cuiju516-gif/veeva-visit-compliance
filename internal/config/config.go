package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

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
}

// Load reads the environment, applying documented defaults.
func Load() (Config, error) {
	c := Config{
		Port:        env("PORT", "8080"),
		PostgresDSN: env("POSTGRES_DSN", ""),
		LogLevel:    slog.LevelInfo,
	}

	if c.PostgresDSN == "" {
		return c, fmt.Errorf("POSTGRES_DSN is required")
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
