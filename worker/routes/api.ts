import {collectionOffset,collectionPage} from "../lib/pagination";
import type { Env, RequestContext } from "../types";
import { createSession, deleteSession, expiredSessionCookie, requireAdmin, requireUser } from "../lib/auth";
import { emailAddress, HttpError, json, readJson, requireSameOrigin } from "../lib/http";
import { rateLimit } from "../lib/rate-limit";
import {sessionTokenHash} from "../lib/auth";
import {photoAccessPredicate} from "../lib/photo-access";
import { photoQuery } from "../lib/photo-query";
import { matchesMediaTag, mediaCacheHeaders } from "../lib/media-cache";
import { cleanText, hashPassword, randomToken, sha256, uuid, validatePassword, verifyPassword } from "../lib/security";

type Body = Record<string, unknown>;
export function normalizeFamilyGender(value: unknown): "female" | "male" | "unspecified" {
  if (value === undefined || value === null || value === "") return "unspecified";
  if (value === "female" || value === "male" || value === "unspecified") return value;
  throw new HttpError(400, "Choose female, male, or not specified for gender.");
}
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function api(ctx: RequestContext): Promise<Response> {
  const { request, url } = ctx;
  const method = request.method;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) requireSameOrigin(request);

  if (method === "GET" && url.pathname === "/api/health") return json({ ok: true });
  if (method === "POST" && url.pathname === "/api/setup") return setup(ctx);
  if (method === "POST" && url.pathname === "/api/auth/login") return login(ctx);
  if (method === "POST" && url.pathname === "/api/auth/register") return register(ctx);
  if (method === "POST" && url.pathname === "/api/auth/recover") return recoverAccount(ctx);
  if (method === "POST" && url.pathname === "/api/auth/logout") return logout(ctx);
  if (method === "GET" && url.pathname === "/api/auth/me") return json({ user: ctx.user });
  if (method === "GET" && url.pathname === "/api/config") return json({ siteName: await setting(ctx.env, "site_name") || "Family Vault" });

  const user = requireUser(ctx.user);
  if (url.pathname === "/api/memories" && method === "GET") return listMemories(ctx);
  if (url.pathname === "/api/memories" && method === "POST") return createMemory(ctx);
  if (url.pathname === "/api/photos/bulk" && method === "PATCH") return bulkEditPhotos(ctx);
  if (method === "GET" && url.pathname === "/api/dashboard") return dashboard(ctx);
  if (method === "GET" && url.pathname === "/api/albums") return listAlbums(ctx);
  if (method === "POST" && url.pathname === "/api/albums") return createAlbum(ctx);
  if (method === "GET" && url.pathname === "/api/photos") return listPhotos(ctx);
  if (method === "POST" && url.pathname === "/api/photos/init") return initPhoto(ctx);
  if (method === "GET" && url.pathname === "/api/timeline") return timeline(ctx);
  if (method === "GET" && url.pathname === "/api/search") return search(ctx);
  if (method === "GET" && url.pathname === "/api/family-tree") return listFamilyTree(ctx);
  if (method === "POST" && url.pathname === "/api/family-tree/people") return createFamilyPerson(ctx);
  if (method === "POST" && url.pathname === "/api/family-tree/relationships") return createFamilyRelationship(ctx);

  const personPhotos = url.pathname.match(/^\/api\/family-tree\/people\/([^/]+)\/photos$/);
  if (method === "GET" && personPhotos) return listPersonPhotos(ctx, personPhotos[1]);
  const familyPerson = url.pathname.match(/^\/api\/family-tree\/people\/([^/]+)$/);
  if (method === "PATCH" && familyPerson) return updateFamilyPerson(ctx, familyPerson[1]);
  if (method === "DELETE" && familyPerson) return deleteFamilyPerson(ctx, familyPerson[1]);
  const familyRelationship = url.pathname.match(/^\/api\/family-tree\/relationships\/([^/]+)$/);
  if (method === "DELETE" && familyRelationship) return deleteFamilyRelationship(ctx, familyRelationship[1]);

  const media = url.pathname.match(/^\/api\/photos\/([^/]+)\/(small|thumbnail|gallery|viewer|original)$/);
  if (method === "GET" && media) return servePhoto(ctx, media[1], media[2]);
  const upload = url.pathname.match(/^\/api\/photos\/([^/]+)\/upload\/(small|thumbnail|gallery|original)$/);
  if (method === "PUT" && upload) return uploadVariant(ctx, upload[1], upload[2]);
  const complete = url.pathname.match(/^\/api\/photos\/([^/]+)\/complete$/);
  if (method === "POST" && complete) return completePhoto(ctx, complete[1]);
  const photoPerson = url.pathname.match(/^\/api\/photos\/([^/]+)\/people\/([^/]+)$/);
  if (method === "DELETE" && photoPerson) return untagPhotoPerson(ctx, photoPerson[1], photoPerson[2]);
  const photoPeople = url.pathname.match(/^\/api\/photos\/([^/]+)\/people$/);
  if (method === "GET" && photoPeople) return listPhotoPeople(ctx, photoPeople[1]);
  if (method === "POST" && photoPeople) return tagPhotoPerson(ctx, photoPeople[1]);
  const photo = url.pathname.match(/^\/api\/photos\/([^/]+)$/);
  if (method === "PATCH" && photo) return updatePhoto(ctx, photo[1]);
  if (method === "DELETE" && photo) return deletePhoto(ctx, photo[1]);
  const comments = url.pathname.match(/^\/api\/photos\/([^/]+)\/comments$/);
  if (method === "GET" && comments) return listComments(ctx, comments[1]);
  if (method === "POST" && comments) return addComment(ctx, comments[1]);
  const comment = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (method === "DELETE" && comment) return deleteComment(ctx, comment[1]);
  const reactions = url.pathname.match(/^\/api\/photos\/([^/]+)\/reactions$/);
  if (method === "POST" && reactions) return toggleReaction(ctx, reactions[1]);
  const albumPhotoItem = url.pathname.match(/^\/api\/albums\/([^/]+)\/photos\/([^/]+)$/);
  if (method === "DELETE" && albumPhotoItem) return removePhotoFromAlbum(ctx, albumPhotoItem[1], albumPhotoItem[2]);
  const albumPhoto = url.pathname.match(/^\/api\/albums\/([^/]+)\/photos$/);
  if (method === "POST" && albumPhoto) return addPhotoToAlbum(ctx, albumPhoto[1]);
  const album = url.pathname.match(/^\/api\/albums\/([^/]+)$/);
  if (method === "PATCH" && album) return updateAlbum(ctx, album[1]);
  if (method === "DELETE" && album) return deleteAlbum(ctx, album[1]);

  if (url.pathname.startsWith("/api/admin/")) requireAdmin(user);
  if (method === "GET" && url.pathname === "/api/admin/members") return adminMembers(ctx);
  if (method === "POST" && url.pathname === "/api/admin/invitations") return createInvitation(ctx);
  if (method === "DELETE" && url.pathname.match(/^\/api\/admin\/invitations\/[^/]+$/)) return revokeInvitation(ctx, url.pathname.split("/").pop()!);
  if (method === "POST" && url.pathname.match(/^\/api\/admin\/members\/[^/]+\/recovery$/)) return createRecovery(ctx, url.pathname.split("/")[4]);
  if (method === "PATCH" && url.pathname.match(/^\/api\/admin\/members\/[^/]+$/)) return updateMember(ctx, url.pathname.split("/").pop()!);
  if (method === "GET" && url.pathname === "/api/admin/storage") return storage(ctx);
  if (method === "POST" && url.pathname === "/api/admin/dev/seed") return seedDevelopmentPhotos(ctx);
  if (method === "GET" && url.pathname === "/api/admin/settings") return settings(ctx);
  if (method === "PATCH" && url.pathname === "/api/admin/settings") return updateSettings(ctx);
  if (method === "GET" && url.pathname === "/api/admin/export") return exportMetadata(ctx);
  if (method === "GET" && url.pathname === "/api/admin/archive") return exportArchive(ctx);

  throw new HttpError(404, "Not found.");
}

async function setup({ request, env }: RequestContext): Promise<Response> {
  await rateLimit(env, request, "setup", 5, 60);
  const exists = await env.DB.prepare("SELECT 1 AS found FROM users LIMIT 1").first();
  if (exists) throw new HttpError(409, "Family Vault has already been initialized.");
  const body = await readJson<Body>(request);
  if (!env.BOOTSTRAP_ADMIN_TOKEN || body.token !== env.BOOTSTRAP_ADMIN_TOKEN) throw new HttpError(403, "Invalid setup token.");
  const email = emailAddress(body.email);
  const displayName = cleanText(body.displayName, 80);
  const password = typeof body.password === "string" ? body.password : "";
  const passwordError = validatePassword(password);
  if (!displayName) throw new HttpError(400, "Name is required.");
  if (passwordError) throw new HttpError(400, passwordError);
  const id = uuid();
  await env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,role) VALUES(?,?,?,?, 'admin')")
    .bind(id, email, displayName, await hashPassword(password)).run();
  await audit(env, id, "vault.initialized", "user", id);
  return json({ user: { id, email, displayName, role: "admin" } }, { status: 201, headers: { "Set-Cookie": await createSession(request, env, id) } });
}

