import type { Env } from "../types";
import { HttpError } from "./http";
import { sha256 } from "./security";

export async function rateLimit(env: Env, request: Request, scope: string, limit: number, minutes: number): Promise<void> {
  const identity = request.headers.get("CF-Connecting-IP") || "local";
  const bucket = Math.floor(Date.now() / (minutes * 60_000));
  const key = `rate:${scope}:${await sha256(identity)}:${bucket}`;
  const row = await env.DB.prepare("SELECT value FROM application_settings WHERE key = ?").bind(key).first<{ value: string }>();
  const count = Number(row?.value || 0);
  if (count >= limit) throw new HttpError(429, "Too many attempts. Please wait and try again.");
  await env.DB.prepare(`INSERT INTO application_settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER)+1, updated_at=datetime('now')`)
    .bind(key, "1").run();
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM application_settings WHERE key LIKE 'rate:%' AND updated_at < datetime('now','-2 days')").run();
}
