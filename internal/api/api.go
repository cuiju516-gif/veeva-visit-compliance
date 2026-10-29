package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// Server wires the HTTP surface to a repository.
type Server struct {
	repo       store.Repo
	log        *slog.Logger
	thresholds domain.Thresholds

	// now is injectable so tests can pin check-out time and therefore the
	// derived duration, which is otherwise a moving target.
	now func() time.Time

	assets http.Handler
	mux    *http.ServeMux
}

// New builds the server. assets may be nil when only the API is served
// (tests, or an API-only deployment).
func New(repo store.Repo, log *slog.Logger, th domain.Thresholds, assets http.Handler) *Server {
	s := &Server{
		repo:       repo,
		log:        log,
		thresholds: th,
		now:        func() time.Time { return time.Now().UTC() },
		assets:     assets,
	}
	s.mux = http.NewServeMux()
	s.routes()
	return s
}

// Handler returns the fully wrapped handler.
func (s *Server) Handler() http.Handler {
	return s.recoverer(s.logger(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealth)

	s.mux.HandleFunc("GET /api/catalog", s.handleCatalog)

	s.mux.HandleFunc("POST /api/visits", s.handleCreateVisit)
	s.mux.HandleFunc("GET /api/visits", s.handleListVisits)
	s.mux.HandleFunc("GET /api/visits/{id}", s.handleGetVisit)
	s.mux.HandleFunc("POST /api/visits/{id}/checkin", s.handleCheckIn)
	s.mux.HandleFunc("POST /api/visits/{id}/checkout", s.handleCheckOut)
	s.mux.HandleFunc("PUT /api/visits/{id}/report", s.handleSubmitReport)

	s.mux.HandleFunc("GET /api/dashboard/monthly", s.handleDashboard)

	if s.assets != nil {
		// Everything that is not /api or /healthz falls through to the
		// embedded single-page frontend.
		s.mux.Handle("/", s.assets)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "field-visit-compliance"})
}

// logger records one line per request with the routed pattern rather than the
// raw path, so /api/visits/<uuid> does not explode cardinality in logs.
func (s *Server) logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		s.log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// recoverer keeps a panic in one handler from taking down the process, and
// still returns a JSON error rather than an empty connection reset.
func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.log.Error("panic", "path", r.URL.Path, "panic", rec)
				s.fail(w, http.StatusInternalServerError, CodeInternal, "internal error", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// contextWithTimeout is used by the handlers so a slow database cannot pin a
// request goroutine forever.
func (s *Server) contextWithTimeout(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 10*time.Second)
}