async function login({ request, env }: RequestContext): Promise<Response> {
  await rateLimit(env, request, "login", 10, 15);
  const body = await readJson<Body>(request);
  const email = emailAddress(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const row = await env.DB.prepare("SELECT id,email,display_name,password_hash,role,status FROM users WHERE email = ?")
    .bind(email).first<{ id: string; email: string; display_name: string; password_hash: string; role: "admin" | "member"; status: string }>();
  if (!row || row.status !== "active" || !(await verifyPassword(password, row.password_hash))) throw new HttpError(401, "Email or password is incorrect.");
  return json({ user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role } }, { headers: { "Set-Cookie": await createSession(request, env, row.id) } });
}

async function register({ request, env }: RequestContext): Promise<Response> {
  await rateLimit(env, request, "register", 8, 30);
  const body = await readJson<Body>(request);
  const token = typeof body.token === "string" ? body.token : "";
  const invitation = await env.DB.prepare("SELECT id,email,role FROM invitations WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')")
    .bind(await sha256(token)).first<{ id: string; email: string | null; role: "admin" | "member" }>();
  if (!invitation) throw new HttpError(400, "Invitation is invalid or expired.");
  const email = emailAddress(body.email);
  if (invitation.email && invitation.email.toLowerCase() !== email) throw new HttpError(403, "This invitation was issued to another email address.");
  const displayName = cleanText(body.displayName, 80);
  const password = typeof body.password === "string" ? body.password : "";
  const passwordError = validatePassword(password);
  if (!displayName) throw new HttpError(400, "Name is required.");
  if (passwordError) throw new HttpError(400, passwordError);
  const id = uuid();
  try {
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,email,display_name,password_hash,role)
        SELECT ?,?,?,?,role FROM invitations WHERE id=? AND used_at IS NULL AND revoked_at IS NULL
        AND expires_at > datetime('now') AND (email IS NULL OR lower(email)=?)`)
        .bind(id,email,displayName,await hashPassword(password),invitation.id,email),
      env.DB.prepare("UPDATE invitations SET used_at=datetime('now') WHERE id=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=?)").bind(invitation.id,id)
    ]);
    if (result[0].meta.changes !== 1) throw new HttpError(409, "Invitation is no longer available.");
  } catch { throw new HttpError(409, "That account already exists or the invitation was used."); }
  await audit(env, id, "member.registered", "user", id);
  return json({ user: { id, email, displayName, role: invitation.role } }, { status: 201, headers: { "Set-Cookie": await createSession(request, env, id) } });
}

async function logout({ request, env }: RequestContext): Promise<Response> {
  await deleteSession(request, env);
  return json({ ok: true }, { headers: { "Set-Cookie": expiredSessionCookie(request, env) } });
}

async function recoverAccount({ request, env }: RequestContext): Promise<Response> {
  await rateLimit(env, request, "recover", 6, 30);
  const body = await readJson<Body>(request);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordError = validatePassword(password);
  if (passwordError) throw new HttpError(400, passwordError);
  const recovery = await env.DB.prepare("SELECT id,user_id FROM recovery_tokens WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')")
    .bind(await sha256(token)).first<{ id: string; user_id: string }>();
  if (!recovery) throw new HttpError(400, "Recovery link is invalid or expired.");
  const validRecovery = "EXISTS(SELECT 1 FROM recovery_tokens WHERE id=? AND user_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now'))";
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_hash=?,updated_at=datetime('now') WHERE id=? AND ${validRecovery}`)
      .bind(await hashPassword(password),recovery.user_id,recovery.id,recovery.user_id),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND ${validRecovery}`).bind(recovery.user_id,recovery.id,recovery.user_id),
    env.DB.prepare("UPDATE recovery_tokens SET used_at=datetime('now') WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')").bind(recovery.id)
  ]);
  if (result[0].meta.changes !== 1) throw new HttpError(400, "Recovery link is invalid or expired.");
  await audit(env, recovery.user_id, "member.password_recovered", "user", recovery.user_id);
  return json({ ok: true });
}

async function dashboard({ env, user }: RequestContext): Promise<Response> {
  requireUser(user);
  const [photos, memories, albums, activity] = await Promise.all([
    env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader FROM photos p JOIN users u ON u.id=p.owner_id WHERE p.status='ready' AND ${photoAccessSql("p")} ORDER BY p.created_at DESC LIMIT 8`).bind(user!.id, user!.role).all(),
    env.DB.batch<Record<string,unknown>>([
      {reason:"on_this_day",where:"substr(p.date_taken,6,5)=strftime('%m-%d','now')",order:"p.date_taken DESC"},
      {reason:"this_month",where:"substr(p.date_taken,6,2)=strftime('%m','now')",order:"p.date_taken DESC"},
      {reason:"recent",where:"1",order:"COALESCE(p.date_taken,p.created_at) DESC,p.created_at DESC"},
    ].map(group=>env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader,'${group.reason}' memory_reason
      FROM photos p JOIN users u ON u.id=p.owner_id WHERE p.status='ready' AND ${group.where} AND ${photoAccessSql("p")} ORDER BY ${group.order} LIMIT 10`).bind(user!.id,user!.role)))
      .then(pages=>({results:pages.flatMap(page=>page.results).filter((row,index,all)=>all.findIndex(other=>other.id===row.id)===index).slice(0,10)})),
    env.DB.prepare(`SELECT a.id,a.name,a.description,a.cover_photo_id,${albumThumbnailSql()},COUNT(ap.photo_id) photo_count,a.created_at FROM albums a LEFT JOIN album_photos ap ON ap.album_id=a.id WHERE a.visibility='family' OR a.owner_id=? GROUP BY a.id ORDER BY a.created_at DESC LIMIT 5`).bind(user!.id).all(),
    env.DB.prepare("SELECT action,target_type,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 8").all()
  ]);
  return json({ photos: photos.results, memories: memories.results, albums: albums.results, activity: activity.results });
}

function albumThumbnailSql(): string {
  return `COALESCE((SELECT cp.id FROM album_photos cap JOIN photos cp ON cp.id=cap.photo_id WHERE cap.album_id=a.id AND cp.id=a.cover_photo_id AND cp.status='ready' LIMIT 1),(SELECT cp.id FROM album_photos cap JOIN photos cp ON cp.id=cap.photo_id WHERE cap.album_id=a.id AND cp.status='ready' ORDER BY cp.created_at DESC,cp.id DESC LIMIT 1)) thumbnail_photo_id`;
}

async function listAlbums({ env, user }: RequestContext): Promise<Response> {
  const rows = await env.DB.prepare(`SELECT a.id,a.name,a.description,a.visibility,a.owner_id,a.cover_photo_id,${albumThumbnailSql()},a.created_at,u.display_name creator,COUNT(ap.photo_id) photo_count
    FROM albums a JOIN users u ON u.id=a.owner_id LEFT JOIN album_photos ap ON ap.album_id=a.id
    WHERE a.visibility='family' OR a.owner_id=? OR ?='admin' GROUP BY a.id ORDER BY a.updated_at DESC`).bind(user!.id, user!.role).all();
  return json({ albums: rows.results });
}

async function listFamilyTree({ env }: RequestContext): Promise<Response> {
  const [people, relationships] = await Promise.all([
    env.DB.prepare(`SELECT fp.id,fp.first_name,fp.last_name,fp.nickname,fp.gender,fp.birth_date,fp.death_date,fp.biography,fp.profile_photo_id,fp.created_by,fp.created_at,
      COUNT(pp.photo_id) photo_count
      FROM family_people fp LEFT JOIN photo_people pp ON pp.person_id=fp.id
      GROUP BY fp.id ORDER BY COALESCE(fp.birth_date,'9999-12-31'),fp.last_name,fp.first_name`).all(),
    env.DB.prepare("SELECT id,person_a_id,person_b_id,relationship,created_by FROM family_relationships ORDER BY created_at").all()
  ]);
  return json({ people: people.results, relationships: relationships.results });
}

async function createFamilyPerson({ request, env, user }: RequestContext): Promise<Response> {
  const body = await readJson<Body>(request);
  const firstName = cleanText(body.firstName, 80);
  const lastName = cleanText(body.lastName, 80);
  if (!firstName) throw new HttpError(400, "First name is required.");
  const id = uuid();
  const relativeTo = cleanText(body.relativeTo, 64);
  const relation = cleanText(body.relation, 20);
  const statements = [env.DB.prepare(`INSERT INTO family_people(id,first_name,last_name,nickname,birth_date,death_date,biography,created_by,gender)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(id, firstName, lastName, cleanText(body.nickname, 80), nullableDate(body.birthDate), nullableDate(body.deathDate), cleanText(body.biography, 2000), user!.id, normalizeFamilyGender(body.gender))];
  if (relativeTo) {
    const existing = await env.DB.prepare("SELECT id FROM family_people WHERE id=?").bind(relativeTo).first();
    if (!existing) throw new HttpError(404, "Relative not found.");
    const normalized = normalizeFamilyRelationship(id, relativeTo, relation);
    statements.push(env.DB.prepare("INSERT INTO family_relationships(id,person_a_id,person_b_id,relationship,created_by) VALUES(?,?,?,?,?)")
      .bind(uuid(), normalized.personA, normalized.personB, normalized.relationship, user!.id));
  }
  await env.DB.batch(statements);
  await audit(env, user!.id, "family.person_created", "family_person", id);
  return json({ id }, { status: 201 });
}

