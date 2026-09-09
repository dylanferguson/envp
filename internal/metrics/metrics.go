package metrics

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const createHandler = "/api/v1/shares"

type Recorder struct {
	requests    *prometheus.CounterVec
	duration    *prometheus.HistogramVec
	created     prometheus.Counter
	expired     prometheus.Counter
	cleanups    *prometheus.CounterVec
	cleanupDur  prometheus.Histogram
	lastCleanup prometheus.Gauge
	handler     http.Handler
}

func New() *Recorder {
	reg := prometheus.NewRegistry()
	auto := promauto.With(reg)
	rec := &Recorder{
		requests: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "HTTP requests by method, handler, and status class.",
		}, []string{"method", "handler", "status_class"}),
		duration: auto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds by method and handler.",
			Buckets: []float64{0.005, 0.02, 0.1, 0.5, 2},
		}, []string{"method", "handler"}),
		created: auto.NewCounter(prometheus.CounterOpts{
			Name: "shares_created_total",
			Help: "Shares created.",
		}),
		expired: auto.NewCounter(prometheus.CounterOpts{
			Name: "shares_expired_deleted_total",
			Help: "Expired or exhausted shares deleted by cleanup.",
		}),
		cleanups: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "shares_cleanup_runs_total",
			Help: "Share cleanup runs by result.",
		}, []string{"result"}),
		cleanupDur: auto.NewHistogram(prometheus.HistogramOpts{
			Name:    "shares_cleanup_duration_seconds",
			Help:    "Share cleanup run duration in seconds.",
			Buckets: []float64{0.001, 0.005, 0.02, 0.1, 0.5, 2},
		}),
		lastCleanup: auto.NewGauge(prometheus.GaugeOpts{
			Name: "shares_cleanup_last_success_timestamp_seconds",
			Help: "Unix timestamp of the last successful share cleanup.",
		}),
	}
	rec.cleanups.WithLabelValues("success")
	rec.cleanups.WithLabelValues("error")
	rec.handler = promhttp.HandlerFor(reg, promhttp.HandlerOpts{})
	return rec
}

func (r *Recorder) Handler() http.Handler { return r.handler }

func (r *Recorder) RecordCleanup(deleted int64, took time.Duration, err error) {
	r.cleanupDur.Observe(took.Seconds())
	if deleted > 0 {
		r.expired.Add(float64(deleted))
	}
	if err != nil {
		r.cleanups.WithLabelValues("error").Inc()
		return
	}
	r.cleanups.WithLabelValues("success").Inc()
	r.lastCleanup.SetToCurrentTime()
}

func (r *Recorder) Instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, req)
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		r.observe(req.Method, handlerLabel(req.Pattern, req.Method), status, time.Since(start))
	})
}

func (r *Recorder) observe(method, handler string, status int, took time.Duration) {
	class := strconv.Itoa(status/100) + "xx"
	r.requests.WithLabelValues(method, handler, class).Inc()
	r.duration.WithLabelValues(method, handler).Observe(took.Seconds())
	if method == http.MethodPost && handler == createHandler && status == http.StatusCreated {
		r.created.Inc()
	}
}

func handlerLabel(pattern, method string) string {
	if pattern == "" {
		return "unmatched"
	}
	if rest, ok := strings.CutPrefix(pattern, method+" "); ok {
		return rest
	}
	if i := strings.IndexByte(pattern, '/'); i >= 0 {
		return pattern[i:]
	}
	return pattern
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
