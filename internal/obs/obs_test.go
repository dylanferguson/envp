package obs

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testRecorder(t *testing.T, probe Probe) *Recorder {
	t.Helper()
	rec, err := New(Options{DB: probe, Now: func() time.Time { return time.Unix(1_700_000_000, 0) }})
	if err != nil {
		t.Fatal(err)
	}
	return rec
}

func scrapeMetrics(t *testing.T, rec *Recorder) string {
	t.Helper()
	mux := http.NewServeMux()
	rec.Mount(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, MetricsPath, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("metrics status = %d", w.Code)
	}
	return w.Body.String()
}

func TestInstrumentMetrics(t *testing.T) {
	rec := testRecorder(t, func(context.Context) error { return nil })
	mux := http.NewServeMux()
	rec.Mount(mux)
	track := rec.Instrument

	mux.Handle("POST /create", track(RouteCreate, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})))
	mux.Handle("GET /limited", track(RouteCreate, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	})))
	mux.Handle("GET /static", track(RouteStatic, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	})))

	before := scrapeMetrics(t, rec)
	for _, req := range []*http.Request{
		httptest.NewRequest(http.MethodPost, "/create", nil),
		httptest.NewRequest(http.MethodGet, "/limited", nil),
		httptest.NewRequest(http.MethodGet, "/static", nil),
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
	}
	after := scrapeMetrics(t, rec)

	if strings.Contains(after, `route="metrics"`) {
		t.Fatal("metrics counted /metrics")
	}
	if strings.Count(after, "http_requests_total{") <= strings.Count(before, "http_requests_total{") {
		t.Fatal("instrumented routes did not increment http_requests_total")
	}
	for _, want := range []string{
		`http_requests_total{route="create",status_class="2xx"} 1`,
		`http_requests_total{route="create",status_class="4xx"} 1`,
		`http_requests_total{route="static",status_class="2xx"} 1`,
		`shares_created_total 1`,
		`rate_limit_exceeded_total{route="create"} 1`,
		`rate_limit_exceeded_total{route="get"} 0`,
		`http_request_duration_seconds_bucket{route="create",le="0.005"}`,
		`http_request_duration_seconds_bucket{route="create",le="2"}`,
	} {
		if !strings.Contains(after, want) {
			t.Fatalf("missing %q in metrics:\n%s", want, after)
		}
	}
	if strings.Contains(after, `route="static",le=`) {
		t.Fatal("static route must not have duration histogram")
	}
	for _, bucket := range []string{"0.005", "0.02", "0.1", "0.5", "2"} {
		if !strings.Contains(after, `le="`+bucket+`"`) {
			t.Fatalf("missing bucket %s", bucket)
		}
	}
}

func TestZeroRoutePanics(t *testing.T) {
	rec := testRecorder(t, func(context.Context) error { return nil })
	defer func() {
		if recover() == nil {
			t.Fatal("zero Route must panic")
		}
	}()
	rec.Instrument(Route{}, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
}

func TestSwept(t *testing.T) {
	rec := testRecorder(t, func(context.Context) error { return nil })
	rec.Swept(3)
	body := scrapeMetrics(t, rec)
	if !strings.Contains(body, "sweep_deleted_total 3") {
		t.Fatalf("sweep_deleted_total: %s", body)
	}
}

func TestHealthPassAndFail(t *testing.T) {
	ok := testRecorder(t, func(context.Context) error { return nil })
	fail := testRecorder(t, func(context.Context) error { return errors.New("db down") })

	for _, tc := range []struct {
		name   string
		rec    *Recorder
		status int
		pass   bool
	}{
		{"pass", ok, http.StatusOK, true},
		{"fail", fail, http.StatusServiceUnavailable, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			tc.rec.Mount(mux)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, HealthPath, nil))
			if w.Code != tc.status {
				t.Fatalf("status = %d", w.Code)
			}
			if ct := w.Header().Get("Content-Type"); ct != "application/health+json" {
				t.Fatalf("content-type = %q", ct)
			}
			var report healthReport
			if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
				t.Fatal(err)
			}
			want := "fail"
			if tc.pass {
				want = "pass"
			}
			if report.Status != want {
				t.Fatalf("status = %q", report.Status)
			}
			checks := report.Checks["db:sqlite"]
			if len(checks) != 1 || checks[0].Status != want || checks[0].Time == "" {
				t.Fatalf("checks: %+v", report.Checks)
			}
			if strings.Contains(w.Body.String(), "db down") {
				t.Fatal("driver error leaked in health body")
			}
		})
	}
}

func TestHealthCache(t *testing.T) {
	var calls int
	rec := testRecorder(t, func(context.Context) error {
		calls++
		return nil
	})
	rec.health.ttl = time.Second
	mux := http.NewServeMux()
	rec.Mount(mux)
	serve := func() {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, HealthPath, nil))
	}
	serve()
	serve()
	if calls != 1 {
		t.Fatalf("probe calls = %d, want 1", calls)
	}
}

func TestCheckHealth(t *testing.T) {
	rec := testRecorder(t, func(context.Context) error { return nil })
	mux := http.NewServeMux()
	rec.Mount(mux)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := CheckHealth(ctx, srv.URL); err != nil {
		t.Fatal(err)
	}

	fail := testRecorder(t, func(context.Context) error { return errors.New("down") })
	failMux := http.NewServeMux()
	fail.Mount(failMux)
	failSrv := httptest.NewServer(failMux)
	defer failSrv.Close()
	if err := CheckHealth(ctx, failSrv.URL); err == nil {
		t.Fatal("expected fail health check error")
	}
}
