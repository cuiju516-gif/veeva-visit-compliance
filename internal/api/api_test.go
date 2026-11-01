package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// --- fake repository ------------------------------------------------------

// fakeRepo is an in-memory implementation of store.Repo with the same state
// machine the Postgres one enforces. It exists so the HTTP contract can be
// tested without a database; the Postgres implementation is covered by the
// compose smoke test.
type fakeRepo struct {
	mu      sync.Mutex
	records map[string]*store.Record
	seq     int
	catalog store.Catalog
	dash    store.Dashboard
	rule    store.RuleVersion
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		records: map[string]*store.Record{},
		rule: store.RuleVersion{
			Version: "v1", MinDurationSeconds: 300, MaxDistanceMeters: 500,
			TimeoutHours: 24, ReportTimeoutHours: 72,
		},
		catalog: store.Catalog{
			MRs:      []store.MR{{ID: "mr-1", Name: "Chen Wei", Region: "East China"}},
			HCPs:     []store.HCP{{ID: "hcp-1", Name: "Dr. Li Ming", HospitalName: "Ruijin Hospital", Department: "Cardiology", BaseLat: 31.2119, BaseLng: 121.4661}},
			Products: []store.Product{{ID: "prod-1", Code: "CARD-01", Name: "Cardizen"}},
		},
		dash: store.Dashboard{
			Months: []string{"2026-09", "2026-10"},
			Rows: []store.MonthlyRow{
				{Month: "2026-10", ProductID: "prod-1", ProductName: "Cardizen", Visits: 4, Abnormal: 1, AbnormalShare: 0.25},
			},
			TotalVisits: 4, TotalAbnormal: 1,
		},
	}
}

func (f *fakeRepo) Catalog(ctx context.Context) (store.Catalog, error) { return f.catalog, nil }

func (f *fakeRepo) Create(ctx context.Context, p store.CreateParams) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seq++
	id := fmt.Sprintf("visit-%d", f.seq)
	rec := &store.Record{
		Visit: domain.Visit{
			ID: id, MRID: p.MRID, HCPID: p.HCPID, ProductID: p.ProductID,
			PlannedAt: p.PlannedAt, Status: domain.StatusPlanned,
			CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1,
		},
		MRName: "Chen Wei", HCPName: "Dr. Li Ming", HospitalName: "Ruijin Hospital",
		Department: "Cardiology", HospitalBase: domain.Coordinates{Lat: 31.2119, Lng: 121.4661},
		ProductName: "Cardizen", Materials: []store.Material{},
	}
	f.records[id] = rec
	return *rec, nil
}

func (f *fakeRepo) Get(ctx context.Context, id string) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	return *rec, nil
}

func (f *fakeRepo) List(ctx context.Context, p store.ListParams) ([]store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []store.Record{}
	for _, r := range f.records {
		if p.Status != "" && r.Visit.Status != p.Status {
			continue
		}
		if p.MRID != "" && r.Visit.MRID != p.MRID {
			continue
		}
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Visit.PlannedAt.After(out[j].Visit.PlannedAt) })
	return out, nil
}

func (f *fakeRepo) CheckIn(ctx context.Context, id string, at time.Time, pos domain.Coordinates) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	if _, err := domain.Apply(rec.Visit.Status, domain.EventCheckIn); err != nil {
		return store.Record{}, &store.StateError{Status: rec.Visit.Status, Action: "check in"}
	}
	rec.Visit.Status = domain.StatusCheckedIn
	rec.Visit.CheckinAt = &at
	rec.Visit.CheckinPos = &pos
	rec.Visit.Version++
	return *rec, nil
}

func (f *fakeRepo) CheckOut(ctx context.Context, id string, at time.Time, pos domain.Coordinates) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	if rec.Visit.Status != domain.StatusCheckedIn {
		return store.Record{}, &store.StateError{Status: rec.Visit.Status, Action: "check out"}
	}

	duration, err := domain.StayDuration(*rec.Visit.CheckinAt, at)
	if err != nil {
		return store.Record{}, err
	}
	rules := f.rule // already holding f.mu; f.rules() would deadlock
	evaluation, err := domain.Snapshot(domain.EvaluationInput{
		CheckinAt: *rec.Visit.CheckinAt, CheckoutAt: at,
		Checkin: *rec.Visit.CheckinPos, Checkout: pos,
		HospitalBase: rec.HospitalBase, Thresholds: rules.Thresholds(),
		RuleVersion: rules.Version, EvaluatedAt: at, Source: "checkout",
	})
	if err != nil {
		return store.Record{}, err
	}

	rec.Visit.Status = domain.StatusCheckedOut
	rec.Visit.CheckoutAt = &at
	rec.Visit.CheckoutPos = &pos
	rec.Visit.Duration = duration
	rec.Visit.Flags = evaluation.Flags
	rec.Visit.Evaluation = &evaluation
	rec.Visit.RuleVersion = rules.Version
	rec.Visit.Version++
	return *rec, nil
}

