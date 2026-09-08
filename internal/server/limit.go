package server

import (
	"math"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/sethvargo/go-limiter"
	"github.com/sethvargo/go-limiter/memorystore"
)

func perIP(tokens uint64, interval time.Duration) (limiter.Store, error) {
	return memorystore.New(&memorystore.Config{Tokens: tokens, Interval: interval})
}

func (s *server) limit(store limiter.Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, _, reset, ok, err := store.Take(r.Context(), clientIP(r, s.config.TrustProxy))
		if err != nil {
			s.error(w, r, err)
			return
		}
		if !ok {
			delay := time.Until(time.Unix(0, int64(reset)))
			w.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(delay.Seconds())))))
			s.error(w, r, errRateLimited)
			return
		}
		next(w, r)
	}
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		for _, value := range []string{
			strings.TrimSpace(r.Header.Get("CF-Connecting-IP")),
			strings.TrimSpace(r.Header.Get("Fly-Client-IP")),
			lastCSV(r.Header.Get("X-Forwarded-For")),
		} {
			if ip, err := netip.ParseAddr(value); err == nil {
				return ip.Unmap().String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return ip.Unmap().String()
	}
	return "unknown"
}
