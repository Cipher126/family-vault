export function mediaCacheHeaders(original: boolean): Record<string,string> {
  // Always revalidate through the authenticated Worker, never a shared cache.
  return { "Cache-Control":original ? "private, no-store, max-age=0" : "private, no-cache, must-revalidate", Vary:"Cookie" };
}
export function matchesMediaTag(request: Request, etag: string): boolean {
  return (request.headers.get("If-None-Match") || "").split(",").some((tag) => tag.trim().replace(/^W\//,"") === etag);
}