func (f *fakeRepo) SubmitReport(ctx context.Context, id string, p store.ReportParams) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	if rec.Visit.Status != domain.StatusCheckedOut {
		return store.Record{}, &store.StateError{Status: rec.Visit.Status, Action: "report"}
	}
	rec.Visit.Status = domain.StatusReported
	rec.Visit.TalkingPoints = p.TalkingPoints
	rec.Visit.HCPFeedback = p.HCPFeedback
	rec.Visit.MaterialsDistributed = p.MaterialsDistributed
	rec.Materials = p.Materials
	rec.Visit.Version++
	return *rec, nil
}

func (f *fakeRepo) Dashboard(ctx context.Context, months int, mrid string) (store.Dashboard, error) {
	return f.dash, nil
}

// --- test harness ---------------------------------------------------------

type harness struct {
	t      *testing.T
	server *Server
	repo   *fakeRepo
	http   *httptest.Server
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	repo := newFakeRepo()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(repo, log, domain.DefaultThresholds(), nil)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return &harness{t: t, server: srv, repo: repo, http: ts}
}

// do sends a request as the test's default rep. Most tests were written before
// the actor header existed and mean "a rep acting on their own visits", which is
// exactly mr-1 — the id newFakeRepo hands out and createPlanned posts.
func (h *harness) do(method, path string, body any) (*http.Response, []byte) {
	h.t.Helper()
	return h.doAs("mr-1", method, path, body)
}

func (h *harness) doAs(actor, method, path string, body any) (*http.Response, []byte) {
	h.t.Helper()
	var buf io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			h.t.Fatalf("marshal body: %v", err)
		}
		buf = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, h.http.URL+path, buf)
	if err != nil {
		h.t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if actor != "" {
		req.Header.Set("X-Actor", actor)
	}
	resp, err := h.http.Client().Do(req)
	if err != nil {
		h.t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		h.t.Fatalf("read body: %v", err)
	}
	return resp, raw
}

func (h *harness) decodeVisit(raw []byte) visitDTO {
	h.t.Helper()
	var v visitDTO
	if err := json.Unmarshal(raw, &v); err != nil {
		h.t.Fatalf("decode visit: %v (body: %s)", err, raw)
	}
	return v
}

func (h *harness) decodeError(raw []byte) apiError {
	h.t.Helper()
	var e errorResponse
	if err := json.Unmarshal(raw, &e); err != nil {
		h.t.Fatalf("decode error: %v (body: %s)", err, raw)
	}
	return e.Error
}

// createPlanned posts a valid plan and returns the resulting visit.
func (h *harness) createPlanned() visitDTO {
	h.t.Helper()
	resp, raw := h.doAs("mr-1", http.MethodPost, "/api/visits", map[string]any{
		"mrId": "mr-1", "hcpId": "hcp-1", "productId": "prod-1",
		"plannedAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
	})
	if resp.StatusCode != http.StatusCreated {
		h.t.Fatalf("create visit: status %d body %s", resp.StatusCode, raw)
	}
	return h.decodeVisit(raw)
}

// --- tests ----------------------------------------------------------------

func TestCreateVisit(t *testing.T) {
	h := newHarness(t)
	resp, raw := h.doAs("mr-1", http.MethodPost, "/api/visits", map[string]any{
		"mrId": "mr-1", "hcpId": "hcp-1", "productId": "prod-1",
		"plannedAt": "2026-11-02T10:00:00+08:00",
	})

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body %s", resp.StatusCode, raw)
	}
	if loc := resp.Header.Get("Location"); !strings.HasPrefix(loc, "/api/visits/") {
		t.Fatalf("Location = %q, want the created resource", loc)
	}

	v := h.decodeVisit(raw)
	if v.Status != string(domain.StatusPlanned) {
		t.Fatalf("status = %q, want PLANNED", v.Status)
	}
	if !v.Capabilities.CanCheckIn || v.Capabilities.CanCheckOut || v.Capabilities.CanReport {
		t.Fatalf("capabilities wrong for PLANNED: %+v", v.Capabilities)
	}
	if v.Abnormal || len(v.Flags) != 0 {
		t.Fatalf("a fresh plan must not carry flags: %+v", v)
	}
	if v.HCPName == "" || v.ProductName == "" {
		t.Fatalf("denormalised names missing: %+v", v)
	}
}

func TestCreateVisitValidation(t *testing.T) {
	h := newHarness(t)

	cases := []struct {
		name  string
		body  map[string]any
		field string
	}{
		{
			name:  "missing hcp",
			body:  map[string]any{"mrId": "mr-1", "productId": "prod-1", "plannedAt": "2026-11-02T10:00:00Z"},
			field: "hcpId",
		},
		{
			name:  "missing plannedAt",
			body:  map[string]any{"mrId": "mr-1", "hcpId": "hcp-1", "productId": "prod-1"},
			field: "plannedAt",
		},
		{
			name:  "plannedAt in the past",
			body:  map[string]any{"mrId": "mr-1", "hcpId": "hcp-1", "productId": "prod-1", "plannedAt": "2020-01-01T10:00:00Z"},
			field: "plannedAt",
		},
		{
			name:  "unknown field is rejected, not ignored",
			body:  map[string]any{"mrId": "mr-1", "hcpId": "hcp-1", "productId": "prod-1", "plannedAt": "2026-11-02T10:00:00Z", "status": "REPORTED"},
			field: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := h.doAs("mr-1", http.MethodPost, "/api/visits", tc.body)
			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", resp.StatusCode, raw)
			}
			e := h.decodeError(raw)
			if e.Code != CodeValidation {
				t.Fatalf("code = %q, want %q", e.Code, CodeValidation)
			}
			if tc.field != "" && e.Details["field"] != tc.field {
				t.Fatalf("details.field = %q, want %q", e.Details["field"], tc.field)
			}
		})
	}
}

