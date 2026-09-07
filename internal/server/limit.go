package server

import (
	"math"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const (
	maxClients     = 10000
	clientIdleTime = 10 * time.Minute
)

type clientLimit struct {
	bucket   *rate.Limiter
	lastSeen time.Time
}

type limiter struct {
	mu          sync.Mutex
	clients     map[string]*clientLimit
	interval    time.Duration
	burst       int
	nextCleanup time.Time
}

func newLimiter(interval time.Duration, burst int) *limiter {
	return &limiter{clients: make(map[string]*clientLimit), interval: interval, burst: burst}
}

// allow returns zero on success, or the time until another attempt can succeed.
func (l *limiter) allow(ip string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !now.Before(l.nextCleanup) {
		for key, client := range l.clients {
			if now.Sub(client.lastSeen) >= clientIdleTime {
				delete(l.clients, key)
			}
		}
		l.nextCleanup = now.Add(time.Minute)
	}
	client := l.clients[ip]
	if client == nil {
		// Preserve existing clients' limits when the registry is full.
		if len(l.clients) >= maxClients {
			return time.Minute
		}
		client = &clientLimit{bucket: rate.NewLimiter(rate.Every(l.interval), l.burst)}
		l.clients[ip] = client
	}
	client.lastSeen = now
	reservation := client.bucket.ReserveN(now, 1)
	if !reservation.OK() {
		return time.Minute
	}
	delay := reservation.DelayFrom(now)
	if delay > 0 {
		reservation.CancelAt(now)
		return delay
	}
	return 0
}

func (s *server) limit(l *limiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if delay := l.allow(clientIP(r, s.config.TrustProxy), time.Now()); delay > 0 {
			seconds := max(1, int(math.Ceil(delay.Seconds())))
			w.Header().Set("Retry-After", strconv.Itoa(seconds))
			s.error(w, r, errRateLimited)
			return
		}
		next(w, r)
	}
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		// Cloudflare sets the visitor; Fly-Client-IP is the TCP peer (Cloudflare
		// when orange-clouded). Fly's last X-Forwarded-For hop is the app IP.
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
