import { describe, expect, it } from "vitest";
import {
  OPEN_READINGS,
  deriveOpenReading,
  showOpenForm,
} from "../src/web/pages/open/state.js";

describe("open state", () => {
  it("maps loading to fetch step", () => {
    expect(deriveOpenReading({ phase: "loading" })).toEqual(
      OPEN_READINGS.loading,
    );
  });

  it("maps missing key to key step with error tone", () => {
    expect(deriveOpenReading({ phase: "missing_key" })).toMatchObject({
      step: "key",
      tone: "error",
    });
  });

  it("shows form on manual open when idle", () => {
    expect(showOpenForm({ phase: "idle" }, true)).toBe(true);
  });

  it("hides form while loading or after reveal", () => {
    expect(showOpenForm({ phase: "loading" }, true)).toBe(false);
    expect(showOpenForm({ phase: "revealed" }, true)).toBe(false);
    expect(showOpenForm({ phase: "gone" }, true)).toBe(true);
  });

  it("hides form on direct share links", () => {
    expect(showOpenForm({ phase: "idle" }, false)).toBe(false);
  });
});