func TestCheckInRecordsServerTimestamp(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	fixed := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	h.server.now = func() time.Time { return fixed }

	resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{
		"lat": 31.2119, "lng": 121.4661,
		// A client-supplied timestamp must be ignored: unknown fields are
		// rejected, so sending one is an error rather than a silent override.
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d; body %s", resp.StatusCode, raw)
	}

	got := h.decodeVisit(raw)
	if got.Status != string(domain.StatusCheckedIn) {
		t.Fatalf("status = %q, want CHECKED_IN", got.Status)
	}
	if got.Checkin == nil {
		t.Fatal("check-in point missing from the response")
	}
	if !got.Checkin.At.Equal(fixed) {
		t.Fatalf("check-in time = %v, want the server clock %v", got.Checkin.At, fixed)
	}
	if !got.Capabilities.CanCheckOut || got.Capabilities.CanCheckIn {
		t.Fatalf("capabilities wrong after check-in: %+v", got.Capabilities)
	}
}

func TestCheckOutDerivesDurationAndFlags(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	checkin := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	h.server.now = func() time.Time { return checkin }
	if resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661}); resp.StatusCode != http.StatusOK {
		t.Fatalf("check-in failed: %s", raw)
	}

	// 4m59s later, 800 m away: both rules must fire.
	h.server.now = func() time.Time { return checkin.Add(4*time.Minute + 59*time.Second) }
	resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{
		"lat": 31.2119 + 800.0/111194.93, "lng": 121.4661,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("check-out: status %d, body %s", resp.StatusCode, raw)
	}

	got := h.decodeVisit(raw)
	if got.Status != string(domain.StatusCheckedOut) {
		t.Fatalf("status = %q, want CHECKED_OUT", got.Status)
	}
	if got.DurationSeconds == nil || *got.DurationSeconds != 299 {
		t.Fatalf("durationSeconds = %v, want 299", got.DurationSeconds)
	}
	if !got.Abnormal || len(got.Flags) != 2 {
		t.Fatalf("expected two flags, got abnormal=%v flags=%+v", got.Abnormal, got.Flags)
	}
	if got.Flags[0].Detail == "" {
		t.Fatal("flags must carry a human-readable detail")
	}
}

func TestCompliantVisitIsNotFlagged(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	checkin := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	h.server.now = func() time.Time { return checkin }
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})

	h.server.now = func() time.Time { return checkin.Add(12 * time.Minute) }
	_, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{"lat": 31.2119, "lng": 121.4661})

	got := h.decodeVisit(raw)
	if got.Abnormal || len(got.Flags) != 0 {
		t.Fatalf("12 minutes at the hospital should be compliant: %+v", got.Flags)
	}
	if *got.DurationSeconds != 720 {
		t.Fatalf("durationSeconds = %d, want 720", *got.DurationSeconds)
	}
}

func TestIllegalTransitionsReturn409(t *testing.T) {
	h := newHarness(t)

	t.Run("check-out before check-in", func(t *testing.T) {
		v := h.createPlanned()
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{"lat": 31.2, "lng": 121.4})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
		e := h.decodeError(raw)
		if e.Code != CodeInvalidState {
			t.Fatalf("code = %q, want %q", e.Code, CodeInvalidState)
		}
		if e.Details["status"] != string(domain.StatusPlanned) {
			t.Fatalf("details.status = %q, want PLANNED", e.Details["status"])
		}
	})

	t.Run("double check-in", func(t *testing.T) {
		v := h.createPlanned()
		h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2, "lng": 121.4})
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2, "lng": 121.4})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("report before check-out", func(t *testing.T) {
		v := h.createPlanned()
		resp, raw := h.do(http.MethodPut, "/api/visits/"+v.ID+"/report", map[string]any{"talkingPoints": "x"})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("unknown visit", func(t *testing.T) {
		resp, raw := h.do(http.MethodGet, "/api/visits/does-not-exist", nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("status = %d, want 404; body %s", resp.StatusCode, raw)
		}
		if e := h.decodeError(raw); e.Code != CodeNotFound {
			t.Fatalf("code = %q, want %q", e.Code, CodeNotFound)
		}
	})
}

func TestSubmitReport(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	checkin := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	h.server.now = func() time.Time { return checkin }
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
	h.server.now = func() time.Time { return checkin.Add(20 * time.Minute) }
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{"lat": 31.2119, "lng": 121.4661})

	resp, raw := h.do(http.MethodPut, "/api/visits/"+v.ID+"/report", map[string]any{
		"talkingPoints":        "Reviewed the outcomes data.",
		"hcpFeedback":          "Wants the subgroup analysis.",
		"materialsDistributed": true,
		"materials":            []map[string]any{{"name": "Outcomes reprint", "kind": "reprint"}},
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d; body %s", resp.StatusCode, raw)
	}

	got := h.decodeVisit(raw)
	if got.Status != string(domain.StatusReported) {
		t.Fatalf("status = %q, want REPORTED", got.Status)
	}
	if !got.MaterialsDistributed || len(got.Materials) != 1 || got.Materials[0].Kind != "reprint" {
		t.Fatalf("materials not stored: %+v", got.Materials)
	}
	if got.Capabilities.CanReport || got.Capabilities.CanCheckIn {
		t.Fatalf("a reported visit must be terminal: %+v", got.Capabilities)
	}

	// Report twice: the second attempt is a conflict, not a silent overwrite.
	resp, _ = h.do(http.MethodPut, "/api/visits/"+v.ID+"/report", map[string]any{"talkingPoints": "again"})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("second report status = %d, want 409", resp.StatusCode)
	}
}

