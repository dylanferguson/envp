import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "public/index.html"),
        open: resolve(__dirname, "public/open.html"),
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
