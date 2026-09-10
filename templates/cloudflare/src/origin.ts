export function parseOrigin(raw: string): string | null {
  if (raw === "") {
    return "";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return null;
  }
  return url.origin;
}

export function expectedOrigin(request: Request, publicOrigin: string): string {
  if (publicOrigin !== "") {
    const configured = parseOrigin(publicOrigin);
    if (configured) {
      return configured;
    }
  }
  return new URL(request.url).origin;
}

export function originAllowed(request: Request, publicOrigin: string): boolean {
  const header = request.headers.get("Origin");
  if (header === null || header === "") {
    return true;
  }
  return header === expectedOrigin(request, publicOrigin);
}
