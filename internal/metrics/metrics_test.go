package metrics

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func scrape(t *testing.T, rec *Recorder) string {
	t.Helper()
	w := httptest.NewRecorder()
	rec.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("metrics: %d %s", w.Code, w.Body)
	}
	return w.Body.String()
}

func TestHTTPLabelsUseRouteTemplates(t *testing.T) {
	rec := New()
	h := rec.Instrument(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/shares", nil)
	req.Pattern = "POST /api/v1/shares"
	h.ServeHTTP(httptest.NewRecorder(), req)

	body := scrape(t, rec)
	if !strings.Contains(body, `http_requests_total{handler="/api/v1/shares",method="POST",status_class="2xx"} 1`) {
		t.Fatalf("requests: %s", body)
	}
	if !strings.Contains(body, `http_request_duration_seconds_count{handler="/api/v1/shares",method="POST"} 1`) {
		t.Fatalf("duration: %s", body)
	}
	if !strings.Contains(body, "shares_created_total 1") {
		t.Fatalf("created: %s", body)
	}
	if strings.Contains(body, `route="create"`) || strings.Contains(body, `handler="create"`) {
		t.Fatalf("legacy operation label: %s", body)
	}
}

func TestUnmatchedAndHEADUseMuxPattern(t *testing.T) {
	rec := New()
	h := rec.Instrument(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))

	notFound := httptest.NewRequest(http.MethodPost, "/api/nope", nil)
	notFound.Pattern = "POST /api/{path...}"
	h.ServeHTTP(httptest.NewRecorder(), notFound)

	head := rec.Instrument(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	peek := httptest.NewRequest(http.MethodHead, "/api/v1/shares/01ARZ3NDEKTSV4RRFFQ69G5FAV", nil)
	peek.Pattern = "GET /api/v1/shares/{id}"
	head.ServeHTTP(httptest.NewRecorder(), peek)

	body := scrape(t, rec)
	if !strings.Contains(body, `http_requests_total{handler="/api/{path...}",method="POST",status_class="4xx"} 1`) {
		t.Fatalf("unmatched: %s", body)
	}
	if !strings.Contains(body, `http_requests_total{handler="/api/v1/shares/{id}",method="HEAD",status_class="2xx"} 1`) {
		t.Fatalf("head: %s", body)
	}
	if strings.Contains(body, "shares_created_total 1") {
		t.Fatalf("unmatched POST counted as create: %s", body)
	}
}

func TestRecordCleanup(t *testing.T) {
	rec := New()
	rec.RecordCleanup(3, 12*time.Millisecond, nil)
	rec.RecordCleanup(1, time.Millisecond, errors.New("db locked"))

	body := scrape(t, rec)
	if !strings.Contains(body, "shares_expired_deleted_total 4") {
		t.Fatalf("deleted: %s", body)
	}
	if !strings.Contains(body, `shares_cleanup_runs_total{result="success"} 1`) {
		t.Fatalf("success: %s", body)
	}
	if !strings.Contains(body, `shares_cleanup_runs_total{result="error"} 1`) {
		t.Fatalf("error: %s", body)
	}
	if !strings.Contains(body, "shares_cleanup_duration_seconds_count 2") {
		t.Fatalf("duration: %s", body)
	}
	if !strings.Contains(body, "shares_cleanup_last_success_timestamp_seconds") {
		t.Fatalf("timestamp: %s", body)
	}
	if strings.Contains(body, "sweep_deleted_total") {
		t.Fatalf("legacy sweep name: %s", body)
	}
}
