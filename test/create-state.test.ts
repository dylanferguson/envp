import { describe, expect, it } from "vitest";
import {
  CREATE_STEPS,
  deriveCreateReading,
  isCreateBusy,
  isCreateDone,
} from "../src/web/pages/create/state.js";

describe("create state", () => {
  it("maps idle to paste step", () => {
    expect(deriveCreateReading({ phase: "idle" })).toMatchObject({
      word: "ready",
      step: "paste",
      kind: "hold",
    });
  });

  it("adds byte count to uploading note", () => {
    expect(deriveCreateReading({ phase: "uploading", bytes: 512 })).toMatchObject(
      {
        step: "send",
        note: "uploading 512 bytes, encrypted",
      },
    );
  });

  it("routes error to the failing step", () => {
    expect(
      deriveCreateReading({
        phase: "error",
        at: "send",
        message: "upload failed (403)",
      }),
    ).toMatchObject({
      step: "send",
      tone: "error",
      note: "upload failed (403)",
    });
  });

  it("tracks busy phases", () => {
    expect(isCreateBusy({ phase: "idle" })).toBe(false);
    expect(isCreateBusy({ phase: "encrypting" })).toBe(true);
    expect(isCreateBusy({ phase: "uploading", bytes: 1 })).toBe(true);
    expect(isCreateDone({ phase: "done", url: "", copied: false, expiresAt: 0 })).toBe(
      true,
    );
  });

  it("covers every step in the tree", () => {
    for (const step of CREATE_STEPS) {
      expect(CREATE_STEPS).toContain(step);
    }
  });
});
