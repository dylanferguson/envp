# Rust server

This implementation stores only opaque encrypted envelope bytes. It never receives a decryption key.

## Contract

Create a share with `POST /shares`, `Content-Type: application/octet-stream`, a non-empty body of at most 65,536 bytes, and `X-Share-Expiry-Seconds: 3600`, `86400`, or `604800`. A successful request returns:

```json
{"id":"base64url-id","path":"/shares/base64url-id","expiresAt":1234567890}
```

Fetch the unchanged bytes with `GET /shares/:id`. Missing, invalid, and logically expired IDs all return the same 404 response. `APP_ORIGIN` is the only browser origin permitted; POST requests without `Origin` remain available to non-browser clients.

## Run

```sh
cargo run --release
STORE=sqlite SQLITE_PATH=shares.db cargo run --release
```

Configuration: `ADDR` defaults to `127.0.0.1:8080`, `APP_ORIGIN` defaults to `http://localhost:3000`, and `STORE` defaults to `memory`.

SQLite uses bundled SQLite, WAL, `synchronous=NORMAL`, and a five-second busy timeout. SQLite calls run on Tokio's blocking pool. Both stores apply expiry on every read, lazily delete expired reads, delete at most 500 expired records at startup, and repeat bounded cleanup hourly.
