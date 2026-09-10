const MAGIC = new Uint8Array([0x45, 0x4e, 0x56, 0x53]);
const ORIGIN = process.env.ENVP_ORIGIN ?? "http://127.0.0.1:8787";

function toArrayBuffer(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value) {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function seal(plaintext, key) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(18);
  header.set(MAGIC, 0);
  header[4] = 0x01;
  header[5] = 0x01;
  header.set(nonce, 6);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: header.slice(0, 6), tagLength: 128 },
      key,
      toArrayBuffer(plaintext),
    ),
  );
  const envelope = new Uint8Array(18 + ciphertext.length);
  envelope.set(header, 0);
  envelope.set(ciphertext, 18);
  return envelope;
}

async function open(envelope, key) {
  const nonce = envelope.slice(6, 18);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: envelope.slice(0, 6), tagLength: 128 },
    key,
    envelope.slice(18),
  );
  return new Uint8Array(plaintext);
}

const plaintext = new TextEncoder().encode("FOO=bar\nSECRET=hunter2\n");
const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
  "encrypt",
  "decrypt",
]);
const envelope = await seal(plaintext, key);
const created = await fetch(`${ORIGIN}/api/v1/shares`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ttl_seconds: 3600, max_reads: 5, envelope: encode(envelope) }),
});
if (!created.ok) {
  throw new Error(`create ${created.status} ${await created.text()}`);
}
const { id } = await created.json();
const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
const link = `${ORIGIN}/share/${id}#${encode(rawKey)}`;
const page = await fetch(`${ORIGIN}/share/${id}`);
const html = await page.text();
if (!page.ok || !html.includes("envp")) {
  throw new Error(`share page ${page.status}`);
}
const home = await fetch(`${ORIGIN}/`);
if (!home.ok || !(await home.text()).includes("envp")) {
  throw new Error(`home ${home.status}`);
}
const read = await fetch(`${ORIGIN}/api/v1/shares/${id}`);
if (!read.ok) {
  throw new Error(`read ${read.status} ${await read.text()}`);
}
const body = await read.json();
const opened = await open(decode(body.envelope), key);
const text = new TextDecoder().decode(opened);
if (text !== "FOO=bar\nSECRET=hunter2\n") {
  throw new Error(`decrypt mismatch: ${JSON.stringify(text)}`);
}
console.log(JSON.stringify({ ok: true, id, link, home: home.status, page: page.status }));
