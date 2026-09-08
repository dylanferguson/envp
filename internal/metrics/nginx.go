package metrics

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

const stubStatusURL = "http://127.0.0.1:8082/stub_status"

const stubStatusFormat = `Active connections: %d
server accepts handled requests
%d %d %d
Reading: %d Writing: %d Waiting: %d
`

var (
	nginxUpDesc       = prometheus.NewDesc("nginx_up", "Shows the status of the last metric scrape: 1 for a successful scrape and 0 for a failed one.", nil, nil)
	nginxActiveDesc   = prometheus.NewDesc("nginx_connections_active", "Active client connections.", nil, nil)
	nginxAcceptedDesc = prometheus.NewDesc("nginx_connections_accepted", "Accepted client connections.", nil, nil)
	nginxHandledDesc  = prometheus.NewDesc("nginx_connections_handled", "Handled client connections.", nil, nil)
	nginxRequestsDesc = prometheus.NewDesc("nginx_http_requests_total", "Total http requests.", nil, nil)
	nginxReadingDesc  = prometheus.NewDesc("nginx_connections_reading", "Connections where NGINX is reading the request header.", nil, nil)
	nginxWritingDesc  = prometheus.NewDesc("nginx_connections_writing", "Connections where NGINX is writing the response back to the client.", nil, nil)
	nginxWaitingDesc  = prometheus.NewDesc("nginx_connections_waiting", "Idle client connections.", nil, nil)
)

type stubStatus struct {
	active, accepted, handled, requests, reading, writing, waiting int64
}

func parseStubStatus(body string) (stubStatus, error) {
	var s stubStatus
	_, err := fmt.Sscanf(strings.TrimSpace(body), stubStatusFormat,
		&s.active, &s.accepted, &s.handled, &s.requests, &s.reading, &s.writing, &s.waiting)
	if err != nil {
		return stubStatus{}, err
	}
	return s, nil
}

type nginxCollector struct {
	client *http.Client
	url    string
}

func newNginxCollector(url string) *nginxCollector {
	return &nginxCollector{
		client: &http.Client{Timeout: 2 * time.Second},
		url:    url,
	}
}

func (c *nginxCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- nginxUpDesc
	ch <- nginxActiveDesc
	ch <- nginxAcceptedDesc
	ch <- nginxHandledDesc
	ch <- nginxRequestsDesc
	ch <- nginxReadingDesc
	ch <- nginxWritingDesc
	ch <- nginxWaitingDesc
}

func (c *nginxCollector) Collect(ch chan<- prometheus.Metric) {
	s, err := c.fetch()
	if err != nil {
		ch <- prometheus.MustNewConstMetric(nginxUpDesc, prometheus.GaugeValue, 0)
		return
	}
	ch <- prometheus.MustNewConstMetric(nginxUpDesc, prometheus.GaugeValue, 1)
	ch <- prometheus.MustNewConstMetric(nginxActiveDesc, prometheus.GaugeValue, float64(s.active))
	ch <- prometheus.MustNewConstMetric(nginxAcceptedDesc, prometheus.CounterValue, float64(s.accepted))
	ch <- prometheus.MustNewConstMetric(nginxHandledDesc, prometheus.CounterValue, float64(s.handled))
	ch <- prometheus.MustNewConstMetric(nginxRequestsDesc, prometheus.CounterValue, float64(s.requests))
	ch <- prometheus.MustNewConstMetric(nginxReadingDesc, prometheus.GaugeValue, float64(s.reading))
	ch <- prometheus.MustNewConstMetric(nginxWritingDesc, prometheus.GaugeValue, float64(s.writing))
	ch <- prometheus.MustNewConstMetric(nginxWaitingDesc, prometheus.GaugeValue, float64(s.waiting))
}

func (c *nginxCollector) fetch() (stubStatus, error) {
	resp, err := c.client.Get(c.url)
	if err != nil {
		return stubStatus{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return stubStatus{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return stubStatus{}, fmt.Errorf("stub_status: status %d", resp.StatusCode)
	}
	return parseStubStatus(string(body))
}
