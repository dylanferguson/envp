# Fly.io deploy profile

Scale-to-zero deployment for sporadic/internal use. See [deploy/README.md](../README.md) for rationale.

## Quick start

```bash
cp deploy/fly/fly.toml.example fly.toml
fly launch          # or fly apps create + fly deploy
fly volumes create env_share_data --region <primary_region> --size 1
fly deploy
```

Set secrets if needed:

```bash
fly secrets set PUBLIC_ORIGIN=https://<your-app>.fly.dev
```

## Scale-to-zero knobs

| Setting | Value | Effect |
| ------- | ----- | ------ |
| `auto_stop_machines` | `"stop"` | Sleep after ~5 min idle |
| `auto_start_machines` | `true` | Wake on HTTP request |
| `min_machines_running` | `0` | Allow fully asleep (no CPU/RAM cost) |

For always-warm (no cold start), set `min_machines_running = 1`.

## SQLite

Mount at `/data`; set `DB_PATH=/data/shares.db`. Use **one Machine in one region** — volumes are not shared across Machines.
