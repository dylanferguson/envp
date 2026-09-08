package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Route string

const (
	RouteCreate Route = "create"
	RouteGet    Route = "get"
	RouteStatic Route = "static"
)

type Recorder struct {
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
	limited  *prometheus.CounterVec
	created  prometheus.Counter
	swept    prometheus.Counter
	handler  http.Handler
}

func New() *Recorder {
	reg := prometheus.NewRegistry()
	auto := promauto.With(reg)
	rec := &Recorder{
		requests: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total", Help: "HTTP requests by route and status class.",
		}, []string{"route", "status_class"}),
		duration: auto.NewHistogramVec(prometheus.HistogramOpts{
			Name: "http_request_duration_seconds", Help: "HTTP latency.",
			Buckets: []float64{0.005, 0.02, 0.1, 0.5, 2},
		}, []string{"route"}),
		limited: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "rate_limit_exceeded_total", Help: "Rate limit rejections.",
		}, []string{"route"}),
		created: auto.NewCounter(prometheus.CounterOpts{Name: "shares_created_total", Help: "Shares created."}),
		swept:   auto.NewCounter(prometheus.CounterOpts{Name: "sweep_deleted_total", Help: "Shares swept."}),
	}
	rec.limited.WithLabelValues(string(RouteCreate)).Add(0)
	rec.limited.WithLabelValues(string(RouteGet)).Add(0)
	rec.handler = promhttp.HandlerFor(reg, promhttp.HandlerOpts{})
	return rec
}

func (r *Recorder) Handler() http.Handler { return r.handler }

func (r *Recorder) Swept(n int64) {
	if n > 0 {
		r.swept.Add(float64(n))
	}
}

func (r *Recorder) Instrument(route Route, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, req)
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		r.observe(route, status, time.Since(start))
	})
}

func (r *Recorder) observe(route Route, status int, took time.Duration) {
	r.requests.WithLabelValues(string(route), strconv.Itoa(status/100)+"xx").Inc()
	if route != RouteStatic {
		r.duration.WithLabelValues(string(route)).Observe(took.Seconds())
	}
	if route == RouteCreate && status == http.StatusCreated {
		r.created.Inc()
	}
	if status == http.StatusTooManyRequests {
		r.limited.WithLabelValues(string(route)).Inc()
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
