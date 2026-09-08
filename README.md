# envp

Browser-encrypted `.env` sharing. The key stays in the URL fragment. The server stores ciphertext, an id, an expiry, and a bound on how many times the encrypted blob may be fetched.

https://envp.dylanferguson.co

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
| `OBS_PORT`      | `9090` (`/health`, `/metrics`)        |
| `DB_PATH`       | `./data/shares.db`                    |
| `PUBLIC_ORIGIN` | derived from request                  |
| `TRUST_PROXY`   | unset (`true` behind a trusted proxy) |
