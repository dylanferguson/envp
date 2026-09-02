## Decision notes (Cloudflare)

Assessed for “Go server on Cloudflare” — **not recommended** for this app’s portable SQLite-on-volume model.

### Classic Workers

- Do not run native Go; need Wasm (TinyGo) + platform storage (D1/KV/R2).
- Split deploy: Pages (SPA) + Worker (API).
- Adds wrangler, bindings, and CF-specific CI — contradicts portable container goal.

### Cloudflare Containers

- **Does** run OCI images (including Go).
- **Does not** provide persistent local disk — all filesystem state is ephemeral on sleep.
- SQLite at `DB_PATH` would be **lost** when the instance sleeps unless you adopt D1/R2/FUSE.
- Sleep/wake is built in, but you still need platform storage primitives for durability.

### If edge matters later

- **Workers Containers** running the **same** portable image is possible, but still needs external DB or R2 for SQLite semantics.
- Prefer **Fly scale-to-zero + volume** or **manual Docker** for v1.

Full write-up: [`deploy/README.md`](../../deploy/README.md)
