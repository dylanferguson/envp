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

type Job string

const JobSweep Job = "sweep"

type Recorder struct {
	requests       *prometheus.CounterVec
	duration       *prometheus.HistogramVec
	created        prometheus.Counter
	jobRuns        *prometheus.CounterVec
	jobProcessed   *prometheus.CounterVec
	jobDuration    *prometheus.HistogramVec
	jobLastSuccess *prometheus.GaugeVec
	handler        http.Handler
}

func New() *Recorder {
	reg := prometheus.NewRegistry()
	auto := promauto.With(reg)
	rec := &Recorder{
		requests: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "HTTP requests by method, handler, and status.",
		}, []string{"method", "handler", "status"}),
		duration: auto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds by method and handler.",
			Buckets: []float64{0.005, 0.02, 0.1, 0.5, 2},
		}, []string{"method", "handler"}),
		created: auto.NewCounter(prometheus.CounterOpts{
			Name: "shares_created_total",
			Help: "Shares created.",
		}),
		jobRuns: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "job_runs_total",
			Help: "Job runs by name and result.",
		}, []string{"name", "result"}),
		jobProcessed: auto.NewCounterVec(prometheus.CounterOpts{
			Name: "job_processed_total",
			Help: "Items processed by job name.",
		}, []string{"name"}),
		jobDuration: auto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "job_duration_seconds",
			Help:    "Job run duration in seconds by name.",
			Buckets: []float64{0.001, 0.005, 0.02, 0.1, 0.5, 2},
		}, []string{"name"}),
		jobLastSuccess: auto.NewGaugeVec(prometheus.GaugeOpts{
			Name: "job_last_success_timestamp_seconds",
			Help: "Unix timestamp of the last successful job run by name.",
		}, []string{"name"}),
	}
	rec.jobRuns.WithLabelValues(string(JobSweep), "success")
	rec.jobRuns.WithLabelValues(string(JobSweep), "error")
	rec.jobProcessed.WithLabelValues(string(JobSweep))
	rec.jobDuration.WithLabelValues(string(JobSweep))
	rec.jobLastSuccess.WithLabelValues(string(JobSweep))
	rec.handler = promhttp.HandlerFor(reg, promhttp.HandlerOpts{})
	return rec
}

func (r *Recorder) Handler() http.Handler { return r.handler }

func (r *Recorder) RecordJob(name Job, processed int64, took time.Duration, err error) {
	job := string(name)
	r.jobDuration.WithLabelValues(job).Observe(took.Seconds())
	if processed > 0 {
		r.jobProcessed.WithLabelValues(job).Add(float64(processed))
	}
	if err != nil {
		r.jobRuns.WithLabelValues(job, "error").Inc()
		return
	}
	r.jobRuns.WithLabelValues(job, "success").Inc()
	r.jobLastSuccess.WithLabelValues(job).SetToCurrentTime()
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
	r.requests.WithLabelValues(method, handler, strconv.Itoa(status)).Inc()
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
