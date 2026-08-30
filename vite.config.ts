import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const partialsDir = join(rootDir, "src/web/partials");
const PARTIAL_RE = /<!--\s*partial:([\w.-]+)\s*-->/g;

function htmlPartials(): Plugin {
  return {
    name: "html-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(PARTIAL_RE, (_match, name: string) =>
          readFileSync(join(partialsDir, name), "utf8"),
        );
      },
    },
    configureServer(server) {
      server.watcher.add(partialsDir);
    },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(partialsDir)) {
        server.ws.send({ type: "full-reload" });
      }
    },
  };
}

function shareOpenPage(): Plugin {
  return {
    name: "share-open-page",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
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
  plugins: [htmlPartials(), shareOpenPage()],
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
      "/shares": { target: "http://127.0.0.1:8080" },
    },
  },
});
