package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStoresConform(t *testing.T) {
	tests := []struct {
		name string
		new  func(*testing.T) store
	}{
		{"memory", func(t *testing.T) store { return newMemoryStore() }},
		{"sqlite", func(t *testing.T) store {
			s, err := newSQLiteStore(filepath.Join(t.TempDir(), "shares.db"))
			if err != nil {
				t.Fatal(err)
			}
			return s
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			s := test.new(t)
			t.Cleanup(func() { _ = s.Close() })
			testContract(t, s)
		})
	}
}

func testContract(t *testing.T, s store) {
	clock := time.Unix(1_700_000_000, 0)
	a := newAPI(s, "https://app.example")
	a.now = func() time.Time { return clock }
	a.random = bytes.NewReader(bytes.Repeat([]byte{7}, 64))
	a.rateLimit = newLimiter(100, 100)

	create := httptest.NewRequest(http.MethodPost, "/shares", strings.NewReader("opaque-envelope"))
	create.Header.Set("Content-Type", "application/octet-stream")
	create.Header.Set("X-Share-Expiry-Seconds", "3600")
	create.Header.Set("Origin", "https://app.example")
	created := httptest.NewRecorder()
	a.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body=%s", created.Code, created.Body.String())
	}
	if created.Header().Get("Access-Control-Allow-Origin") != "https://app.example" {
		t.Fatal("missing creation CORS header")
	}
	var response struct {
		ID, Path  string
		ExpiresAt int64
	}
	if err := json.NewDecoder(created.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.ExpiresAt != clock.Unix()+3600 || response.Path != "/shares/"+response.ID {
		t.Fatalf("response = %+v", response)
	}
	if len(response.ID) != 22 {
		t.Fatalf("ID length = %d", len(response.ID))
	}

	fetch := httptest.NewRecorder()
	a.ServeHTTP(fetch, httptest.NewRequest(http.MethodGet, response.Path, nil))
	if fetch.Code != http.StatusOK || fetch.Body.String() != "opaque-envelope" {
		t.Fatalf("fetch = %d %q", fetch.Code, fetch.Body.String())
	}
	if fetch.Header().Get("Content-Type") != "application/octet-stream" || fetch.Header().Get("X-Content-Type-Options") != "nosniff" || fetch.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unsafe headers: %v", fetch.Header())
	}

	clock = clock.Add(time.Hour)
	expired := httptest.NewRecorder()
	a.ServeHTTP(expired, httptest.NewRequest(http.MethodGet, response.Path, nil))
	assertError(t, expired, http.StatusNotFound, "not_found")
}

func TestCreateValidationAndStreamingLimit(t *testing.T) {
	a := newAPI(newMemoryStore(), "https://app.example")
	a.rateLimit = newLimiter(100, 100)
	request := func(body []byte, expiry, contentType, origin string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/shares", bytes.NewReader(body))
		r.Header.Set("X-Share-Expiry-Seconds", expiry)
		r.Header.Set("Content-Type", contentType)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}
	assertError(t, request(nil, "3600", "application/octet-stream", ""), 400, "invalid_request")
	assertError(t, request([]byte("x"), "42", "application/octet-stream", ""), 400, "invalid_request")
	assertError(t, request([]byte("x"), "3600", "text/plain", ""), 400, "invalid_request")
	assertError(t, request([]byte("x"), "3600", "application/octet-stream", "https://evil.example"), 400, "invalid_request")
	assertError(t, request(bytes.Repeat([]byte("x"), maxEnvelopeBytes+1), "3600", "application/octet-stream", ""), 413, "payload_too_large")
	if got := request([]byte("x"), "3600", "Application/Octet-Stream; charset=binary", ""); got.Code != 201 {
		t.Fatalf("parameterized mixed-case content type status = %d", got.Code)
	}
	if got := request(bytes.Repeat([]byte("x"), maxEnvelopeBytes), "604800", "application/octet-stream", ""); got.Code != 201 {
		t.Fatalf("max body status = %d", got.Code)
	}
}

func TestGenericNotFoundAndRateLimits(t *testing.T) {
	a := newAPI(newMemoryStore(), "")
	a.rateLimit = newLimiter(1, 2)
	for _, path := range []string{"/shares/malformed", "/shares/AAAAAAAAAAAAAAAAAAAAAA", "/other"} {
		w := httptest.NewRecorder()
		a.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if path == "/other" {
			assertError(t, w, 429, "rate_limited")
		} else {
			assertError(t, w, 404, "not_found")
		}
	}
	r := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/shares", strings.NewReader("x"))
		req.Header.Set("Content-Type", "application/octet-stream")
		req.Header.Set("X-Share-Expiry-Seconds", "3600")
		w := httptest.NewRecorder()
		a.ServeHTTP(w, req)
		return w
	}
	if first := r(); first.Code != 201 {
		t.Fatalf("first POST = %d", first.Code)
	}
	assertError(t, r(), 429, "rate_limited")
}

func TestCleanupIsBounded(t *testing.T) {
	for _, s := range []store{newMemoryStore(), mustSQLite(t)} {
		t.Cleanup(func() { _ = s.Close() })
		for _, id := range []string{"one", "two", "three"} {
			if err := s.Put(context.Background(), id, []byte(id), 10); err != nil {
				t.Fatal(err)
			}
		}
		deleted, err := s.Cleanup(context.Background(), 10, 2)
		if err != nil || deleted != 2 {
			t.Fatalf("cleanup = %d, %v", deleted, err)
		}
	}
}

func TestPreflightIsRestrictive(t *testing.T) {
	a := newAPI(newMemoryStore(), "https://app.example")
	for origin, status := range map[string]int{"https://app.example": 204, "https://evil.example": 400} {
		r := httptest.NewRequest(http.MethodOptions, "/shares", nil)
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("origin %s status = %d", origin, w.Code)
		}
	}
}

func mustSQLite(t *testing.T) store {
	s, err := newSQLiteStore(filepath.Join(t.TempDir(), "cleanup.db"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func assertError(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status = %d, want %d, body=%s", w.Code, status, w.Body.String())
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["error"] != code {
		t.Fatalf("error = %q, want %q", body["error"], code)
	}
	if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("missing security headers: %v", w.Header())
	}
}
