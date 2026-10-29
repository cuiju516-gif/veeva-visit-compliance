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
	Limit     int
}

// MonthlyRow is one product in one month on the dashboard.
type MonthlyRow struct {
	Month         string  `json:"month"`
	ProductID     string  `json:"productId"`
	ProductName   string  `json:"productName"`
	Visits        int     `json:"visits"`
	Abnormal      int     `json:"abnormal"`
	AbnormalShare float64 `json:"abnormalShare"`
}

// Dashboard is the monthly per-product aggregation.
type Dashboard struct {
	Months        []string     `json:"months"`
	Rows          []MonthlyRow `json:"rows"`
	TotalVisits   int          `json:"totalVisits"`
	TotalAbnormal int          `json:"totalAbnormal"`
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
	CheckOut(ctx context.Context, id string, at time.Time, pos domain.Coordinates, th domain.Thresholds) (Record, error)
	SubmitReport(ctx context.Context, id string, p ReportParams) (Record, error)
	Dashboard(ctx context.Context, months int) (Dashboard, error)
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

// Is keeps errors.Is(err, ErrInvalidState) working for callers that only care
// about the class of error.
func (e *StateError) Is(target error) bool { return target == ErrInvalidState }
