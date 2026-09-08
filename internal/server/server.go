package server

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/dylanferguson/envp/internal/metrics"
	"github.com/dylanferguson/envp/internal/store"
	"github.com/oklog/ulid/v2"
)

const (
	minTTLSeconds      = 60
	maxTTLSeconds      = 86400
	minMaxReads        = 1
	maxMaxReads        = 100
	maxShareBytes      = 65570
	maxCreateJSONBytes = 64 + (maxShareBytes*4+2)/3
)

type Config struct {
	PublicOrigin string
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
)

type Server struct {
	http.Handler
}

type server struct {
	db     *store.Store
	config Config
	log    *slog.Logger
}

func New(db *store.Store, config Config, logger *slog.Logger, rec *metrics.Recorder) (*Server, error) {
	if config.PublicOrigin != "" {
		origin, err := ParseOrigin(config.PublicOrigin)
		if err != nil {
			return nil, err
		}
		config.PublicOrigin = origin
	}
	s := &server{db: db, config: config, log: logger}
	track := rec.Instrument

	mux := http.NewServeMux()
	mux.Handle("POST /api/v1/shares", track(metrics.RouteCreate, s.recover(noStore(s.createShare))))
	mux.Handle("GET /api/v1/shares/{id}", track(metrics.RouteGet, s.recover(noStore(s.readShare))))
	mux.Handle("GET /api/{path...}", track(metrics.RouteGet, s.recover(noStore(s.apiNotFound))))
	mux.Handle("POST /api/{path...}", track(metrics.RouteCreate, s.recover(noStore(s.apiNotFound))))

	return &Server{Handler: headers(mux)}, nil
}

func noStore(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next(w, r)
	}
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
	if err != nil || len(envelope) == 0 || len(envelope) > maxShareBytes {
		s.error(w, r, errInvalidRequest)
		return
	}
	share, err := s.db.Create(r.Context(), envelope, time.Duration(req.TTL)*time.Second, int(req.MaxReads))
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
		if err := s.db.Peek(r.Context(), id.String()); errors.Is(err, store.ErrNotFound) {
			s.error(w, r, errShareNotFound)
			return
		} else if err != nil {
			s.error(w, r, err)
			return
		}
		w.WriteHeader(http.StatusOK)
		return
	}
	share, err := s.db.Consume(r.Context(), id.String())
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

func (s *server) apiNotFound(w http.ResponseWriter, r *http.Request) {
	s.error(w, r, errNotFound)
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

func headers(next http.Handler) http.Handler {
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
