import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin, lazyPlugins } from "vite-plus";

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
        if (req.url && /^\/shared\/[^/]+\/?(\?.*)?$/.test(req.url)) {
          req.url = "/open.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
  plugins: lazyPlugins(() => [svelte(), shareOpenPage()]),
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