async function updateFamilyPerson({ request, env, user }: RequestContext, id: string): Promise<Response> {
  const current = await env.DB.prepare("SELECT * FROM family_people WHERE id=?").bind(id).first<Record<string, string | null>>();
  if (!current) throw new HttpError(404, "Relative not found.");
  const body = await readJson<Body>(request);
  const firstName = body.firstName === undefined ? current.first_name! : cleanText(body.firstName, 80);
  if (!firstName) throw new HttpError(400, "First name is required.");
  const profilePhotoId = body.profilePhotoId === undefined ? current.profile_photo_id : cleanText(body.profilePhotoId, 64) || null;
  if (profilePhotoId) {
    const tagged = await env.DB.prepare("SELECT 1 FROM photo_people WHERE person_id=? AND photo_id=?").bind(id, profilePhotoId).first();
    if (!tagged) throw new HttpError(400, "Choose a photograph already tagged with this relative.");
  }
  await env.DB.prepare(`UPDATE family_people SET first_name=?,last_name=?,nickname=?,birth_date=?,death_date=?,biography=?,profile_photo_id=?,gender=?,updated_at=datetime('now') WHERE id=?`)
    .bind(firstName, body.lastName === undefined ? current.last_name : cleanText(body.lastName, 80), body.nickname === undefined ? current.nickname : cleanText(body.nickname, 80), body.birthDate === undefined ? current.birth_date : nullableDate(body.birthDate), body.deathDate === undefined ? current.death_date : nullableDate(body.deathDate), body.biography === undefined ? current.biography : cleanText(body.biography, 2000), profilePhotoId, normalizeFamilyGender(body.gender === undefined ? current.gender : body.gender), id).run();
  await audit(env, user!.id, "family.person_updated", "family_person", id);
  return json({ ok: true });
}

async function deleteFamilyPerson({ env, user }: RequestContext, id: string): Promise<Response> {
  const person = await env.DB.prepare("SELECT created_by FROM family_people WHERE id=?").bind(id).first<{ created_by: string }>();
  if (!person || (person.created_by !== user!.id && user!.role !== "admin")) throw new HttpError(404, "Relative not found.");
  await env.DB.prepare("DELETE FROM family_people WHERE id=?").bind(id).run();
  await audit(env, user!.id, "family.person_deleted", "family_person", id);
  return json({ ok: true });
}

async function createFamilyRelationship({ request, env, user }: RequestContext): Promise<Response> {
  const body = await readJson<Body>(request);
  const personA = cleanText(body.personA, 64);
  const personB = cleanText(body.personB, 64);
  const normalized = normalizeFamilyRelationship(personA, personB, cleanText(body.relationship, 20));
  const found = await env.DB.prepare("SELECT COUNT(*) count FROM family_people WHERE id IN (?,?)").bind(normalized.personA, normalized.personB).first<{ count: number }>();
  if (Number(found?.count || 0) !== 2) throw new HttpError(404, "One of those relatives was not found.");
  const id = uuid();
  try {
    await env.DB.prepare("INSERT INTO family_relationships(id,person_a_id,person_b_id,relationship,created_by) VALUES(?,?,?,?,?)")
      .bind(id, normalized.personA, normalized.personB, normalized.relationship, user!.id).run();
  } catch { throw new HttpError(409, "That relationship already exists."); }
  await audit(env, user!.id, "family.relationship_created", "family_relationship", id);
  return json({ id }, { status: 201 });
}

async function deleteFamilyRelationship({ env, user }: RequestContext, id: string): Promise<Response> {
  const relationship = await env.DB.prepare("SELECT created_by FROM family_relationships WHERE id=?").bind(id).first<{ created_by: string }>();
  if (!relationship || (relationship.created_by !== user!.id && user!.role !== "admin")) throw new HttpError(404, "Relationship not found.");
  await env.DB.prepare("DELETE FROM family_relationships WHERE id=?").bind(id).run();
  await audit(env, user!.id, "family.relationship_deleted", "family_relationship", id);
  return json({ ok: true });
}

async function listPersonPhotos({ env, url, user }: RequestContext, personId: string): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM family_people WHERE id=?").bind(personId).first();
  if (!exists) throw new HttpError(404, "Relative not found.");
  const offset=collectionOffset(url);
  const photos = await env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader
    FROM photo_people pp JOIN photos p ON p.id=pp.photo_id JOIN users u ON u.id=p.owner_id
    WHERE pp.person_id=? AND p.status='ready' AND ${photoAccessSql("p")}
    ORDER BY COALESCE(p.date_taken,p.created_at) DESC,p.id DESC LIMIT 101 OFFSET ?`).bind(personId, user!.id, user!.role,offset).all();
  return json(collectionPage(photos.results,offset));
}

async function listPhotoPeople({ env, user }: RequestContext, photoId: string): Promise<Response> {
  await requirePhotoAccess(env, user!, photoId);
  const people = await env.DB.prepare(`SELECT fp.id,fp.first_name,fp.last_name,fp.nickname,fp.profile_photo_id
    FROM photo_people pp JOIN family_people fp ON fp.id=pp.person_id WHERE pp.photo_id=? ORDER BY fp.first_name,fp.last_name`).bind(photoId).all();
  return json({ people: people.results });
}

async function tagPhotoPerson({ request, env, user }: RequestContext, photoId: string): Promise<Response> {
  await requirePhotoAccess(env, user!, photoId);
  const body = await readJson<Body>(request);
  const personId = cleanText(body.personId, 64);
  const person = await env.DB.prepare("SELECT id FROM family_people WHERE id=?").bind(personId).first();
  if (!person) throw new HttpError(404, "Relative not found.");
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO photo_people(photo_id,person_id,tagged_by) VALUES(?,?,?)").bind(photoId, personId, user!.id),
    env.DB.prepare("UPDATE family_people SET profile_photo_id=COALESCE(profile_photo_id,?),updated_at=datetime('now') WHERE id=?").bind(photoId, personId)
  ]);
  await audit(env, user!.id, "family.photo_tagged", "photo", photoId, personId);
  return json({ ok: true });
}

async function untagPhotoPerson({ env, user }: RequestContext, photoId: string, personId: string): Promise<Response> {
  await requirePhotoAccess(env, user!, photoId);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM photo_people WHERE photo_id=? AND person_id=?").bind(photoId, personId),
    env.DB.prepare("UPDATE family_people SET profile_photo_id=NULL,updated_at=datetime('now') WHERE id=? AND profile_photo_id=?").bind(personId, photoId)
  ]);
  await audit(env, user!.id, "family.photo_untagged", "photo", photoId, personId);
  return json({ ok: true });
}

function normalizeFamilyRelationship(personA: string, personB: string, relationship: string): { personA: string; personB: string; relationship: "parent" | "partner" } {
  if (!personA || !personB || personA === personB) throw new HttpError(400, "Choose two different relatives.");
  if (relationship === "parent") return { personA, personB, relationship };
  if (relationship === "child") return { personA: personB, personB: personA, relationship: "parent" };
  if (relationship === "partner") return personA < personB ? { personA, personB, relationship } : { personA: personB, personB: personA, relationship };
  throw new HttpError(400, "Choose a valid relationship.");
}

async function createAlbum({ request, env, user }: RequestContext): Promise<Response> {
  if (user!.role !== "admin" && (await setting(env, "members_can_create_albums")) === "false") throw new HttpError(403, "Only administrators can create albums right now.");
  const body = await readJson<Body>(request);
  const name = cleanText(body.name, 100);
  if (!name) throw new HttpError(400, "Album name is required.");
  const id = uuid();
  const visibility = body.visibility === "private" ? "private" : "family";
  await env.DB.prepare("INSERT INTO albums(id,name,description,visibility,owner_id) VALUES(?,?,?,?,?)")
    .bind(id, name, cleanText(body.description, 600), visibility, user!.id).run();
  await audit(env, user!.id, "album.created", "album", id);
  return json({ id }, { status: 201 });
}

async function updateAlbum({ request, env, user }: RequestContext, id: string): Promise<Response> {
  await requireAlbumOwner(env, user!, id);
  const body = await readJson<Body>(request);
  const current = await env.DB.prepare("SELECT name,description,visibility,cover_photo_id FROM albums WHERE id=?").bind(id).first<{ name: string; description: string; visibility: string; cover_photo_id: string | null }>();
  if (!current) throw new HttpError(404, "Album not found.");
  const name = body.name === undefined ? current.name : cleanText(body.name, 100);
  if (!name) throw new HttpError(400, "Album name is required.");
  const description = body.description === undefined ? current.description : cleanText(body.description, 600);
  const visibility = body.visibility === undefined ? current.visibility : body.visibility === "private" ? "private" : "family";
  let coverPhotoId = current.cover_photo_id;
  if (Object.prototype.hasOwnProperty.call(body, "coverPhotoId")) {
    coverPhotoId = cleanText(body.coverPhotoId, 64) || null;
    if (coverPhotoId) {
      const association = await env.DB.prepare("SELECT 1 FROM album_photos WHERE album_id=? AND photo_id=?").bind(id, coverPhotoId).first();
      if (!association) throw new HttpError(400, "Choose a photograph that belongs to this album.");
    }
  }
  await env.DB.prepare("UPDATE albums SET name=?,description=?,visibility=?,cover_photo_id=?,updated_at=datetime('now') WHERE id=?")
    .bind(name, description, visibility, coverPhotoId, id).run();
  await audit(env, user!.id, "album.updated", "album", id);
  return json({ ok: true });
}

async function deleteAlbum({ env, user }: RequestContext, id: string): Promise<Response> {
  await requireAlbumOwner(env, user!, id);
  await env.DB.prepare("DELETE FROM albums WHERE id=?").bind(id).run();
  await audit(env, user!.id, "album.deleted", "album", id);
  return json({ ok: true });
}

async function listPhotos({ env, url, user }: RequestContext): Promise<Response> {
  const query = photoQuery(url, user!, photoAccessSql("p"));
  const countUrl = new URL(url); countUrl.searchParams.delete("cursor");
  const count = photoQuery(countUrl,user!,photoAccessSql("p"));
  const [rows,totalRows] = await env.DB.batch<Record<string,unknown>>([
    env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader FROM photos p JOIN users u ON u.id=p.owner_id WHERE ${query.where} ORDER BY ${query.order} LIMIT ?`).bind(...query.bindings,query.limit+1),
    env.DB.prepare(`SELECT COUNT(*) total FROM photos p WHERE ${count.where}`).bind(...count.bindings),
  ]);
  const items = rows.results.slice(0, query.limit);
  const last = items[items.length - 1];
  return json({ photos: items, total:Number(totalRows.results[0]?.total || 0), nextCursor: rows.results.length > query.limit && last ? JSON.stringify([query.taken ? last.date_taken || "" : last.created_at, last.id]) : null });
}

