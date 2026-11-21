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
		t.Fatalf("metrics status = %d", w.Code)
	}
	return w.Body.String()
}

func TestInstrumentTracksRequestsAndCreates(t *testing.T) {
	rec := New()
	mux := http.NewServeMux()
	mux.Handle("POST /api/v1/shares", rec.Instrument(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Fail") == "1" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})))
	mux.Handle("GET /api/v1/shares/{id}", rec.Instrument(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})))

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/shares", nil))

	r := httptest.NewRequest(http.MethodPost, "/api/v1/shares", nil)
	r.Header.Set("X-Fail", "1")
	mux.ServeHTTP(httptest.NewRecorder(), r)

	mux.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodHead, "/api/v1/shares/abc", nil))
	mux.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/shares/abc", nil))

	out := scrape(t, rec)
	for _, want := range []string{
		`http_requests_total{handler="/api/v1/shares",method="POST",status="201"} 1`,
		`http_requests_total{handler="/api/v1/shares",method="POST",status="400"} 1`,
		`http_requests_total{handler="/api/v1/shares/{id}",method="GET",status="200"} 1`,
		`http_requests_total{handler="/api/v1/shares/{id}",method="HEAD",status="200"} 1`,
		`shares_created_total 1`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

func TestHandlerLabel(t *testing.T) {
	for _, tc := range []struct {
		pattern, method, want string
	}{
		{"", http.MethodGet, "unmatched"},
		{"POST /api/v1/shares", http.MethodPost, "/api/v1/shares"},
		{"GET /api/v1/shares/{id}", http.MethodHead, "/api/v1/shares/{id}"},
		{"/api/v1/shares", http.MethodDelete, "/api/v1/shares"},
	} {
		if got := handlerLabel(tc.pattern, tc.method); got != tc.want {
			t.Errorf("handlerLabel(%q, %q) = %q, want %q", tc.pattern, tc.method, got, tc.want)
		}
	}
}

func TestRecordJob(t *testing.T) {
	rec := New()
	rec.RecordJob(JobSweep, 7, 15*time.Millisecond, nil)
	rec.RecordJob(JobSweep, 0, 5*time.Millisecond, errors.New("boom"))

	out := scrape(t, rec)
	for _, want := range []string{
		`job_runs_total{name="sweep",result="success"} 1`,
		`job_runs_total{name="sweep",result="error"} 1`,
		`job_processed_total{name="sweep"} 7`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

func TestRegisterStorageStats(t *testing.T) {
	rec := New()
	var fail bool
	rec.RegisterStorageStats(func() (int64, int64, error) {
		if fail {
			return 0, 0, errors.New("closed")
		}
		return 12, 4096, nil
	})

	out := scrape(t, rec)
	if !strings.Contains(out, "shares_active 12") || !strings.Contains(out, "shares_active_bytes 4096") {
		t.Fatalf("missing storage metrics:\n%s", out)
	}

	fail = true
	out = scrape(t, rec)
	if strings.Contains(out, "shares_active ") || strings.Contains(out, "shares_active_bytes ") {
		t.Fatalf("emitted storage metrics on error:\n%s", out)
	}
}
