package server

import (
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestRemoteIP(t *testing.T) {
	for _, tc := range []struct {
		name, remote, forwarded, cf, fly, want string
	}{
		{"remote only", "192.0.2.1:1234", "", "", "", "192.0.2.1"},
		{"ignores forwarded", "192.0.2.1:1234", "198.51.100.1", "", "", "192.0.2.1"},
		{"ignores last forwarded hop", "192.0.2.1:1234", "198.51.100.1, 203.0.113.8", "", "", "192.0.2.1"},
		{"ignores fly client", "192.0.2.1:1234", "", "", "198.51.100.9", "192.0.2.1"},
		{"ignores cloudflare visitor", "192.0.2.1:1234", "198.51.100.1", "198.51.100.7", "203.0.113.1", "192.0.2.1"},
		{"ipv4 mapped", "[::ffff:192.0.2.1]:1234", "198.51.100.1", "198.51.100.7", "", "192.0.2.1"},
		{"ipv6", "[2001:db8::1]:1234", "198.51.100.1", "", "", "2001:db8::1"},
		{"missing port", "192.0.2.1", "198.51.100.1", "", "", "192.0.2.1"},
		{"unparseable", "not-an-ip", "198.51.100.1", "", "", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			r.RemoteAddr = tc.remote
			if tc.forwarded != "" {
				r.Header.Set("X-Forwarded-For", tc.forwarded)
			}
			if tc.cf != "" {
				r.Header.Set("CF-Connecting-IP", tc.cf)
			}
			if tc.fly != "" {
				r.Header.Set("Fly-Client-IP", tc.fly)
			}
			if got := remoteIP(r); got != tc.want {
				t.Fatalf("got %s want %s", got, tc.want)
			}
		})
	}
}

func TestHeadSharesReadAllowance(t *testing.T) {
	h, _ := testServer(t, Config{})
	for range readFuseTokens {
		request(h, "GET", "/api/v1/shares/invalid", "")
	}
	w := request(h, "HEAD", "/api/v1/shares/invalid", "")
	if w.Code != 429 || w.Body.Len() != 0 {
		t.Fatalf("HEAD after exhausting reads: %d %s", w.Code, w.Body)
	}
}

func TestForwardedHeadersDoNotSplitFuse(t *testing.T) {
	h, _ := testServer(t, Config{})
	for i := range createFuseTokens {
		r := httptest.NewRequest("POST", "http://localhost/api/v1/shares", strings.NewReader(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Forwarded-For", "198.51.100."+strconv.Itoa(i+1))
		r.Header.Set("CF-Connecting-IP", "203.0.113."+strconv.Itoa(i+1))
		r.Header.Set("Fly-Client-IP", "192.0.2."+strconv.Itoa(i+1))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 201 {
			t.Fatalf("create %d: %d %s", i, w.Code, w.Body)
		}
	}
	r := httptest.NewRequest("POST", "http://localhost/api/v1/shares", strings.NewReader(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Forwarded-For", "198.51.100.250")
	r.Header.Set("CF-Connecting-IP", "203.0.113.250")
	r.Header.Set("Fly-Client-IP", "192.0.2.250")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	assertError(t, w, 429, "rate_limited", "Too many requests. Try again later.")
}

func TestDistinctPeersHaveDistinctFuses(t *testing.T) {
	h, _ := testServer(t, Config{})
	create := func(remote string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "http://localhost/api/v1/shares", strings.NewReader(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`))
		r.RemoteAddr = remote
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	for range createFuseTokens {
		if w := create("192.0.2.1:1"); w.Code != 201 {
			t.Fatalf("peer a: %d %s", w.Code, w.Body)
		}
	}
	assertError(t, create("192.0.2.1:1"), 429, "rate_limited", "Too many requests. Try again later.")
	if w := create("192.0.2.2:1"); w.Code != 201 {
		t.Fatalf("peer b: %d %s", w.Code, w.Body)
	}
}
