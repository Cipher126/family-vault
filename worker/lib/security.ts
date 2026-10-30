import type { Env } from "../types";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 310_000;

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  );
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterations, saltText, expectedText] = encoded.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !saltText || !expectedText) return false;
  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(expectedText);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations: Number(iterations) },
    key,
    expected.length * 8
  ));
  return timingSafeEqual(actual, expected);
}

export function validatePassword(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}

export function securityHeaders(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (env.APP_ENV === "production") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function base64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}
