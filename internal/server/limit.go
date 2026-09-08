package server

import (
	"math"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"time"

	"github.com/sethvargo/go-limiter"
)

func (s *server) limit(store limiter.Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, _, reset, ok, err := store.Take(r.Context(), remoteIP(r))
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

func remoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return ip.Unmap().String()
	}
	return "unknown"
}
