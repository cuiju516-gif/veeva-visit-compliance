package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// --- request shapes -------------------------------------------------------

type createVisitRequest struct {
	MRID      string    `json:"mrId"`
	HCPID     string    `json:"hcpId"`
	ProductID string    `json:"productId"`
	PlannedAt time.Time `json:"plannedAt"`
}

// positionRequest uses pointers so that a missing coordinate is rejected rather
// than silently defaulting to 0,0 — which is a real point in the Gulf of Guinea
// and would make the location rule fire for a very confusing reason.
type positionRequest struct {
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
}

type reportRequest struct {
	TalkingPoints        string        `json:"talkingPoints"`
	HCPFeedback          string        `json:"hcpFeedback"`
	MaterialsDistributed bool          `json:"materialsDistributed"`
	Materials            []materialDTO `json:"materials"`
}

var allowedKinds = map[string]bool{"slide": true, "reprint": true, "document": true, "other": true}

// --- handlers -------------------------------------------------------------

func (s *Server) handleCatalog(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	cat, err := s.repo.Catalog(ctx)
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, cat)
}

func (s *Server) handleCreateVisit(w http.ResponseWriter, r *http.Request) {
	var req createVisitRequest
	if err := decodeJSON(w, r, &req); err != nil {
		s.handleError(w, r, err)
		return
	}

	if strings.TrimSpace(req.MRID) == "" {
		s.handleError(w, r, invalidField("mrId", "mrId is required"))
		return
	}
	if strings.TrimSpace(req.HCPID) == "" {
		s.handleError(w, r, invalidField("hcpId", "hcpId is required"))
		return
	}
	if strings.TrimSpace(req.ProductID) == "" {
		s.handleError(w, r, invalidField("productId", "productId is required"))
		return
	}
	if req.PlannedAt.IsZero() {
		s.handleError(w, r, invalidField("plannedAt", "plannedAt is required (RFC3339)"))
		return
	}
	// The brief describes planning next week. A calendar check would reject
	// legitimate same-week corrections, so the only hard rule is "not in the
	// past". See docs/design-notes.md §5.
	if req.PlannedAt.Before(s.now().Add(-5 * time.Minute)) {
		s.handleError(w, r, invalidField("plannedAt", "plannedAt must not be in the past"))
		return
	}

	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	rec, err := s.repo.Create(ctx, store.CreateParams{
		MRID:      req.MRID,
		HCPID:     req.HCPID,
		ProductID: req.ProductID,
		PlannedAt: req.PlannedAt.UTC(),
	})
	if err != nil {
		s.handleError(w, r, err)
		return
	}

	w.Header().Set("Location", "/api/visits/"+rec.Visit.ID)
	writeJSON(w, http.StatusCreated, toVisitDTO(rec))
}

func (s *Server) handleGetVisit(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	rec, err := s.repo.Get(ctx, r.PathValue("id"))
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	if actor := actorFrom(r.Context()); !actor.IsAdmin() && rec.Visit.MRID != actor.MRID {
		s.fail(w, http.StatusForbidden, CodeForbidden, "this visit belongs to another rep", nil)
		return
	}
	writeJSON(w, http.StatusOK, toVisitDTO(rec))
}

func (s *Server) handleListVisits(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	actor := actorFrom(r.Context())
	params := store.ListParams{
		ProductID: r.URL.Query().Get("productId"),
		// The scope comes from the actor, not from the query string: a client
		// that could name another rep would defeat the point of the switcher.
		MRID: actor.MRID,
	}
	if raw := r.URL.Query().Get("status"); raw != "" {
		status := domain.Status(strings.ToUpper(raw))
		switch status {
		case domain.StatusPlanned, domain.StatusCheckedIn, domain.StatusCheckedOut, domain.StatusReported:
			params.Status = status
		default:
			s.handleError(w, r, invalidField("status", "unknown status %q", raw))
			return
		}
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			s.handleError(w, r, invalidField("limit", "limit must be a positive integer"))
			return
		}
		params.Limit = n
	}

	recs, err := s.repo.List(ctx, params)
	if err != nil {
		s.handleError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"visits": toVisitDTOs(recs),
		"count":  len(recs),
	})
}

func (s *Server) handleCheckIn(w http.ResponseWriter, r *http.Request) {
	pos, err := s.decodePosition(w, r)
	if err != nil {
		s.handleError(w, r, err)
		return
	}

	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	rec, err := s.repo.CheckIn(ctx, r.PathValue("id"), s.now(), pos)
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toVisitDTO(rec))
}

func (s *Server) handleCheckOut(w http.ResponseWriter, r *http.Request) {
	pos, err := s.decodePosition(w, r)
	if err != nil {
		s.handleError(w, r, err)
		return
	}

	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	// Duration and flags are derived inside the repository from stored
	// timestamps. Nothing about them comes off the wire.
	rec, err := s.repo.CheckOut(ctx, r.PathValue("id"), s.now(), pos, s.thresholds)
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toVisitDTO(rec))
}

