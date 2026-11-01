package store

import (
	"context"
	"errors"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
)

// Sentinel errors the API layer maps onto HTTP status codes.
var (
	// ErrNotFound means the visit id does not exist.
	ErrNotFound = errors.New("visit not found")
	// ErrInvalidState means the visit exists but the transition is illegal.
	ErrInvalidState = errors.New("invalid state")
	// ErrConcurrentUpdate means the optimistic lock lost: someone else wrote
	// the row between our read and our write.
	ErrConcurrentUpdate = errors.New("concurrent update")
	// ErrReasonRequired means a cancel or void arrived without a reason. The API
	// rejects it first; the store refuses as well so that no other caller can
	// write a terminal row that cannot be explained.
	ErrReasonRequired = errors.New("reason is required")
	// ErrAlreadyCheckedIn means the rep is already checked in somewhere else.
	// A rep cannot be in two hospitals at once (uq_visit_mr_active), and a client
	// that opens two tabs gets a conflict rather than a server error.
	ErrAlreadyCheckedIn = errors.New("another visit is already in progress")
)

// Material is one item of academic material shown or handed over.
type Material struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

// Record is a visit plus the denormalised names the UI needs to render a row
// without a second round trip.
type Record struct {
	Visit        domain.Visit
	MRName       string
	HCPName      string
	HospitalName string
	Department   string
	HospitalBase domain.Coordinates
	ProductName  string
	Materials    []Material
}

// Catalog is the reference data that fills the form's dropdowns.
type Catalog struct {
	MRs      []MR      `json:"mrs"`
	HCPs     []HCP     `json:"hcps"`
	Products []Product `json:"products"`
}

// MR is a pharma representative.
type MR struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Region string `json:"region"`
}

// HCP is a healthcare professional, carrying the hospital's baseline point.
type HCP struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	HospitalName string  `json:"hospitalName"`
	Department   string  `json:"department"`
	BaseLat      float64 `json:"baseLat"`
	BaseLng      float64 `json:"baseLng"`
	// HospitalID is the normalised link; the three fields above are projected
	// from it so the form does not need a second round trip.
	HospitalID string `json:"hospitalId"`
}

// Product is the detailing target.
type Product struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// CreateParams is the input for step 1, plan a visit.
type CreateParams struct {
	MRID      string
	HCPID     string
	ProductID string
	PlannedAt time.Time
}

// ReportParams is the input for step 5, the call report.
type ReportParams struct {
	TalkingPoints        string
	HCPFeedback          string
	MaterialsDistributed bool
	Materials            []Material
}

// ListParams filters the visit list. All fields are optional.
type ListParams struct {
	Status    domain.Status
	ProductID string
	// MRID limits the result to one rep's visits. Empty means "all", which only
	// an admin actor is allowed to ask for.
	MRID  string
	Limit int
}

// RuleVersion is one row of the threshold history. The latest row is the one in
// force; older rows exist so a past evaluation can still be explained.
type RuleVersion struct {
	Version            string    `json:"version"`
	MinDurationSeconds int       `json:"minDurationSeconds"`
	MaxDistanceMeters  float64   `json:"maxDistanceMeters"`
	CreatedAt          time.Time `json:"createdAt"`
	CreatedBy          string    `json:"createdBy"`
	Note               string    `json:"note"`
}

// Thresholds converts a version into the domain type the rule engine takes.
func (r RuleVersion) Thresholds() domain.Thresholds {
	return domain.Thresholds{
		MinDurationSeconds: r.MinDurationSeconds,
		MaxDistanceMeters:  r.MaxDistanceMeters,
	}
}

// MonthlyRow is one product in one month on the dashboard.
//
// The five counters are the ones the frozen baseline defines. They are mutually
// exclusive by construction: a visit lands in exactly one of Done / Cancelled /
// Voided, and Deleted lands in none. Effective = Done - Abnormal.
type MonthlyRow struct {
	Month         string  `json:"month"`
	ProductID     string  `json:"productId"`
	ProductName   string  `json:"productName"`
	Visits        int     `json:"visits"` // Done + Cancelled + Voided
	Done          int     `json:"done"`
	Effective     int     `json:"effective"`
	Abnormal      int     `json:"abnormal"`
	Cancelled     int     `json:"cancelled"`
	Voided        int     `json:"voided"`
	AbnormalShare float64 `json:"abnormalShare"`
}

// Dashboard is the monthly per-product aggregation plus the same five numbers
// across all products.
type Dashboard struct {
	Months         []string     `json:"months"`
	Rows           []MonthlyRow `json:"rows"`
	TotalVisits    int          `json:"totalVisits"`
	TotalDone      int          `json:"totalDone"`
	TotalEffective int          `json:"totalEffective"`
	TotalAbnormal  int          `json:"totalAbnormal"`
	TotalCancelled int          `json:"totalCancelled"`
	TotalVoided    int          `json:"totalVoided"`
}

// Repo is the persistence contract. Two implementations exist on purpose: the
// Postgres one is what ships, and the API tests use an in-memory fake so that
// `go test ./...` needs no database.
type Repo interface {
	Catalog(ctx context.Context) (Catalog, error)
	Create(ctx context.Context, p CreateParams) (Record, error)
	Get(ctx context.Context, id string) (Record, error)
	List(ctx context.Context, p ListParams) ([]Record, error)
	CheckIn(ctx context.Context, id string, at time.Time, pos domain.Coordinates) (Record, error)
	CheckOut(ctx context.Context, id string, at time.Time, pos domain.Coordinates) (Record, error)
	SubmitReport(ctx context.Context, id string, p ReportParams) (Record, error)
	Cancel(ctx context.Context, id, reason string, at time.Time) (Record, error)
	Void(ctx context.Context, id, reason string, at time.Time) (Record, error)
	Delete(ctx context.Context, id string, now time.Time) (Record, error)
	Dashboard(ctx context.Context, months int, mrid string) (Dashboard, error)
	CurrentRules(ctx context.Context) (RuleVersion, error)
	// SetRules creates a new version when the thresholds actually change, and
	// returns the resulting version either way.
	SetRules(ctx context.Context, th domain.Thresholds, by, note string) (RuleVersion, error)
}

// StateError means the visit exists but is not in a state that allows the
// requested action. The API maps it to 409 and tells the client which state it
// actually found, so the UI can refresh instead of guessing.
type StateError struct {
	Status domain.Status
	Action string
}

func (e *StateError) Error() string {
	return "visit is " + string(e.Status) + ", cannot " + e.Action
}

// DeleteWindowError reports a refused delete with the specific condition that
// failed. It satisfies errors.Is(err, ErrInvalidState) so the API maps it to 409
// without a second mapping table.
type DeleteWindowError struct {
	Reason string
}

func (e *DeleteWindowError) Error() string { return "delete window closed: " + e.Reason }

// Is makes a closed window a flavour of invalid state: the client reacts the
// same way (reload the visit, offer cancel instead), and it is not a 400.
func (e *DeleteWindowError) Is(target error) bool { return target == ErrInvalidState }

// Is keeps errors.Is(err, ErrInvalidState) working for callers that only care
// about the class of error.
func (e *StateError) Is(target error) bool { return target == ErrInvalidState }