function selectedPhotoIds(body: Body): string[] {
  if (!Array.isArray(body.photoIds) || body.photoIds.length < 1 || body.photoIds.length > 60 || body.photoIds.some((id) => typeof id !== "string" || !id || id.length > 64)) throw new HttpError(400, "Select between 1 and 60 photographs.");
  return [...new Set(body.photoIds as string[])];
}

async function listMemories({ env, user }: RequestContext): Promise<Response> {
  // A private photo's membership must not expose its group's title or story.
  const rows = await env.DB.prepare(`SELECT m.*,COUNT(p.id) photo_count FROM memories m JOIN memory_photos mp ON mp.memory_id=m.id JOIN photos p ON p.id=mp.photo_id WHERE p.status='ready' AND ${photoAccessSql("p")} GROUP BY m.id ORDER BY COALESCE(m.event_date,m.created_at) DESC,m.id DESC`).bind(user!.id, user!.role).all();
  return json({ memories: rows.results });
}

async function createMemory({ request, env, user }: RequestContext): Promise<Response> {
  const body = await readJson<Body>(request);
  const ids = selectedPhotoIds(body);
  const title = cleanText(body.title, 160);
  if (!title) throw new HttpError(400, "Give this memory a title.");
  // Shared group descriptions require access to every included photo.
  const visible = await env.DB.prepare(`SELECT p.id FROM photos p WHERE p.status='ready' AND p.id IN (${ids.map(() => "?").join(",")}) AND ${photoAccessSql("p")}`).bind(...ids,user!.id,user!.role).all();
  if (visible.results.length !== ids.length) throw new HttpError(404,"Photo not found.");
  const id = uuid();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO memories(id,title,story,event_date,created_by) VALUES(?,?,?,?,?)").bind(id,title,cleanText(body.story,2000),nullableDate(body.eventDate),user!.id),
    ...ids.map((photoId) => env.DB.prepare("INSERT INTO memory_photos(memory_id,photo_id) VALUES(?,?)").bind(id,photoId)),
  ]);
  await audit(env,user!.id,"memory.created","memory",id);
  return json({ id }, { status: 201 });
}

async function bulkEditPhotos({ request, env, user }: RequestContext): Promise<Response> {
  const body = await readJson<Body>(request);
  const ids = selectedPhotoIds(body);
  const columns: string[] = [];
  const values: (string | null)[] = [];
  if ("caption" in body) { columns.push("caption=?"); values.push(cleanText(body.caption,500)); }
  if ("eventDescription" in body) { columns.push("event_description=?"); values.push(cleanText(body.eventDescription,500)); }
  if ("dateTaken" in body) {
    const date = nullableDate(body.dateTaken);
    if (body.dateTaken && !date) throw new HttpError(400,"Choose a valid date.");
    columns.push("date_taken=?"); values.push(date);
  }
  if (!columns.length) throw new HttpError(400,"Choose details to change.");
  // Check the entire selection before changing any records.
  const owned = await env.DB.prepare(`SELECT id FROM photos WHERE status='ready' AND id IN (${ids.map(() => "?").join(",")}) AND (owner_id=? OR ?='admin')`).bind(...ids,user!.id,user!.role).all();
  if (owned.results.length !== ids.length) throw new HttpError(404,"Photo not found.");
  await env.DB.batch(ids.map((id) => env.DB.prepare(`UPDATE photos SET ${columns.join(",")},updated_at=datetime('now') WHERE id=?`).bind(...values,id)));
  return json({ ok:true });
}

async function initPhoto({ request, env, user }: RequestContext): Promise<Response> {
  await cleanupStaleUploads(env);
  const body = await readJson<Body>(request);
  const mimeType = cleanText(body.mimeType, 80);
  const originalFilename = cleanText(body.filename, 240);
  const originalBytes = positiveInt(body.originalBytes);
  const galleryBytes = positiveInt(body.galleryBytes);
  const thumbnailBytes = positiveInt(body.thumbnailBytes);
  const smallBytes = positiveInt(body.smallBytes);
  if (!PHOTO_TYPES.has(mimeType)) throw new HttpError(415, "Only JPEG, PNG, and WebP photos are supported.");
  if (!originalFilename || !galleryBytes || !thumbnailBytes) throw new HttpError(400, "Photo metadata is incomplete.");
  const config = await settingsMap(env);
  const preserve = config.preserve_originals === "true";
  const maxBytes = Number(config.max_upload_bytes || 20 * 1024 * 1024);
  if (Math.max(originalBytes, galleryBytes, thumbnailBytes, smallBytes) > maxBytes) throw new HttpError(413, "Photo exceeds the configured upload limit.");
  const incoming = galleryBytes + thumbnailBytes + smallBytes + (preserve ? originalBytes : 0);
  const quota = Number(config.storage_quota_bytes);
  const hash = cleanText(body.hash, 128) || null;
  if (hash) {
    const duplicate = await env.DB.prepare("SELECT id FROM photos WHERE owner_id=? AND hash=? AND status='ready'").bind(user!.id, hash).first<{ id: string }>();
    if (duplicate) return json({ duplicateId: duplicate.id }, { status: 409 });
  }
  const id = uuid();
  const base = `photos/${id}`;
  const values = [id,user!.id,cleanText(body.caption,500),cleanText(body.eventDescription,500),originalFilename,mimeType,
    nullableDate(body.dateTaken),positiveInt(body.width)||null,positiveInt(body.height)||null,hash,
    preserve ? `${base}/original` : null,`${base}/gallery`,`${base}/thumbnail`,smallBytes ? `${base}/small` : null,
    preserve ? originalBytes : 0,galleryBytes,thumbnailBytes,smallBytes];
  const reservation = await env.DB.prepare(`INSERT INTO photos(
    id,owner_id,caption,event_description,original_filename,mime_type,date_taken,width,height,hash,
    original_key,gallery_key,thumbnail_key,small_key,expected_original_bytes,expected_gallery_bytes,expected_thumbnail_bytes,expected_small_bytes,upload_expires_at
  ) SELECT ${values.map(()=>"?").join(",")},datetime('now','+1 hour')
    WHERE COALESCE((SELECT SUM(CASE WHEN status='ready' THEN original_bytes+gallery_bytes+thumbnail_bytes+small_bytes
      WHEN status='pending' AND upload_expires_at > datetime('now') THEN expected_original_bytes+expected_gallery_bytes+expected_thumbnail_bytes+expected_small_bytes ELSE 0 END) FROM photos),0)+?<=?`)
    .bind(...values,incoming,quota).run();
  if (!reservation.meta.changes) throw new HttpError(413, "The family storage quota would be exceeded.");
  return json({ id, preserveOriginal: preserve, upload: { small:smallBytes ? `/api/photos/${id}/upload/small` : null, gallery: `/api/photos/${id}/upload/gallery`, thumbnail: `/api/photos/${id}/upload/thumbnail`, original: preserve ? `/api/photos/${id}/upload/original` : null } }, { status: 201 });
}

