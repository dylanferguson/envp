package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestConfig(t *testing.T) {
	for _, tc := range []struct {
		name, key, value string
		valid            bool
	}{
		{"custom port", "PORT", "18080", true},
		{"invalid port", "PORT", "abc", false},
		{"zero port", "PORT", "0", false},
		{"large port", "PORT", "65536", false},
		{"custom internal port", "INTERNAL_PORT", "9191", true},
		{"invalid internal port", "INTERNAL_PORT", "abc", false},
		{"internal port collision", "INTERNAL_PORT", "8080", false},
		{"empty database", "DB_PATH", "", false},
		{"origin", "PUBLIC_ORIGIN", "https://example.com", true},
		{"origin with port", "PUBLIC_ORIGIN", "http://localhost:8080", true},
		{"origin mixed case", "PUBLIC_ORIGIN", "https://Example.com", true},
		{"origin default https port", "PUBLIC_ORIGIN", "https://example.com:443", true},
		{"origin with path", "PUBLIC_ORIGIN", "https://example.com/path", false},
		{"origin with credentials", "PUBLIC_ORIGIN", "https://user:pass@example.com", false},
		{"invalid origin", "PUBLIC_ORIGIN", "example.com", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("PORT", "8080")
			t.Setenv("INTERNAL_PORT", "9090")
			t.Setenv("DB_PATH", "./data/shares.db")
			t.Setenv("PUBLIC_ORIGIN", "")
			t.Setenv("LISTEN_HOST", "")
			t.Setenv(tc.key, tc.value)
			cfg, err := loadConfig()
			if (err == nil) != tc.valid {
				t.Fatalf("loadConfig: %v", err)
			}
			if tc.key == "PUBLIC_ORIGIN" && tc.valid {
				if cfg.http.PublicOrigin != "https://example.com" && cfg.http.PublicOrigin != "http://localhost:8080" {
					t.Fatalf("origin = %q", cfg.http.PublicOrigin)
				}
			}
		})
	}
}

func TestConfigPortRespectsExplicitValue(t *testing.T) {
	for _, tc := range []struct {
		name, listenHost, port string
		want                   int
	}{
		{"public default", "", "", 8080},
		{"public explicit", "", "8080", 8080},
		{"loopback default", "127.0.0.1", "", 8080},
		{"loopback explicit 8080", "127.0.0.1", "8080", 8080},
		{"loopback explicit 8081", "127.0.0.1", "8081", 8081},
		{"loopback custom", "127.0.0.1", "8082", 8082},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("INTERNAL_PORT", "9090")
			t.Setenv("DB_PATH", "./data/shares.db")
			t.Setenv("PUBLIC_ORIGIN", "")
			t.Setenv("LISTEN_HOST", tc.listenHost)
			if tc.port != "" {
				t.Setenv("PORT", tc.port)
			} else {
				t.Setenv("PORT", "8080")
				_ = os.Unsetenv("PORT")
			}
			cfg, err := loadConfig()
			if err != nil {
				t.Fatalf("loadConfig: %v", err)
			}
			if cfg.port != tc.want {
				t.Fatalf("port = %d, want %d", cfg.port, tc.want)
			}
		})
	}
}

func TestHealthJSON(t *testing.T) {
	for _, tc := range []struct {
		name      string
		pingErr   error
		releaseID string
		wantCode  int
		wantStat  string
	}{
		{"pass", nil, "abc1234", http.StatusOK, "pass"},
		{"fail", errors.New("db down"), "abc1234", http.StatusServiceUnavailable, "fail"},
		{"special chars", nil, "v1\x01\"test\"", http.StatusOK, "pass"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := health(func(context.Context) error { return tc.pingErr }, tc.releaseID)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/health", nil))
			if w.Code != tc.wantCode {
				t.Fatalf("status = %d, want %d", w.Code, tc.wantCode)
			}
			var body struct {
				Status    string `json:"status"`
				ReleaseID string `json:"releaseId"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("invalid json %q: %v", w.Body.String(), err)
			}
			if body.Status != tc.wantStat || body.ReleaseID != tc.releaseID {
				t.Fatalf("body = %+v", body)
			}
		})
	}
}
