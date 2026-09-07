package server

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/dylanferguson/envp/internal/store"
)

var testFiles = fstest.MapFS{
	"index.html":        {Data: []byte("<!doctype html><title>Create</title>")},
	"open.html":         {Data: []byte("<!doctype html><title>Open</title>")},
	"assets/app-123.js": {Data: []byte("console.log('test')")},
	"favicon.ico":       {Data: []byte{1, 2, 3}},
}

func testServer(t *testing.T, cfg Config) (http.Handler, *store.Store) {
	t.Helper()
	db, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "shares.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	handler, err := New(db, testFiles, cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return handler, db
}

func request(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://localhost"+path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func assertError(t *testing.T, w *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status = %d, want %d; body %s", w.Code, status, w.Body)
	}
	var body errorBody
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != code || body.Error.Message != message {
		t.Fatalf("error = %+v", body.Error)
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("missing security headers")
	}
}

func TestCreateReadContract(t *testing.T) {
	h, _ := testServer(t, Config{})
	before := time.Now().UnixMilli()
	w := request(h, "POST", "/api/v1/shares", `{"ttl_seconds":3600,"envelope":"AQID_w"}`)
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var created shareResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.ExpiresAt < before+3600000 || created.ExpiresAt > time.Now().UnixMilli()+3600000 {
		t.Fatalf("expiry: %d", created.ExpiresAt)
	}
	if strings.Contains(w.Body.String(), "envelope") {
		t.Fatal("create returned envelope")
	}
	if w.Header().Get("Location") != "/api/v1/shares/"+created.ID {
		t.Fatal("wrong Location")
	}
	w = request(h, "GET", "/api/v1/shares/"+strings.ToLower(created.ID), "")
	if w.Code != 200 {
		t.Fatalf("read: %d %s", w.Code, w.Body)
	}
	var read shareResponse
	if err := json.Unmarshal(w.Body.Bytes(), &read); err != nil {
		t.Fatal(err)
	}
	if read.ID != created.ID || read.ExpiresAt != created.ExpiresAt || read.Envelope != "AQID_w" {
		t.Fatalf("read: %+v", read)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store")
	}
}

func TestRequestValidation(t *testing.T) {
	for _, body := range []string{
		`null`, `[]`, `{}`, `{`, `{} {}`,
		`{"ttl_seconds":30,"envelope":"AQ"}`, `{"ttl_seconds":86401,"envelope":"AQ"}`,
		`{"ttl_seconds":60.1,"envelope":"AQ"}`, `{"ttl_seconds":[60],"envelope":"AQ"}`,
		`{"ttl_seconds":true,"envelope":"AQ"}`, `{"ttl_seconds":null,"envelope":"AQ"}`,
		`{"ttl_seconds":"3600","envelope":"AQ"}`, `{"ttl_seconds":60.0,"envelope":"AQ"}`,
		`{"ttl_seconds":6e1,"envelope":"AQ"}`,
		`{"ttl_seconds":"NaN","envelope":"AQ"}`, `{"ttl_seconds":60,"envelope":""}`,
		`{"ttl_seconds":60,"envelope":12}`, `{"ttl_seconds":60,"envelope":"!AQ"}`,
	} {
		t.Run(body, func(t *testing.T) {
			h, _ := testServer(t, Config{})
			assertError(t, request(h, "POST", "/api/v1/shares", body), 400, "invalid_request", "The request could not be processed.")
		})
	}
	for _, ttl := range []string{`60`, `3600`, `86400`} {
		h, _ := testServer(t, Config{})
		w := request(h, "POST", "/api/v1/shares", `{"ttl_seconds":`+ttl+`,"envelope":"AQ","extra":true}`)
		if w.Code != 201 {
			t.Errorf("TTL %s: %d %s", ttl, w.Code, w.Body)
		}
	}
}

func TestBodyAndEnvelopeLimits(t *testing.T) {
	for _, size := range []int{maxEnvelopeBytes, maxEnvelopeBytes + 1} {
		h, _ := testServer(t, Config{})
		body, _ := json.Marshal(map[string]any{"ttl_seconds": 60, "envelope": base64.RawURLEncoding.EncodeToString(make([]byte, size))})
		w := request(h, "POST", "/api/v1/shares", string(body))
		if size == maxEnvelopeBytes && w.Code != 201 {
			t.Fatalf("at limit: %d %s", w.Code, w.Body)
		}
		if size > maxEnvelopeBytes {
			assertError(t, w, 400, "invalid_request", "The request could not be processed.")
		}
	}
	for _, contentLength := range []int64{-1, maxCreateJSONBytes + 1} {
		h, _ := testServer(t, Config{})
		r := httptest.NewRequest("POST", "/api/v1/shares", strings.NewReader(strings.Repeat(" ", maxCreateJSONBytes+1)))
		r.ContentLength = contentLength
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		assertError(t, w, 413, "payload_too_large", "Request body is too large.")
	}
}

func TestOversizedContentLength(t *testing.T) {
	h, _ := testServer(t, Config{})
	r := httptest.NewRequest("POST", "/api/v1/shares", strings.NewReader(`{"ttl_seconds":60,"envelope":"AQ"}`))
	r.ContentLength = maxCreateJSONBytes + 1
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	assertError(t, w, 413, "payload_too_large", "Request body is too large.")
}

