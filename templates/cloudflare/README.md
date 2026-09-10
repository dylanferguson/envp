# Cloudflare Worker (D1)

Same envp UI and API, on a Worker with D1 instead of the Fly/Go machine.

The browser still encrypts. The Worker only stores the envelope. TTL and remaining reads are enforced in SQL. A minute cron deletes expired and exhausted rows.

This does not replace the Fly site.

## Run locally

From the repo root:

```bash
pnpm --dir templates/cloudflare install
mise run cf:dev
```

App on [http://127.0.0.1:8787](http://127.0.0.1:8787). That builds the Vite UI into `public/`, applies local D1 migrations, and starts Wrangler.

## Deploy

1. `npx wrangler login` (from this directory)
2. `npx wrangler d1 create envp` and paste `database_id` into `wrangler.jsonc`
3. Set `vars.PUBLIC_ORIGIN` to the public origin (`https://your-worker.workers.dev` or the custom domain), no path
4. `mise run cf:build`
5. `npx wrangler d1 migrations apply envp --remote`
6. `npx wrangler deploy`

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dylanferguson/envp/tree/main/templates/cloudflare)

After a Deploy to Cloudflare clone, run `mise run cf:build` (or `vp build` at the repo root and copy `dist/client` here) so `public/` has the UI.

## Assumptions

- Rate limits live in WAF, not in this Worker.
- `GET` decrements `remaining_reads` atomically in D1. Missing, expired, and exhausted shares all return the same 404.
- Sweep is hygiene. Reads already filter `expires_at` and `remaining_reads`.
