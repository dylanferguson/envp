# envp

Browser-encrypted `.env` sharing. The key stays in the URL fragment. The server stores ciphertext, an id, an expiry, and a bound on how many times the encrypted blob may be fetched.

https://envp.dylanferguson.co

```bash
mise install
vp install
mise run dev
```

http://127.0.0.1:5173 — Vite on 5173, API on 8080.

Self-host the production image without Node or mise:

```bash
git clone https://github.com/dylanferguson/envp.git
cd envp
docker compose up --build
```

http://127.0.0.1:8080. nginx serves the UI, rate-limits creates and reads, and proxies `/api` to Go on loopback `:8081`. SQLite lives on the named `envp-data` volume. A host bind mount at `/data` is root-owned, so the non-root process cannot write the database.

Set `PUBLIC_ORIGIN` when the hostname is not localhost. nginx rate-limits on the client IP Fly's edge reports (`Fly-Client-IP`, honoring `CF-Connecting-IP` only when that edge IP is in a Cloudflare range), returns 403 for `*.fly.dev`, and requires an `X-Origin-Token` header that only a Cloudflare Transform Rule injects, so direct-to-Fly traffic is rejected. `mise run dev` talks to Go directly and has no per-IP cap. `mise run start` is the API without the UI.

Production wiring for the edge token — both values must match:

```bash
fly secrets set X_ORIGIN_TOKEN=<random, letters/digits/-/_ only>
```

Cloudflare dashboard: Rules → Transform Rules → Modify Request Header, "set static" `X-Origin-Token` to the same value on `http.host eq "envp.dylanferguson.co"`. Without the secret, nginx exits at boot (fail closed).

```bash
mise run check
mise run test
mise run test:e2e:install
mise run test:e2e
mise run docker:build
mise run docker:run
```

| Variable         | Default                                   |
| ---------------- | ----------------------------------------- |
| `PORT`           | `8080` (`8081` behind nginx)              |
| `LISTEN_HOST`    | all interfaces (`127.0.0.1` behind nginx) |
| `INTERNAL_PORT`  | `9090` (`/health`, `/metrics`)            |
| `DB_PATH`        | `./data/shares.db`                        |
| `PUBLIC_ORIGIN`  | derived from request                      |
| `X_ORIGIN_TOKEN` | `envp-dev-token` (compose) / fly secret   |
