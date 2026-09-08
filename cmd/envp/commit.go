package main

import (
	"regexp"
	"runtime/debug"
	"strings"
)

var commit string

func vcsRevision() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	for _, s := range info.Settings {
		if s.Key == "vcs.revision" {
			return s.Value
		}
	}
	return ""
}

var hexCommit = regexp.MustCompile(`^[0-9a-f]{7,}$`)

func resolveCommit(stamped, vcsRev string) string {
	if id := shortHexCommit(stamped); id != "" {
		return id
	}
	if id := shortHexCommit(vcsRev); id != "" {
		return id
	}
	return "unknown"
}

func shortHexCommit(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if hexCommit.MatchString(s) {
		return s[:7]
	}
	return ""
}
