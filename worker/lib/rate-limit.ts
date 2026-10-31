import type { Env } from "../types";
import { HttpError } from "./http";
import { sha256 } from "./security";

export async function rateLimit(env: Env, request: Request, scope: string, limit: number, minutes: number): Promise<void> {
  const identity = request.headers.get("CF-Connecting-IP") || "local";
  const bucket = Math.floor(Date.now() / (minutes * 60_000));
  const key = `rate:${scope}:${await sha256(identity)}:${bucket}`;
  const accepted = await env.DB.prepare(`INSERT INTO application_settings(key,value,updated_at) VALUES(?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1,updated_at=datetime('now')
    WHERE CAST(value AS INTEGER) < ? RETURNING value`).bind(key,"1",limit).first<{value:string}>();
  if (!accepted) throw new HttpError(429, "Too many attempts. Please wait and try again.");
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM application_settings WHERE key LIKE 'rate:%' AND updated_at < datetime('now','-2 days')").run();
}
