import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../db/migrations/0001_initial.sql", import.meta.url), "utf8");
const recoverySql = readFileSync(new URL("../db/migrations/0002_account_recovery.sql", import.meta.url), "utf8");

describe("initial database migration", () => {
  it.each(["users", "sessions", "invitations", "albums", "photos", "album_photos", "comments", "reactions", "application_settings", "audit_logs"])("creates %s", (table) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE ${table}\\b`));
  });

  it("does not cascade album deletion into photos", () => {
    expect(sql).toContain("photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE");
    const photosTable = sql.match(/CREATE TABLE photos \([\s\S]*?\n\);/)?.[0] || "";
    expect(photosTable).not.toContain("album_id");
  });

  it("stores only hashed, expiring, single-use account recovery tokens", () => {
    expect(recoverySql).toContain("token_hash TEXT NOT NULL UNIQUE");
    expect(recoverySql).toContain("expires_at TEXT NOT NULL");
    expect(recoverySql).toContain("used_at TEXT");
    expect(recoverySql).not.toMatch(/\btoken TEXT\b/);
  });
});
