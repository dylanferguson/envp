package obs

import (
	"errors"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	MetricsPath = "/metrics"
	HealthPath  = "/health"
)

const healthComponent = "db:sqlite"

var durationBuckets = []float64{0.005, 0.02, 0.1, 0.5, 2}

type Route struct {
	name  string
	timed bool
}

var (
	RouteCreate = Route{name: "create", timed: true}
	RouteGet    = Route{name: "get", timed: true}
	RouteStatic = Route{name: "static"}
)

type Options struct {
	DB           Probe
	ReleaseID    string
	ProbeTTL     time.Duration
	ProbeTimeout time.Duration
	Now          func() time.Time
}

type Recorder struct {
	registry *prometheus.Registry

	requests    *prometheus.CounterVec
	duration    *prometheus.HistogramVec
	rateLimited *prometheus.CounterVec
	created     prometheus.Counter
	swept       prometheus.Counter

	health    *healthProbe
	releaseID string
	now       func() time.Time
}

func New(opts Options) (*Recorder, error) {
	if opts.DB == nil {
		return nil, errors.New("obs: DB probe required")
	}
	ttl := opts.ProbeTTL
	if ttl == 0 {
		ttl = time.Second
	}
	timeout := opts.ProbeTimeout
	if timeout == 0 {
		timeout = 2 * time.Second
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	releaseID := opts.ReleaseID
	if releaseID == "" {
		releaseID = "unknown"
	}

	reg := prometheus.NewRegistry()
	requests := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests by route and status class.",
	}, []string{"route", "status_class"})
	duration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request latency in seconds.",
		Buckets: durationBuckets,
	}, []string{"route"})
	rateLimited := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "rate_limit_exceeded_total",
		Help: "Rate limit rejections by route.",
	}, []string{"route"})
	created := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "shares_created_total",
		Help: "Shares successfully created.",
	})
	swept := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "sweep_deleted_total",
		Help: "Expired shares deleted by sweep.",
	})
	reg.MustRegister(requests, duration, rateLimited, created, swept)
	rateLimited.WithLabelValues(RouteCreate.name).Add(0)
	rateLimited.WithLabelValues(RouteGet.name).Add(0)

	return &Recorder{
		registry:    reg,
		requests:    requests,
		duration:    duration,
		rateLimited: rateLimited,
		created:     created,
		swept:       swept,
		health: &healthProbe{
			run:     opts.DB,
			ttl:     ttl,
			timeout: timeout,
			now:     now,
		},
		releaseID: releaseID,
		now:       now,
	}, nil
}

func (r *Recorder) Instrument(route Route, next http.Handler) http.Handler {
	if route.name == "" {
		panic("obs: zero Route")
	}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}

		panicVal := any(nil)
		defer func() {
			took := time.Since(start)
			status := sw.status
			if p := recover(); p != nil {
				panicVal = p
			}
			if panicVal != nil && status == 0 {
				status = http.StatusInternalServerError
			} else if status == 0 {
				status = http.StatusOK
			}
			r.observe(route, status, took)
			if panicVal != nil {
				panic(panicVal)
			}
		}()

		next.ServeHTTP(sw, req)
	})
}

func (r *Recorder) Handler() http.Handler {
	mux := http.NewServeMux()
	r.Mount(mux)
	return mux
}

func (r *Recorder) Mount(root *http.ServeMux) {
	root.Handle("GET "+MetricsPath, promhttp.HandlerFor(r.registry, promhttp.HandlerOpts{}))
	root.HandleFunc("GET "+HealthPath, r.handleHealth)
	root.HandleFunc("HEAD "+HealthPath, r.handleHealth)
}

func (r *Recorder) Swept(deleted int64) {
	if deleted > 0 {
		r.swept.Add(float64(deleted))
	}
}

func (r *Recorder) observe(route Route, status int, took time.Duration) {
	r.requests.WithLabelValues(route.name, statusClass(status)).Inc()
	if route.timed {
		r.duration.WithLabelValues(route.name).Observe(took.Seconds())
	}
	if route == RouteCreate && status == http.StatusCreated {
		r.created.Inc()
	}
	if status == http.StatusTooManyRequests {
		r.rateLimited.WithLabelValues(route.name).Inc()
	}
}

func statusClass(code int) string {
	switch {
	case code >= 100 && code < 200:
		return "1xx"
	case code >= 200 && code < 300:
		return "2xx"
	case code >= 300 && code < 400:
		return "3xx"
	case code >= 400 && code < 500:
		return "4xx"
	default:
		return "5xx"
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
