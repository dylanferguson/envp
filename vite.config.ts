import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

function shareOpenPage(): Plugin {
  return {
    name: "share-open-page",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/open\/?(\?.*)?$/.test(req.url)) {
          req.url = "/open.html";
        }
        if (req.url && /^\/s\/[^/]+\/?(\?.*)?$/.test(req.url)) {
          req.url = "/open.html";
        }
        if (req.url && /^\/new\/?(\?.*)?$/.test(req.url)) {
          req.url = "/index.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), shareOpenPage()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        open: resolve(__dirname, "open.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080" },
    },
  },
});
