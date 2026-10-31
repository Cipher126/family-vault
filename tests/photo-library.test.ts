import { describe, expect, it, vi } from "vitest";
import { captureDate, readCaptureDate } from "../src/lib/photoMetadata";
import { photoQuery } from "../worker/lib/photo-query";
import { api } from "../worker/routes/api";
import type { RequestContext } from "../worker/types";

describe("capture dates", () => {
  it("prefers the original camera date and preserves its calendar day", () => {
    expect(captureDate({ DateTimeOriginal:"2025:12:25 23:59:00", CreateDate:"2026:01:01 00:00:00" })).toBe("2025-12-25");
    expect(captureDate({ DateTimeOriginal:new Date(2025,11,25,23,59) })).toBe("2025-12-25");
  });
  it("does not invent capture dates for missing or corrupt metadata", async () => {
    expect(captureDate(undefined)).toBeNull();
    expect(captureDate({ DateTimeOriginal:"2025:02:30 00:00:00" })).toBeNull();
    expect(await readCaptureDate(new Blob(["not a photo"]))).toBeNull();
  });
  it("reads an actual JPEG EXIF DateTimeOriginal tag", async () => {
    // Minimal JPEG APP1 segment with little-endian TIFF and an EXIF sub-IFD.
    const tiff = new Uint8Array(64); const view = new DataView(tiff.buffer);
    tiff.set([0x49,0x49,42,0,8,0,0,0]);
    view.setUint16(8,1,true); view.setUint16(10,0x8769,true); view.setUint16(12,4,true); view.setUint32(14,1,true); view.setUint32(18,26,true);
    view.setUint16(26,1,true); view.setUint16(28,0x9003,true); view.setUint16(30,2,true); view.setUint32(32,20,true); view.setUint32(36,44,true);
    tiff.set(new TextEncoder().encode("2025:12:25 23:59:00\0"),44);
    const payload = new Uint8Array(70); payload.set([69,120,105,102,0,0]); payload.set(tiff,6);
    const jpeg = new Uint8Array(78); jpeg.set([255,216,255,225,0,72]); jpeg.set(payload,6); jpeg.set([255,217],76);
    expect(await readCaptureDate(new Blob([jpeg],{ type:"image/jpeg" }))).toBe("2025-12-25");
  });
});

describe("library filtering and pagination", () => {
  const user = { id:"member",role:"member" };
  it("uses a stable composite cursor when multiple photos share a capture date", () => {
    const url = new URL("https://vault/api/photos?sort=taken-oldest&memory=christmas&from=2025-01-01&to=2025-12-31");
    url.searchParams.set("cursor",JSON.stringify(["2025-12-25","photo-2"]));
    const query = photoQuery(url,user,"(p.owner_id=? OR ?='admin')");
    expect(query.order).toBe("COALESCE(p.date_taken,'') ASC,p.id ASC");
    expect(query.where).toContain("p.id>?");
    expect(query.bindings).toEqual(["member","member","christmas","2025-01-01","2025-12-31","2025-12-25","2025-12-25","photo-2"]);
  });
  it("retains album privacy checks and bounds page sizes", () => {
    const query = photoQuery(new URL("https://vault/api/photos?album=private&recent=7&undated=1&limit=100000"),user,"(p.owner_id=? OR ?='admin')");
    expect(query.where).toContain("a.owner_id=?");
    expect(query.where).toContain("p.date_taken IS NULL");
    expect(query.where).toContain("-7 days");
    expect(query.limit).toBe(100);
    expect(() => photoQuery(new URL("https://vault/api/photos?cursor=bad"),user,"access")).toThrow("Invalid photo cursor");
  });
});

function context(path: string, body: unknown, denied = false) {
  const batch = vi.fn().mockResolvedValue([]);
  const run = vi.fn().mockResolvedValue({});
  const prepare = vi.fn((sql: string) => ({ bind: (...values: unknown[]) => ({
    all: async () => ({ results: values.slice(0,-2).filter((id) => !denied || id !== "other").map((id) => ({ id })) }),
    first: async () => denied && values[0] === "other" ? null : sql.includes("owner_id") ? { owner_id:"member" } : { id:values[0] },
    run, sql, values,
  }) }));
  const request = new Request(`https://vault${path}`, { method:path.endsWith("bulk") ? "PATCH" : "POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) });
  return { batch,prepare, ctx:{ request,url:new URL(request.url),user:{ id:"member",role:"member" },env:{ DB:{ prepare,batch } } } as unknown as RequestContext };
}
describe("shared memories and bulk permissions", () => {
  it("creates a group without overwriting individual photo dates", async () => {
    const { ctx,batch } = context("/api/memories",{ photoIds:["one","two"],title:"Christmas",eventDate:"2025-12-25" });
    expect((await api(ctx)).status).toBe(201);
    expect(batch).toHaveBeenCalledOnce();
    const statements = batch.mock.calls[0][0] as { sql:string }[];
    expect(statements).toHaveLength(3);
    expect(statements.some((s) => s.sql.includes("UPDATE photos"))).toBe(false);
  });
  it("rejects the whole bulk edit before writes if any photo belongs to someone else", async () => {
    const { ctx,batch } = context("/api/photos/bulk",{ photoIds:["one","other"],caption:"Together" },true);
    await expect(api(ctx)).rejects.toThrow("Photo not found");
    expect(batch).not.toHaveBeenCalled();
  });
  it("does not create a shared memory from inaccessible photographs", async () => {
    const { ctx,batch } = context("/api/memories",{ photoIds:["one","other"],title:"Private occasion" },true);
    await expect(api(ctx)).rejects.toThrow("Photo not found");
    expect(batch).not.toHaveBeenCalled();
  });
  it("only changes explicitly selected fields", async () => {
    const { ctx,batch } = context("/api/photos/bulk",{ photoIds:["one"],caption:"Together" });
    expect((await api(ctx)).status).toBe(200);
    const statements = batch.mock.calls[0][0] as { sql:string }[];
    expect(statements[0].sql).toContain("caption=?");
    expect(statements[0].sql).not.toContain("date_taken=");
  });
});
