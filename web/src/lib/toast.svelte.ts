type Phase = "hidden" | "shown" | "hiding";

const HIDE_AFTER_MS = 2800;

export const toast = $state({
  message: "",
  phase: "hidden" as Phase,
  seq: 0,
});

let hideTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleHide(): void {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    dismissToast();
  }, HIDE_AFTER_MS);
}

export function showToast(nextMessage: string): void {
  toast.message = nextMessage;
  toast.seq += 1;
  toast.phase = "shown";
  scheduleHide();
}

export function dismissToast(): void {
  clearTimeout(hideTimer);
  if (toast.phase === "shown") {
    toast.phase = "hiding";
  } else {
    toast.phase = "hidden";
  }
}

export function finishHide(): void {
  if (toast.phase === "hiding") {
    toast.phase = "hidden";
  }
}
