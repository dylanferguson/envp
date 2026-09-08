package main

import "testing"

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
			t.Setenv("TRUST_PROXY", "")
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
