package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// Error codes are part of the API contract: the TypeScript client switches on
// them, so they are stable strings rather than HTTP-status-derived guesses.
const (
	CodeValidation   = "validation_failed"
	CodeNotFound     = "not_found"
	CodeInvalidState = "invalid_state"
	CodeConflict     = "conflict"
	CodeInternal     = "internal_error"
)

// apiError is the single error envelope used by every endpoint:
//
//	{"error": {"code": "invalid_state", "message": "...", "details": {"status": "CHECKED_OUT"}}}
type apiError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

type errorResponse struct {
	Error apiError `json:"error"`
}

// validationError marks a request-shape problem: bad JSON, missing field, a
// latitude outside ±90. It is a distinct type so handleError can tell "your
// input is wrong" (400) from "the database said no" (500).
type validationError struct {
	msg     string
	details map[string]string
}

func (e *validationError) Error() string { return e.msg }

func invalid(format string, args ...any) error {
	return &validationError{msg: fmt.Sprintf(format, args...)}
}

func invalidField(field, format string, args ...any) error {
	return &validationError{
		msg:     fmt.Sprintf(format, args...),
		details: map[string]string{"field": field},
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		// The status line is already on the wire; logging is all that is left.
		slog.Error("encode response", "err", err)
	}
}

func (s *Server) fail(w http.ResponseWriter, status int, code, msg string, details map[string]string) {
	writeJSON(w, status, errorResponse{Error: apiError{Code: code, Message: msg, Details: details}})
}

// handleError maps a repository/domain error onto the wire.
//
// 404 vs 409 matters to the client: "this visit does not exist" and "this visit
// is not in the state you think it is" call for different UI responses,
// reloading the list versus refreshing this visit.
func (s *Server) handleError(w http.ResponseWriter, r *http.Request, err error) {
	var ve *validationError
	var se *store.StateError

	switch {
	case errors.As(err, &ve):
		s.fail(w, http.StatusBadRequest, CodeValidation, ve.msg, ve.details)

	case errors.Is(err, store.ErrNotFound):
		s.fail(w, http.StatusNotFound, CodeNotFound, "visit not found", nil)

	case errors.As(err, &se):
		s.fail(w, http.StatusConflict, CodeInvalidState, se.Error(), map[string]string{
			"status": string(se.Status),
			"action": se.Action,
		})

	case errors.Is(err, store.ErrInvalidState):
		s.fail(w, http.StatusConflict, CodeInvalidState, err.Error(), nil)

	case errors.Is(err, store.ErrAlreadyCheckedIn):
		s.fail(w, http.StatusConflict, CodeConflict,
			"this rep is already checked in on another visit; check out of it first", nil)

	case errors.Is(err, store.ErrConcurrentUpdate):
		s.fail(w, http.StatusConflict, CodeConflict,
			"the visit was modified by someone else; reload and try again", nil)

	case errors.Is(err, contextDeadline):
		s.fail(w, http.StatusGatewayTimeout, CodeInternal, "the request timed out", nil)

	default:
		s.log.Error("unhandled error", "path", r.URL.Path, "err", err)
		s.fail(w, http.StatusInternalServerError, CodeInternal, "internal error", nil)
	}
}

var contextDeadline = errors.New("context deadline exceeded")

// decodeJSON reads exactly one JSON document from the request body.
//
// DisallowUnknownFields turns a typo'd field name into a 400 instead of a
// silently ignored value: that is the difference between "the form is broken"
// and "the rep's 4-hour visit was stored with no product".
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return invalid("malformed JSON body: %v", err)
	}
	if dec.More() {
		return invalid("unexpected trailing data after JSON body")
	}
	return nil
}