async function uploadVariant({ request, env, user }: RequestContext, id: string, variant: string): Promise<Response> {
  const photo = await env.DB.prepare("SELECT owner_id,status,original_key,gallery_key,thumbnail_key,small_key,expected_original_bytes,expected_gallery_bytes,expected_thumbnail_bytes,expected_small_bytes FROM photos WHERE id=? AND upload_expires_at > datetime('now')").bind(id).first<Record<string, string | null>>();
  if (!photo || photo.status !== "pending" || (photo.owner_id !== user!.id && user!.role !== "admin")) throw new HttpError(404, "Pending upload not found or has expired.");
  const key = photo[`${variant}_key`];
  if (!key) throw new HttpError(400, "This image variant is disabled.");
  const type = request.headers.get("Content-Type") || "";
  if (!PHOTO_TYPES.has(type)) throw new HttpError(415, "Unsupported image type.");
  const limit = Number((await setting(env, "max_upload_bytes")) || 20 * 1024 * 1024);
  const length = Number(request.headers.get("Content-Length") || 0);
  const expected = Number(photo[`expected_${variant}_bytes`] || 0);
  if (!request.body || length <= 0 || length > limit || length !== expected) throw new HttpError(413, "Upload size does not match its reservation.");
  await env.PHOTOS.put(key, request.body, { httpMetadata: { contentType: type }, customMetadata: { photoId: id, variant, ownerId: photo.owner_id! } });
  return json({ ok: true });
}

async function completePhoto({ env, user }: RequestContext, id: string): Promise<Response> {
  const photo = await env.DB.prepare("SELECT owner_id,status,original_key,gallery_key,thumbnail_key,small_key,expected_original_bytes,expected_gallery_bytes,expected_thumbnail_bytes,expected_small_bytes FROM photos WHERE id=? AND upload_expires_at > datetime('now')").bind(id).first<Record<string, string | null>>();
  if (!photo || photo.status !== "pending" || (photo.owner_id !== user!.id && user!.role !== "admin")) throw new HttpError(404, "Pending upload not found or has expired.");
  const [original, gallery, thumbnail, small] = await Promise.all([photo.original_key ? env.PHOTOS.head(photo.original_key) : null, env.PHOTOS.head(photo.gallery_key!), env.PHOTOS.head(photo.thumbnail_key!),photo.small_key ? env.PHOTOS.head(photo.small_key) : null]);
  if (!gallery || !thumbnail || (photo.original_key && !original) || (photo.small_key && !small)) throw new HttpError(409, "Upload is not complete yet.");
  const sizesMatch = gallery.size === Number(photo.expected_gallery_bytes)
    && thumbnail.size === Number(photo.expected_thumbnail_bytes)
    && (!photo.small_key || small?.size === Number(photo.expected_small_bytes))
    && (!photo.original_key || original?.size === Number(photo.expected_original_bytes));
  if (!sizesMatch) {
    await Promise.all([photo.original_key, photo.gallery_key, photo.thumbnail_key,photo.small_key].filter(Boolean).map((key) => env.PHOTOS.delete(key!)));
    await env.DB.prepare("DELETE FROM photos WHERE id=? AND status='pending'").bind(id).run();
    throw new HttpError(413, "Uploaded files did not match their reserved sizes. Please retry.");
  }
  await env.DB.prepare("UPDATE photos SET status='ready',original_bytes=?,gallery_bytes=?,thumbnail_bytes=?,small_bytes=?,upload_expires_at=NULL,updated_at=datetime('now') WHERE id=?")
    .bind(original?.size || 0, gallery.size, thumbnail.size,small?.size || 0, id).run();
  await audit(env, user!.id, "photo.uploaded", "photo", id);
  return json({ id, ok: true });
}

export async function serveAuthenticatedPhoto(request:Request,env:Env,id:string,variant:string):Promise<Response> {
  const started=performance.now(),hash=await sessionTokenHash(request);
  if(!hash)throw new HttpError(401,"Please sign in.");
  const photo=await env.DB.prepare(`SELECT u.id session_user_id,p.id photo_id,p.original_filename,p.mime_type,p.original_key,p.gallery_key,p.thumbnail_key,p.small_key
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN photos p ON p.id=? AND p.status='ready' AND ${photoAccessPredicate("p","u.id","u.role")}
    WHERE s.id_hash=? AND julianday(s.expires_at)>julianday('now') AND u.status='active'`).bind(id,hash).first<Record<string,string|null>>();
  if(!photo)throw new HttpError(401,"Please sign in.");
  if(!photo.photo_id)throw new HttpError(404,"Photo not found.");
  const authorized=performance.now();const response=await deliverPhoto(request,env,photo,variant);
  response.headers.set("Server-Timing",`auth;dur=${(authorized-started).toFixed(1)}, storage;dur=${(performance.now()-authorized).toFixed(1)}`);
  return response;
}

async function servePhoto({ request, env, user }: RequestContext, id: string, variant: string): Promise<Response> {
  requireUser(user);
  const photo = await env.DB.prepare(`SELECT p.original_filename,p.mime_type,p.original_key,p.gallery_key,p.thumbnail_key,p.small_key FROM photos p WHERE p.id=? AND p.status='ready' AND ${photoAccessSql("p")}`).bind(id, user!.id, user!.role).first<Record<string, string | null>>();
  if (!photo) throw new HttpError(404, "Photo not found.");
  return deliverPhoto(request,env,photo,variant);
}

