export async function readLimitedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | "too_large"> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null && contentLength !== "") {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > maxBytes) {
      return "too_large";
    }
  }
  if (request.body === null) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
