const DIAGRAM_SEEN_KEY = "env-share:diagram-seen";

function diagramStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function hasSeenDiagram(): boolean {
  try {
    const storage = diagramStorage();
    if (!storage) {
      return true;
    }
    return storage.getItem(DIAGRAM_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markDiagramSeen(): void {
  try {
    diagramStorage()?.setItem(DIAGRAM_SEEN_KEY, "1");
  } catch {
    // private mode / quota
  }
}