async function deliverPhoto(request:Request,env:Env,photo:Record<string,string|null>,variant:string):Promise<Response> {
  // The viewer should show the complete photograph. Prefer the untouched
  // original when it is retained, while keeping gallery derivatives as a
  // fallback for vaults configured not to preserve originals.
  const key = variant === "viewer"
    ? photo.original_key || photo.gallery_key
    : variant === "small" ? photo.small_key || photo.thumbnail_key || photo.gallery_key : photo[`${variant}_key`] || photo.gallery_key;
  if (variant !== "original" && request.headers.has("If-None-Match")) {
    const metadata = await env.PHOTOS.head(key!);
    if (metadata && matchesMediaTag(request,metadata.httpEtag)) return new Response(null,{ status:304,headers:{ ...mediaCacheHeaders(false),ETag:metadata.httpEtag } });
  }
  const object = await env.PHOTOS.get(key!);
  if (!object) throw new HttpError(404, "Photo file not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  for (const [name,value] of Object.entries(mediaCacheHeaders(variant === "original"))) headers.set(name,value);
  headers.set("Content-Security-Policy", "default-src 'none'");
  headers.set("Content-Disposition", variant === "original" ? `attachment; filename="${safeFilename(photo.original_filename || "photo")}"` : "inline");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function updatePhoto({ request, env, user }: RequestContext, id: string): Promise<Response> {
  await requirePhotoOwner(env, user!, id);
  const body = await readJson<Body>(request);
  await env.DB.prepare("UPDATE photos SET caption=?,event_description=?,date_taken=?,updated_at=datetime('now') WHERE id=?")
    .bind(cleanText(body.caption, 500), cleanText(body.eventDescription, 500), nullableDate(body.dateTaken), id).run();
  return json({ ok: true });
}

async function deletePhoto({ env, user }: RequestContext, id: string): Promise<Response> {
  await requirePhotoOwner(env, user!, id);
  const photo = await env.DB.prepare("SELECT original_key,gallery_key,thumbnail_key,small_key FROM photos WHERE id=?").bind(id).first<Record<string, string | null>>();
  if (!photo) throw new HttpError(404, "Photo not found.");
  await env.DB.prepare("UPDATE photos SET status='deleting' WHERE id=?").bind(id).run();
  await Promise.all(Object.values(photo).filter(Boolean).map((key) => env.PHOTOS.delete(key!)));
  await env.DB.prepare("DELETE FROM photos WHERE id=?").bind(id).run();
  await audit(env, user!.id, "photo.deleted", "photo", id);
  return json({ ok: true });
}

async function addPhotoToAlbum({ request, env, user }: RequestContext, albumId: string): Promise<Response> {
  const album = await env.DB.prepare("SELECT owner_id,visibility FROM albums WHERE id=?").bind(albumId).first<{ owner_id: string; visibility: string }>();
  if (!album || (album.visibility === "private" && album.owner_id !== user!.id && user!.role !== "admin")) throw new HttpError(404, "Album not found.");
  const body = await readJson<Body>(request);
  const photoId = cleanText(body.photoId, 64);
  await requirePhotoAccess(env, user!, photoId);
  await env.DB.prepare("INSERT OR IGNORE INTO album_photos(album_id,photo_id,added_by) VALUES(?,?,?)").bind(albumId, photoId, user!.id).run();
  return json({ ok: true });
}

async function removePhotoFromAlbum({ env, user }: RequestContext, albumId: string, photoId: string): Promise<Response> {
  await requireAlbumOwner(env, user!, albumId);
  const removed = await env.DB.prepare("DELETE FROM album_photos WHERE album_id=? AND photo_id=?").bind(albumId, photoId).run();
  if (!removed.meta.changes) throw new HttpError(404, "Photograph is not in this album.");
  await env.DB.prepare("UPDATE albums SET cover_photo_id=NULL,updated_at=datetime('now') WHERE id=? AND cover_photo_id=?").bind(albumId, photoId).run();
  await audit(env, user!.id, "album.photo_removed", "album", albumId, JSON.stringify({ photoId }));
  return json({ ok: true });
}

async function listComments({ env, user }: RequestContext, photoId: string): Promise<Response> {
  await requirePhotoAccess(env, user!, photoId);
  const [comments, reactions] = await Promise.all([
    env.DB.prepare("SELECT c.id,c.body,c.author_id,c.created_at,u.display_name author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.photo_id=? ORDER BY c.created_at").bind(photoId).all(),
    env.DB.prepare("SELECT emoji,COUNT(*) count,MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) mine FROM reactions WHERE photo_id=? GROUP BY emoji").bind(user!.id, photoId).all()
  ]);
  return json({ comments: comments.results, reactions: reactions.results });
}

async function addComment({ request, env, user }: RequestContext, photoId: string): Promise<Response> {
  await requirePhotoAccess(env, user!, photoId);
  const body = await readJson<Body>(request);
  const text = cleanText(body.body, 1000);
  if (!text) throw new HttpError(400, "Comment cannot be empty.");
  const exists = await env.DB.prepare("SELECT 1 FROM photos WHERE id=? AND status='ready'").bind(photoId).first();
  if (!exists) throw new HttpError(404, "Photo not found.");
  const id = uuid();
  await env.DB.prepare("INSERT INTO comments(id,photo_id,author_id,body) VALUES(?,?,?,?)").bind(id, photoId, user!.id, text).run();
  return json({ id }, { status: 201 });
}

async function deleteComment({ env, user }: RequestContext, id: string): Promise<Response> {
  const comment = await env.DB.prepare("SELECT author_id FROM comments WHERE id=?").bind(id).first<{ author_id: string }>();
  if (!comment || (comment.author_id !== user!.id && user!.role !== "admin")) throw new HttpError(404, "Comment not found.");
  await env.DB.prepare("DELETE FROM comments WHERE id=?").bind(id).run();
  return json({ ok: true });
}

async function toggleReaction({ request, env, user }: RequestContext, photoId: string): Promise<Response> {
  await requirePhotoAccess(env, user!, photoId);
  const body = await readJson<Body>(request);
  const emoji = cleanText(body.emoji, 20);
  if (!["heart", "smile", "celebrate"].includes(emoji)) throw new HttpError(400, "Unsupported reaction.");
  const existing = await env.DB.prepare("SELECT 1 FROM reactions WHERE photo_id=? AND user_id=? AND emoji=?").bind(photoId, user!.id, emoji).first();
  if (existing) await env.DB.prepare("DELETE FROM reactions WHERE photo_id=? AND user_id=? AND emoji=?").bind(photoId, user!.id, emoji).run();
  else await env.DB.prepare("INSERT INTO reactions(photo_id,user_id,emoji) VALUES(?,?,?)").bind(photoId, user!.id, emoji).run();
  return json({ active: !existing });
}

async function timeline({ env, url, user }: RequestContext): Promise<Response> {
  const offset=collectionOffset(url);
  const year = /^\d{4}$/.test(url.searchParams.get("year") || "") ? url.searchParams.get("year")! : "";
  const month = /^(?:0[1-9]|1[0-2])$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month")! : "";
  const album = cleanText(url.searchParams.get("album"), 64);
  const event = cleanText(url.searchParams.get("event"), 80);
  const clauses = ["p.status='ready'"];
  const bindings: string[] = [];
  if (year) { clauses.push("p.date_taken>=? AND p.date_taken<?"); bindings.push(`${year}-01-01`,`${Number(year)+1}-01-01`); }
  if (month) { clauses.push("substr(p.date_taken,6,2)=?"); bindings.push(month); }
  if (album) { clauses.push("EXISTS (SELECT 1 FROM album_photos timeline_ap WHERE timeline_ap.photo_id=p.id AND timeline_ap.album_id=?)"); bindings.push(album); }
  if (event) { clauses.push("(p.event_description LIKE ? OR p.caption LIKE ?)"); const pattern = `%${event.replace(/[%_]/g, "")}%`; bindings.push(pattern, pattern); }
  clauses.push(photoAccessSql("p"));
  bindings.push(user!.id, user!.role);
  const rows = await env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader
    FROM photos p JOIN users u ON u.id=p.owner_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY CASE WHEN p.date_taken IS NULL THEN 1 ELSE 0 END, p.date_taken DESC, p.created_at DESC,p.id DESC LIMIT 101 OFFSET ?`).bind(...bindings,offset).all();
  return json(collectionPage(rows.results,offset));
}

async function search({ env, url, user }: RequestContext): Promise<Response> {
  const query = cleanText(url.searchParams.get("q"), 50);
  if (query.length < 2) return json({ photos: [], albums: [] });
  const pattern = `%${query.replace(/[%_]/g, "")}%`;
  const { year, month } = searchDateParts(query);
  let dateClause = "0";
  const dateBindings: string[] = [];
  if (year && month) {
    dateClause = "((p.date_taken>=? AND p.date_taken<?) OR (p.created_at>=? AND p.created_at<?))";
    const start=`${year}-${month}-01`,end=month==="12" ? `${Number(year)+1}-01-01` : `${year}-${String(Number(month)+1).padStart(2,"0")}-01`;
    dateBindings.push(start,end,start,end);
  } else if (year) {
    dateClause = "((p.date_taken>=? AND p.date_taken<?) OR (p.created_at>=? AND p.created_at<?))";
    dateBindings.push(`${year}-01-01`,`${Number(year)+1}-01-01`,`${year}-01-01`,`${Number(year)+1}-01-01`);
  } else if (month) {
    dateClause = "(substr(p.date_taken,6,2)=? OR substr(p.created_at,6,2)=?)";
    dateBindings.push(month, month);
  }
  const offset=collectionOffset(url);
  const photoFrom=`FROM photos p JOIN users u ON u.id=p.owner_id WHERE p.status='ready' AND p.rowid IN (
    SELECT rowid FROM photo_search WHERE caption LIKE ? UNION SELECT rowid FROM photo_search WHERE event_description LIKE ?
    UNION SELECT rowid FROM photos WHERE owner_id IN (SELECT id FROM users WHERE display_name LIKE ?)
    UNION SELECT p.rowid FROM photos p WHERE p.status='ready' AND ${dateClause}
  ) AND ${photoAccessSql("p")}`;
  const albumFrom=`FROM albums a JOIN users u ON u.id=a.owner_id WHERE (a.visibility='family' OR a.owner_id=? OR ?='admin') AND (a.name LIKE ? OR a.description LIKE ?)`;
  const photoBindings=[pattern,pattern,pattern,...dateBindings,user!.id,user!.role];
  const albumBindings=[user!.id,user!.role,pattern,pattern];
  const [photos,albums,photoTotal,albumTotal]=await Promise.all([
    env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader ${photoFrom} ORDER BY p.created_at DESC,p.id DESC LIMIT 101 OFFSET ?`).bind(...photoBindings,offset*100).all(),
    env.DB.prepare(`SELECT a.id,a.name,a.description,a.visibility,a.owner_id,a.cover_photo_id,${albumThumbnailSql()},u.display_name creator,(SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id=a.id) photo_count ${albumFrom} ORDER BY a.updated_at DESC,a.id DESC LIMIT 21 OFFSET ?`).bind(...albumBindings,offset*20).all(),
    env.DB.prepare(`SELECT COUNT(*) total ${photoFrom}`).bind(...photoBindings).first<{total:number}>(),
    env.DB.prepare(`SELECT COUNT(*) total ${albumFrom}`).bind(...albumBindings).first<{total:number}>()
  ]);
  return json({photos:photos.results.slice(0,100),albums:albums.results.slice(0,20),total:Number(photoTotal?.total || 0)+Number(albumTotal?.total || 0),nextCursor:photos.results.length>100 || albums.results.length>20 ? String(offset+1) : null});

}

