import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = readFileSync(new URL("../worker/routes/api.ts", import.meta.url), "utf8");
const reservationSql = readFileSync(new URL("../db/migrations/0003_upload_reservations.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const familyTreeCanvas = readFileSync(new URL("../src/components/FamilyTreeExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("private album associations", () => {
  it("checks photo access before adding a photo to an album", () => {
    const handler = routes.match(/async function addPhotoToAlbum[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain("await requirePhotoAccess(env, user!, photoId)");
    expect(handler.indexOf("requirePhotoAccess")).toBeLessThan(handler.indexOf("INSERT OR IGNORE INTO album_photos"));
  });

  it("requires album ownership before removing an association", () => {
    const handler = routes.match(/async function removePhotoFromAlbum[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain("await requireAlbumOwner(env, user!, albumId)");
    expect(handler).toContain("DELETE FROM album_photos");
    expect(handler).not.toContain("DELETE FROM photos");
  });
});

describe("upload reservations", () => {
  it("tracks expected sizes and expiration in the schema", () => {
    expect(reservationSql).toContain("expected_original_bytes");
    expect(reservationSql).toContain("expected_gallery_bytes");
    expect(reservationSql).toContain("expected_thumbnail_bytes");
    expect(reservationSql).toContain("upload_expires_at");
  });

  it("enforces exact sizes and removes stale uploads", () => {
    expect(routes).toContain("length !== expected");
    expect(routes).toContain("Uploaded files did not match their reserved sizes");
    expect(routes).toContain("async function cleanupStaleUploads");
  });
});

describe("invitation revocation", () => {
  it("only revokes unused active invitations", () => {
    const handler = routes.match(/async function revokeInvitation[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain("used_at IS NULL");
    expect(handler).toContain("revoked_at IS NULL");
    expect(handler).toContain("invitation.revoked");
  });
});

describe("administrator archive", () => {
  it("keeps archive export behind the administrator route guard and streams a tar file", () => {
    expect(routes.indexOf('url.pathname.startsWith("/api/admin/")')).toBeLessThan(routes.indexOf('url.pathname === "/api/admin/archive"'));
    expect(routes).toContain('"Content-Type": "application/x-tar"');
    expect(routes).toContain("object.body.getReader()");
  });
});

describe("archive search", () => {
  it("keeps photo and album results access-scoped and returns useful album metadata", () => {
    const handler = routes.match(/async function search[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain('photoAccessSql("p")');
    expect(handler).toContain("a.visibility='family' OR a.owner_id=? OR ?='admin'");
    expect(handler).toContain("cover_photo_id");
    expect(handler).toContain("photo_count");
  });

  it("recognizes month names and searches both taken and uploaded dates", () => {
    const handler = routes.match(/async function search[\s\S]*?\n}\n\nfunction searchDateParts[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain("searchDateParts(query)");
    expect(handler).toContain("p.date_taken");
    expect(handler).toContain("p.created_at");
    expect(handler).toContain('october: "10"');
    expect(handler).toContain("${year}-${month}");
  });
});

describe("scrollable photo viewer", () => {
  it("keeps navigation outside the scrolling strip and contains portrait images", () => {
    expect(app).toContain('className="viewer-stage"');
    const strip = app.indexOf('<div ref={stripRef} className=');
    expect(app.slice(strip,strip+100)).toContain('viewer-image');
    expect(app.indexOf('className="viewer-stage"')).toBeLessThan(strip);
    expect(strip).toBeLessThan(app.indexOf('className="viewer-prev"'));
    expect(styles).toContain(".viewer-stage .viewer-image{width:100%;height:100%}");
    expect(styles).toContain(".viewer:not(.fullscreen-view) .viewer-slide img");
    expect(styles).toContain("max-height:100%");
  });

  it("loads the preserved full photograph and never crops it in the viewer", () => {
    expect(app).toContain('photoUrl(item.id, "viewer")');
    expect(routes).toContain('(small|thumbnail|gallery|viewer|original)');
    const handler = routes.match(/async function deliverPhoto[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain('variant === "viewer"');
    expect(handler).toContain("photo.original_key || photo.gallery_key");
    expect(styles).toContain(".viewer-slide{position:relative");
    expect(styles).toContain(".viewer-slide img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain}");
  });
});

describe("automatic memory curation", () => {
  it("prioritizes private-access-scoped anniversaries, monthly memories, and recent fallbacks", () => {
    const handler = routes.match(/async function dashboard[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain("on_this_day");
    expect(handler).toContain("this_month");
    expect(handler).toContain("recent");
    expect(handler).toContain('photoAccessSql("p")');
    expect(handler).toContain("strftime('%m-%d','now')");
  });
});

describe("home memory slideshow", () => {
  it("supports direct scrolling, advances every three seconds, and has no arrow controls", () => {
    expect(app).toContain('className="hero-memory-strip"');
    expect(app).toContain("}), 3000)");
    expect(app).toContain("strip.scrollLeft / strip.clientWidth");
    expect(app).not.toContain('aria-label="Previous featured memory"');
    expect(app).not.toContain('aria-label="Next featured memory"');
    expect(styles).toContain("scroll-snap-type:x mandatory");
    expect(styles).toContain("touch-action:pan-x");
  });
});

describe("completed gallery and archive interactions", () => {
  it("supports multi-photo selection with authenticated album and deletion operations", () => {
    expect(app).toContain("Select photos");
    expect(app).toContain("selectedIds");
    expect(app).toContain("addSelectedToAlbum");
    expect(app).toContain("deleteSelected");
    expect(app).toContain("confirmBulkDelete");
    expect(styles).toContain(".bulk-toolbar");
    expect(styles).toContain(".selection-check");
  });

  it("keeps the viewer toolbar compact and focused on fullscreen and close", () => {
    expect(app).not.toContain('aria-label="Zoom in"');
    expect(app).not.toContain('aria-label="Zoom out"');
    expect(app).toContain('aria-label={fullscreenView ? "Exit fullscreen" : "View fullscreen"}');
    expect(app).toContain('aria-label="Close viewer"');
    expect(styles).toContain(".viewer-toolbar button svg{width:18px;height:18px}");
  });

  it("filters the access-scoped timeline by year, month, album, and event", () => {
    const handler = routes.match(/async function timeline[\s\S]*?\n}/)?.[0] || "";
    expect(handler).toContain('url.searchParams.get("year")');
    expect(handler).toContain('url.searchParams.get("month")');
    expect(handler).toContain('url.searchParams.get("album")');
    expect(handler).toContain('url.searchParams.get("event")');
    expect(handler).toContain('photoAccessSql("p")');
    expect(app).toContain('className="timeline-filters"');
  });

  it("includes an administrator media review surface", () => {
    expect(app).toContain('["media", LibraryBig, "Media"]');
    expect(app).toContain("function AdminMedia()");
    expect(app).toContain("Manage albums");
  });
});

describe("memory-linked family tree", () => {
  it("stores relatives, relationships, and private photo tags in dedicated tables", () => {
    const migration = readFileSync(new URL("../db/migrations/0004_family_tree.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE TABLE family_people");
    expect(migration).toContain("CREATE TABLE family_relationships");
    expect(migration).toContain("CREATE TABLE photo_people");
    expect(migration).toContain("REFERENCES photos(id) ON DELETE CASCADE");
  });

  it("exposes relationship and person-memory APIs behind authenticated routing", () => {
    expect(routes).toContain('url.pathname === "/api/family-tree"');
    expect(routes).toContain("createFamilyPerson(ctx)");
    expect(routes).toContain("createFamilyRelationship(ctx)");
    expect(routes).toContain("tagPhotoPerson(ctx, photoPeople[1])");
    expect(routes).toContain('photoAccessSql("p")');
  });

  it("adds a responsive family tree and people tagging to the viewer", () => {
    expect(app).toContain('["/family-tree", Network, "Family tree"]');
    expect(app).toContain("function FamilyTree()");
    expect(app).toContain("<FamilyTreeCanvas");
    expect(app).toContain("People in this memory");
    expect(app).toContain("Their memories");
    expect(styles).toContain(".ancestry-experience");
    expect(styles).toContain(".real-tree-bough");
    expect(styles).toContain(".photo-people-tags");
  });
});

describe("viewer edit dialog", () => {
  it("keeps its close control visible and closes the nested dialog before the viewer", () => {
    expect(app).toContain('className="icon-button dialog-close"');
    expect(app).toContain("else if (editing) setEditing(false)");
    expect(styles).toContain(".modal{color:var(--ink)}");
    expect(styles).toContain(".modal>header>.dialog-close");
  });
});
