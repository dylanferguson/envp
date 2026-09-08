# envp

Browser-encrypted `.env` sharing. The key stays in the URL fragment. The server stores ciphertext, an id, an expiry, and a bound on how many times the encrypted blob may be fetched.

https://envp.dylanferguson.co

```bash
mise install
vp install
mise run dev
```

http://127.0.0.1:5173 — Vite on 5173, API on 8080.

Self-host the production image without Node or mise:

```bash
git clone https://github.com/dylanferguson/envp.git
cd envp
docker compose up --build
```

http://127.0.0.1:8080. SQLite lives on the named `envp-data` volume. A host bind mount at `/data` is root-owned, so the non-root process cannot write the database.

Set `PUBLIC_ORIGIN` when the hostname is not localhost.

## Client identity and rate limits

Production traffic for `https://envp.dylanferguson.co` goes Cloudflare, then Fly `[http_service]`, then `:8080`. DNS for that hostname is Cloudflare anycast. `envp.fly.dev` is a different public address and skips Cloudflare.

Cloudflare is the per-client security boundary once you create the rules. They are not in this repo. Apply them before you treat the edge as the write bound. Cloudflare counting periods start at 10 seconds. A 1 second window is not valid. Two rules need Pro or above. Free allows one rule and 10s only.

- Path equals `/api/v1/shares`: 15 requests per 20s per IP (create)
- Path starts with `/api/v1/shares/`: 600 requests per 10s per IP (read). That is the same average as the old 30 requests per 0.5s in-process fuse.

Those rules survive Fly auto-stop. Cold start still empties the in-process fuse. Cloudflare counters can lag a few seconds and are per data center.

The Go process does not trust `CF-Connecting-IP`, `Fly-Client-IP`, `X-Forwarded-For`, or `X-Forwarded-Proto`. There is no `TRUST_PROXY` flag. Setting `TRUST_PROXY=true` on a public VM was a mistake and does nothing. When `PUBLIC_ORIGIN` is set, requests whose `Host` does not match that hostname are rejected. That blocks `envp.fly.dev`. It does not block a client that reaches Fly's origin IPs with the custom hostname as SNI.

The in-process limiter (100 creates / 20s, 200 reads / 0.5s) keys on `RemoteAddr` only. It is a coarse fuse. On Fly every request shares the proxy hop, so this is one global bucket, not per visitor. In-process 429 responses increment `rate_limit_exceeded_total`. Cloudflare rejections do not.

Local `mise run dev` and `docker compose` have no Cloudflare. The in-app fuse is the only limiter, and it keys on the TCP peer. Compose publishes `8080:8080` on all interfaces. Put a reverse proxy in front if that port is reachable beyond loopback. This process will not rate-limit by client.

```bash
mise run check
mise run test
mise run test:e2e:install
mise run test:e2e
mise run docker:build
mise run docker:run
```

| Variable        | Default                         |
| --------------- | ------------------------------- |
| `PORT`          | `8080`                          |
| `INTERNAL_PORT` | `9090` (`/health`, `/metrics`)  |
| `DB_PATH`       | `./data/shares.db`              |
| `PUBLIC_ORIGIN` | empty locally. Required on Fly. |
