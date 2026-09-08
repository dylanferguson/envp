import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { once } from "../src/lib/once.js";

function memoryStorage(init: Record<string, string> = {}) {
  const data = { ...init };
  return {
    getItem(key: string) {
      return Object.hasOwn(data, key) ? data[key]! : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("once", () => {
  it("is true the first time, then false", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(once("envp:diagram-seen")).toBe(true);
    expect(once("envp:diagram-seen")).toBe(false);
  });

  it("is false when the key already exists", () => {
    vi.stubGlobal("localStorage", memoryStorage({ "envp:diagram-seen": "1" }));
    expect(once("envp:diagram-seen")).toBe(false);
  });

  it("is false when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    expect(once("envp:diagram-seen")).toBe(false);
  });
});
