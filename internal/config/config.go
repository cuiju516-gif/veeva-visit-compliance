package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
)

// Config is everything the process needs, read once at boot.
//
// Configuration errors are fatal on purpose: a typo in a threshold that
// silently defaulted would mean a compliance rule running at the wrong limit.
type Config struct {
	Port        string
	PostgresDSN string
	Thresholds  domain.Thresholds
	LogLevel    slog.Level
}

// Load reads the environment, applying documented defaults.
func Load() (Config, error) {
	c := Config{
		Port:        env("PORT", "8080"),
		PostgresDSN: env("POSTGRES_DSN", ""),
		Thresholds:  domain.DefaultThresholds(),
		LogLevel:    slog.LevelInfo,
	}

	if c.PostgresDSN == "" {
		return c, fmt.Errorf("POSTGRES_DSN is required")
	}

	if raw := os.Getenv("COMPLIANCE_MIN_DURATION_SECONDS"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			return c, fmt.Errorf("COMPLIANCE_MIN_DURATION_SECONDS: %w", err)
		}
		c.Thresholds.MinDurationSeconds = n
	}
	if raw := os.Getenv("COMPLIANCE_MAX_DISTANCE_METERS"); raw != "" {
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return c, fmt.Errorf("COMPLIANCE_MAX_DISTANCE_METERS: %w", err)
		}
		c.Thresholds.MaxDistanceMeters = f
	}
	if err := c.Thresholds.Validate(); err != nil {
		return c, err
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
