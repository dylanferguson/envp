package main

import "testing"

func TestResolveCommit(t *testing.T) {
	for _, tc := range []struct {
		name, stamped, vcs, want string
	}{
		{"stamped full sha", "7c4e901abc123def4567890123456789012345678", "", "7c4e901"},
		{"stamped seven chars", "7c4e901", "", "7c4e901"},
		{"stamped uppercase", "7C4E901ABC", "", "7c4e901"},
		{"stamped trimmed", "  7c4e901abc  ", "", "7c4e901"},
		{"stamped too short", "7c4e90", "abc1234def5678901234567890123456789012345678", "abc1234"},
		{"stamped non-hex", "not-a-sha", "deadbeef0123456789012345678901234567890", "deadbee"},
		{"v prefix not stripped", "v7c4e901abc", "7c4e901abc", "7c4e901"},
		{"vcs fallback", "", "7c4e901abc123", "7c4e901"},
		{"both invalid", "bad", "also-bad", "unknown"},
		{"stamped wins", "1111111", "2222222", "1111111"},
		{"empty", "", "", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveCommit(tc.stamped, tc.vcs); got != tc.want {
				t.Fatalf("resolveCommit(%q, %q) = %q, want %q", tc.stamped, tc.vcs, got, tc.want)
			}
		})
	}
}
