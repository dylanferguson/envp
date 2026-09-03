import { describe, expect, it } from "vite-plus/test";
import { deriveCreateDiagramFocus, type CreateState } from "../src/web/pages/create/state.js";

describe("deriveCreateDiagramFocus", () => {
  it("maps each create phase to the matching diagram region", () => {
    expect(deriveCreateDiagramFocus({ phase: "idle" })).toBe("paste");
    expect(deriveCreateDiagramFocus({ phase: "encrypting" })).toBe("seal");
    expect(deriveCreateDiagramFocus({ phase: "uploading", bytes: 32 })).toBe("seal");
    expect(
      deriveCreateDiagramFocus({
        phase: "done",
        url: "https://example.test/share/1#key",
        copied: true,
        expiresAt: 1,
      }),
    ).toBe("share");
  });

  it("maps errors onto the step that failed", () => {
    const failed = (at: Extract<CreateState, { phase: "error" }>["at"]): CreateState => ({
      phase: "error",
      at,
      message: "failed",
    });

    expect(deriveCreateDiagramFocus(failed("encrypt"))).toBe("seal");
    expect(deriveCreateDiagramFocus(failed("send"))).toBe("send");
    expect(deriveCreateDiagramFocus(failed("link"))).toBe("share");
  });
});