func TestReportValidation(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	checkin := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	h.server.now = func() time.Time { return checkin }
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
	h.server.now = func() time.Time { return checkin.Add(20 * time.Minute) }
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{"lat": 31.2119, "lng": 121.4661})

	t.Run("material claimed but not listed", func(t *testing.T) {
		resp, raw := h.do(http.MethodPut, "/api/visits/"+v.ID+"/report", map[string]any{
			"materialsDistributed": true,
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("unknown material kind", func(t *testing.T) {
		resp, raw := h.do(http.MethodPut, "/api/visits/"+v.ID+"/report", map[string]any{
			"materialsDistributed": true,
			"materials":            []map[string]any{{"name": "Leaflet", "kind": "banner"}},
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400; body %s", resp.StatusCode, raw)
		}
	})
}

func TestInvalidCoordinatesAreRejected(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	cases := []map[string]any{
		{"lat": 91, "lng": 121},
		{"lat": 31, "lng": 181},
		{"lng": 121}, // lat missing: must not default to 0
	}
	for _, body := range cases {
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("body %v: status = %d, want 400 (%s)", body, resp.StatusCode, raw)
		}
	}
}

func TestListAndCatalog(t *testing.T) {
	h := newHarness(t)
	h.createPlanned()
	h.createPlanned()

	// Listing is scoped by actor: with no header the API deliberately returns
	// nothing (fail closed), so the test has to say who is asking.
	resp, raw := h.doAs("mr-1", http.MethodGet, "/api/visits?status=PLANNED", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list: status %d", resp.StatusCode)
	}
	var list struct {
		Visits []visitDTO `json:"visits"`
		Count  int        `json:"count"`
	}
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if list.Count != 2 || len(list.Visits) != 2 {
		t.Fatalf("count = %d, want 2", list.Count)
	}

	resp, raw = h.do(http.MethodGet, "/api/catalog", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("catalog: status %d", resp.StatusCode)
	}
	var cat store.Catalog
	if err := json.Unmarshal(raw, &cat); err != nil {
		t.Fatalf("decode catalog: %v", err)
	}
	if len(cat.HCPs) != 1 || len(cat.Products) != 1 {
		t.Fatalf("catalog = %+v", cat)
	}

	resp, _ = h.do(http.MethodGet, "/api/visits?status=NOT_A_STATUS", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad status filter: got %d, want 400", resp.StatusCode)
	}
}

func TestDashboardPassthrough(t *testing.T) {
	h := newHarness(t)
	resp, raw := h.do(http.MethodGet, "/api/dashboard/monthly?months=2", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var dash store.Dashboard
	if err := json.Unmarshal(raw, &dash); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(dash.Months) != 2 || dash.TotalVisits != 4 {
		t.Fatalf("dashboard = %+v", dash)
	}
}

func TestHealth(t *testing.T) {
	h := newHarness(t)
	resp, raw := h.do(http.MethodGet, "/healthz", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if !strings.Contains(string(raw), `"ok"`) {
		t.Fatalf("body = %s", raw)
	}
}

// TestZeroSecondVisitReportsZeroDuration guards the contract detail that broke
// the smoke test: a check-out that happens immediately still has a duration, and
// "0" must be distinguishable from "not checked out yet".
func TestZeroSecondVisitReportsZeroDuration(t *testing.T) {
	h := newHarness(t)
	v := h.createPlanned()

	fixed := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	h.server.now = func() time.Time { return fixed }
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
	_, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{"lat": 31.2119, "lng": 121.4661})

	if !strings.Contains(string(raw), `"durationSeconds":0`) {
		t.Fatalf("a zero-second stay must report durationSeconds: 0, got %s", raw)
	}
	got := h.decodeVisit(raw)
	if got.DurationSeconds == nil || *got.DurationSeconds != 0 {
		t.Fatalf("durationSeconds = %v, want a present 0", got.DurationSeconds)
	}
}

func (f *fakeRepo) Cancel(ctx context.Context, id, reason string, at time.Time) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	if strings.TrimSpace(reason) == "" {
		return store.Record{}, store.ErrReasonRequired
	}
	if rec.Visit.Status != domain.StatusPlanned {
		return store.Record{}, &store.StateError{Status: rec.Visit.Status, Action: "cancel"}
	}
	rec.Visit.Status = domain.StatusCancelled
	rec.Visit.CancelReason = reason
	rec.Visit.CancelledAt = &at
	rec.Visit.Version++
	return *rec, nil
}

func (f *fakeRepo) Void(ctx context.Context, id, reason string, at time.Time) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	if strings.TrimSpace(reason) == "" {
		return store.Record{}, store.ErrReasonRequired
	}
	if rec.Visit.Status != domain.StatusCheckedIn || rec.Visit.CheckinPos == nil {
		return store.Record{}, &store.StateError{Status: rec.Visit.Status, Action: "void"}
	}
	rules := f.rule // already holding f.mu; f.rules() would deadlock
	evaluation, err := domain.SnapshotCheckinPoint(domain.EvaluationInput{
		Checkin:      *rec.Visit.CheckinPos,
		HospitalBase: rec.HospitalBase,
		Thresholds:   rules.Thresholds(),
		RuleVersion:  rules.Version,
		EvaluatedAt:  at,
		Source:       "void_backfill",
	})
	if err != nil {
		return store.Record{}, err
	}
	rec.Visit.Status = domain.StatusVoided
	rec.Visit.VoidReason = reason
	rec.Visit.VoidCause = domain.VoidCauseManual
	rec.Visit.VoidedAt = &at
	rec.Visit.Flags = evaluation.Flags
	rec.Visit.Evaluation = &evaluation
	rec.Visit.RuleVersion = rules.Version
	rec.Visit.Version++
	return *rec, nil
}

func (f *fakeRepo) Delete(ctx context.Context, id string, now time.Time) (store.Record, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.records[id]
	if !ok {
		return store.Record{}, store.ErrNotFound
	}
	if rec.Visit.Status != domain.StatusPlanned {
		return store.Record{}, &store.StateError{Status: rec.Visit.Status, Action: "delete"}
	}
	if !domain.DeleteWindowOpen(rec.Visit.CreatedAt, rec.Visit.PlannedAt, now) {
		return store.Record{}, &store.DeleteWindowError{
			Reason: domain.DeleteWindowReport(rec.Visit.CreatedAt, rec.Visit.PlannedAt, now),
		}
	}
	rec.Visit.Status = domain.StatusDeleted
	rec.Visit.DeletedAt = &now
	rec.Visit.Version++
	return *rec, nil
}

// --- terminal transitions -------------------------------------------------

func TestCancelRequiresReason(t *testing.T) {
	h := newHarness(t)

	t.Run("missing reason", func(t *testing.T) {
		v := h.createPlanned()
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/cancel", map[string]any{})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400; body %s", resp.StatusCode, raw)
		}
		e := h.decodeError(raw)
		if e.Code != CodeValidation || e.Details["field"] != "reason" {
			t.Fatalf("error = %+v, want validation_failed on reason", e)
		}
	})

	t.Run("blank reason", func(t *testing.T) {
		v := h.createPlanned()
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/cancel", map[string]any{"reason": "   "})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("accepted", func(t *testing.T) {
		v := h.createPlanned()
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/cancel", map[string]any{"reason": "doctor on leave"})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %s", resp.StatusCode, raw)
		}
		got := h.decodeVisit(raw)
		if got.Status != string(domain.StatusCancelled) {
			t.Fatalf("status = %q, want CANCELLED", got.Status)
		}
		if got.CancelReason != "doctor on leave" || got.CancelledAt == nil {
			t.Fatalf("reason/at not recorded: %+v", got)
		}
		if got.Capabilities.CanCancel || got.Capabilities.CanCheckIn {
			t.Fatalf("cancelled visit still offers actions: %+v", got.Capabilities)
		}
	})

	t.Run("after check-in is a conflict", func(t *testing.T) {
		v := h.createPlanned()
		h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/cancel", map[string]any{"reason": "changed my mind"})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
		if e := h.decodeError(raw); e.Code != CodeInvalidState {
			t.Fatalf("code = %q, want invalid_state", e.Code)
		}
	})
}

