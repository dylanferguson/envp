# Deployment strategy

env-share is designed as **one process + one SQLite file + embedded static UI**. Deployment concerns (sleep/wake, volumes, platform choice) belong in **deploy profiles**, not application code.

Canonical env vars: `PORT`, `DB_PATH`, `PUBLIC_ORIGIN`, `TRUST_PROXY` (see root README).

## Goals

1. **Portable artifact** — same container/binary on Docker, Fly, a VPS, etc.
2. **No PaaS-specific app code** — avoid Workers bindings, D1, wrangler in the server.
3. **Cheap when idle** — internal/episodic use should not pay for 24/7 compute.
4. **SQLite on a volume** — `DB_PATH` points at a persistent mount (e.g. `/data/shares.db`).

## Recommended direction: Go + deploy profiles

Rewrite the small Node/Hono server in Go (stdlib or chi, `go:embed` for `dist/client`, pure-Go SQLite via `modernc.org/sqlite`). Keep the JSON API contract identical.

| Layer              | Responsibility                                                  |
| ------------------ | --------------------------------------------------------------- |
| **App**            | HTTP API, static files, `DB_PATH`, validation, headers          |
| **deploy/docker/** | Always-on or manual `compose up` / `down`                       |
| **deploy/fly/**    | Auto sleep/wake + volume (see [fly/README.md](./fly/README.md)) |

Image size (~20–30 MB) helps cold starts but **idle cost is dominated by compute hours**, not megabytes. Optimize for scale-to-zero where traffic is sporadic.

## Platform notes

### Fly.io — recommended for “deployed but rarely used”

Fly **autostop/autostart** (scale to zero) fits internal episodic traffic:

- Fly Proxy stops Machines after ~**5 minutes** idle (not configurable).
- `auto_start_machines = true` wakes on the next HTTP request.
- `min_machines_running = 0` allows **fully asleep** (no CPU/RAM charges).
- **Volumes persist** across stop/wake — SQLite at `/data` survives sleep.
- Idle cost: volume storage (~$0.15/GB/mo) + stopped Machine rootfs; no CPU/RAM while stopped.
- Cold start: often **1–3 s** first request after sleep (acceptable for env sharing).
- Use **one Machine, one region** for file-backed SQLite.

Example profile: [fly/fly.toml.example](./fly/fly.toml.example).

Docs: [Autostop/autostart](https://fly.io/docs/launch/autostop-autostart/), [pricing (stopped machines)](https://fly.io/docs/about/pricing/#stopped-fly-machines).

### Docker Compose — zero cloud cost when down

`docker compose up` when needed, `down` when finished. Same image and volume model as production Docker. Good for “twice a month” internal use with no Fly account.

### Cloudflare Workers (classic) — not a fit

Workers run JS/Wasm, not native Go. Would require D1/KV/R2, split Pages/Worker deploy, and platform bindings — opposite of portable container + volume SQLite.

### Cloudflare Containers — not a fit for file SQLite

Runs OCI images but **disk is ephemeral**; data is lost when the instance sleeps. Durable state requires D1/R2/FUSE — again, platform-specific storage.

## App behavior when sleeping

No code changes required for sleep/wake:

- **Expiry** — `read()` already filters `expires_at > now` (lazy expiry).
- **Hourly sweep** — optional hygiene; safe to miss while asleep.
- **In-memory rate limits** — reset on wake; fine for internal traffic.

## Deploy profiles (planned)

| Profile                      | Sleep/wake            | SQLite   | Status                                  |
| ---------------------------- | --------------------- | -------- | --------------------------------------- |
| `deploy/docker/`             | Manual                | Volume   | Baseline exists (root Dockerfile)       |
| `deploy/fly/`                | Automatic             | Volume   | Example `fly.toml` only                 |
| Remote SQLite (Turso/libSQL) | Broader scale-to-zero | External | Future option if Fly is too opinionated |

## Issue cross-references

Planning notes for GitHub issues live in [`.github/issue-notes/`](../.github/issue-notes/README.md) (source material for issue bodies). Issues #1, #8, and #11 were updated 2026-09-02.