function searchDateParts(query: string): { year: string; month: string } {
  const normalized = query.toLowerCase();
  const year = normalized.match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
  const monthNames: Record<string, string> = {
    january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
    april: "04", apr: "04", may: "05", june: "06", jun: "06", july: "07", jul: "07",
    august: "08", aug: "08", september: "09", sep: "09", sept: "09", october: "10", oct: "10",
    november: "11", nov: "11", december: "12", dec: "12"
  };
  const monthToken = normalized.match(/\b(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/)?.[0] || "";
  return { year, month: monthNames[monthToken] || "" };
}

async function adminMembers({ env }: RequestContext): Promise<Response> {
  const members = await env.DB.prepare("SELECT id,email,display_name,role,status,created_at FROM users ORDER BY created_at").all();
  const invites = await env.DB.prepare("SELECT id,email,role,expires_at,used_at,revoked_at,created_at FROM invitations ORDER BY created_at DESC LIMIT 50").all();
  return json({ members: members.results, invitations: invites.results });
}

async function createInvitation({ request, env, user }: RequestContext): Promise<Response> {
  const body = await readJson<Body>(request);
  const email = body.email ? emailAddress(body.email) : null;
  const days = Math.min(30, Math.max(1, Number(body.days || 7)));
  const role = body.role === "admin" ? "admin" : "member";
  const token = randomToken();
  const id = uuid();
  await env.DB.prepare("INSERT INTO invitations(id,email,token_hash,role,created_by,expires_at) VALUES(?,?,?,?,?,datetime('now',?))")
    .bind(id, email, await sha256(token), role, user!.id, `+${days} days`).run();
  await audit(env, user!.id, "invitation.created", "invitation", id);
  return json({ id, token, invitePath: `/register?invite=${encodeURIComponent(token)}` }, { status: 201 });
}

async function revokeInvitation({ env, user }: RequestContext, id: string): Promise<Response> {
  const revoked = await env.DB.prepare("UPDATE invitations SET revoked_at=datetime('now') WHERE id=? AND used_at IS NULL AND revoked_at IS NULL").bind(id).run();
  if (!revoked.meta.changes) throw new HttpError(404, "Active invitation not found.");
  await audit(env, user!.id, "invitation.revoked", "invitation", id);
  return json({ ok: true });
}

async function createRecovery({ env, user }: RequestContext, memberId: string): Promise<Response> {
  if (memberId === user!.id) throw new HttpError(400, "Use a separate administrator for account recovery.");
  const member = await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(memberId).first<{ id: string; email: string }>();
  if (!member) throw new HttpError(404, "Member not found.");
  const token = randomToken();
  const id = uuid();
  await env.DB.batch([
    env.DB.prepare("UPDATE recovery_tokens SET revoked_at=datetime('now') WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL").bind(memberId),
    env.DB.prepare("INSERT INTO recovery_tokens(id,user_id,token_hash,created_by,expires_at) VALUES(?,?,?,?,datetime('now','+2 hours'))").bind(id, memberId, await sha256(token), user!.id)
  ]);
  await audit(env, user!.id, "member.recovery_created", "user", memberId);
  return json({ id, email: member.email, recoveryPath: `/recover?token=${encodeURIComponent(token)}` }, { status: 201 });
}

async function updateMember({ request, env, user }: RequestContext, id: string): Promise<Response> {
  if (id === user!.id) throw new HttpError(400, "You cannot change your own access here.");
  const body = await readJson<Body>(request);
  const status = body.status === "revoked" ? "revoked" : "active";
  const role = body.role === "admin" ? "admin" : "member";
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status=?,role=?,updated_at=datetime('now') WHERE id=?").bind(status, role, id),
    ...(status === "revoked" ? [env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id)] : [])
  ]);
  await audit(env, user!.id, "member.updated", "user", id, JSON.stringify({ status, role }));
  return json({ ok: true });
}

async function storage({ env, url }: RequestContext): Promise<Response> {
  const config = await settingsMap(env);
  const row = await env.DB.prepare("SELECT COUNT(*) photo_count,COALESCE(SUM(original_bytes+gallery_bytes+thumbnail_bytes+small_bytes),0) total_bytes FROM photos WHERE status='ready'").first();
  return json({ ...(row || {}), quota_bytes: Number(config.storage_quota_bytes), warning_percent: Number(config.storage_warning_percent), estimated_monthly_usd: Math.max(0, (Number((row as Record<string, number>)?.total_bytes || 0) / 1_000_000_000 - 10) * 0.015), can_seed_samples: env.APP_ENV === "development" && ["localhost", "127.0.0.1"].includes(url.hostname) });
}

async function seedDevelopmentPhotos({ env, url, user }: RequestContext): Promise<Response> {
  if (env.APP_ENV !== "development" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new HttpError(404, "Not found.");
  const albumId = "dev-unsplash-samples";
  await env.DB.prepare("INSERT OR IGNORE INTO albums(id,name,description,visibility,owner_id) VALUES(?,?,'Development-only photographs imported from Unsplash for exercising the complete Family Vault flow.','family',?)")
    .bind(albumId, "Sample family moments", user!.id).run();
  const samples = [
    ["1529156069898-49953e39b3ac", "Together in the sunshine"],
    ["1511895426328-dc8714191300", "A favorite afternoon"],
    ["1504151932400-72d4384f04b3", "Growing up together"],
    ["1529333166437-7750a6dd5a70", "The little moments"],
    ["1475503572774-15a45e5d60b9", "Time with family"],
    ["1485217988980-11786ced9454", "A day worth remembering"]
  ] as const;
  let imported = 0;
  let skipped = 0;
  for (const [sourceId, caption] of samples) {
    const id = `dev-unsplash-${sourceId}`;
    const exists = await env.DB.prepare("SELECT id FROM photos WHERE id=? AND status='ready'").bind(id).first();
    if (exists) {
      await env.DB.prepare("INSERT OR IGNORE INTO album_photos(album_id,photo_id,added_by) VALUES(?,?,?)").bind(albumId, id, user!.id).run();
      skipped++;
      continue;
    }
    const baseUrl = `https://images.unsplash.com/photo-${sourceId}`;
    const [galleryResponse, thumbnailResponse] = await Promise.all([
      fetch(`${baseUrl}?auto=format&fit=crop&w=1600&q=82`),
      fetch(`${baseUrl}?auto=format&fit=crop&w=600&q=76`)
    ]);
    if (!galleryResponse.ok || !thumbnailResponse.ok || !galleryResponse.body || !thumbnailResponse.body) throw new HttpError(502, "Unsplash sample import failed. Try again later.");
    const galleryKey = `photos/${id}/gallery`;
    const thumbnailKey = `photos/${id}/thumbnail`;
    try {
      await Promise.all([
        env.PHOTOS.put(galleryKey, galleryResponse.body, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { photoId: id, variant: "gallery", ownerId: user!.id, source: "unsplash" } }),
        env.PHOTOS.put(thumbnailKey, thumbnailResponse.body, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { photoId: id, variant: "thumbnail", ownerId: user!.id, source: "unsplash" } })
      ]);
      const [gallery, thumbnail] = await Promise.all([env.PHOTOS.head(galleryKey), env.PHOTOS.head(thumbnailKey)]);
      if (!gallery || !thumbnail) throw new Error("Stored sample object is missing.");
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO photos(id,owner_id,caption,event_description,original_filename,mime_type,hash,status,gallery_key,thumbnail_key,gallery_bytes,thumbnail_bytes)
          VALUES(?,?,?,?,?,?,?,'ready',?,?,?,?)`).bind(id, user!.id, caption, `Development sample from Unsplash: https://unsplash.com/photos/${sourceId}`, `unsplash-${sourceId}.jpg`, "image/jpeg", `dev-unsplash-${sourceId}`, galleryKey, thumbnailKey, gallery.size, thumbnail.size),
        env.DB.prepare("INSERT OR IGNORE INTO album_photos(album_id,photo_id,added_by) VALUES(?,?,?)").bind(albumId, id, user!.id)
      ]);
      imported++;
    } catch (error) {
      await Promise.all([env.PHOTOS.delete(galleryKey), env.PHOTOS.delete(thumbnailKey)]);
      throw error;
    }
  }
  await audit(env, user!.id, "development.samples_imported", "album", albumId, JSON.stringify({ imported, skipped }));
  return json({ imported, skipped, albumId });
}

async function settings({ env }: RequestContext): Promise<Response> { return json({ settings: await settingsMap(env) }); }

