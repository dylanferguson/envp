import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { MAX_ENVELOPE_BYTES } from "../src/lib/limits.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("boundary", () => {
  it("Go server does not implement browser encryption or decryption", () => {
    for (const dir of ["cmd/envp", "internal/server", "internal/store"]) {
      const serverDir = join(repoRoot, dir);
      const files = readdirSync(serverDir).filter(
        (name) => name.endsWith(".go") && !name.endsWith("_test.go"),
      );
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const source = readFileSync(join(serverDir, file), "utf8");
        expect(source).not.toMatch(/"crypto\/(aes|cipher)"/);
      }
    }
  });

  it("Go blob cap is at least the browser envelope max", () => {
    const source = readFileSync(join(repoRoot, "internal/server/server.go"), "utf8");
    expect(source).not.toMatch(/envelopeHeaderBytes|gcmTagBytes/);
    const match = source.match(/maxShareBytes\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(MAX_ENVELOPE_BYTES);
  });
});
