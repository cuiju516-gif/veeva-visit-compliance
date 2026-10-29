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
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		records: map[string]*store.Record{},
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

func (f *fakeRepo) CheckOut(ctx context.Context, id string, at time.Time, pos domain.Coordinates, th domain.Thresholds) (store.Record, error) {
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
	flags, err := domain.Evaluate(domain.EvaluationInput{
		CheckinAt: *rec.Visit.CheckinAt, CheckoutAt: at,
		Checkin: *rec.Visit.CheckinPos, Checkout: pos,
		HospitalBase: rec.HospitalBase, Thresholds: th,
	})
	if err != nil {
		return store.Record{}, err
	}

	rec.Visit.Status = domain.StatusCheckedOut
	rec.Visit.CheckoutAt = &at
	rec.Visit.CheckoutPos = &pos
	rec.Visit.Duration = duration
	rec.Visit.Flags = flags
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

func (f *fakeRepo) Dashboard(ctx context.Context, months int) (store.Dashboard, error) {
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

func (h *harness) do(method, path string, body any) (*http.Response, []byte) {
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
	resp, raw := h.do(http.MethodPost, "/api/visits", map[string]any{
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
	resp, raw := h.do(http.MethodPost, "/api/visits", map[string]any{
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
			resp, raw := h.do(http.MethodPost, "/api/visits", tc.body)
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

	resp, raw := h.do(http.MethodGet, "/api/visits?status=PLANNED", nil)
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
