import type { OpenState } from "../pages/open/state.js";

export type DiagramFocus = "link" | "key" | "fetch" | "unlock" | "revealed";

export const OPEN_DIAGRAM_FOCUS: Record<OpenState["phase"], DiagramFocus> = {
  idle: "link",
  invalid_link: "link",
  missing_key: "key",
  loading: "fetch",
  gone: "fetch",
  unlocking: "unlock",
  tampered: "unlock",
  revealed: "revealed",
};

export function deriveOpenDiagramFocus(phase: OpenState["phase"]): DiagramFocus {
  return OPEN_DIAGRAM_FOCUS[phase];
}
