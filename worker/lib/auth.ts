import type { AuthUser, Env } from "../types";
import { HttpError } from "./http";
import { randomToken, sha256 } from "./security";

const COOKIE = "fv_session";

export async function currentUser(request: Request, env: Env): Promise<AuthUser | null> {
  const token = readCookie(request.headers.get("Cookie"), COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ? AND s.expires_at > datetime('now') AND u.status = 'active'
  `).bind(tokenHash).first<{ id: string; email: string; display_name: string; role: "admin" | "member" }>();
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

export function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

export function requireAdmin(user: AuthUser | null): AuthUser {
  const authenticated = requireUser(user);
  if (authenticated.role !== "admin") throw new HttpError(403, "Administrator access required.");
  return authenticated;
}

export async function createSession(request: Request, env: Env, userId: string): Promise<string> {
  const token = randomToken();
  const days = Math.min(90, Math.max(1, Number(env.SESSION_TTL_DAYS || 30)));
  const expires = new Date(Date.now() + days * 86_400_000);
  await env.DB.prepare(`INSERT INTO sessions(id_hash,user_id,expires_at,user_agent,ip_prefix) VALUES(?,?,?,?,?)`)
    .bind(await sha256(token), userId, expires.toISOString(), request.headers.get("User-Agent")?.slice(0, 300) || null, ipPrefix(request)).run();
  return `${COOKIE}=${token}; Path=/; HttpOnly${sessionCookieSecurity(request, env)}; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const token = readCookie(request.headers.get("Cookie"), COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
}

export function expiredSessionCookie(request: Request, env: Env): string {
  return `${COOKIE}=; Path=/; HttpOnly${sessionCookieSecurity(request, env)}; SameSite=Strict; Max-Age=0`;
}

export function sessionCookieSecurity(request: Request, env: Pick<Env, "APP_ENV">): string {
  return env.APP_ENV === "production" || new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function ipPrefix(request: Request): string | null {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return null;
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":");
  return ip.split(".").slice(0, 3).join(".");
}
