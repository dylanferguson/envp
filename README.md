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

Production ingress is **Cloudflare** (proxied hostname) → **Fly** `[http_service]` → the app on `:8080`. Cloudflare sees the real client IP and is the per-client security boundary. Apply these rate-limit rules at Cloudflare (they are not configured in this repo):

- `POST /api/v1/shares`: 15 requests / 20s per IP
- `GET`/`HEAD /api/v1/shares/*`: 60 requests / 1s per IP

Those rules persist while the Fly machine is stopped (`min_machines_running = 0`). Cold start empties the in-process fuse; the per-client bound is supposed to live at Cloudflare once those rules exist.

The Go process does not trust `CF-Connecting-IP`, `Fly-Client-IP`, `X-Forwarded-For`, or `X-Forwarded-Proto`. There is no `TRUST_PROXY` flag. Setting `TRUST_PROXY=true` on a public VM was a mistake and does nothing.

The in-process limiter (100 creates / 20s, 200 reads / 0.5s) keys on `RemoteAddr` only. It is a coarse fuse. On Fly every request shares the proxy hop, so this is one global bucket, not per visitor. In-process 429 responses increment `rate_limit_exceeded_total`; Cloudflare rejections do not.

`*.fly.dev` bypasses Cloudflare. Do not use it as a public URL; `PUBLIC_ORIGIN` is the proxied hostname.

Local `mise run dev` and `docker compose` have no Cloudflare. The in-app fuse is the only limiter, and it keys on the TCP peer. If you expose compose beyond loopback, put a reverse proxy in front. This process will not rate-limit by client.

```bash
mise run check
mise run test
mise run test:e2e:install
mise run test:e2e
mise run docker:build
mise run docker:run
```

| Variable        | Default                            |
| --------------- | ---------------------------------- |
| `PORT`          | `8080`                             |
| `INTERNAL_PORT` | `9090` (`/health`, `/metrics`)     |
| `DB_PATH`       | `./data/shares.db`                 |
| `PUBLIC_ORIGIN` | derived from request (set in prod) |
