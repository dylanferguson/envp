export type SignalTone = "idle" | "live" | "ok" | "error";
export type TreeKind = "now" | "hold" | "error";
export type DiagramFocus =
  | "paste"
  | "seal"
  | "send"
  | "share"
  | "link"
  | "key"
  | "fetch"
  | "unlock"
  | "revealed";

export type Reading<S extends string = string> = {
  word: string;
  tone: SignalTone;
  step: S;
  kind: TreeKind;
  note: string;
};

export type TreeLine<S extends string = string> = {
  step: S;
  twig: string;
  label: string;
};
