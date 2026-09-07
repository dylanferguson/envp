# envp

Browser-encrypted `.env` sharing. The key stays in the URL fragment; the server stores ciphertext, an id, and an expiry.

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

http://127.0.0.1:8080. SQLite lives on the named `envp-data` volume. A host bind mount at `/data` is root-owned, so the non-root process cannot write the database.

Set `PUBLIC_ORIGIN` when the hostname is not localhost. Set `TRUST_PROXY=true` behind a trusted reverse proxy.

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
| `OBS_PORT`      | `9090` (`/health`, `/metrics`)        |
| `DB_PATH`       | `./data/shares.db`                    |
| `PUBLIC_ORIGIN` | derived from request                  |
| `TRUST_PROXY`   | unset (`true` behind a trusted proxy) |
