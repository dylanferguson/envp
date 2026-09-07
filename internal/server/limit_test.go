package server

import (
	"net/http/httptest"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestTokenRefill(t *testing.T) {
	l := newLimiter(20*time.Second, 15)
	now := time.Now()
	for range 15 {
		if delay := l.allow("client", now); delay != 0 {
			t.Fatal(delay)
		}
	}
	if delay := l.allow("client", now); delay != 20*time.Second {
		t.Fatalf("exhausted: %s", delay)
	}
	if delay := l.allow("client", now.Add(19*time.Second)); delay <= 0 || delay > time.Second {
		t.Fatalf("partial refill: %s", delay)
	}
	if delay := l.allow("client", now.Add(20*time.Second)); delay != 0 {
		t.Fatalf("refilled: %s", delay)
	}
	if delay := l.allow("other", now); delay != 0 {
		t.Fatalf("other client: %s", delay)
	}
}

func TestLimiterBoundsAndCleanup(t *testing.T) {
	l := newLimiter(20*time.Second, 15)
	now := time.Now()
	for i := range maxClients {
		l.allow(strconv.Itoa(i), now)
	}
	if l.allow("new", now) == 0 {
		t.Fatal("allowed new client at capacity")
	}
	if l.allow("0", now) != 0 {
		t.Fatal("blocked existing client at capacity")
	}
	if l.allow("new", now.Add(clientIdleTime)) != 0 {
		t.Fatal("did not remove inactive clients")
	}
}

func TestConcurrentBurst(t *testing.T) {
	l := newLimiter(20*time.Second, 15)
	now := time.Now()
	var allowed atomic.Int32
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if l.allow("client", now) == 0 {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()
	if allowed.Load() != 15 {
		t.Fatalf("allowed: %d", allowed.Load())
	}
}

func TestClientIP(t *testing.T) {
	for _, tc := range []struct {
		remote, forwarded, want string
		trust                   bool
	}{
		{"192.0.2.1:1234", "198.51.100.1", "192.0.2.1", false},
		{"192.0.2.2:1234", "198.51.100.1", "192.0.2.2", false},
		{"192.0.2.1:1234", "198.51.100.1, 192.0.2.1", "192.0.2.1", true},
		{"192.0.2.9:1234", "198.51.100.1, 203.0.113.8", "203.0.113.8", true},
		{"192.0.2.1:1234", "invalid", "192.0.2.1", true},
		{"[::ffff:192.0.2.1]:1234", "", "192.0.2.1", false},
		{"[2001:db8::1]:1234", "", "2001:db8::1", false},
	} {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = tc.remote
		r.Header.Set("X-Forwarded-For", tc.forwarded)
		if got := clientIP(r, tc.trust); got != tc.want {
			t.Errorf("%+v: got %s", tc, got)
		}
	}
}

func TestHeadSharesReadAllowance(t *testing.T) {
	h, _ := testServer(t, Config{})
	for range 30 {
		request(h, "GET", "/api/v1/shares/invalid", "")
	}
	w := request(h, "HEAD", "/api/v1/shares/invalid", "")
	if w.Code != 429 || w.Body.Len() != 0 {
		t.Fatalf("HEAD after exhausting reads: %d %s", w.Code, w.Body)
	}
}
