import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.js";
import { openStore } from "./store.js";

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? "./data/shares.db";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN;
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

mkdirSync(dirname(DB_PATH), { recursive: true });

const store = openStore(DB_PATH);
store.sweep();

const sweepInterval = setInterval(() => {
  store.sweep();
}, 60 * 60 * 1000);
sweepInterval.unref();

const app = createApp({
  store,
  publicOrigin: PUBLIC_ORIGIN,
  trustProxy: TRUST_PROXY,
  clientRoot: "dist/client",
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`env-share listening on http://127.0.0.1:${info.port}`);
});
