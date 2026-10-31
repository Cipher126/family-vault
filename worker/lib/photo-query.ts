import { HttpError } from "./http";

export function photoQuery(url: URL, user: { id: string; role: string }, access: string) {
  const sort = url.searchParams.get("sort") || "uploaded";
  const ascending = sort === "taken-oldest";
  const column = sort.startsWith("taken-") ? "COALESCE(p.date_taken,'')" : "p.created_at";
  const direction = ascending ? "ASC" : "DESC";
  const clauses = ["p.status='ready'", access];
  const bindings: (string | number)[] = [user.id, user.role];
  for (const [param, condition] of [
    ["album", "EXISTS (SELECT 1 FROM album_photos ap JOIN albums a ON a.id=ap.album_id WHERE ap.photo_id=p.id AND ap.album_id=? AND (a.visibility='family' OR a.owner_id=? OR ?='admin'))"],
    ["memory", "EXISTS (SELECT 1 FROM memory_photos mp WHERE mp.photo_id=p.id AND mp.memory_id=?)"],
    ["from", "p.date_taken>=?"], ["to", "p.date_taken<=?"],
  ]) {
    const value = url.searchParams.get(param);
    if (value) { clauses.push(condition); bindings.push(value); if (param === "album") bindings.push(user.id, user.role); }
  }
  if (url.searchParams.get("undated") === "1") clauses.push("p.date_taken IS NULL");
  const recent = url.searchParams.get("recent");
  if (recent === "7" || recent === "30") clauses.push(`p.created_at >= datetime('now','-${recent} days')`);
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    let pair: unknown;
    try { pair = JSON.parse(cursor); } catch { throw new HttpError(400, "Invalid photo cursor."); }
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((v) => typeof v !== "string")) throw new HttpError(400, "Invalid photo cursor.");
    const op = ascending ? ">" : "<";
    clauses.push(`(${column}${op}? OR (${column}=? AND p.id${op}?))`);
    bindings.push(pair[0], pair[0], pair[1]);
  }
  const requested = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : 100;
  return { where: clauses.join(" AND "), bindings, order: `${column} ${direction},p.id ${direction}`, limit, taken: sort.startsWith("taken-") };
}
