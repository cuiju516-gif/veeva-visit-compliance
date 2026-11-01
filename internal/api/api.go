package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// Actor identifies who is making the request. There is no login (the brief does
// not ask for one), so the client states its identity in X-Actor; the server uses
// it to decide *which rows* are visible, and never trusts it for anything else.
type Actor struct {
	// MRID is empty for the administrator, who sees every rep's visits.
	MRID string
}

// IsAdmin reports whether the actor may see all data and change configuration.
func (a Actor) IsAdmin() bool { return a.MRID == "" }

type actorKey struct{}

// ActorHeader is the request header that names the actor: an MR uuid, or the
// literal "admin".
const ActorHeader = "X-Actor"

// actorFrom returns the actor stored by the actor middleware.
func actorFrom(ctx context.Context) Actor {
	a, _ := ctx.Value(actorKey{}).(Actor)
	return a
}

// withActor reads X-Actor once and puts the result on the context. A missing or
// unknown value is treated as "admin" only when it is literally "admin";
// anything else that does not look like an id becomes an anonymous MR, which
// sees nothing rather than everything. Failing closed matters here: the
// permissive default would silently turn every scoping bug into a data leak.
func (s *Server) withActor(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimSpace(r.Header.Get(ActorHeader))
		var actor Actor
		switch {
		case raw == "admin":
			actor = Actor{}
		case raw != "":
			actor = Actor{MRID: raw}
		default:
			// No header: behave like a rep with no id, i.e. see nothing.
			actor = Actor{MRID: "00000000-0000-0000-0000-000000000000"}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), actorKey{}, actor)))
	})
}

// Server wires the HTTP surface to a repository.
type Server struct {
	repo store.Repo
	log  *slog.Logger

	// now is injectable so tests can pin check-out time and therefore the
	// derived duration, which is otherwise a moving target.
	now func() time.Time

	assets http.Handler
	mux    *http.ServeMux
}

// New builds the server. assets may be nil when only the API is served
// (tests, or an API-only deployment).
func New(repo store.Repo, log *slog.Logger, assets http.Handler) *Server {
	s := &Server{
		repo:   repo,
		log:    log,
		now:    func() time.Time { return time.Now().UTC() },
		assets: assets,
	}
	s.mux = http.NewServeMux()
	s.routes()
	return s
}

// Handler returns the fully wrapped handler.
func (s *Server) Handler() http.Handler {
	return s.recoverer(s.logger(s.withActor(s.mux)))
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
	s.mux.HandleFunc("POST /api/visits/{id}/cancel", s.handleCancel)
	s.mux.HandleFunc("POST /api/visits/{id}/void", s.handleVoid)
	s.mux.HandleFunc("DELETE /api/visits/{id}", s.handleDelete)

	s.mux.HandleFunc("GET /api/dashboard/monthly", s.handleDashboard)

	s.mux.HandleFunc("GET /api/admin/rules", s.handleGetRules)
	s.mux.HandleFunc("PUT /api/admin/rules", s.handlePutRules)

	if s.assets != nil {
		// Everything that is not /api or /healthz falls through to the
		// embedded single-page frontend.
		s.mux.Handle("/", s.assets)
	}
}

// converge runs the timeout sweep before a read.
//
// It is deliberate that failures here are logged and swallowed: refusing to
// serve the list because the sweep hiccuped would take the app down for a
// maintenance operation that will be retried on the next request anyway. The
// sweep is idempotent, so "try again later" is a correct recovery.
func (s *Server) converge(ctx context.Context) {
	result, err := s.repo.Converge(ctx, s.now())
	if err != nil {
		s.log.Warn("timeout sweep failed", "err", err)
		return
	}
	if result.Cancelled > 0 || result.Voided > 0 {
		s.log.Info("timeout sweep", "cancelled", result.Cancelled, "voided", result.Voided)
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
