package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
)

const stubStatusFixture = `Active connections: 43
server accepts handled requests
 7368 7368 10993
Reading: 0 Writing: 5 Waiting: 38
`

const stubStatusDocsFixture = `Active connections: 291 
server accepts handled requests
 16630948 16630948 31070465 
Reading: 6 Writing: 179 Waiting: 106 
`

func TestParseStubStatus(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		want       stubStatus
	}{
		{"compact", stubStatusFixture, stubStatus{43, 7368, 7368, 10993, 0, 5, 38}},
		{"docs trailing spaces", stubStatusDocsFixture, stubStatus{291, 16630948, 16630948, 31070465, 6, 179, 106}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseStubStatus(tc.body)
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestParseStubStatusInvalid(t *testing.T) {
	for _, tc := range []struct {
		name, body string
	}{
		{"empty", ""},
		{"garbage", "not stub_status"},
		{"active only", "Active connections: 1\n"},
		{"missing counts", "Active connections: 1\nserver accepts handled requests\nReading: 1 Writing: 2 Waiting: 3\n"},
		{"two counts", "Active connections: 1\nserver accepts handled requests\n1 2\nReading: 1 Writing: 2 Waiting: 3\n"},
		{"bad active", "Active connections: x\nserver accepts handled requests\n1 1 1\nReading: 1 Writing: 1 Waiting: 1\n"},
		{"bad waiting", "Active connections: 1\nserver accepts handled requests\n1 1 1\nReading: 1 Writing: 1 Waiting: x\n"},
		{"plus json", `{"version":"plus"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseStubStatus(tc.body); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestNginxCollector(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/stub_status" {
			http.NotFound(w, r)
			return
		}
		_, _ = io.WriteString(w, stubStatusFixture)
	}))
	t.Cleanup(srv.Close)

	got := gather(t, newNginxCollector(srv.URL+"/stub_status"))
	want := map[string]float64{
		"nginx_up":                   1,
		"nginx_connections_active":   43,
		"nginx_connections_accepted": 7368,
		"nginx_connections_handled":  7368,
		"nginx_http_requests_total":  10993,
		"nginx_connections_reading":  0,
		"nginx_connections_writing":  5,
		"nginx_connections_waiting":  38,
	}
	for name, v := range want {
		if got[name] != v {
			t.Fatalf("%s = %v, want %v (%v)", name, got[name], v, got)
		}
	}
}

func TestNginxCollectorFailure(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	closed := ok.URL + "/stub_status"
	ok.Close()

	unavailable := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	t.Cleanup(unavailable.Close)

	invalid := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "nope")
	}))
	t.Cleanup(invalid.Close)

	for _, tc := range []struct{ name, url string }{
		{"closed", closed},
		{"http error", unavailable.URL + "/stub_status"},
		{"invalid body", invalid.URL},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := gather(t, newNginxCollector(tc.url))
			if got["nginx_up"] != 0 {
				t.Fatalf("nginx_up = %v, want 0 (%v)", got["nginx_up"], got)
			}
			for _, name := range []string{
				"nginx_connections_active",
				"nginx_connections_accepted",
				"nginx_connections_handled",
				"nginx_http_requests_total",
				"nginx_connections_reading",
				"nginx_connections_writing",
				"nginx_connections_waiting",
			} {
				if _, ok := got[name]; ok {
					t.Fatalf("unexpected %s: %v", name, got)
				}
			}
		})
	}
}

func TestNewRegistersNginx(t *testing.T) {
	w := httptest.NewRecorder()
	New().Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Body.String(), "nginx_up") {
		t.Fatalf("missing nginx_up in\n%s", w.Body)
	}
}

func gather(t *testing.T, c prometheus.Collector) map[string]float64 {
	t.Helper()
	reg := prometheus.NewRegistry()
	if err := reg.Register(c); err != nil {
		t.Fatal(err)
	}
	fams, err := reg.Gather()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]float64{}
	for _, fam := range fams {
		if len(fam.Metric) != 1 {
			t.Fatalf("%s: %d metrics", fam.GetName(), len(fam.Metric))
		}
		m := fam.Metric[0]
		switch {
		case m.Gauge != nil:
			out[fam.GetName()] = m.Gauge.GetValue()
		case m.Counter != nil:
			out[fam.GetName()] = m.Counter.GetValue()
		default:
			t.Fatalf("%s: unexpected type", fam.GetName())
		}
	}
	return out
}
