## Decision notes (Fly scale-to-zero)

For **internal, episodic** use, optimize **compute hours**, not just image size. Fly autostop/autostart is the recommended “deployed but cheap when idle” profile.

### How it works

- Fly Proxy stops Machines after ~**5 min** idle (`auto_stop_machines = "stop"`).
- Next request starts the Machine (`auto_start_machines = true`).
- `min_machines_running = 0` → **fully asleep**, no CPU/RAM charges while stopped.
- **Volume at `/data` persists** — SQLite (`DB_PATH=/data/shares.db`) survives stop/wake.
- Cold start: often **1–3 s** on first request after sleep (fine for env sharing).
- Use **one Machine, one region** for file-backed SQLite.

### Idle cost

- Stopped/suspended: no CPU/RAM billing.
- Still pay: volume (~$0.15/GB/mo) + stopped Machine rootfs storage.

### App impact

None required:
- Lazy expiry in `read()` already handles correctness if the hourly sweep doesn’t run while asleep.
- In-memory rate limits reset on wake — acceptable for internal traffic.

### Config

Example in repo: `deploy/fly/fly.toml.example` and `deploy/fly/README.md`.

Docs: https://fly.io/docs/launch/autostop-autostart/

### Alternatives

| Profile | When |
| ------- | ---- |
| `docker compose up/down` | Zero cloud cost, manual wake |
| `min_machines_running = 1` on Fly | No cold start, always-on cost |
| Remote SQLite (Turso) | Scale-to-zero on more platforms; external dependency |

Full write-up: [`deploy/README.md`](../../deploy/README.md)
