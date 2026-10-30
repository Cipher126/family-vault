export interface User { id: string; email: string; displayName: string; role: "admin" | "member" }
export interface Photo { id: string; caption: string; event_description?: string; date_taken?: string | null; created_at: string; owner_id?: string; width?: number; height?: number; uploader?: string; memory_reason?: "on_this_day" | "this_month" | "recent" }
export interface Album { id: string; name: string; description: string; visibility: string; owner_id?: string; cover_photo_id?: string | null; photo_count: number; creator?: string }
export interface Comment { id: string; body: string; author_id: string; author: string; created_at: string }
export interface Reaction { emoji: "heart" | "smile" | "celebrate"; count: number; mine: number }
export type FamilyGender = "female" | "male" | "unspecified";
export interface FamilyPerson { id: string; first_name: string; last_name: string; nickname: string; gender?: FamilyGender; birth_date?: string | null; death_date?: string | null; biography: string; profile_photo_id?: string | null; created_by?: string; photo_count: number }
export interface FamilyRelationship { id: string; person_a_id: string; person_b_id: string; relationship: "parent" | "partner"; created_by?: string }

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (import.meta.env.VITE_UI_PREVIEW === "1") return mockRequest(path, init) as T;
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() as Record<string, unknown> : null;
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${response.status})`);
  return data as T;
}

export function photoUrl(id: string, variant: "thumbnail" | "gallery" | "viewer" | "original" = "thumbnail"): string {
  if (import.meta.env.VITE_UI_PREVIEW !== "1") return `/api/photos/${id}/${variant}`;
  const palettes = [["#8f6f58", "#d8b9a1"], ["#5f7365", "#b7c1a9"], ["#8c665f", "#d6aaa0"], ["#646b78", "#aeb6c2"], ["#9a815e", "#d8c69f"]];
  const index = Math.abs(Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0)) % palettes.length;
  const [a, b] = palettes[index];
  const label = ["Summer picnic", "Together at home", "Sunday afternoon", "A day to remember", "The old garden"][index];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .08 0"/></filter></defs><rect width="900" height="700" fill="url(#g)"/><circle cx="450" cy="270" r="105" fill="#f7ead7" opacity=".75"/><path d="M210 650c38-190 145-260 240-260s202 70 240 260" fill="#3e392f" opacity=".5"/><rect width="900" height="700" filter="url(#n)" opacity=".7"/><text x="450" y="665" text-anchor="middle" fill="white" font-family="Georgia" font-size="26" opacity=".9">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function mockRequest(path: string, init: RequestInit): unknown {
  const photos = Array.from({ length: 12 }, (_, index) => ({ id: `memory-${index + 1}`, caption: ["Grandma's garden", "A summer picnic", "The cousins together", "Sunday best", "Home for the holidays", "A quiet afternoon"][index % 6], date_taken: `${1992 + index}-0${index % 9 + 1}-12`, created_at: new Date(2026, 9, 19 - index).toISOString(), uploader: index % 2 ? "Amara" : "David" }));
  const albums = [{ id: "a1", name: "Childhood memories", description: "The little moments that became big memories.", visibility: "family", owner_id: "preview-admin", photo_count: 34, creator: "Amara" }, { id: "a2", name: "Family gatherings", description: "All of us, under one roof.", visibility: "family", owner_id: "2", photo_count: 18, creator: "David" }, { id: "a3", name: "Grandparents", description: "Where our stories began.", visibility: "family", owner_id: "preview-admin", photo_count: 42, creator: "Amara" }];
  const familyPeople: FamilyPerson[] = [
    { id: "p1", first_name: "Nneka", last_name: "Okafor", nickname: "Mama", birth_date: "1948-04-18", biography: "The keeper of the family stories.", profile_photo_id: "memory-1", photo_count: 8 },
    { id: "p2", first_name: "Chidi", last_name: "Okafor", nickname: "", birth_date: "1945-09-02", death_date: "2020-01-14", biography: "Teacher, gardener, and patient grandfather.", profile_photo_id: "memory-2", photo_count: 11 },
    { id: "p3", first_name: "Amara", last_name: "Okafor", nickname: "", birth_date: "1978-06-10", biography: "", profile_photo_id: "memory-3", photo_count: 17 },
    { id: "p4", first_name: "David", last_name: "Okafor", nickname: "", birth_date: "1975-11-23", biography: "", profile_photo_id: "memory-4", photo_count: 14 },
    { id: "p5", first_name: "Ada", last_name: "Okafor", nickname: "", birth_date: "2004-03-08", biography: "", profile_photo_id: "memory-5", photo_count: 9 }
  ];
  const familyRelationships: FamilyRelationship[] = [{ id: "r1", person_a_id: "p1", person_b_id: "p3", relationship: "parent" }, { id: "r2", person_a_id: "p2", person_b_id: "p3", relationship: "parent" }, { id: "r3", person_a_id: "p1", person_b_id: "p4", relationship: "parent" }, { id: "r4", person_a_id: "p2", person_b_id: "p4", relationship: "parent" }, { id: "r5", person_a_id: "p3", person_b_id: "p5", relationship: "parent" }, { id: "r6", person_a_id: "p1", person_b_id: "p2", relationship: "partner" }];
  if (path === "/api/auth/me") return { user: { id: "preview-admin", email: "admin@family.local", displayName: "Amara Okafor", role: "admin" } };
  if (path === "/api/config") return { siteName: "Family Vault" };
  if (path === "/api/dashboard") return { photos: photos.slice(0, 8), memories: photos.slice(0, 8).map((photo, index) => ({ ...photo, memory_reason: index < 2 ? "on_this_day" : index < 5 ? "this_month" : "recent" })), albums, activity: [{ action: "photo.uploaded", created_at: new Date().toISOString() }, { action: "album.created", created_at: new Date(Date.now() - 86400000).toISOString() }, { action: "member.registered", created_at: new Date(Date.now() - 172800000).toISOString() }] };
  if (/^\/api\/photos\/[^/]+\/comments$/.test(path) && (!init.method || init.method === "GET")) return { comments: [{ id: "c1", body: "This one always makes me smile.", author_id: "2", author: "David Okafor", created_at: new Date(Date.now() - 86400000).toISOString() }], reactions: [{ emoji: "heart", count: 4, mine: 1 }] };
  if (path.startsWith("/api/photos?album=")) return { photos: photos.slice(0, 7) };
  if (path.startsWith("/api/photos")) return { photos, nextCursor: null };
  if (path === "/api/albums") return { albums };
  if (path === "/api/family-tree") return { people: familyPeople, relationships: familyRelationships };
  if (/^\/api\/family-tree\/people\/[^/]+\/photos$/.test(path)) return { photos: photos.slice(0, 6) };
  if (/^\/api\/photos\/[^/]+\/people$/.test(path) && (!init.method || init.method === "GET")) return { people: familyPeople.slice(0, 2) };
  if (path.startsWith("/api/timeline")) return { photos };
  if (path.startsWith("/api/search")) return { photos: photos.slice(0, 5), albums: albums.slice(0, 2) };
  if (path === "/api/admin/members") return { members: [{ id: "1", email: "admin@family.local", display_name: "Amara Okafor", role: "admin", status: "active", created_at: "2026-01-01" }, { id: "2", email: "david@family.local", display_name: "David Okafor", role: "member", status: "active", created_at: "2026-02-01" }], invitations: [] };
  if (path === "/api/admin/storage") return { photo_count: 94, total_bytes: 2684354560, quota_bytes: 8589934592, warning_percent: 80, estimated_monthly_usd: 0, can_seed_samples: true };
  if (path === "/api/admin/settings") return { settings: { site_name: "Family Vault", preserve_originals: "true", max_upload_bytes: "20971520", storage_quota_bytes: "8589934592", storage_warning_percent: "80", members_can_create_albums: "true" } };
  if (/^\/api\/admin\/members\/[^/]+\/recovery$/.test(path) && init.method === "POST") return { recoveryPath: "/recover?token=preview-recovery-token" };
  if (path === "/api/admin/dev/seed" && init.method === "POST") return { imported: 6, skipped: 0, albumId: "dev-unsplash-samples" };
  if (["POST", "PATCH", "DELETE"].includes(init.method || "")) return { ok: true, id: "preview" };
  return {};
}

export function post<T>(path: string, body?: unknown): Promise<T> { return request(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }); }
export function patch<T>(path: string, body: unknown): Promise<T> { return request(path, { method: "PATCH", body: JSON.stringify(body) }); }
export function remove<T>(path: string): Promise<T> { return request(path, { method: "DELETE" }); }