func TestUnknownExpiredAndInvalidIDs(t *testing.T) {
	h, db := testServer(t, Config{})
	expired, err := db.Create(t.Context(), []byte{1}, -time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{expired.ID, "00000000000000000000000000", "invalid", "share_01h2xcejqtf2nbrexx3vqjhp41"} {
		assertError(t, request(h, "GET", "/api/v1/shares/"+id, ""), 404, "not_found", "Share not found.")
	}
}

func TestOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, origin, forwarded string
		cfg                     Config
		status                  int
	}{
		{"missing origin", "", "", Config{}, 201},
		{"same origin", "http://localhost", "", Config{}, 201},
		{"cross origin", "http://evil.example", "", Config{}, 403},
		{"explicit origin", "https://example.com", "", Config{PublicOrigin: "https://example.com"}, 201},
		{"canonical origin", "https://example.com", "", Config{PublicOrigin: "https://Example.com:443"}, 201},
		{"untrusted protocol", "https://localhost", "https", Config{}, 403},
		{"trusted protocol", "https://localhost", "https", Config{TrustProxy: true}, 201},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h, _ := testServer(t, tc.cfg)
			r := httptest.NewRequest("POST", "http://localhost/api/v1/shares", strings.NewReader(`{"ttl_seconds":60,"envelope":"AQ"}`))
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("X-Forwarded-Proto", tc.forwarded)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if tc.status == 403 {
				assertError(t, w, 403, "forbidden", "The request origin is not allowed.")
			} else if w.Code != tc.status {
				t.Fatalf("status: %d %s", w.Code, w.Body)
			}
		})
	}
}

func TestRateLimits(t *testing.T) {
	h, _ := testServer(t, Config{})
	for range 15 {
		w := request(h, "POST", "/api/v1/shares", `{"ttl_seconds":60,"envelope":"AQ"}`)
		if w.Code != 201 {
			t.Fatalf("create: %d", w.Code)
		}
	}
	w := request(h, "POST", "/api/v1/shares", `{"ttl_seconds":60,"envelope":"AQ"}`)
	assertError(t, w, 429, "rate_limited", "Too many requests. Try again later.")
	if w.Header().Get("Retry-After") != "20" {
		t.Fatalf("retry: %s", w.Header().Get("Retry-After"))
	}
	// Failed reads spend the independent read allowance too.
	for range 30 {
		if w := request(h, "GET", "/api/v1/shares/invalid", ""); w.Code != 404 {
			t.Fatalf("read: %d", w.Code)
		}
	}
	w = request(h, "GET", "/api/v1/shares/invalid", "")
	assertError(t, w, 429, "rate_limited", "Too many requests. Try again later.")
	if w.Header().Get("Retry-After") != "1" {
		t.Fatal("missing read Retry-After")
	}
}

func TestStaticFiles(t *testing.T) {
	h, _ := testServer(t, Config{})
	for _, tc := range []struct{ path, content, cache string }{
		{"/", "Create", "no-cache"}, {"/open", "Open", "no-cache"}, {"/share/any-id", "Open", "no-cache"},
		{"/assets/app-123.js", "console.log", "public, max-age=31536000, immutable"}, {"/favicon.ico", "", ""},
	} {
		w := request(h, "GET", tc.path, "")
		if w.Code != 200 || !strings.Contains(w.Body.String(), tc.content) || w.Header().Get("Cache-Control") != tc.cache {
			t.Errorf("%s: %d %s %v", tc.path, w.Code, w.Body, w.Header())
		}
		if w.Header().Get("Referrer-Policy") != "no-referrer" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
			t.Errorf("security headers: %s", tc.path)
		}
		w = request(h, "HEAD", tc.path, "")
		if w.Code != 200 || w.Body.Len() != 0 {
			t.Errorf("HEAD %s: %d %s", tc.path, w.Code, w.Body)
		}
	}
	for _, path := range []string{"/assets/", "/assets/missing.js", "/missing", "/../go.mod", "/api/v1/missing"} {
		w := request(h, "GET", path, "")
		assertError(t, w, 404, "not_found", "Not found.")
		if strings.Contains(w.Header().Get("Cache-Control"), "immutable") {
			t.Errorf("%s: immutable cache on 404", path)
		}
	}
}

func TestStorageFailureIsGeneric(t *testing.T) {
	h, db := testServer(t, Config{})
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	w := request(h, "POST", "/api/v1/shares", `{"ttl_seconds":60,"envelope":"AQ"}`)
	assertError(t, w, 500, "internal_error", "The request could not be processed.")
}

func TestConcurrentHTTPWrites(t *testing.T) {
	h, _ := testServer(t, Config{TrustProxy: true})
	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := httptest.NewRequest("POST", "http://localhost/api/v1/shares", bytes.NewBufferString(`{"ttl_seconds":60,"envelope":"AQID"}`))
			r.Header.Set("X-Forwarded-For", "192.0.2."+strconv.Itoa(i+1))
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 201 {
				t.Errorf("create: %d %s", w.Code, w.Body)
			}
		}()
	}
	wg.Wait()
}
