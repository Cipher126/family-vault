import { describe, expect, it } from "vitest";
import { sessionCookieSecurity } from "../worker/lib/auth";
import { hashPassword, securityHeaders, sha256, validatePassword, verifyPassword } from "../worker/lib/security";

describe("authentication primitives", () => {
  it("hashes passwords with a random salt and verifies without storing plaintext", async () => {
    const first = await hashPassword("Long family password 42");
    const second = await hashPassword("Long family password 42");
    expect(first).not.toBe(second);
    expect(first).not.toContain("Long family password 42");
    expect(await verifyPassword("Long family password 42", first)).toBe(true);
    expect(await verifyPassword("wrong password 42", first)).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(validatePassword("short1")).toMatch(/12/);
    expect(validatePassword("longbutwithoutnumber")).toMatch(/number/);
    expect(validatePassword("correct horse 123")).toBeNull();
  });

  it("produces stable opaque token hashes", async () => {
    expect(await sha256("session-token")).toBe(await sha256("session-token"));
    expect(await sha256("session-token")).not.toBe("session-token");
  });

  it("allows development sessions over a local-network HTTP address", () => {
    expect(sessionCookieSecurity(new Request("http://192.168.1.117:5174/api/auth/login"), { APP_ENV: "development" } as never)).toBe("");
    expect(sessionCookieSecurity(new Request("https://family.example/api/auth/login"), { APP_ENV: "development" } as never)).toBe("; Secure");
    expect(sessionCookieSecurity(new Request("http://family.example/api/auth/login"), { APP_ENV: "production" } as never)).toBe("; Secure");
  });
});

describe("response hardening", () => {
  it("sets anti-clickjacking and no-sniff headers", () => {
    const response = securityHeaders(new Response("ok"), { APP_ENV: "production" } as never);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age");
  });
});
