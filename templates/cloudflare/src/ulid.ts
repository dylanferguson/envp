const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newUlid(now = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

function encodeTime(now: number): string {
  let n = Math.floor(now);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out = ENCODING[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0n;
  for (const byte of bytes) {
    buffer = (buffer << 8n) | BigInt(byte);
  }
  let out = "";
  for (let i = 0; i < 16; i++) {
    const shift = BigInt(5 * (15 - i));
    out += ENCODING[Number((buffer >> shift) & 31n)];
  }
  return out;
}
