package api

import (
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// Wire types. They are separate from domain.Visit on purpose: the JSON shape is
// a contract with the frontend, and it must not change just because an internal
// field was renamed.

type pointDTO struct {
	At  time.Time `json:"at"`
	Lat float64   `json:"lat"`
	Lng float64   `json:"lng"`
}

type flagDTO struct {
	Code   string `json:"code"`
	Detail string `json:"detail"`
}

type materialDTO struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

// capabilitiesDTO lets the UI disable the right button without duplicating the
// state machine in TypeScript. The server still re-checks everything.
type capabilitiesDTO struct {
	CanCheckIn  bool `json:"canCheckIn"`
	CanCheckOut bool `json:"canCheckOut"`
	CanReport   bool `json:"canReport"`
}

type visitDTO struct {
	ID     string `json:"id"`
	Status string `json:"status"`

	MRID        string `json:"mrId"`
	MRName      string `json:"mrName"`
	HCPID       string `json:"hcpId"`
	HCPName     string `json:"hcpName"`
	ProductID   string `json:"productId"`
	ProductName string `json:"productName"`

	HospitalName string  `json:"hospitalName"`
	Department   string  `json:"department"`
	BaseLat      float64 `json:"baseLat"`
	BaseLng      float64 `json:"baseLng"`

	PlannedAt time.Time `json:"plannedAt"`

	Checkin  *pointDTO `json:"checkin,omitempty"`
	Checkout *pointDTO `json:"checkout,omitempty"`

	// DurationSeconds is null until check-out, and is always server-derived.
	DurationSeconds *int64 `json:"durationSeconds,omitempty"`

	Abnormal bool      `json:"abnormal"`
	Flags    []flagDTO `json:"flags"`

	TalkingPoints        string        `json:"talkingPoints"`
	HCPFeedback          string        `json:"hcpFeedback"`
	MaterialsDistributed bool          `json:"materialsDistributed"`
	Materials            []materialDTO `json:"materials"`

	Capabilities capabilitiesDTO `json:"capabilities"`

	Version   int       `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func toVisitDTO(rec store.Record) visitDTO {
	v := rec.Visit

	dto := visitDTO{
		ID:                   v.ID,
		Status:               string(v.Status),
		MRID:                 v.MRID,
		MRName:               rec.MRName,
		HCPID:                v.HCPID,
		HCPName:              rec.HCPName,
		ProductID:            v.ProductID,
		ProductName:          rec.ProductName,
		HospitalName:         rec.HospitalName,
		Department:           rec.Department,
		BaseLat:              rec.HospitalBase.Lat,
		BaseLng:              rec.HospitalBase.Lng,
		PlannedAt:            v.PlannedAt,
		Abnormal:             domain.IsAbnormal(v.Flags),
		TalkingPoints:        v.TalkingPoints,
		HCPFeedback:          v.HCPFeedback,
		MaterialsDistributed: v.MaterialsDistributed,
		Capabilities: capabilitiesDTO{
			CanCheckIn:  domain.CanCheckIn(v.Status),
			CanCheckOut: domain.CanCheckOut(v.Status),
			CanReport:   domain.CanReport(v.Status),
		},
		Version:   v.Version,
		CreatedAt: v.CreatedAt,
		UpdatedAt: v.UpdatedAt,
	}

	if v.CheckinAt != nil && v.CheckinPos != nil {
		dto.Checkin = &pointDTO{At: *v.CheckinAt, Lat: v.CheckinPos.Lat, Lng: v.CheckinPos.Lng}
	}
	if v.CheckoutAt != nil && v.CheckoutPos != nil {
		dto.Checkout = &pointDTO{At: *v.CheckoutAt, Lat: v.CheckoutPos.Lat, Lng: v.CheckoutPos.Lng}
	}
	// Present exactly when a check-out exists, including a zero-second stay:
	// omitting the field for 0 made "not checked out yet" and "checked out
	// immediately" indistinguishable on the wire.
	if v.CheckoutAt != nil {
		secs := int64(v.Duration.Seconds())
		dto.DurationSeconds = &secs
	}

	dto.Flags = make([]flagDTO, 0, len(v.Flags))
	for _, f := range v.Flags {
		dto.Flags = append(dto.Flags, flagDTO{Code: string(f.Code), Detail: f.Detail})
	}

	dto.Materials = make([]materialDTO, 0, len(rec.Materials))
	for _, m := range rec.Materials {
		dto.Materials = append(dto.Materials, materialDTO{Name: m.Name, Kind: m.Kind})
	}

	return dto
}

func toVisitDTOs(recs []store.Record) []visitDTO {
	out := make([]visitDTO, 0, len(recs))
	for _, r := range recs {
		out = append(out, toVisitDTO(r))
	}
	return out
}
