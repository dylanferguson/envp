# env-share

Browser-encrypted `.env` sharing. Paste your variables, get a link. The decryption key stays in the URL fragment (`#...`). The server stores only the encrypted blob, a share ID, and an expiry timestamp.

Routes are `/` (compose), `/open` (paste a link), and `/share/:id#key` (direct share link).

## Run locally

```bash
mise install
vp install
mise run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the Go API on port 8080. `mise.toml` pins Go 1.27.1, Node 24.20.0, pnpm 11.22.0, golangci-lint 2.13.2, and watchexec 2.7.2. Repo-level commands are `mise run` tasks. Vite+ (`vp`) still owns frontend-only commands. Docker images keep their own digest pins.

The dev command builds an initial UI, then starts Vite and the Go API. Svelte changes reload through Vite. Go file changes restart the API process.

Production-style single process:

```bash
mise run build
mise run start
```

`dist/env-share` serves the embedded UI and API on port 8080. It needs no Node runtime or external static files. The `production` build tag embeds Vite's generated `internal/webui/client` directory; development reads that directory from disk.

## Go server

- `cmd/env-share`: environment configuration, HTTP timeouts, signals, and graceful shutdown.
- `internal/server`: stdlib routes, request validation, JSON errors, static files, and per-IP token buckets.
- `internal/store`: explicit SQLite queries, ULID generation with `crypto/rand`, and expiry cleanup.
- `internal/webui`: embedded production UI and filesystem access during development.

The runtime dependencies are `modernc.org/sqlite`, `oklog/ulid`, and `golang.org/x/time/rate`. Logging uses `log/slog`. SQLite uses one connection, prepared statements, WAL, a 5-second busy timeout, and `synchronous=FULL`. Expired records are hidden immediately and deleted on startup and every minute in batches of 500.

## Environment

| Variable        | Default              | Purpose                                                                            |
| --------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `PORT`          | `8080`               | HTTP listen port                                                                   |
| `DB_PATH`       | `./data/shares.db`   | SQLite file path                                                                   |
| `PUBLIC_ORIGIN` | derived from request | Origin check for `POST /api/v1/shares`                                             |
| `TRUST_PROXY`   | unset                | Set `true` to trust the rightmost `X-Forwarded-For` IP and `X-Forwarded-Proto` hop |

`PUBLIC_ORIGIN` is an origin such as `https://example.com`, without a path or trailing slash. Requests without an `Origin` header remain supported.

## API

```text
POST /api/v1/shares
  Content-Type: application/json
  { "ttl_seconds": 3600, "envelope": "<base64url>" }

→ 201 { "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "expires_at": 1735689600000 }

GET /api/v1/shares/01ARZ3NDEKTSV4RRFFQ69G5FAV

→ 200 { "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "expires_at": 1735689600000, "envelope": "<base64url>" }
```

Errors use a consistent JSON envelope:

```json
{ "error": { "code": "not_found", "message": "Share not found." } }
```

Rate-limited responses (`429`) include a `Retry-After` header in seconds. Successful creates include `Location: /api/v1/shares/{id}`. API responses use `Cache-Control: no-store`. Share links use `/share/{id}#key`, not the API path.

IDs remain case-insensitive ULIDs, and expiry timestamps remain Unix milliseconds. The SQLite table is compatible with existing Node-created databases. The server accepts JSON integer TTL values from 60 to 86400, with a nonempty unpadded base64url envelope. It rejects strings, fractional numbers, scientific notation, array/boolean TTL values, malformed JSON, and invalid base64 characters. Share misses return `not_found` with "Share not found."; other missing paths use the same code with "Not found." Unexpected failures return a generic `internal_error` response; internal details remain in structured logs.

## Encryption

- AES-256-GCM in the browser via Web Crypto.
- Envelope v1: 18-byte header + ciphertext + 16-byte GCM tag.
- Header prefix (magic, version, suite) is bound as additional authenticated data.
- The 32-byte key is encoded as unpadded base64url in the URL fragment.

The server never sees the key or plaintext.

## Limits

- Plaintext cap: 64 KiB (`65536` bytes).
- TTL: 60 seconds to 86400 seconds (24 hours). The UI defaults to 1 hour; the API requires a TTL.

Rate limits use independent in-memory token buckets per client IP:

| Operation                        | Burst capacity | Refill                     |
| -------------------------------- | -------------- | -------------------------- |
| Create                           | 15 requests    | 1 request every 20 seconds |
| Read (`GET` and `HEAD` combined) | 30 requests    | 2 requests per second      |

These are burst-plus-rate allowances, replacing the Node server's fixed windows. Failed requests to these endpoints also spend tokens. Excess requests receive `429` immediately, with `Retry-After` in whole seconds. Static files do not consume API tokens. Clients behind a shared office or VPN IP share the allowance.

Each operation tracks up to 10,000 IPs. Entries idle for 10 minutes are removed during periodic request-driven cleanup. At capacity, new IPs receive `429` until space is available. Limits are per process and reset on restart; they are not a global storage quota.

## Fragment risk

Anyone with the full link (path + `#key`) can decrypt until expiry. Fragments are not sent to the server on navigation, but they can leak via browser history, screenshots, or shared logs. Treat links like passwords.

## Metadata we store

- Share ID (ULID, containing a creation timestamp and random component).
- Encrypted blob.
- Expiry timestamp.

We cannot read your variables. Questions or abuse: `abuse@localhost` (placeholder for v1).

## Deploy

Production is one statically linked Go binary in a scratch image, running as UID/GID `65532`. Node and Go are used only in build stages. The Linux ARM64 image is approximately 11 MB uncompressed; size varies by architecture and UI build.

```bash
mise run docker:build
docker image inspect env-share:go-scratch --format '{{.Size}}'
mise run docker:run
```

Pass a commit label at build time to display it in the UI footer:

```bash
docker build -t env-share:go-scratch --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) .
```

Open `http://127.0.0.1:8080`. SQLite persists in the `env-share-data` Docker volume at `/data/shares.db`. Existing bind mounts or volumes must be writable by UID/GID `65532`. Stop the old server before switching to the Go binary and keep the existing `DB_PATH` to retain active shares.

Terminate TLS at your reverse proxy or platform ingress. Set `TRUST_PROXY=true` and `PUBLIC_ORIGIN=https://your-host.example` only when the server is reachable through a trusted proxy. Rate limits use the rightmost `X-Forwarded-For` hop. With proxy trust disabled, rate limits use the socket peer IP and forwarded headers are ignored.

The server handles SIGINT/SIGTERM with up to 10 seconds to drain HTTP requests before closing SQLite. It logs startup, shutdown, and operational errors as JSON without request bodies or raw share URLs.

## Tests

```bash
mise run check
mise run test
mise run test:e2e:install
mise run test:e2e
node scripts/smoke-container.mjs
```

Go tests cover API behavior, expiry, disk persistence, concurrent writes, limiter refill, proxy handling, and static headers. Playwright builds and runs the production Go binary on port 18080. The container smoke test checks embedded assets, non-root writes, persistence across restart, and graceful shutdown, then removes its test container and volume. Build the image before running the smoke test.

CI runs frontend checks, Go tests with the race detector, golangci-lint, Playwright, and the container smoke test. Go modules and frontend dependencies are locked; Docker build images are pinned by digest.

## Issue

[Go server migration](https://github.com/dylanferguson/env-share/issues/11)
