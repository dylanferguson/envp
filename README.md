# envp

envp is an environment pointer. Browser-encrypted `.env` sharing. The key stays in the URL fragment; the server stores ciphertext, an id, and an expiry.

```bash
mise install
vp install
mise run dev
```

http://127.0.0.1:5173 — Vite on 5173, API on 8080.

```bash
mise run check
mise run test
mise run test:e2e:install
mise run test:e2e

mise run docker:build
mise run docker:run
```

| Variable        | Default                               |
| --------------- | ------------------------------------- |
| `PORT`          | `8080`                                |
| `DB_PATH`       | `./data/shares.db`                    |
| `PUBLIC_ORIGIN` | derived from request                  |
| `TRUST_PROXY`   | unset (`true` behind a trusted proxy) |

## Observability

`GET /metrics` is Prometheus text on the same listener. It publishes `http_requests_total`, `http_request_duration_seconds`, `rate_limit_exceeded_total`, `shares_created_total`, and `sweep_deleted_total`. The `route` label is `create`, `get`, or `static`. The `status_class` label is `1xx` through `5xx`. Share ids, IPs, and request bodies never appear as labels.

`GET /health` returns `application/health+json` with a `db:sqlite` check.

Logs are JSON on stderr. INFO covers listen and shutdown. WARN covers a rejected origin. ERROR covers database, sweep, and panic failures. Successful requests are not logged. Envelopes, share ids, and URL fragments are not logged. A W3C `traceparent` on the request adds `trace_id` to error and warn lines.

The scratch image has no shell. Docker `HEALTHCHECK` runs `/envp healthcheck`, which GETs `http://127.0.0.1:$PORT/health`.
