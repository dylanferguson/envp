// Package server exposes the share API and serves the browser application.
package server

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/dylanferguson/envp/internal/obs"
	"github.com/dylanferguson/envp/internal/store"
	"github.com/oklog/ulid/v2"
)

const (
	minTTLSeconds       = 60
	maxTTLSeconds       = 86400
	minMaxReads         = 1
	maxMaxReads         = 100
	maxPlaintextBytes   = 65536
	envelopeHeaderBytes = 18
	gcmTagBytes         = 16
	maxEnvelopeBytes    = envelopeHeaderBytes + maxPlaintextBytes + gcmTagBytes
	maxCreateJSONBytes  = 64 + (maxEnvelopeBytes*4+2)/3
)

type Config struct {
	PublicOrigin string
	TrustProxy   bool
}

type createRequest struct {
	TTL      int64  `json:"ttl_seconds"`
	MaxReads int64  `json:"max_reads"`
	Envelope string `json:"envelope"`
}

type createShareResponse struct {
	ID        string `json:"id"`
	ExpiresAt int64  `json:"expires_at"`
	MaxReads  int    `json:"max_reads"`
}

type getShareResponse struct {
	ID        string `json:"id"`
	ExpiresAt int64  `json:"expires_at"`
	Envelope  string `json:"envelope"`
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type apiError struct {
	status  int
	code    string
	message string
}

func (e apiError) Error() string { return e.message }

var (
	errInvalidRequest  = apiError{http.StatusBadRequest, "invalid_request", "The request could not be processed."}
	errForbidden       = apiError{http.StatusForbidden, "forbidden", "The request origin is not allowed."}
	errNotFound        = apiError{http.StatusNotFound, "not_found", "Not found."}
	errShareNotFound   = apiError{http.StatusNotFound, "not_found", "Share not found."}
	errPayloadTooLarge = apiError{http.StatusRequestEntityTooLarge, "payload_too_large", "Request body is too large."}
	errRateLimited     = apiError{http.StatusTooManyRequests, "rate_limited", "Too many requests. Try again later."}
)

type server struct {
	store  *store.Store
	config Config
	log    *slog.Logger
	files  fs.FS
	static http.Handler
	shells map[string][]byte
}

func New(db *store.Store, files fs.FS, config Config, logger *slog.Logger, rec *obs.Recorder) (http.Handler, error) {
	if config.PublicOrigin != "" {
		origin, err := ParseOrigin(config.PublicOrigin)
		if err != nil {
			return nil, err
		}
		config.PublicOrigin = origin
	}
	s := &server{
		store: db, config: config, log: logger,
		files: files, static: http.FileServerFS(files), shells: make(map[string][]byte),
	}
	for _, name := range []string{"index.html", "open.html"} {
		data, err := fs.ReadFile(files, name)
		if err != nil {
			return nil, fmt.Errorf("load UI %s (run vp build first): %w", name, err)
		}
		s.shells[name] = data
	}

	track := rec.Instrument

	api := http.NewServeMux()
	api.Handle("POST /api/v1/shares", track(obs.RouteCreate, s.limit(newLimiter(20*time.Second, 15), s.createShare)))
	api.Handle("GET /api/v1/shares/{id}", track(obs.RouteGet, s.limit(newLimiter(time.Second/2, 30), s.readShare)))

	pages := http.NewServeMux()
	pages.Handle("GET /{$}", track(obs.RouteStatic, s.shell("index.html")))
	pages.Handle("GET /open", track(obs.RouteStatic, s.shell("open.html")))
	pages.Handle("GET /share/{id}", track(obs.RouteStatic, s.shell("open.html")))
	pages.HandleFunc("GET /robots.txt", s.robots)
	pages.HandleFunc("GET /", s.file)

	return s.recover(headers(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path.Clean(r.URL.Path) {
			s.error(w, r, errNotFound)
			return
		}
		isAPI := r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/")
		if !isAPI {
			pages.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if _, pattern := api.Handler(r); pattern == "" {
			s.error(w, r, errNotFound)
			return
		}
		api.ServeHTTP(w, r)
	})), nil
}

func (s *server) createShare(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > maxCreateJSONBytes {
		s.error(w, r, errPayloadTooLarge)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.expectedOrigin(r) {
		s.log.Warn("origin rejected", "method", r.Method)
		s.error(w, r, errForbidden)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxCreateJSONBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			s.error(w, r, errPayloadTooLarge)
			return
		}
		s.error(w, r, errInvalidRequest)
		return
	}
	var req createRequest
	if err := json.Unmarshal(body, &req); err != nil || req.TTL < minTTLSeconds || req.TTL > maxTTLSeconds || req.MaxReads < minMaxReads || req.MaxReads > maxMaxReads {
		s.error(w, r, errInvalidRequest)
		return
	}
	envelope, err := base64.RawURLEncoding.DecodeString(req.Envelope)
	if err != nil || len(envelope) == 0 || len(envelope) > maxEnvelopeBytes {
		s.error(w, r, errInvalidRequest)
		return
	}
	share, err := s.store.Create(r.Context(), envelope, time.Duration(req.TTL)*time.Second, int(req.MaxReads))
	if err != nil {
		s.error(w, r, err)
		return
	}
	w.Header().Set("Location", "/api/v1/shares/"+share.ID)
	writeJSON(w, http.StatusCreated, createShareResponse{ID: share.ID, ExpiresAt: share.ExpiresAt.UnixMilli(), MaxReads: int(req.MaxReads)})
}

func (s *server) readShare(w http.ResponseWriter, r *http.Request) {
	id, err := ulid.ParseStrict(r.PathValue("id"))
	if err != nil {
		s.error(w, r, errShareNotFound)
		return
	}
	if r.Method == http.MethodHead {
		if err := s.store.Peek(r.Context(), id.String()); errors.Is(err, store.ErrNotFound) {
			s.error(w, r, errShareNotFound)
			return
		} else if err != nil {
			s.error(w, r, err)
			return
		}
		w.WriteHeader(http.StatusOK)
		return
	}
	share, err := s.store.Consume(r.Context(), id.String())
	if errors.Is(err, store.ErrNotFound) {
		s.error(w, r, errShareNotFound)
		return
	}
	if err != nil {
		s.error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, getShareResponse{
		ID: share.ID, ExpiresAt: share.ExpiresAt.UnixMilli(),
		Envelope: base64.RawURLEncoding.EncodeToString(share.Envelope),
	})
}

func (s *server) shell(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(s.shells[name]))
	}
}