func (s *Server) handleSubmitReport(w http.ResponseWriter, r *http.Request) {
	var req reportRequest
	if err := decodeJSON(w, r, &req); err != nil {
		s.handleError(w, r, err)
		return
	}

	if utf8.RuneCountInString(req.TalkingPoints) > 4000 {
		s.handleError(w, r, invalidField("talkingPoints", "talkingPoints is limited to 4000 characters"))
		return
	}
	if utf8.RuneCountInString(req.HCPFeedback) > 4000 {
		s.handleError(w, r, invalidField("hcpFeedback", "hcpFeedback is limited to 4000 characters"))
		return
	}

	// The two fields have to agree: claiming material was handed over without
	// listing any is either a UI bug or an attempt to look compliant.
	if req.MaterialsDistributed && len(req.Materials) == 0 {
		s.handleError(w, r, invalidField("materials",
			"materialsDistributed is true but no material was listed"))
		return
	}

	materials := make([]store.Material, 0, len(req.Materials))
	for i, m := range req.Materials {
		name := strings.TrimSpace(m.Name)
		if name == "" {
			s.handleError(w, r, invalid("materials[%d].name is required", i))
			return
		}
		kind := m.Kind
		if kind == "" {
			kind = "document"
		}
		if !allowedKinds[kind] {
			s.handleError(w, r, invalid("materials[%d].kind %q is not one of slide, reprint, document, other", i, kind))
			return
		}
		materials = append(materials, store.Material{Name: name, Kind: kind})
	}

	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	rec, err := s.repo.SubmitReport(ctx, r.PathValue("id"), store.ReportParams{
		TalkingPoints:        strings.TrimSpace(req.TalkingPoints),
		HCPFeedback:          strings.TrimSpace(req.HCPFeedback),
		MaterialsDistributed: req.MaterialsDistributed,
		Materials:            materials,
	})
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toVisitDTO(rec))
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	months := 6
	if raw := r.URL.Query().Get("months"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 || n > 24 {
			s.handleError(w, r, invalidField("months", "months must be between 1 and 24"))
			return
		}
		months = n
	}

	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	dash, err := s.repo.Dashboard(ctx, months, actorFrom(r.Context()).MRID)
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dash)
}

// decodePosition reads and range-checks a {lat,lng} body.
func (s *Server) decodePosition(w http.ResponseWriter, r *http.Request) (domain.Coordinates, error) {
	var req positionRequest
	if err := decodeJSON(w, r, &req); err != nil {
		return domain.Coordinates{}, err
	}
	if req.Lat == nil {
		return domain.Coordinates{}, invalidField("lat", "lat is required")
	}
	if req.Lng == nil {
		return domain.Coordinates{}, invalidField("lng", "lng is required")
	}
	pos := domain.Coordinates{Lat: *req.Lat, Lng: *req.Lng}
	if !pos.Valid() {
		return domain.Coordinates{}, invalidField("lat", "coordinates out of range: lat must be within ±90 and lng within ±180")
	}
	return pos, nil
}

// --- terminal transitions -------------------------------------------------

// reasonRequest is the body of cancel and void.
//
// It is a separate type from positionRequest on purpose: DisallowUnknownFields
// turns "I sent lat/lng to /cancel" into a 400 instead of a silently ignored
// coordinate, which is the difference between a broken client and a visit that
// was cancelled at a position nobody recorded.
type reasonRequest struct {
	Reason string `json:"reason"`
}

const maxReasonRunes = 500

// decodeReason reads and validates the reason shared by cancel and void.
func (s *Server) decodeReason(w http.ResponseWriter, r *http.Request, action string) (string, bool) {
	var req reasonRequest
	if err := decodeJSON(w, r, &req); err != nil {
		s.handleError(w, r, err)
		return "", false
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		s.handleError(w, r, invalidField("reason", "a reason is required to %s a visit", action))
		return "", false
	}
	if utf8.RuneCountInString(reason) > maxReasonRunes {
		s.handleError(w, r, invalidField("reason", "reason is limited to %d characters", maxReasonRunes))
		return "", false
	}
	return reason, true
}

func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
	reason, ok := s.decodeReason(w, r, "cancel")
	if !ok {
		return
	}
	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	rec, err := s.repo.Cancel(ctx, r.PathValue("id"), reason, s.now())
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toVisitDTO(rec))
}

func (s *Server) handleVoid(w http.ResponseWriter, r *http.Request) {
	reason, ok := s.decodeReason(w, r, "void")
	if !ok {
		return
	}
	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	rec, err := s.repo.Void(ctx, r.PathValue("id"), reason, s.now(), s.thresholds)
	if err != nil {
		s.handleError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toVisitDTO(rec))
}

// handleDelete is a logical delete: 204, and the row is still there.
func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.contextWithTimeout(r)
	defer cancel()

	if _, err := s.repo.Delete(ctx, r.PathValue("id"), s.now()); err != nil {
		s.handleError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
