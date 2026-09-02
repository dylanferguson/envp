## Decision notes (portable Go container)

**Direction:** Rewrite the Node/Hono server in Go; keep the same JSON API and env vars (`PORT`, `DB_PATH`, `PUBLIC_ORIGIN`, `TRUST_PROXY`). Embed `dist/client` with `go:embed`. Use pure-Go SQLite (`modernc.org/sqlite`) so the binary is static and the image can be ~20–30 MB vs the current ~184 MB Node distroless baseline.

**Why not PaaS-specific support in app code:**
- Classic Cloudflare Workers need Wasm + D1/KV + split Pages deploy — a second platform surface for two API routes.
- Cloudflare Containers have **ephemeral disk** — file SQLite does not survive sleep.
- Portable container + volume matches today’s model (`DB_PATH` on a mount).

**Scope:** ~180 lines of server logic (`app.ts`, `store.ts`, `main.ts`). Add contract tests so implementations cannot drift.

**Deploy stays separate:** `deploy/docker/`, `deploy/fly/` — no Fly/CF imports in the Go module.

Full write-up: [`deploy/README.md`](../../deploy/README.md)