func TestVoidOnlyFromCheckedIn(t *testing.T) {
	h := newHarness(t)

	t.Run("planned cannot be voided", func(t *testing.T) {
		v := h.createPlanned()
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/void", map[string]any{"reason": "wrong site"})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("checked in can be voided", func(t *testing.T) {
		v := h.createPlanned()
		h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/void", map[string]any{"reason": "left early"})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %s", resp.StatusCode, raw)
		}
		got := h.decodeVisit(raw)
		if got.Status != string(domain.StatusVoided) {
			t.Fatalf("status = %q, want VOIDED", got.Status)
		}
		if got.VoidCause != domain.VoidCauseManual || got.VoidReason != "left early" {
			t.Fatalf("void evidence not recorded: %+v", got)
		}
		if got.Checkin == nil || got.Checkout != nil {
			t.Fatalf("voided visit must keep check-in and have no check-out: %+v", got)
		}
		if got.DurationSeconds != nil {
			t.Fatalf("voided visit must not have a duration, got %d", *got.DurationSeconds)
		}
	})

	t.Run("after check-out the window is closed", func(t *testing.T) {
		v := h.createPlanned()
		h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
		h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkout", map[string]any{"lat": 31.2119, "lng": 121.4661})
		resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/void", map[string]any{"reason": "it was flagged"})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
	})
}

