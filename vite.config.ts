import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

function resolveGitCommit(): string {
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT.trim().slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildCommit = resolveGitCommit();

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
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        open: resolve(__dirname, "open.html"),
        "fixtures/step-tree": resolve(__dirname, "fixtures/step-tree.html"),
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
