export function persist<T>(key: string, fallback: T) {
  return {
    get(unavailable: T = fallback): T {
      try {
        const raw = globalThis.localStorage.getItem(key);
        if (raw === null) {
          return fallback;
        }
        try {
          return JSON.parse(raw) as T;
        } catch {
          return fallback;
        }
      } catch {
        return unavailable;
      }
    },
    set(value: T): void {
      try {
        globalThis.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // private mode / quota
      }
    },
  };
}
