package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxEnvelopeBytes = 64 * 1024

var allowedExpiries = map[int64]struct{}{
	3600: {}, 86400: {}, 604800: {},
}

type rateBucket struct {
	window int64
	count  int
}

type limiter struct {
	mu      sync.Mutex
	buckets map[string]rateBucket
	limits  map[string]int
}

func newLimiter(postLimit, getLimit int) *limiter {
	return &limiter{
		buckets: make(map[string]rateBucket),
		limits: map[string]int{
			http.MethodPost: postLimit,
			http.MethodGet:  getLimit,
		},
	}
}

func (l *limiter) allow(method, ip string, now time.Time) bool {
	limit, limited := l.limits[method]
	if !limited {
		return true
	}
	window := now.Unix() / 60
	key := method + "\x00" + ip
	l.mu.Lock()
	defer l.mu.Unlock()
	bucket := l.buckets[key]
	if bucket.window != window {
		bucket = rateBucket{window: window}
	}
	if bucket.count >= limit {
		return false
	}
	bucket.count++
	l.buckets[key] = bucket
	// Opportunistically keep this anonymous-IP map bounded.
	if len(l.buckets) > 10000 {
		for oldKey, old := range l.buckets {
			if old.window < window-1 {
				delete(l.buckets, oldKey)
			}
		}
	}
	return true
}

type api struct {
	store     store
	origin    string
	now       func() time.Time
	random    io.Reader
	rateLimit *limiter
}

func newAPI(s store, origin string) *api {
	return &api{
		store: s, origin: origin, now: time.Now, random: rand.Reader,
		rateLimit: newLimiter(10, 120),
	}
}

func (a *api) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if r.Method == http.MethodOptions {
		a.options(w, r)
		return
	}
	if !a.rateLimit.allow(r.Method, clientIP(r), a.now()) {
		writeError(w, http.StatusTooManyRequests, "rate_limited")
		return
	}
	if r.Method == http.MethodPost && r.URL.Path == "/shares" {
		a.create(w, r)
		return
	}
	if r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/shares/") {
		a.fetch(w, r)
		return
	}
	writeError(w, http.StatusNotFound, "not_found")
}

func (a *api) create(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" {
		if a.origin == "" || origin != a.origin {
			writeError(w, http.StatusBadRequest, "invalid_request")
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", a.origin)
		w.Header().Set("Vary", "Origin")
	}
	if mediaType := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]); !strings.EqualFold(mediaType, "application/octet-stream") {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	expiry, err := strconv.ParseInt(r.Header.Get("X-Share-Expiry-Seconds"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if _, ok := allowedExpiries[expiry]; !ok {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if r.ContentLength > maxEnvelopeBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxEnvelopeBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if len(body) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if len(body) > maxEnvelopeBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large")
		return
	}
	idBytes := make([]byte, 16)
	if _, err := io.ReadFull(a.random, idBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)
	expiresAt := a.now().Unix() + expiry
	if err := a.store.Put(r.Context(), id, body, expiresAt); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id": id, "path": "/shares/" + id, "expiresAt": expiresAt,
	})
}

func (a *api) fetch(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/shares/")
	decoded, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil || len(decoded) != 16 || strings.Contains(id, "/") {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	record, err := a.store.Get(r.Context(), id, a.now().Unix())
	if errors.Is(err, errNotFound) {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(record.Envelope)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(record.Envelope)
}

func (a *api) options(w http.ResponseWriter, r *http.Request) {
	if a.origin == "" || r.Header.Get("Origin") != a.origin || r.URL.Path != "/shares" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", a.origin)
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Share-Expiry-Seconds")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.Header().Set("Vary", "Origin")
	w.WriteHeader(http.StatusNoContent)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func writeError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}
