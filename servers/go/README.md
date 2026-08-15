# Go server

The Go implementation uses `net/http` and stores the encrypted envelope as opaque bytes. It never receives the browser's AES-GCM key.

## API

Create a share with `POST /shares`, `Content-Type: application/octet-stream`, an `X-Share-Expiry-Seconds` header of `3600`, `86400`, or `604800`, and a non-empty raw envelope body of at most 65,536 bytes. A successful request returns:

```json
{"id":"base64url-id","path":"/shares/base64url-id","expiresAt":1700003600}
```

Fetch the same raw envelope with `GET /shares/:id`. Missing, malformed, and logically expired IDs all return the same `404` response. The browser keeps the decryption key in the URL fragment.

## Run

```sh
go run .
STORE=sqlite SQLITE_PATH=shares.db APP_ORIGIN=https://example.test go run .
```

`STORE` is `memory` by default. `ADDR` defaults to `:8080`. When `APP_ORIGIN` is set, only that origin receives creation CORS permission; requests without an Origin header remain available to non-browser clients.

SQLite uses WAL, a 5-second busy timeout, `synchronous=NORMAL`, and one database connection so its serialization boundary is explicit. Cleanup deletes at most 1,000 expired records at startup and hourly. Reads always enforce exact logical expiry, independently of cleanup.