func TestVoidBackfillsLocationFlag(t *testing.T) {
	h := newHarness(t)

	v := h.createPlanned()
	// ~2.2 km east of the hospital: far outside the 500 m rule.
	h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4861})

	resp, raw := h.do(http.MethodPost, "/api/visits/"+v.ID+"/void", map[string]any{"reason": "wrong building"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", resp.StatusCode, raw)
	}
	got := h.decodeVisit(raw)
	if !got.Abnormal || len(got.Flags) == 0 {
		t.Fatalf("voiding hid the location deviation: abnormal=%v flags=%+v", got.Abnormal, got.Flags)
	}
	if got.Flags[0].Code != string(domain.RuleLocationDeviation) {
		t.Fatalf("flag code = %q, want LOCATION_DEVIATION", got.Flags[0].Code)
	}
}

func TestDeleteWindowEnforced(t *testing.T) {
	h := newHarness(t)

	t.Run("inside the window", func(t *testing.T) {
		v := h.createPlanned() // created now, starts in 24h
		resp, raw := h.do(http.MethodDelete, "/api/visits/"+v.ID, nil)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("status = %d, want 204; body %s", resp.StatusCode, raw)
		}
		after := h.repo.records[v.ID]
		if after.Visit.Status != domain.StatusDeleted || after.Visit.DeletedAt == nil {
			t.Fatalf("visit not marked deleted: %+v", after.Visit)
		}
	})

	t.Run("plan starts too soon", func(t *testing.T) {
		v := h.createPlanned()
		h.repo.records[v.ID].Visit.PlannedAt = time.Now().Add(30 * time.Minute)
		resp, raw := h.do(http.MethodDelete, "/api/visits/"+v.ID, nil)
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
		e := h.decodeError(raw)
		if e.Code != CodeInvalidState {
			t.Fatalf("code = %q, want invalid_state", e.Code)
		}
		if !strings.Contains(e.Message, "cancel instead") {
			t.Fatalf("message should point at cancel, got %q", e.Message)
		}
	})

	t.Run("created too long ago", func(t *testing.T) {
		v := h.createPlanned()
		h.repo.records[v.ID].Visit.CreatedAt = time.Now().Add(-3 * time.Hour)
		resp, raw := h.do(http.MethodDelete, "/api/visits/"+v.ID, nil)
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("checked-in visit cannot be deleted", func(t *testing.T) {
		v := h.createPlanned()
		h.do(http.MethodPost, "/api/visits/"+v.ID+"/checkin", map[string]any{"lat": 31.2119, "lng": 121.4661})
		resp, raw := h.do(http.MethodDelete, "/api/visits/"+v.ID, nil)
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409; body %s", resp.StatusCode, raw)
		}
	})
}

// --- actor scoping --------------------------------------------------------

