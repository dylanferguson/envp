# Shared HTTP contract

All runtimes implement the same API and storage behavior.

## Create a share

```http
POST /shares
Content-Type: application/octet-stream
X-Share-Expiry-Seconds: 3600

<opaque encrypted envelope>
```

`X-Share-Expiry-Seconds` must be `3600`, `86400`, or `604800`. The body must
contain between 1 and 65,536 bytes. Servers enforce the limit while reading the
body, independent of `Content-Length`.

The `application/octet-stream` media type is case-insensitive and may include
semicolon-delimited parameters.

Successful responses use status `201` and this JSON shape:

```json
{"id":"<base64url-id>","path":"/shares/<base64url-id>","expiresAt":1760000000}
```

The ID is unpadded base64url encoding of 16 cryptographically random bytes.
`expiresAt` is an absolute Unix timestamp in seconds.

## Fetch a share

```http
GET /shares/<id>
```

A readable share returns status `200`, content type
`application/octet-stream`, and the original opaque bytes. Missing, malformed,
expired, and physically deleted shares all return the same `404` response.

## Errors

Errors are JSON with these stable bodies:

| Status | Body |
| --- | --- |
| `400` | `{"error":"invalid_request"}` |
| `404` | `{"error":"not_found"}` |
| `413` | `{"error":"payload_too_large"}` |
| `429` | `{"error":"rate_limited"}` |

## Headers and origins

Every response includes `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`.

Browser creation requests are accepted only when `Origin` exactly matches the
configured `APP_ORIGIN`. Requests without `Origin` remain available to CLI and
conformance clients. CORS preflight responses grant access only to that exact
origin.

## Storage and expiry

`STORE=memory` selects the in-memory implementation. `STORE=sqlite` selects
local SQLite. Every read applies logical expiry. Both modes run bounded cleanup
at startup and approximately hourly, independent of request traffic.
