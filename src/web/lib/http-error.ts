export function formatHttpError(status: number, statusText = ""): string {
  const reason = statusText.trim();
  if (status > 0 && reason) {
    return `${status} ${reason}`;
  }
  if (status > 0) {
    return `${status}`;
  }
  return "Request failed";
}