func TestActorScopesVisits(t *testing.T) {
	h := newHarness(t)

	h.createPlanned() // created as mr-1 by default
	other := domain.Visit{
		ID: "visit-other", MRID: "mr-2", HCPID: "hcp-1", ProductID: "prod-1",
		PlannedAt: time.Now().Add(24 * time.Hour), Status: domain.StatusPlanned,
		CreatedAt: time.Now(), UpdatedAt: time.Now(), Version: 1,
	}
	h.repo.records[other.ID] = &store.Record{Visit: other, MRName: "Liu Yang"}

	t.Run("a rep sees only their own", func(t *testing.T) {
		resp, raw := h.doAs("mr-1", http.MethodGet, "/api/visits", nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d; body %s", resp.StatusCode, raw)
		}
		var out struct {
			Count int `json:"count"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if out.Count != 1 {
			t.Fatalf("count = %d, want 1 (only own visits)", out.Count)
		}
	})

	t.Run("an admin sees everyone", func(t *testing.T) {
		resp, raw := h.doAs("admin", http.MethodGet, "/api/visits", nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d; body %s", resp.StatusCode, raw)
		}
		var out struct {
			Count int `json:"count"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if out.Count != 2 {
			t.Fatalf("count = %d, want 2", out.Count)
		}
	})

	t.Run("opening another rep's visit is forbidden", func(t *testing.T) {
		resp, raw := h.doAs("mr-1", http.MethodGet, "/api/visits/"+other.ID, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("status = %d, want 403; body %s", resp.StatusCode, raw)
		}
		if e := h.decodeError(raw); e.Code != CodeForbidden {
			t.Fatalf("code = %q, want forbidden", e.Code)
		}
	})

	t.Run("no header sees nothing", func(t *testing.T) {
		resp, raw := h.doAs("", http.MethodGet, "/api/visits", nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d; body %s", resp.StatusCode, raw)
		}
		var out struct {
			Count int `json:"count"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if out.Count != 0 {
			t.Fatalf("count = %d, want 0: an unknown actor must fail closed", out.Count)
		}
	})
}

func (f *fakeRepo) rules() store.RuleVersion {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.rule
}

func (f *fakeRepo) CurrentRules(ctx context.Context) (store.RuleVersion, error) {
	return f.rules(), nil
}

func (f *fakeRepo) Converge(ctx context.Context, now time.Time) (store.ConvergeResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rules := f.rule
	var out store.ConvergeResult
	for _, rec := range f.records {
		switch rec.Visit.Status {
		case domain.StatusPlanned:
			if rec.Visit.PlannedAt.Add(time.Duration(rules.TimeoutHours) * time.Hour).Before(now) {
				at := now
				rec.Visit.Status = domain.StatusCancelled
				rec.Visit.CancelReason = "超时未签到（系统代取消）"
				rec.Visit.CancelledAt = &at
				out.Cancelled++
			}
		case domain.StatusCheckedIn:
			if rec.Visit.CheckinAt != nil &&
				rec.Visit.CheckinAt.Add(time.Duration(rules.TimeoutHours)*time.Hour).Before(now) {
				at := now
				rec.Visit.Status = domain.StatusVoided
				rec.Visit.VoidReason = "超时未签退（系统作废）"
				rec.Visit.VoidCause = domain.VoidCauseTimeout
				rec.Visit.VoidedAt = &at
				out.Voided++
			}
		}
	}
	return out, nil
}

func (f *fakeRepo) SetRules(ctx context.Context, th domain.Thresholds, by, note string) (store.RuleVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.rule.MinDurationSeconds == th.MinDurationSeconds && f.rule.MaxDistanceMeters == th.MaxDistanceMeters {
		return f.rule, nil
	}
	f.rule = store.RuleVersion{
		Version:            "v2",
		MinDurationSeconds: th.MinDurationSeconds,
		MaxDistanceMeters:  th.MaxDistanceMeters,
		CreatedBy:          by,
		Note:               note,
	}
	return f.rule, nil
}

func TestTimeoutSweepOnRead(t *testing.T) {
	h := newHarness(t)

	// A plan whose time passed long ago, and a visit checked in and abandoned.
	old := domain.Visit{
		ID: "stale-plan", MRID: "mr-1", HCPID: "hcp-1", ProductID: "prod-1",
		PlannedAt: time.Now().Add(-48 * time.Hour), Status: domain.StatusPlanned,
		CreatedAt: time.Now().Add(-49 * time.Hour), UpdatedAt: time.Now().Add(-49 * time.Hour), Version: 1,
	}
	h.repo.records[old.ID] = &store.Record{Visit: old, MRName: "张伟"}

	checkin := time.Now().Add(-30 * time.Hour)
	stale := domain.Visit{
		ID: "stale-visit", MRID: "mr-1", HCPID: "hcp-1", ProductID: "prod-1",
		PlannedAt: time.Now().Add(-31 * time.Hour), Status: domain.StatusCheckedIn,
		CheckinAt: &checkin, CheckinPos: &domain.Coordinates{Lat: 31.2119, Lng: 121.4661},
		CreatedAt: time.Now().Add(-32 * time.Hour), UpdatedAt: time.Now().Add(-32 * time.Hour), Version: 2,
	}
	h.repo.records[stale.ID] = &store.Record{
		Visit: stale, MRName: "张伟", HospitalBase: domain.Coordinates{Lat: 31.2119, Lng: 121.4661},
	}

	// Reading is what applies the sweep.
	resp, raw := h.doAs("mr-1", http.MethodGet, "/api/visits", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list: status %d body %s", resp.StatusCode, raw)
	}

	plan := h.repo.records["stale-plan"].Visit
	if plan.Status != domain.StatusCancelled {
		t.Fatalf("stale plan is %s, want CANCELLED", plan.Status)
	}
	if plan.CancelReason == "" {
		t.Fatalf("system cancellation must record why")
	}

	visit := h.repo.records["stale-visit"].Visit
	if visit.Status != domain.StatusVoided {
		t.Fatalf("abandoned visit is %s, want VOIDED", visit.Status)
	}
	if visit.VoidCause != domain.VoidCauseTimeout {
		t.Fatalf("void cause = %q, want TIMEOUT", visit.VoidCause)
	}

	// Second read: nothing left to do. This is the property that makes a
	// read-time sweep safe.
	second, err := h.repo.Converge(context.Background(), time.Now())
	if err != nil {
		t.Fatalf("second sweep: %v", err)
	}
	if second.Cancelled != 0 || second.Voided != 0 {
		t.Fatalf("sweep is not idempotent: %+v", second)
	}
}

func (f *fakeRepo) RuleHistory(ctx context.Context, limit int) ([]store.RuleVersion, error) {
	return []store.RuleVersion{f.rules()}, nil
}

func (f *fakeRepo) SetRulesWithTimeouts(
	ctx context.Context, th domain.Thresholds, timeoutHours, reportTimeoutHours int, by, note string,
) (store.RuleVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.rule.MinDurationSeconds == th.MinDurationSeconds &&
		f.rule.MaxDistanceMeters == th.MaxDistanceMeters &&
		f.rule.TimeoutHours == timeoutHours &&
		f.rule.ReportTimeoutHours == reportTimeoutHours {
		return f.rule, nil
	}
	f.rule = store.RuleVersion{
		Version:            "v2",
		MinDurationSeconds: th.MinDurationSeconds,
		MaxDistanceMeters:  th.MaxDistanceMeters,
		TimeoutHours:       timeoutHours,
		ReportTimeoutHours: reportTimeoutHours,
		CreatedBy:          by,
		Note:               note,
	}
	return f.rule, nil
}

func TestRepCannotPlanForAnotherRep(t *testing.T) {
	h := newHarness(t)

	body := map[string]any{
		"mrId": "mr-2", "hcpId": "hcp-1", "productId": "prod-1",
		"plannedAt": time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339),
	}

	t.Run("rep posting another rep's id is forbidden", func(t *testing.T) {
		resp, raw := h.doAs("mr-1", http.MethodPost, "/api/visits", body)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("status = %d, want 403; body %s", resp.StatusCode, raw)
		}
		if e := h.decodeError(raw); e.Code != CodeForbidden {
			t.Fatalf("code = %q, want forbidden", e.Code)
		}
	})

	t.Run("rep posting their own id is accepted", func(t *testing.T) {
		own := map[string]any{
			"mrId": "mr-1", "hcpId": "hcp-1", "productId": "prod-1",
			"plannedAt": time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339),
		}
		resp, raw := h.doAs("mr-1", http.MethodPost, "/api/visits", own)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %s", resp.StatusCode, raw)
		}
	})

	t.Run("the admin may plan on a rep's behalf", func(t *testing.T) {
		resp, raw := h.doAs("admin", http.MethodPost, "/api/visits", body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %s", resp.StatusCode, raw)
		}
	})
}

// TestRepCannotMutateAnotherRepsVisit covers the whole mutation surface, not just
// create: the first version scoped the list by actor and then let any id be
// mutated, so a rep could check out someone else's visit.
func TestRepCannotMutateAnotherRepsVisit(t *testing.T) {
	h := newHarness(t)

	other := domain.Visit{
		ID: "visit-mr2", MRID: "mr-2", HCPID: "hcp-1", ProductID: "prod-1",
		PlannedAt: time.Now().Add(24 * time.Hour), Status: domain.StatusPlanned,
		CreatedAt: time.Now(), UpdatedAt: time.Now(), Version: 1,
	}
	h.repo.records[other.ID] = &store.Record{Visit: other, MRName: "李娜"}
	checkin := time.Now().Add(-time.Hour)
	checkedIn := domain.Visit{
		ID: "visit-mr2-in", MRID: "mr-2", HCPID: "hcp-1", ProductID: "prod-1",
		PlannedAt: time.Now().Add(-2 * time.Hour), Status: domain.StatusCheckedIn,
		CheckinAt: &checkin, CheckinPos: &domain.Coordinates{Lat: 31.2119, Lng: 121.4661},
		CreatedAt: time.Now().Add(-3 * time.Hour), UpdatedAt: time.Now(), Version: 2,
	}
	h.repo.records[checkedIn.ID] = &store.Record{Visit: checkedIn, MRName: "李娜"}

	cases := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"check in", http.MethodPost, "/api/visits/visit-mr2/checkin", map[string]any{"lat": 31.2, "lng": 121.4}},
		{"check out", http.MethodPost, "/api/visits/visit-mr2-in/checkout", map[string]any{"lat": 31.2, "lng": 121.4}},
		{"report", http.MethodPut, "/api/visits/visit-mr2-in/report", map[string]any{"talkingPoints": "x"}},
		{"cancel", http.MethodPost, "/api/visits/visit-mr2/cancel", map[string]any{"reason": "x"}},
		{"void", http.MethodPost, "/api/visits/visit-mr2-in/void", map[string]any{"reason": "x"}},
		{"delete", http.MethodDelete, "/api/visits/visit-mr2", nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := h.doAs("mr-1", tc.method, tc.path, tc.body)
			if resp.StatusCode != http.StatusForbidden {
				t.Fatalf("status = %d, want 403; body %s", resp.StatusCode, raw)
			}
			if e := h.decodeError(raw); e.Code != CodeForbidden {
				t.Fatalf("code = %q, want forbidden", e.Code)
			}
		})
	}

	// Nothing above may have changed the rows.
	if h.repo.records["visit-mr2"].Visit.Status != domain.StatusPlanned {
		t.Fatalf("the other rep's plan was modified")
	}
	if h.repo.records["visit-mr2-in"].Visit.Status != domain.StatusCheckedIn {
		t.Fatalf("the other rep's checked-in visit was modified")
	}
}
