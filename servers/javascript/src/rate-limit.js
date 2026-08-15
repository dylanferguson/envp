export class FixedWindowRateLimiter {
  #entries = new Map();

  constructor({ limit, windowSeconds = 60, clock = () => Date.now() }) {
    this.limit = limit;
    this.windowMilliseconds = windowSeconds * 1000;
    this.clock = clock;
  }

  allow(key) {
    const now = this.clock();
    const current = this.#entries.get(key);
    if (!current || current.resetAt <= now) {
      this.#entries.set(key, { count: 1, resetAt: now + this.windowMilliseconds });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  cleanup() {
    const now = this.clock();
    for (const [key, entry] of this.#entries) {
      if (entry.resetAt <= now) this.#entries.delete(key);
    }
  }
}
