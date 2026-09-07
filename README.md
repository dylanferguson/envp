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
