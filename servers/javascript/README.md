# JavaScript server

Requires Node.js 22.5 or later. It uses native `node:http` and `node:sqlite`; there are no runtime dependencies.

## API

Create a share with `POST /shares`, `Content-Type: application/octet-stream`, and an
`X-Share-Expiry-Seconds` header whose value is `3600`, `86400`, or `604800`. The body
is a non-empty, opaque, versioned encrypted envelope of at most 65,536 bytes. The
server does not parse or decrypt it.

The response is:

```json
{"id":"<22-character base64url ID>","path":"/shares/<id>","expiresAt":1234567890}
```

`GET /shares/:id` returns the exact envelope bytes as `application/octet-stream`.
Missing, malformed, and expired IDs all return the same `404` response.

## Configuration

- `STORE=memory|sqlite` (default `memory`)
- `SQLITE_PATH` (default `env-share.sqlite`)
- `APP_ORIGIN` exact origin allowed to create shares from a browser
- `HOST` and `PORT` (defaults `127.0.0.1:3000`)
- `POST_RATE_LIMIT` and `GET_RATE_LIMIT` per-IP requests/minute (defaults 10 and 120)
- `CLEANUP_BATCH_SIZE` (default 1000)

SQLite uses WAL mode, `synchronous=NORMAL`, and a 5-second busy timeout. SQLite calls
are synchronous and therefore execute on the JavaScript event-loop thread. Both
stores enforce expiry during reads. Cleanup runs once at startup and hourly in a
bounded batch; reads never depend on physical cleanup.

Run `npm test` from this directory.
