package obs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const healthFailOutput = "database check failed"

const maxHealthBody = 64 << 10

type Probe func(context.Context) error

type healthProbe struct {
	run     Probe
	ttl     time.Duration
	timeout time.Duration
	now     func() time.Time

	mu       sync.Mutex
	checked  time.Time
	lastErr  error
	lastTook time.Duration
}

func (p *healthProbe) result(ctx context.Context) (time.Duration, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.checked.IsZero() && p.now().Sub(p.checked) < p.ttl {
		return p.lastTook, p.lastErr
	}
	start := p.now()
	probeCtx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()
	err := p.run(probeCtx)
	took := p.now().Sub(start)
	p.checked = p.now()
	p.lastErr = err
	p.lastTook = took
	return took, err
}

type healthReport struct {
	Status string                   `json:"status"`
	Checks map[string][]healthCheck `json:"checks"`
}

type healthCheck struct {
	ComponentType string  `json:"componentType"`
	ObservedValue float64 `json:"observedValue"`
	ObservedUnit  string  `json:"observedUnit"`
	Status        string  `json:"status"`
	Time          string  `json:"time"`
	Output        string  `json:"output,omitempty"`
}

func (r *Recorder) handleHealth(w http.ResponseWriter, req *http.Request) {
	took, err := r.health.result(req.Context())
	checkStatus := "pass"
	reportStatus := "pass"
	httpStatus := http.StatusOK
	var output string
	if err != nil {
		checkStatus = "fail"
		reportStatus = "fail"
		httpStatus = http.StatusServiceUnavailable
		output = healthFailOutput
	}
	w.Header().Set("Content-Type", "application/health+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(httpStatus)
	if req.Method == http.MethodHead {
		return
	}
	report := healthReport{
		Status: reportStatus,
		Checks: map[string][]healthCheck{
			healthComponent: {{
				ComponentType: "datastore",
				ObservedValue: float64(took.Milliseconds()),
				ObservedUnit:  "ms",
				Status:        checkStatus,
				Time:          r.now().UTC().Format(time.RFC3339),
				Output:        output,
			}},
		},
	}
	_ = json.NewEncoder(w).Encode(report)
}

func CheckHealth(ctx context.Context, baseURL string) error {
	baseURL = strings.TrimRight(baseURL, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+HealthPath, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/health+json")
	client := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("redirect not allowed")
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHealthBody))
	if err != nil {
		return err
	}
	var report healthReport
	if err := json.Unmarshal(body, &report); err != nil {
		return err
	}
	if report.Status != "pass" {
		return fmt.Errorf("health report status %q", report.Status)
	}
	return nil
}
