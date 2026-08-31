# env-share

Browser-encrypted `.env` sharing. The homepage is the paste form: paste, get a link. The decryption key stays in the URL fragment (`#...`). The server stores only the encrypted blob and an expiry timestamp.

Routes are `/` and `/new` (the same compose console) and `/s/:id#key` (the open console).

## Run locally

```bash
mise install
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173` for the UI. Vite proxies `/api` to the API on port 8080.

`mise.toml` pins Node 24.16.0 and pnpm 11.22.0. `mise install` in this directory uses those versions.

Production-style single process:

```bash
pnpm build
pnpm start
```

Serves the built UI and API from one Node process on port 8080 (override with `PORT`).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `DB_PATH` | `./data/shares.db` | SQLite file path |
| `PUBLIC_ORIGIN` | derived from `Host` | Origin check for `POST /api/v1/shares` |
| `TRUST_PROXY` | unset | Set `true` to trust first `X-Forwarded-For` hop |

## API

```
POST /api/v1/shares
  Content-Type: application/json
  { "ttl_seconds": 3600, "envelope": "<base64url>" }

→ 201 { "id": "share_…", "expires_at": 1735689600000 }

GET /api/v1/shares/share_…

→ 200 { "id": "share_…", "expires_at": 1735689600000, "envelope": "<base64url>" }
```

Share links use `/s/share_…#key`, not the API path.

## Encryption

- AES-256-GCM in the browser via Web Crypto
- Envelope v1: 18-byte header + ciphertext + 16-byte GCM tag
- Header prefix (magic, version, suite) is bound as additional authenticated data
- 32-byte key encoded as unpadded base64url in the URL fragment

The server never sees the key or plaintext.

## Limits

- Plaintext cap: 64 KiB (`65536` bytes)
- TTL: 60 seconds to 86400 seconds (24 hours), default 1 hour
- Rate limits (in-memory): 15 creates per 5 minutes per IP, 120 fetches per minute per IP

## Fragment risk

Anyone with the full link (path + `#key`) can decrypt until expiry. Fragments are not sent to the server on navigation, but they can leak via browser history, screenshots, referrer mistakes on other sites, or shared logs. Treat links like passwords.

## Metadata we store

- Share id (random, opaque)
- Encrypted blob
- Expiry timestamp
- Your IP at upload time (for abuse response)

We cannot read your variables. Questions or abuse: `abuse@localhost` (placeholder for v1).

## Deploy

Out of scope for v1. Target shape is a single Node process plus one SQLite file on disk. Fly, Workers, and other hosting come later.

## Tests

```bash
pnpm test
pnpm check
```

## Issue

https://github.com/dylanferguson/env-share/issues/1
