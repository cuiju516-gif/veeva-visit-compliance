package webui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The embedded bundle is the only thing standing between a reviewer and a blank
// page, and `go:embed` failing silently is a classic way to ship a 404. These
// tests fail if the build did not produce the three files or if the SPA
// fallback stops working.

func TestIndexIsServed(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", ct)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "/app.js") || !strings.Contains(body, "/app.css") {
		t.Fatalf("index.html does not reference the bundle: %s", body)
	}
}

func TestBundleIsServed(t *testing.T) {
	for _, path := range []string{"/app.js", "/app.css"} {
		rec := httptest.NewRecorder()
		Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200 (did `make web` run before `go build`?)", path, rec.Code)
		}
		if rec.Body.Len() < 1000 {
			t.Fatalf("%s: body is only %d bytes, looks like a placeholder", path, rec.Body.Len())
		}
	}
}

// A deep link such as /visits/<id> must survive a hard refresh: the client
// router owns those paths, so the server has to hand back the shell.
func TestUnknownPathFallsBackToIndex(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/visits/44444444-4444", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<!doctype html") {
		t.Fatalf("SPA fallback did not return the shell: %s", rec.Body.String())
	}
}

func TestIndexIsNotCachedButBundleMayBe(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if got := rec.Header().Get("Cache-Control"); !strings.Contains(got, "no-cache") {
		t.Fatalf("index Cache-Control = %q, want no-cache", got)
	}
}
