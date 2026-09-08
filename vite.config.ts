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
        if (req.url && /^\/share\/[^/]+\/?(\?.*)?$/.test(req.url)) {
          req.url = "/open.html";
        }
        next();
      });
    },
  };
}

const webRoot = resolve(__dirname, "web");

export default defineConfig({
  root: webRoot,
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    globals: true,
    environment: "node",
    dir: webRoot,
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  plugins: lazyPlugins(() => [
    svelte({ configFile: resolve(webRoot, "svelte.config.js") }),
    shareOpenPage(),
  ]),
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(webRoot, "index.html"),
        open: resolve(webRoot, "open.html"),
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
