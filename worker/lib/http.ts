export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Request is too large.");
  try { return await request.json<T>(); }
  catch { throw new HttpError(400, "Invalid JSON request."); }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "Cross-site request rejected.");
}

export function emailAddress(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  return email;
}
