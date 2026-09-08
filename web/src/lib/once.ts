export function once(key: string): boolean {
  try {
    if (localStorage.getItem(key)) {
      return false;
    }
    localStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}