const robotsTxt = "User-agent: *\nDisallow: /\n"

func (s *server) robots(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, "robots.txt", time.Time{}, strings.NewReader(robotsTxt))
}

func (s *server) file(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	if !fs.ValidPath(name) {
		s.error(w, r, errNotFound)
		return
	}
	info, err := fs.Stat(s.files, name)
	if err != nil || info.IsDir() {
		s.error(w, r, errNotFound)
		return
	}
	if strings.HasPrefix(name, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else if strings.HasSuffix(name, ".html") {
		w.Header().Set("Cache-Control", "no-cache")
	}
	s.static.ServeHTTP(w, r)
}

func (s *server) expectedOrigin(r *http.Request) string {
	if s.config.PublicOrigin != "" {
		return s.config.PublicOrigin
	}
	if r.Host == "" {
		return ""
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if s.config.TrustProxy {
		if proto := lastCSV(r.Header.Get("X-Forwarded-Proto")); proto == "http" || proto == "https" {
			scheme = proto
		}
	}
	return scheme + "://" + r.Host
}

func (s *server) error(w http.ResponseWriter, r *http.Request, err error) {
	status := http.StatusInternalServerError
	detail := errorDetail{Code: "internal_error", Message: "The request could not be processed."}
	var typed apiError
	if errors.As(err, &typed) {
		status = typed.status
		detail = errorDetail{Code: typed.code, Message: typed.message}
	} else {
		s.log.Error("request failed", "method", r.Method, "route", r.Pattern, "error", err)
	}
	if r.Method == http.MethodHead {
		w.WriteHeader(status)
		return
	}
	writeJSON(w, status, errorBody{Error: detail})
}

func (s *server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hw := &headerWriter{ResponseWriter: w}
		defer func() {
			if v := recover(); v != nil {
				err := fmt.Errorf("panic: %v", v)
				s.log.Error("request failed", "method", r.Method, "route", r.Pattern, "error", err)
				if !hw.wrote {
					if r.Method == http.MethodHead {
						hw.WriteHeader(http.StatusInternalServerError)
					} else {
						writeJSON(hw, http.StatusInternalServerError, errorBody{Error: errorDetail{Code: "internal_error", Message: "The request could not be processed."}})
					}
				}
			}
		}()
		next.ServeHTTP(hw, r)
	})
}

type headerWriter struct {
	http.ResponseWriter
	wrote bool
}

func (w *headerWriter) WriteHeader(code int) {
	w.wrote = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *headerWriter) Write(b []byte) (int, error) {
	w.wrote = true
	return w.ResponseWriter.Write(b)
}

func (w *headerWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func headers(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Robots-Tag", "noindex, nofollow")
		h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// ParseOrigin canonicalizes an http(s) origin. Empty input is allowed.
func ParseOrigin(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return "", errors.New("PUBLIC_ORIGIN must be an http(s) origin without a path, query, or fragment")
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if (u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443") {
		port = ""
	}
	if port == "" {
		return u.Scheme + "://" + host, nil
	}
	return u.Scheme + "://" + net.JoinHostPort(host, port), nil
}

func lastCSV(header string) string {
	if i := strings.LastIndex(header, ","); i >= 0 {
		header = header[i+1:]
	}
	return strings.TrimSpace(header)
}