async function updateSettings({ request, env, user }: RequestContext): Promise<Response> {
  const body = await readJson<Body>(request);
  const allowed: Record<string, string> = {
    site_name: cleanText(body.site_name, 80),
    preserve_originals: body.preserve_originals === true || body.preserve_originals === "true" ? "true" : "false",
    max_upload_bytes: String(Math.min(100_000_000, Math.max(1_000_000, Number(body.max_upload_bytes)))),
    storage_quota_bytes: String(Math.max(100_000_000, Number(body.storage_quota_bytes))),
    storage_warning_percent: String(Math.min(99, Math.max(50, Number(body.storage_warning_percent)))),
    members_can_create_albums: body.members_can_create_albums === false || body.members_can_create_albums === "false" ? "false" : "true"
  };
  if (!allowed.site_name) throw new HttpError(400, "Site name is required.");
  await env.DB.batch(Object.entries(allowed).map(([key, value]) => env.DB.prepare("INSERT INTO application_settings(key,value,updated_by,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(key, value, user!.id)));
  await audit(env, user!.id, "settings.updated", "settings", null);
  return json({ settings: allowed });
}

async function exportMetadata({ env }: RequestContext): Promise<Response> {
  const metadata = await collectArchiveMetadata(env);
  const headers = new Headers({ "Content-Type": "application/json", "Content-Disposition": `attachment; filename="family-vault-metadata-${new Date().toISOString().slice(0,10)}.json"`, "Cache-Control": "private, no-store" });
  return new Response(JSON.stringify(metadata, null, 2), { headers });
}

async function exportArchive({ env }: RequestContext): Promise<Response> {
  const metadata = await collectArchiveMetadata(env);
  const photos = metadata.photos as Array<Record<string, string | number | null>>;
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield tarHeader("family-vault-metadata.json",metadataBytes.byteLength,Date.now());
    yield metadataBytes;
    if (metadataBytes.byteLength % 512) yield new Uint8Array(512-metadataBytes.byteLength % 512);
    for (const photo of photos) {
      const key = String(photo.original_key || photo.gallery_key || "");
      if (!key) continue;
      const object = await env.PHOTOS.get(key);
      if (!object?.body) continue;
      const original = Boolean(photo.original_key);
      const sourceName = original ? safeFilename(String(photo.original_filename || "photo")) : `${safeFilename(String(photo.original_filename || "photo")).replace(/\.[^.]+$/, "")}-optimized.webp`;
      const archiveName = `photos/${String(photo.id).slice(0,36)}-${sourceName}`.slice(0,99);
      yield tarHeader(archiveName,object.size,Date.parse(String(photo.created_at || "")) || Date.now());
      const reader = object.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          yield chunk.value;
        }
      } finally { await reader.cancel().catch(()=>undefined);reader.releaseLock(); }
      if (object.size % 512) yield new Uint8Array(512-object.size % 512);
    }
    yield new Uint8Array(1024);
  }
  const iterator=chunks();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try { const chunk=await iterator.next();if(chunk.done)controller.close();else controller.enqueue(chunk.value); }
      catch(error) {controller.error(error);}
    },
    async cancel() {await iterator.return(undefined);}
  },{highWaterMark:0});
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, { headers: { "Content-Type": "application/x-tar", "Content-Disposition": `attachment; filename="family-vault-archive-${date}.tar"`, "Cache-Control": "private, no-store" } });
}

async function collectArchiveMetadata(env: RequestContext["env"]): Promise<Record<string, unknown>> {
  const [users, albums, photos, joins, comments, reactions, people, relationships, tags, memories, memoryPhotos] = await Promise.all([
    env.DB.prepare("SELECT id,email,display_name,role,status,created_at FROM users").all(), env.DB.prepare("SELECT * FROM albums").all(),
    env.DB.prepare("SELECT id,owner_id,caption,event_description,original_filename,mime_type,date_taken,width,height,hash,original_key,gallery_key,thumbnail_key,small_key,original_bytes,gallery_bytes,thumbnail_bytes,small_bytes,created_at FROM photos WHERE status='ready'").all(),
    env.DB.prepare("SELECT * FROM album_photos").all(), env.DB.prepare("SELECT * FROM comments").all(), env.DB.prepare("SELECT * FROM reactions").all(),
    env.DB.prepare("SELECT * FROM family_people").all(),env.DB.prepare("SELECT * FROM family_relationships").all(),env.DB.prepare("SELECT * FROM photo_people").all(),
    env.DB.prepare("SELECT * FROM memories").all(),env.DB.prepare("SELECT * FROM memory_photos").all()
  ]);
  return { exportedAt: new Date().toISOString(), users: users.results, albums: albums.results, photos: photos.results, albumPhotos: joins.results, comments: comments.results, reactions: reactions.results,
    familyPeople:people.results,familyRelationships:relationships.results,photoPeople:tags.results,memories:memories.results,memoryPhotos:memoryPhotos.results };

}

function tarHeader(name: string, size: number, modifiedMs: number): Uint8Array {
  const header = new Uint8Array(512);
  writeTarText(header, 0, 100, name);
  writeTarOctal(header, 100, 8, 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, size);
  writeTarOctal(header, 136, 12, Math.floor(modifiedMs / 1000));
  header.fill(32, 148, 156);
  header[156] = 48;
  writeTarText(header, 257, 6, "ustar");
  writeTarText(header, 263, 2, "00");
  writeTarText(header, 265, 32, "family-vault");
  writeTarText(header, 297, 32, "family-vault");
  const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0");
  writeTarText(header, 148, 6, checksum);
  header[154] = 0;
  header[155] = 32;
  return header;
}

function writeTarText(target: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = new TextEncoder().encode(value);
  target.set(bytes.slice(0, length), offset);
}

function writeTarOctal(target: Uint8Array, offset: number, length: number, value: number): void {
  writeTarText(target, offset, length, Math.max(0, value).toString(8).padStart(length - 1, "0") + "\0");
}



async function requirePhotoOwner(env: RequestContext["env"], user: NonNullable<RequestContext["user"]>, id: string): Promise<void> {
  const row = await env.DB.prepare("SELECT owner_id FROM photos WHERE id=?").bind(id).first<{ owner_id: string }>();
  if (!row || (row.owner_id !== user.id && user.role !== "admin")) throw new HttpError(404, "Photo not found.");
}

async function requirePhotoAccess(env: RequestContext["env"], user: NonNullable<RequestContext["user"]>, id: string): Promise<void> {
  const row = await env.DB.prepare(`SELECT p.id FROM photos p WHERE p.id=? AND p.status='ready' AND ${photoAccessSql("p")}`).bind(id, user.id, user.role).first();
  if (!row) throw new HttpError(404, "Photo not found.");
}

function photoAccessSql(alias:string):string {return photoAccessPredicate(alias);}


async function requireAlbumOwner(env: RequestContext["env"], user: NonNullable<RequestContext["user"]>, id: string): Promise<void> {
  const row = await env.DB.prepare("SELECT owner_id FROM albums WHERE id=?").bind(id).first<{ owner_id: string }>();
  if (!row || (row.owner_id !== user.id && user.role !== "admin")) throw new HttpError(404, "Album not found.");
}

async function setting(env: RequestContext["env"], key: string): Promise<string | null> {
  return (await env.DB.prepare("SELECT value FROM application_settings WHERE key=?").bind(key).first<{ value: string }>())?.value || null;
}

async function settingsMap(env: RequestContext["env"]): Promise<Record<string, string>> {
  const rows = await env.DB.prepare("SELECT key,value FROM application_settings WHERE key NOT LIKE 'rate:%'").all<{ key: string; value: string }>();
  return Object.fromEntries(rows.results.map((row) => [row.key, row.value]));
}

async function totalStorage(env: RequestContext["env"]): Promise<number> {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(original_bytes+gallery_bytes+thumbnail_bytes+small_bytes),0) total FROM photos WHERE status='ready'").first<{ total: number }>();
  return Number(row?.total || 0);
}

async function cleanupStaleUploads(env: RequestContext["env"]): Promise<void> {
  const stale = await env.DB.prepare("SELECT id,original_key,gallery_key,thumbnail_key,small_key FROM photos WHERE status='pending' AND upload_expires_at <= datetime('now') LIMIT 25").all<Record<string, string | null>>();
  for (const photo of stale.results) {
    await Promise.all([photo.original_key, photo.gallery_key, photo.thumbnail_key,photo.small_key].filter(Boolean).map((key) => env.PHOTOS.delete(key!)));
    await env.DB.prepare("DELETE FROM photos WHERE id=? AND status='pending'").bind(photo.id).run();
  }
}

async function audit(env: RequestContext["env"], actorId: string | null, action: string, targetType: string | null, targetId: string | null, detail: string | null = null): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,detail) VALUES(?,?,?,?,?,?)").bind(uuid(), actorId, action, targetType, targetId, detail).run();
}

function positiveInt(value: unknown): number { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
function nullableDate(value: unknown): string | null { const text = cleanText(value, 32); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null; const date = new Date(`${text}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === text ? text : null; }
function safeFilename(name: string): string { return name.replace(/["\\\r\n/]/g, "_").slice(0, 160); }
