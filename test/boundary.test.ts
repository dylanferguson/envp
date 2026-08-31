import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

describe("boundary", () => {
  it("server code does not import envelope or use crypto.subtle", () => {
    const serverDir = join(process.cwd(), "src/server");
    const files = readdirSync(serverDir).filter((name) => name.endsWith(".ts"));
    for (const file of files) {
      const source = readFileSync(join(serverDir, file), "utf8");
      expect(source).not.toMatch(/from\s+["'].*\/envelope(?:\.js)?["']/);
      expect(source).not.toMatch(/crypto\.subtle/);
    }
  });
});
