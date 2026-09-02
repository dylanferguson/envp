## Deployment & portability summary

Consolidated notes from architecture review (2026-09-02).

### Agreed direction

1. **Portable Go container** — rewrite small Node server; same API contract; `go:embed` UI; pure-Go SQLite; no PaaS SDKs in app code.
2. **Deploy profiles in repo** — `deploy/docker/` (baseline), `deploy/fly/` (scale-to-zero + volume). App reads `DB_PATH`, not platform bindings.
3. **Sleep/wake is a deploy concern** — for internal rare use, Fly autostop/autostart (`min_machines_running = 0`) is the default recommendation; manual `docker compose` for zero cloud cost.
4. **Skip Cloudflare-specific paths for v1** — Workers need Wasm + D1; Containers have ephemeral disk. Both push platform storage into the design.

### Key constraint

SQLite on a **volume** requires a platform that keeps the volume across sleep/wake (Fly ✓, Docker ✓, Cloudflare Containers ✗ without R2/D1).

### Repo artifacts

- [`deploy/README.md`](../../deploy/README.md) — canonical doc
- [`deploy/fly/fly.toml.example`](../../deploy/fly/fly.toml.example) — scale-to-zero example
- [`.github/issue-notes/`](./) — topic-specific paste-ready comments

### Open follow-ups

- [ ] Go server implementation + contract tests
- [ ] Go multi-stage Dockerfile (Node build stage → static Go binary)
- [ ] `fly launch` validation against example `fly.toml`
- [ ] Optional `/health` endpoint for faster Fly health checks
