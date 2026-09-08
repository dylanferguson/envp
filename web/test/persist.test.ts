import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { persist } from "../src/lib/persist.js";

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

describe("persist", () => {
  it("round-trips a value and uses the fallback when missing", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const store = persist("envp:test-flag", false);
    expect(store.get()).toBe(false);
    store.set(true);
    expect(store.get()).toBe(true);
  });

  it("treats blocked storage as unavailable, not as a missing key", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    const store = persist("envp:diagram-seen", false);
    expect(store.get(true)).toBe(true);
    store.set(true);
  });

  it("still counts the previous diagram flag as seen", () => {
    vi.stubGlobal("localStorage", memoryStorage({ "envp:diagram-seen": "1" }));
    expect(persist("envp:diagram-seen", false).get(true)).toBeTruthy();
  });
});
