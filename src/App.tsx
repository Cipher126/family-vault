import {usePhotoCollection,appendPhotos,PhotoPage} from "./lib/usePhotoCollection";
import { lazy, Suspense, useLayoutEffect, createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Album as AlbumIcon, AlertTriangle, Archive, Camera, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, Eye, EyeOff, Heart, Home, Image, Images, Info, LibraryBig, LockKeyhole, LogOut, Mail, Maximize2, Menu, MessageCircle, Minimize2, MoreVertical, Network, PartyPopper, Pencil, Plus, Search, Settings, ShieldCheck, Smile, Sparkles, Trash2, Upload, UserRound, Users, X } from "lucide-react";
import { Album, cachedRequest, peekRequestCache, setRequestCacheUser, Comment, FamilyPerson, FamilyRelationship, patch, Photo, photoUrl, post, Reaction, remove, request, User } from "./lib/api";
import { preparePhoto } from "./lib/images";
import { clearLibrarySnapshots, readLibrarySnapshot, saveLibrarySnapshot, readViewSnapshot, saveViewSnapshot } from "./lib/librarySnapshot";
import PhotoGrid from "./components/PhotoGrid";
import ZoomablePhoto from "./components/ZoomablePhoto";
import MobilePhotoActions from "./components/MobilePhotoActions";
import AlbumCoverPicker from "./components/AlbumCoverPicker";
import PhotoSelectionActions from "./components/PhotoSelectionActions";
import PhotoLibraryTools from "./components/PhotoLibraryTools";
const FamilyTreeCanvas = lazy(() => import("./components/ConnectedFamilyTree"));

type AuthState = { user: User | null; loading: boolean; refresh: () => Promise<void> };
const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: async () => undefined });
const useAuth = () => useContext(AuthContext);
const SiteNameContext = createContext("Family Vault");

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [siteName, setSiteName] = useState("Family Vault");
  const refresh = async () => { try { const nextUser = (await request<{ user: User | null }>("/api/auth/me")).user; if (!nextUser) clearLibrarySnapshots(); setRequestCacheUser(nextUser ? `${nextUser.id}:${nextUser.role}` : ""); setUser(nextUser); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); request<{ siteName: string }>("/api/config").then((config) => setSiteName(config.siteName)).catch(() => undefined); const updateName = (event: Event) => setSiteName((event as CustomEvent<string>).detail); window.addEventListener("family-vault-name", updateName); return () => window.removeEventListener("family-vault-name", updateName); }, []);
  const value = useMemo(() => ({ user, loading, refresh }), [user, loading]);
  return <SiteNameContext.Provider value={siteName}><AuthContext.Provider value={value}><Routes>
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/recover" element={<AuthPage mode="recover" />} />
    <Route path="/setup" element={<AuthPage mode="setup" />} />
    <Route path="/*" element={<Protected><Shell /></Protected>} />
  </Routes></AuthContext.Provider></SiteNameContext.Provider>;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash"><Brand /><div className="loader" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function Brand() { const siteName = useContext(SiteNameContext); return <div className="brand"><span className="brand-mark"><Archive size={21} /></span><span><b>{siteName}</b><small>Our stories, kept close</small></span></div>; }

function AuthPage({ mode }: { mode: "login" | "register" | "recover" | "setup" }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "register") values.token = params.get("invite") || values.token;
    if (mode === "recover") values.token = params.get("token") || values.token;
    try { await post(`/api/${mode === "login" ? "auth/login" : mode === "register" ? "auth/register" : mode === "recover" ? "auth/recover" : "setup"}`, values); if (mode === "recover") navigate("/login?recovered=1"); else { await refresh(); navigate("/"); } }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to continue."); }
    finally { setBusy(false); }
  };
  return <main className="auth-page">
    <section className="auth-story"><Brand /><figure className="auth-memory-card"><div className="auth-memory-photo"><img src="https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=84" alt="A family spending time together outdoors" /><span><LockKeyhole size={15} />Private by design</span></div><figcaption><b>Keep the moments that matter</b><small>One private home for every chapter.</small></figcaption></figure><div className="auth-quote"><Sparkles size={25} /><h1>Every family has a story worth preserving.</h1><p>A quiet, private place for the photographs and moments that made you who you are.</p></div></section>
    <section className="auth-form-wrap"><form className="auth-card" onSubmit={submit}>
      <p className="eyebrow">{mode === "login" ? "WELCOME HOME" : mode === "register" ? "YOU'VE BEEN INVITED" : mode === "recover" ? "ACCOUNT RECOVERY" : "FIRST-TIME SETUP"}</p>
      <h2>{mode === "login" ? "Sign in to your family" : mode === "register" ? "Join your family vault" : mode === "recover" ? "Choose a new password" : "Create the first administrator"}</h2>
      <p className="muted">{mode === "login" ? "Your memories are waiting for you." : "Use a strong, unique password with at least 12 characters."}</p>
      {(mode === "register" || mode === "setup") && <label>Your name<input name="displayName" autoComplete="name" required placeholder="How family knows you" /></label>}
      {mode !== "recover" && <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>}
      <label>Password<div className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} placeholder="••••••••••••" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      {mode === "register" && !params.get("invite") && <label>Invitation code<input name="token" required /></label>}
      {mode === "recover" && !params.get("token") && <label>Recovery code<input name="token" required /></label>}
      {mode === "setup" && <label>One-time setup token<input name="token" required /></label>}
      {mode === "login" && params.get("recovered") === "1" && <Notice tone="success">Password updated. You can sign in now.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Enter Family Vault" : mode === "recover" ? "Update password" : "Continue"}</button>
      {mode === "login" && <p className="auth-help">Accounts are invitation-only. Ask your family administrator for access.</p>}
    </form></section>
  </main>;
}

const nav = [
  ["/", Home, "Home"], ["/gallery", Images, "Photos"], ["/albums", AlbumIcon, "Albums"],
  ["/family-tree", Network, "Family tree"], ["/timeline", Clock3, "Timeline"], ["/search", Search, "Search"]
] as const;

function Shell() {
  const { user, refresh } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [uploader, setUploader] = useState(false);
  const location = useLocation();
  useEffect(() => setMobile(false), [location.pathname]);
  const logout = async () => { await post("/api/auth/logout"); clearLibrarySnapshots(); await refresh(); };
  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? "open" : ""}`}><Brand /><button className="close-mobile icon-button" onClick={() => setMobile(false)}><X /></button>
      <nav>{nav.map(([href, Icon, text]) => <NavLink key={href} to={href} end={href === "/"}><Icon size={19} />{text}</NavLink>)}
      {user?.role === "admin" && <NavLink to="/admin"><ShieldCheck size={19} />Admin</NavLink>}</nav>
      <div className="sidebar-footer"><div className="avatar">{user?.displayName.charAt(0).toUpperCase()}</div><span><b>{user?.displayName}</b><small>{user?.role === "admin" ? "Family administrator" : "Family member"}</small></span><button className="icon-button" aria-label="Sign out" onClick={logout}><LogOut size={18} /></button></div>
    </aside>
    {mobile && <button className="scrim" onClick={() => setMobile(false)} aria-label="Close menu" />}
    <main className="main"><header className="mobile-header"><button className="icon-button" onClick={() => setMobile(true)}><Menu /></button><Brand /><button className="icon-button accent" onClick={() => setUploader(true)}><Plus /></button></header>
      <Routes>
        <Route path="/" element={<Dashboard onUpload={() => setUploader(true)} />} />
        <Route path="/gallery" element={<Gallery onUpload={() => setUploader(true)} />} />
        <Route path="/albums" element={<Albums />} />
        <Route path="/family-tree" element={<FamilyTree />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/admin" element={user?.role === "admin" ? <Admin /> : <Navigate to="/" />} />
      </Routes>
    </main>
    {uploader && <UploadDialog onClose={() => setUploader(false)} />}
  </div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}

function Dashboard({ onUpload }: { onUpload: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<{ photos: Photo[]; memories: Photo[]; albums: Album[]; activity: Array<{ action: string; created_at: string }> } | null>(() => peekRequestCache("/api/dashboard") || null);
  const [selected, setSelected] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const heroStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cachedRequest<typeof data>("/api/dashboard").then(setData).catch(() => setData({ photos: [], memories: [], albums: [], activity: [] })); }, []);
  const slides = data?.memories.length ? data.memories : data?.photos || [];
  const allPhotos = useMemo(() => data ? Array.from(new Map([...data.memories, ...data.photos].map((photo) => [photo.id, photo])).values()) : [], [data]);
  useEffect(() => {
    if (heroPaused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setHeroIndex((current) => {
      const next = (current + 1) % slides.length;
      heroStripRef.current?.scrollTo({ left: heroStripRef.current.clientWidth * next, behavior: "smooth" });
      return next;
    }), 3000);
    return () => window.clearInterval(timer);
  }, [heroPaused, slides.length]);
  useEffect(() => { if (heroIndex >= slides.length) setHeroIndex(0); }, [heroIndex, slides.length]);
  const showPhoto = (photo: Photo) => setSelected(allPhotos.findIndex((item) => item.id === photo.id));
  const memoryLabel = (photo: Photo) => photo.memory_reason === "on_this_day" ? "On this day" : photo.memory_reason === "this_month" ? `From ${new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date())}` : "Recent highlight";
  return <div className="page dashboard"><PageHeader eyebrow={greeting()} title={`${greetingWord()}, ${user?.displayName.split(" ")[0]}`} description="Come in. Your family memories are safe here." action={<button className="button primary" onClick={onUpload}><Upload size={17} />Add memories</button>} />
    {!data ? <Skeleton /> : data.photos.length === 0 ? <Empty onUpload={onUpload} /> : <>
      {slides.length > 0 && <section className="hero-memory" aria-roledescription="carousel" aria-label="Featured family memories" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false); }}><div ref={heroStripRef} className="hero-memory-strip" onScroll={() => { const strip = heroStripRef.current; if (!strip) return; const next = Math.round(strip.scrollLeft / strip.clientWidth); if (next !== heroIndex && next >= 0 && next < slides.length) setHeroIndex(next); }}>{slides.map((hero, index) => <button key={hero.id} className="hero-memory-open" onClick={() => showPhoto(hero)} aria-label={`Open featured memory ${index + 1} of ${slides.length}`}><img loading={index === heroIndex ? "eager" : "lazy"} decoding="async" fetchPriority={index === heroIndex ? "high" : "low"} src={photoUrl(hero.id, Math.abs(index-heroIndex)<=1 ? "gallery" : "thumbnail")} alt={hero.caption || "Featured family memory"} /><div className="hero-overlay"><p className="eyebrow">{memoryLabel(hero).toUpperCase()}</p><h2>{hero.caption || "A moment worth keeping"}</h2><p>{prettyDate(hero.date_taken || hero.created_at)}</p></div></button>)}</div>{slides.length > 1 && <div className="hero-indicators" aria-hidden="true">{slides.map((photo, index) => <span key={photo.id} className={index === heroIndex ? "active" : ""} />)}</div>}</section>}
      <SectionTitle title="Made for your family" /><div className="memory-reel">{slides.slice(0, 6).map((photo) => <button key={photo.id} onClick={() => showPhoto(photo)}><img src={photoUrl(photo.id, "thumbnail")} alt={photo.caption || "Curated family memory"} /><span><small>{memoryLabel(photo)}</small><b>{photo.caption || prettyDate(photo.date_taken || photo.created_at)}</b></span></button>)}</div>
      <SectionTitle title="Recently added" link="/gallery" /> <PhotoGrid photos={data.photos.slice(1)} onSelect={showPhoto} />
      <div className="dashboard-columns"><section><SectionTitle title="Family albums" link="/albums" /> <AlbumList albums={data.albums} /></section><section className="activity"><SectionTitle title="Recent activity" /><div className="activity-list">{data.activity.map((item, index) => <div key={index}><span className="activity-dot"><Heart size={14} /></span><p>{activityText(item.action)}<small>{relativeDate(item.created_at)}</small></p></div>)}</div></section></div>
      {selected !== null && <Viewer photos={allPhotos} index={selected} setIndex={setSelected} onClose={() => setSelected(null)} onUpdated={(updated) => setData((current) => current ? { ...current, photos: current.photos.map((item) => item.id === updated.id ? updated : item), memories: current.memories.map((item) => item.id === updated.id ? { ...updated, memory_reason: item.memory_reason } : item) } : current)} onDeleted={(id) => { setData((current) => current ? { ...current, photos: current.photos.filter((item) => item.id !== id), memories: current.memories.filter((item) => item.id !== id) } : current); setSelected(null); }} />}
    </>}
  </div>;
}

function Gallery({ onUpload }: { onUpload: () => void }) {
  const { user } = useAuth();
  const [initialSnapshot] = useState(() => readLibrarySnapshot(user!.id));
  const [photos, setPhotos] = useState<Photo[]>(initialSnapshot?.photos || []); const [loading, setLoading] = useState(!initialSnapshot); const [loadingMore, setLoadingMore] = useState(false); const [nextCursor, setNextCursor] = useState<string | null>(initialSnapshot?.nextCursor || null); const [selected, setSelected] = useState<number | null>(null);
  const [totalCount,setTotalCount] = useState<number | null>(initialSnapshot?.total ?? null);
  const [refreshing,setRefreshing] = useState(true);
  const moreRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false); const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); const [albums, setAlbums] = useState<Album[]>([]); const [bulkBusy, setBulkBusy] = useState(false); const [bulkMessage, setBulkMessage] = useState(""); const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [filters, setFilters] = useState(initialSnapshot?.query || ""); const [displayedFilters, setDisplayedFilters] = useState(initialSnapshot?.query || ""); const [revision, setRevision] = useState(0); const [galleryError, setGalleryError] = useState("");
  useEffect(() => {
    let active = true;
    const cached = readLibrarySnapshot(user!.id,filters);
    setRefreshing(true);setTotalCount(cached?.total ?? null);setLoading(!cached); setPhotos(cached?.photos || []); setDisplayedFilters(filters); setSelected(null); setNextCursor(cached?.nextCursor || null); setSelectedIds(new Set()); setGalleryError("");
    request<{ photos: Photo[]; nextCursor: string | null; total:number }>(`/api/photos?${filters}`).then((data) => {
      if (!active) return;
      setTotalCount(data.total);
      const unchangedFirstPage = cached && data.nextCursor && data.photos.every((photo,index) => cached.photos[index]?.id === photo.id);
      setPhotos(unchangedFirstPage ? [...data.photos,...cached.photos.slice(data.photos.length)] : data.photos);
      setNextCursor(unchangedFirstPage && cached.photos.length > data.photos.length ? cached.nextCursor : data.nextCursor);
    }).catch((reason) => { if (active) setGalleryError(reason.message); }).finally(() => { if (active) {setLoading(false);setRefreshing(false);} });
    return () => { active = false; };
  }, [filters, revision, user!.id]);
  useEffect(() => { if (!loading && !galleryError && displayedFilters === filters) saveLibrarySnapshot(user!.id,{ query:filters,photos,nextCursor,...(totalCount === null ? {} : {total:totalCount}) }); },[photos,nextCursor,totalCount,filters,displayedFilters,loading,galleryError,user!.id]);
  useEffect(() => { const reload = () => setRevision((n) => n + 1); window.addEventListener("family-vault-uploaded",reload); return () => window.removeEventListener("family-vault-uploaded",reload); }, []);
  useEffect(() => { cachedRequest<{ albums: Album[] }>("/api/albums").then((data) => setAlbums(data.albums)).catch(() => setAlbums([])); }, []);
  const activeFilters = useRef(filters); activeFilters.current = filters;
  const loadMore = async () => { if (!nextCursor || loadingMore) return; setLoadingMore(true); const snapshot = filters; try { const data = await request<{ photos: Photo[]; nextCursor: string | null; total:number }>(`/api/photos?${filters}&cursor=${encodeURIComponent(nextCursor)}`); if (activeFilters.current === snapshot) { setTotalCount(data.total); setPhotos((items) => [...items, ...data.photos]); setNextCursor(data.nextCursor); } } catch (reason) { if (activeFilters.current === snapshot) setGalleryError(reason instanceof Error ? reason.message : "Unable to load photographs."); } finally { setLoadingMore(false); } };
  const [libraryAction, setLibraryAction] = useState<"memory" | "edit" | null>(null);
  useEffect(() => {
    if (!moreRef.current || !nextCursor || loading || refreshing || loadingMore || galleryError) return;
    const observer = new IntersectionObserver(entries => {if(entries.some(entry=>entry.isIntersecting))void loadMore();},{rootMargin:"600px"});
    observer.observe(moreRef.current);return ()=>observer.disconnect();
  },[nextCursor,loading,refreshing,loadingMore,galleryError,filters,photos.length]);
  const toggleSelection = (photo: Photo) => setSelectedIds((current) => { const next = new Set(current); if (next.has(photo.id)) next.delete(photo.id); else next.add(photo.id); return next; });
  const leaveSelection = () => { setSelecting(false); setSelectedIds(new Set()); setBulkMessage(""); };
  const addSelectedToAlbum = async (albumId: string) => { if (!albumId || !selectedIds.size) return; setBulkBusy(true); setBulkMessage(""); try { await Promise.all([...selectedIds].map((photoId) => post(`/api/albums/${albumId}/photos`, { photoId }))); setBulkMessage(`${selectedIds.size} ${selectedIds.size === 1 ? "photograph" : "photographs"} added to the album.`); } catch (reason) { setBulkMessage(reason instanceof Error ? reason.message : "Unable to add the selected photographs."); } finally { setBulkBusy(false); } };
  const deletableIds = [...selectedIds].filter((id) => user?.role === "admin" || photos.find((photo) => photo.id === id)?.owner_id === user?.id);
  const deleteSelected = async () => { setBulkBusy(true); setBulkMessage(""); try { for (const id of deletableIds) await remove(`/api/photos/${id}`); setPhotos((items) => items.filter((item) => !deletableIds.includes(item.id))); setTotalCount(count => count === null ? null : Math.max(0,count-deletableIds.length)); setConfirmBulkDelete(false); leaveSelection(); } catch (reason) { setBulkMessage(reason instanceof Error ? reason.message : "Unable to delete all selected photographs."); setConfirmBulkDelete(false); } finally { setBulkBusy(false); } };
  return <div className={`page gallery-page ${selecting ? "gallery-is-selecting" : ""}`}><PageHeader eyebrow="THE FAMILY COLLECTION" title="All photographs" description={totalCount === null ? "Loading photograph count…" : `${totalCount} ${totalCount === 1 ? "photograph" : "photographs"}${filters ? " matching your filters" : " in your library"}`} action={<div className="gallery-header-actions"><button className="button secondary" aria-label={selecting ? "Cancel selection" : "Select photos"} onClick={() => selecting ? leaveSelection() : setSelecting(true)}><Images size={17} />{selecting ? "Cancel" : "Select"}</button><button className="button primary" onClick={onUpload}><Upload size={17} />Upload</button></div>} />
    <PhotoLibraryTools query={filters} onQuery={setFilters} albums={albums} selectedIds={selectedIds} action={libraryAction} onActionHandled={() => setLibraryAction(null)} onUpdated={() => { leaveSelection(); setRevision((n) => n + 1); }} />
    {galleryError && <Notice tone="error">{galleryError}</Notice>}
    {selecting && <PhotoSelectionActions count={selectedIds.size} allSelected={selectedIds.size === photos.length && photos.length > 0} albums={albums} busy={bulkBusy} message={bulkMessage} canEdit={selectedIds.size > 0 && deletableIds.length === selectedIds.size} deletableCount={deletableIds.length} onSelectAll={() => setSelectedIds(selectedIds.size === photos.length ? new Set() : new Set(photos.map((photo) => photo.id)))} onAlbum={(id) => void addSelectedToAlbum(id)} onMemory={() => setLibraryAction("memory")} onEdit={() => setLibraryAction("edit")} onDelete={() => setConfirmBulkDelete(true)} onClose={leaveSelection} />}
    {loading ? <Skeleton /> : photos.length ? <PhotoGrid photos={photos} onSelect={(photo) => selecting ? toggleSelection(photo) : setSelected(photos.findIndex((p) => p.id === photo.id))} selectionMode={selecting} selectedIds={selectedIds} /> : filters ? <div className="soft-empty"><h3>No matching photographs</h3><p>Try changing or resetting the filters.</p></div> : <Empty onUpload={onUpload} compact />}
    {nextCursor && <div ref={moreRef} className="gallery-auto-more" role="status" aria-live="polite">{loadingMore ? "Loading photographs…" : ""}</div>}
    {selected !== null && <Viewer photos={photos} index={selected} setIndex={setSelected} onClose={() => setSelected(null)} onUpdated={(updated) => setPhotos((items) => items.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => { setTotalCount(count => count === null ? null : Math.max(0,count-1)); setPhotos((items) => items.filter((item) => item.id !== id)); setSelected(null); }} />}
    {confirmBulkDelete && <ConfirmationDialog title={`Delete ${deletableIds.length} selected ${deletableIds.length === 1 ? "photograph" : "photographs"}?`} description="Their comments and album references will also be permanently removed. Photographs owned by other members are excluded unless you are an administrator." confirmLabel="Delete selected" busy={bulkBusy} onCancel={() => setConfirmBulkDelete(false)} onConfirm={() => void deleteSelected()} />}
  </div>;
}


export function Viewer({ photos, index, setIndex, onClose, onDeleted, onUpdated, albumContext }: { photos: Photo[]; index: number; setIndex: (n: number) => void; onClose: () => void; onDeleted?: (id: string) => void; onUpdated?: (photo: Photo) => void; albumContext?: { album: Album; canManage: boolean; onCoverChanged: (photoId: string) => void; onRemoved: (photoId: string) => void } }) {
  const photo = photos[index];
  const viewerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const nativeFullscreen = useRef(false);
  const { user } = useAuth();
  const [social, setSocial] = useState<{ comments: Comment[]; reactions: Reaction[] }>({ comments: [], reactions: [] });
  const [socialError, setSocialError] = useState("");
  const [sending, setSending] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumId, setAlbumId] = useState("");
  const [albumMessage, setAlbumMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [albumBusy, setAlbumBusy] = useState(false);
  const [confirmAlbumRemoval, setConfirmAlbumRemoval] = useState(false);
  const [fullscreenView, setFullscreenView] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"notes" | "people" | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [photoZoomed, setPhotoZoomed] = useState(false);
  const gestureStart = useRef({x:0,y:0});
  useEffect(() => { setActionsOpen(false); setMobilePanel(null); },[photo.id]);
  useEffect(() => {
    const hide = () => setControlsVisible(false);
    const show = () => setControlsVisible(true);
    const visibility = () => setControlsVisible(!document.hidden);
    window.addEventListener("blur",hide); window.addEventListener("focus",show); document.addEventListener("visibilitychange",visibility);
    return () => { window.removeEventListener("blur",hide);window.removeEventListener("focus",show);document.removeEventListener("visibilitychange",visibility); };
  },[]);
  const [familyPeople, setFamilyPeople] = useState<FamilyPerson[]>([]);
  const [taggedPeople, setTaggedPeople] = useState<FamilyPerson[]>([]);
  const [personId, setPersonId] = useState("");
  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);
  const leaveFullscreen = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* The CSS fallback can still close normally. */ }
    }
    nativeFullscreen.current = false;
    setFullscreenView(false);
  };
  const closeViewer = async () => { await leaveFullscreen(); onClose(); };
  const goToPhoto = (nextIndex: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, nextIndex));
    setIndex(next);
    if (stripRef.current) stripRef.current.scrollTo({ left: stripRef.current.clientWidth * next, behavior: "smooth" });
  };
  const toggleFullscreen = async () => {
    if (fullscreenView) { await leaveFullscreen(); return; }
    setFullscreenView(true);
    if (viewerRef.current?.requestFullscreen) {
      try { await viewerRef.current.requestFullscreen(); nativeFullscreen.current = true; }
      catch { nativeFullscreen.current = false; }
    }
  };
  const selectedPhotoId=useRef(photo.id),socialRequest=useRef(0);
  selectedPhotoId.current=photo.id;
  useEffect(()=>{setSocial({comments:[],reactions:[]});setSocialError("");setTaggedPeople([]);setAlbumId("");setAlbumMessage("");},[photo.id]);
  const loadSocial = async (signal?:AbortSignal) => {
    const id=photo.id,turn=++socialRequest.current;
    try {const data=await request<{comments:Comment[];reactions:Reaction[]}>(`/api/photos/${id}/comments`,{signal});if(selectedPhotoId.current===id && turn===socialRequest.current && !signal?.aborted){setSocial(data);setSocialError("");}}
    catch(error){if(selectedPhotoId.current===id && turn===socialRequest.current && !signal?.aborted)setSocialError(error instanceof Error ? error.message : "Unable to load family notes.");}
  };
  useEffect(()=>{const controller=new AbortController();if(matchMedia("(min-width: 901px)").matches || actionsOpen || mobilePanel==="notes")void loadSocial(controller.signal);return ()=>controller.abort();},[photo.id,actionsOpen,mobilePanel]);
  useEffect(() => { cachedRequest<{ albums: Album[] }>("/api/albums").then((data) => setAlbums(data.albums)).catch(() => setAlbums([])); }, []);
  useEffect(() => { cachedRequest<{ people: FamilyPerson[] }>("/api/family-tree").then((data) => setFamilyPeople(data.people)).catch(() => setFamilyPeople([])); }, []);
  useEffect(()=>{
    setPersonId("");const controller=new AbortController(),id=photo.id;
    if(matchMedia("(min-width: 901px)").matches || mobilePanel==="people")void request<{people:FamilyPerson[]}>(`/api/photos/${id}/people`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted && selectedPhotoId.current===id)setTaggedPeople(data.people);}).catch(()=>{if(!controller.signal.aborted && selectedPhotoId.current===id)setTaggedPeople([]);});
    return ()=>controller.abort();
  },[photo.id,mobilePanel]);
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && nativeFullscreen.current) {
        nativeFullscreen.current = false;
        setFullscreenView(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  useEffect(() => {
    if (!stripRef.current) return;
    const strip = stripRef.current;
    const frame = requestAnimationFrame(() => strip.scrollTo({ left: strip.clientWidth * index }));
    const useWheelForStrip = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener("wheel", useWheelForStrip, { passive: false });
    return () => { cancelAnimationFrame(frame); strip.removeEventListener("wheel", useWheelForStrip); };
  }, [fullscreenView]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (confirmDelete) setConfirmDelete(false);
      else if (confirmAlbumRemoval) setConfirmAlbumRemoval(false);
      else if (editing) setEditing(false);
      else if (actionsOpen) { setActionsOpen(false); setControlsVisible(true); }
      else if (mobilePanel) setMobilePanel(null);
      else if (document.fullscreenElement) return;
      else if (fullscreenView) setFullscreenView(false);
      else void closeViewer();
    }
    if (!confirmDelete && e.key === "ArrowLeft" && index > 0) goToPhoto(index - 1);
    if (!confirmDelete && e.key === "ArrowRight" && index < photos.length - 1) goToPhoto(index + 1);
  }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [confirmAlbumRemoval, confirmDelete, editing, actionsOpen, mobilePanel, fullscreenView, index, photos.length]);
  const reaction = (emoji: Reaction["emoji"]) => social.reactions.find((item) => item.emoji === emoji);
  const toggle = async (emoji: Reaction["emoji"]) => { await post(`/api/photos/${photo.id}/reactions`, { emoji }); await loadSocial(); };
  const comment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSending(true);
    const form = event.currentTarget; const body = String(new FormData(form).get("body") || "").trim();
    if (!body) { setSending(false); return; }
    try { await post(`/api/photos/${photo.id}/comments`, { body }); form.reset(); await loadSocial(); }
    catch (error) { setSocialError(error instanceof Error ? error.message : "Unable to add your note."); }
    finally { setSending(false); }
  };
  const deleteNote = async (id: string) => { await remove(`/api/comments/${id}`); await loadSocial(); };
  const addToAlbum = async () => { if (!albumId) return; setAlbumMessage(""); try { await post(`/api/albums/${albumId}/photos`, { photoId: photo.id }); setAlbumMessage("Added to album."); } catch (error) { setAlbumMessage(error instanceof Error ? error.message : "Unable to add this photograph."); } };
  const tagPerson = async () => { if (!personId) return; const selectedId=photo.id; try { await post(`/api/photos/${photo.id}/people`, { personId }); if(selectedPhotoId.current!==selectedId)return; const person = familyPeople.find((item) => item.id === personId); if (person) setTaggedPeople((items) => items.some((item) => item.id === person.id) ? items : [...items, person]); setPersonId(""); } catch (error) { setSocialError(error instanceof Error ? error.message : "Unable to tag this relative."); } };
  const untagPerson = async (id: string) => { const selectedId=photo.id; try { await remove(`/api/photos/${photo.id}/people/${id}`); if(selectedPhotoId.current!==selectedId)return; setTaggedPeople((items) => items.filter((item) => item.id !== id)); } catch (error) { setSocialError(error instanceof Error ? error.message : "Unable to remove this tag."); } };
  const canDelete = user?.role === "admin" || photo.owner_id === user?.id;
  const savePhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingEdit(true); setEditError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await patch(`/api/photos/${photo.id}`, values);
      onUpdated?.({ ...photo, caption: String(values.caption || "").trim(), event_description: String(values.eventDescription || "").trim(), date_taken: String(values.dateTaken || "") || null });
      setEditing(false);
    } catch (error) { setEditError(error instanceof Error ? error.message : "Unable to save this memory."); }
    finally { setSavingEdit(false); }
  };
  const setAlbumCover = async () => {
    if (!albumContext) return; setAlbumBusy(true); setSocialError("");
    try { await patch(`/api/albums/${albumContext.album.id}`, { coverPhotoId: photo.id }); albumContext.onCoverChanged(photo.id); }
    catch (error) { setSocialError(error instanceof Error ? error.message : "Unable to update the album cover."); }
    finally { setAlbumBusy(false); }
  };
  const removeFromAlbum = async () => {
    if (!albumContext) return; setAlbumBusy(true); setSocialError("");
    try { await remove(`/api/albums/${albumContext.album.id}/photos/${photo.id}`); albumContext.onRemoved(photo.id); setConfirmAlbumRemoval(false); }
    catch (error) { setSocialError(error instanceof Error ? error.message : "Unable to remove this photograph from the album."); setConfirmAlbumRemoval(false); }
    finally { setAlbumBusy(false); }
  };
  const deleteMemory = async () => {
    setDeleting(true); setSocialError("");
    try { await remove(`/api/photos/${photo.id}`); await leaveFullscreen(); onDeleted?.(photo.id); if (!onDeleted) onClose(); }
    catch (error) { setSocialError(error instanceof Error ? error.message : "Unable to delete this photograph."); setDeleting(false); setConfirmDelete(false); }
  };
  return <div ref={viewerRef} className={`viewer ${fullscreenView ? "fullscreen-view" : ""} ${mobilePanel ? "mobile-details-open" : ""} ${controlsVisible || actionsOpen || mobilePanel ? "" : "mobile-controls-hidden"}`} role="dialog" aria-modal="true" aria-label={photo.caption || "Family photograph"}>
    <div className="viewer-toolbar" onFocusCapture={() => setControlsVisible(true)}>
      <button className="viewer-mobile-more" aria-label="Photo actions" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => { setActionsOpen(!actionsOpen); setControlsVisible(true); }}><MoreVertical /></button>
      <button className="viewer-expand" onClick={() => void toggleFullscreen()} aria-label={fullscreenView ? "Exit fullscreen" : "View fullscreen"} aria-pressed={fullscreenView} title={fullscreenView ? "Exit fullscreen" : "View fullscreen"}>{fullscreenView ? <Minimize2 /> : <Maximize2 />}</button>
      <button onClick={() => void closeViewer()} aria-label="Close viewer" title="Close viewer"><X /></button>
    </div>
    <div className="viewer-stage">
      <div ref={stripRef} className={`viewer-image ${photoZoomed ? "photo-zoomed" : ""}`} onPointerDown={(event) => { gestureStart.current = {x:event.clientX,y:event.clientY}; }} onPointerUp={(event) => { if (!photoZoomed && Math.abs(event.clientX-gestureStart.current.x)+Math.abs(event.clientY-gestureStart.current.y)<10) setControlsVisible((visible) => !visible); }} onTouchMove={() => setControlsVisible(false)} onScroll={() => { if (!stripRef.current) return; const next = Math.round(stripRef.current.scrollLeft / stripRef.current.clientWidth); if (next !== index && next >= 0 && next < photos.length) setIndex(next); }}>
        {photos.map((item, photoIndex) => <div className="viewer-slide" key={item.id}>{Math.abs(photoIndex-index)<=1 && <ZoomablePhoto active={photoIndex === index} loading="eager" src={photoUrl(item.id, "gallery")} originalSrc={photoUrl(item.id, "viewer")} alt={item.caption || `Family photograph ${photoIndex + 1}`} onZoomChange={setPhotoZoomed} onDismiss={() => void closeViewer()} />}</div>)}
      </div>
      {!fullscreenView && index > 0 && <button className="viewer-prev" onClick={() => goToPhoto(index - 1)} aria-label="Previous photograph"><ChevronLeft /></button>}
      {!fullscreenView && index < photos.length - 1 && <button className="viewer-next" onClick={() => goToPhoto(index + 1)} aria-label="Next photograph"><ChevronRight /></button>}
      {fullscreenView && <span className="viewer-position" aria-live="polite">{index + 1} / {photos.length}</span>}
    </div>
    <MobilePhotoActions open={actionsOpen} albums={albums} reactions={social.reactions} downloadUrl={photoUrl(photo.id,"original")} canEdit={canDelete} canManageAlbum={!!albumContext?.canManage} onClose={() => setActionsOpen(false)} onAlbum={async (id) => { await post(`/api/albums/${id}/photos`,{photoId:photo.id}); }} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)} onReaction={toggle} onNotes={() => setMobilePanel("notes")} onPeople={() => setMobilePanel("people")} onCover={async () => { if (albumContext) { await patch(`/api/albums/${albumContext.album.id}`,{coverPhotoId:photo.id});albumContext.onCoverChanged(photo.id); } }} onRemove={() => setConfirmAlbumRemoval(true)} />
    {mobilePanel && <button className="viewer-mobile-details-scrim" aria-label="Dismiss photo panel" onClick={() => { setMobilePanel(null); setControlsVisible(true); }} />}
    <aside className={mobilePanel ? `mobile-photo-panel-${mobilePanel}` : ""}><header className="viewer-mobile-details-heading"><h2>{mobilePanel === "people" ? "People in this photograph" : "Family notes"}</h2><button className="icon-button" aria-label="Close photo panel" onClick={() => { setMobilePanel(null); setControlsVisible(true); }}><X size={20} /></button></header><p className="eyebrow">MEMORY {index + 1} OF {photos.length}</p><h2>{photo.caption || "Untitled memory"}</h2><p className="muted">{photo.date_taken ? prettyDate(photo.date_taken) : "Date unknown"}</p>{photo.event_description && <p className="memory-story">{photo.event_description}</p>}
      <dl><dt>Shared by</dt><dd>{photo.uploader || "Family"}</dd></dl>
      <a className="button secondary wide" href={photoUrl(photo.id, "original")}><Download size={17} />Download original</a>
      {canDelete && <button className="viewer-edit wide" onClick={() => setEditing(true)}><Pencil size={16} />Edit details</button>}
      {albumContext?.canManage && <div className="album-photo-tools">{albumContext.album.cover_photo_id !== photo.id && <button disabled={albumBusy} onClick={() => void setAlbumCover()}><Image size={16} />Set as album cover</button>}<button className="remove" disabled={albumBusy} onClick={() => setConfirmAlbumRemoval(true)}><X size={16} />Remove from album</button></div>}
      {albums.length > 0 && <div className="album-add"><label htmlFor={`album-${photo.id}`}>Add to an album</label><div><select id={`album-${photo.id}`} value={albumId} onChange={(event) => { setAlbumId(event.target.value); setAlbumMessage(""); }}><option value="">Choose an album…</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select><button onClick={() => void addToAlbum()} disabled={!albumId}><Plus size={16} /></button></div>{albumMessage && <small>{albumMessage}</small>}</div>}
      {familyPeople.length > 0 && <div className="photo-people"><label>People in this memory</label>{taggedPeople.length > 0 && <div className="photo-people-tags">{taggedPeople.map((person) => <span key={person.id}>{familyPersonName(person)}<button aria-label={`Remove ${familyPersonName(person)} tag`} onClick={() => void untagPerson(person.id)}><X size={12} /></button></span>)}</div>}<div><select aria-label="Tag a relative" value={personId} onChange={(event) => setPersonId(event.target.value)}><option value="">Choose a relative…</option>{familyPeople.filter((person) => !taggedPeople.some((tagged) => tagged.id === person.id)).map((person) => <option key={person.id} value={person.id}>{familyPersonName(person)}</option>)}</select><button onClick={() => void tagPerson()} disabled={!personId}><Plus size={16} /></button></div></div>}
      <div className="reaction-row" aria-label="Photo reactions">
        <button className={reaction("heart")?.mine ? "active" : ""} onClick={() => void toggle("heart")}><Heart size={17} />{reaction("heart")?.count || 0}</button>
        <button className={reaction("smile")?.mine ? "active" : ""} onClick={() => void toggle("smile")}><Smile size={17} />{reaction("smile")?.count || 0}</button>
        <button className={reaction("celebrate")?.mine ? "active" : ""} onClick={() => void toggle("celebrate")}><PartyPopper size={17} />{reaction("celebrate")?.count || 0}</button>
      </div>
      {canDelete && <button className="delete-button wide" disabled={deleting} onClick={() => setConfirmDelete(true)}><Trash2 size={16} />{deleting ? "Deleting…" : "Delete photograph"}</button>}
      <section className="comments"><h3><MessageCircle size={17} />Family notes</h3>
        <div className="comment-list">{social.comments.length ? social.comments.map((item) => <article key={item.id}><span>{item.author.slice(0, 1)}</span><p><b>{item.author}</b>{item.body}<small>{relativeDate(item.created_at)}</small></p>{(item.author_id === user?.id || user?.role === "admin") && <button aria-label="Delete comment" onClick={() => void deleteNote(item.id)}><Trash2 size={14} /></button>}</article>) : <p className="comment-empty">Be the first to add a note about this memory.</p>}</div>
        <form className="comment-form" onSubmit={comment}><input name="body" maxLength={1000} placeholder="Share what you remember…" aria-label="New comment" /><button disabled={sending} aria-label="Add comment"><ChevronRight size={18} /></button></form>
        {socialError && <p className="inline-error">{socialError}</p>}
      </section>
    </aside>
    {confirmDelete && <ConfirmationDialog title="Delete this photograph?" description="Its comments and album references will also be permanently removed. This action cannot be undone." confirmLabel="Delete photograph" busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteMemory()} />}
    {confirmAlbumRemoval && albumContext && <ConfirmationDialog title={`Remove from “${albumContext.album.name}”?`} description="The photograph will remain safely stored in Family Vault and in any other albums." confirmLabel="Remove from album" busy={albumBusy} onCancel={() => setConfirmAlbumRemoval(false)} onConfirm={() => void removeFromAlbum()} />}
    {editing && <Modal title="Edit memory details" icon={<Pencil />} onClose={() => setEditing(false)}><form className="stack-form" onSubmit={savePhoto}><label>Caption<input name="caption" maxLength={500} defaultValue={photo.caption} placeholder="What should the family remember?" /></label><label>Date photograph was taken<input name="dateTaken" type="date" defaultValue={photo.date_taken || ""} /></label><label>Event or story<textarea name="eventDescription" rows={4} maxLength={500} defaultValue={photo.event_description || ""} placeholder="Add the occasion, people, or story behind this photograph." /></label>{editError && <Notice tone="error">{editError}</Notice>}<button className="button primary wide" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save memory details"}</button></form></Modal>}
  </div>;
}

function Albums() {
  const { user } = useAuth();
  const [albums, setAlbums] = useState<Album[]>(() => peekRequestCache<{albums:Album[]}>("/api/albums")?.albums || []); const [show, setShow] = useState(false); const [error, setError] = useState("");
  const [selected, setSelected] = useState<Album | null>(null); const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([]); const [albumLoading, setAlbumLoading] = useState(false); const [albumPhotoIndex, setAlbumPhotoIndex] = useState<number | null>(null);
  const [confirmAlbumDelete, setConfirmAlbumDelete] = useState(false); const [deletingAlbum, setDeletingAlbum] = useState(false);
  const [chosenCover, setChosenCover] = useState("");
  const [editingAlbum, setEditingAlbum] = useState(false); const [savingAlbum, setSavingAlbum] = useState(false);
  const load = () => cachedRequest<{ albums: Album[] }>("/api/albums").then((d) => setAlbums(d.albums)); useEffect(() => { void load(); }, []);
  const create = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setError(""); const values = Object.fromEntries(new FormData(e.currentTarget)); try { await post("/api/albums", values); setShow(false); await load(); } catch (err) { setError((err as Error).message); } };
  const [albumCursor,setAlbumCursor] = useState<string | null>(null); const [albumMoreBusy,setAlbumMoreBusy] = useState(false);
  const albumRequest = useRef(0);
  const openAlbum = async (album:Album) => {
    const turn=++albumRequest.current;const path=`/api/photos?album=${encodeURIComponent(album.id)}`;
    const cached=peekRequestCache<{photos:Photo[];nextCursor:string|null}>(path);
    setSelected(album);setAlbumPhotos(cached?.photos || []);setAlbumCursor(cached?.nextCursor || null);setAlbumPhotoIndex(null);setAlbumLoading(!cached);setError("");
    try{const data=await cachedRequest<{photos:Photo[];nextCursor:string|null}>(path);if(turn===albumRequest.current){setAlbumPhotos(data.photos);setAlbumCursor(data.nextCursor);}}
    catch(reason){if(turn===albumRequest.current)setError(reason instanceof Error ? reason.message : "Unable to load this album.");}
    finally{if(turn===albumRequest.current)setAlbumLoading(false);}
  };
  const moreAlbumPhotos = async () => {if(!selected || !albumCursor)return;setAlbumMoreBusy(true);try{const data=await request<{photos:Photo[];nextCursor:string|null}>(`/api/photos?album=${encodeURIComponent(selected.id)}&cursor=${encodeURIComponent(albumCursor)}`);setAlbumPhotos(items=>[...items,...data.photos]);setAlbumCursor(data.nextCursor);}catch(reason){setError(reason instanceof Error ? reason.message : "Unable to load more photographs.");}finally{setAlbumMoreBusy(false);}};
  const deleteAlbum = async () => { if (!selected) return; setDeletingAlbum(true); try { await remove(`/api/albums/${selected.id}`); setConfirmAlbumDelete(false); setSelected(null); setAlbumPhotos([]); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete this album."); setConfirmAlbumDelete(false); } finally { setDeletingAlbum(false); } };
  const saveAlbum = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selected) return; setSavingAlbum(true); setError(""); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await patch(`/api/albums/${selected.id}`, values); const updated = { ...selected, name: String(values.name || "").trim(), description: String(values.description || "").trim(), visibility: values.visibility === "private" ? "private" : "family", cover_photo_id: chosenCover || null, thumbnail_photo_id: chosenCover || albumPhotos[0]?.id || null }; setSelected(updated); setAlbums((items) => items.map((item) => item.id === updated.id ? updated : item)); setEditingAlbum(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update this album."); } finally { setSavingAlbum(false); } };
  const canManageSelected = !!selected && (user?.role === "admin" || selected.owner_id === user?.id);
  return <div className="page"><PageHeader eyebrow="CHAPTERS OF OUR STORY" title="Family albums" description="Gather related moments into chapters everyone can revisit." action={<button className="button primary" onClick={() => setShow(true)}><Plus size={17} />New album</button>} />
    {albums.length ? <div className="album-grid">{albums.map((album, index) => <button type="button" className="album-card" key={album.id} onClick={() => void openAlbum(album)}><div className={`album-cover tone-${index % 4}`}>{(album.thumbnail_photo_id || album.cover_photo_id) ? <img loading="lazy" decoding="async" src={photoUrl((album.thumbnail_photo_id || album.cover_photo_id)!, "thumbnail")} alt="" /> : <AlbumIcon size={32} />}</div><div><h3>{album.name}</h3><p>{album.description || "A family collection"}</p><small>{album.photo_count} photos · {album.creator}</small></div></button>)}</div> : <div className="soft-empty"><AlbumIcon /><h3>Your first chapter starts here</h3><p>Create an album for a reunion, a branch of the family, or a lifetime of ordinary days.</p><button className="button secondary" onClick={() => setShow(true)}>Create an album</button></div>}
    {selected && <Modal title={selected.name} icon={<AlbumIcon />} onClose={() => { setSelected(null); setAlbumPhotos([]); }}><div className="album-dialog"><p>{selected.description || "A family collection"}</p>{albumLoading ? <Skeleton /> : albumPhotos.length ? <PhotoGrid photos={albumPhotos} onSelect={(photo) => setAlbumPhotoIndex(albumPhotos.findIndex((item) => item.id === photo.id))} /> : <div className="soft-empty"><Image /><h3>No photographs yet</h3><p>Open a photograph from the main gallery to add it to this album.</p></div>}{albumCursor && albumPhotos.length >= 100 && <button className="button secondary" disabled={albumMoreBusy} onClick={() => void moreAlbumPhotos()}>{albumMoreBusy ? "Loading…" : "Load more photographs"}</button>}{error && <Notice tone="error">{error}</Notice>}{canManageSelected && <div className="album-danger"><p>Edit this album or remove it without deleting its photographs.</p><span><button className="member-action" onClick={() => { setChosenCover(selected.cover_photo_id || ""); setEditingAlbum(true); }}><Pencil size={15} />Edit album</button><button className="delete-button" onClick={() => setConfirmAlbumDelete(true)}><Trash2 size={16} />Delete album</button></span></div>}</div></Modal>}
    {confirmAlbumDelete && selected && <ConfirmationDialog title={`Delete “${selected.name}”?`} description="The album will be removed, but every photograph inside it will remain safely stored in Family Vault." confirmLabel="Delete album" busy={deletingAlbum} onCancel={() => setConfirmAlbumDelete(false)} onConfirm={() => void deleteAlbum()} />}
    {albumPhotoIndex !== null && selected && <Viewer photos={albumPhotos} index={albumPhotoIndex} setIndex={setAlbumPhotoIndex} onClose={() => setAlbumPhotoIndex(null)} onUpdated={(updated) => setAlbumPhotos((items) => items.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => { setAlbumPhotos((items) => items.filter((item) => item.id !== id)); setAlbumPhotoIndex(null); }} albumContext={{ album: selected, canManage: canManageSelected, onCoverChanged: (photoId) => { const updated = { ...selected, cover_photo_id: photoId, thumbnail_photo_id: photoId }; setSelected(updated); setAlbums((items) => items.map((item) => item.id === updated.id ? updated : item)); }, onRemoved: (photoId) => { setAlbumPhotos((items) => items.filter((item) => item.id !== photoId)); setAlbums((items) => items.map((item) => item.id === selected.id ? { ...item, photo_count: Math.max(0, item.photo_count - 1), cover_photo_id: item.cover_photo_id === photoId ? null : item.cover_photo_id } : item)); setSelected((current) => current ? { ...current, photo_count: Math.max(0, current.photo_count - 1), cover_photo_id: current.cover_photo_id === photoId ? null : current.cover_photo_id } : current); setAlbumPhotoIndex(null); } }} />}
    {editingAlbum && selected && <Modal title="Edit album" icon={<Pencil />} onClose={() => setEditingAlbum(false)}><form className="stack-form" onSubmit={saveAlbum}><AlbumCoverPicker albumId={selected.id} initialPhotos={albumPhotos} value={chosenCover} onChange={setChosenCover} /><label>Album name<input name="name" required maxLength={100} autoFocus defaultValue={selected.name} /></label><label>Description<textarea name="description" rows={3} maxLength={600} defaultValue={selected.description} /></label><label>Who can see it?<select name="visibility" defaultValue={selected.visibility}><option value="family">Everyone in the family</option><option value="private">Only me (and administrators)</option></select></label>{error && <Notice tone="error">{error}</Notice>}<button className="button primary wide" disabled={savingAlbum}>{savingAlbum ? "Saving…" : "Save album"}</button></form></Modal>}
    {show && <Modal title="Create a family album" icon={<AlbumIcon />} onClose={() => setShow(false)}><form className="stack-form" onSubmit={create}><label>Album name<input name="name" required maxLength={100} autoFocus placeholder="e.g. Summer at Grandma's" /></label><label>Description<textarea name="description" rows={3} placeholder="What belongs in this chapter?" /></label><label>Who can see it?<select name="visibility"><option value="family">Everyone in the family</option><option value="private">Only me (and administrators)</option></select></label>{error && <Notice tone="error">{error}</Notice>}<button className="button primary wide">Create album</button></form></Modal>}
  </div>;
}

function FamilyTree() {
  const { user } = useAuth();
  const [people, setPeople] = useState<FamilyPerson[]>([]);
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
  const [selected, setSelected] = useState<FamilyPerson | null>(null);
  const {photos:personPhotos,nextCursor:personCursor,loading:personLoading,loadingMore:personMoreBusy,error:personError,loadMore:loadMorePerson}=usePhotoCollection(selected ? `/api/family-tree/people/${selected.id}/photos` : null);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const load = async () => { const data = await request<{ people: FamilyPerson[]; relationships: FamilyRelationship[] }>("/api/family-tree"); setPeople(data.people); setRelationships(data.relationships); };
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load the family tree.")); }, []);
  useEffect(()=>setSelectedPhoto(null),[selected?.id]);
  const createPerson = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); try { await post("/api/family-tree/people", Object.fromEntries(new FormData(event.currentTarget))); setShowAdd(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add this relative."); } finally { setBusy(false); } };
  const savePerson = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selected) return; setBusy(true); setError(""); try { const values = Object.fromEntries(new FormData(event.currentTarget)); await patch(`/api/family-tree/people/${selected.id}`, values); const updated = { ...selected, first_name: String(values.firstName || ""), last_name: String(values.lastName || ""), nickname: String(values.nickname || ""), gender: String(values.gender || "unspecified") as FamilyPerson["gender"], birth_date: String(values.birthDate || "") || null, death_date: String(values.deathDate || "") || null, biography: String(values.biography || "") }; setSelected(updated); setEditing(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update this relative."); } finally { setBusy(false); } };
  const deletePerson = async () => { if (!selected) return; setBusy(true); try { await remove(`/api/family-tree/people/${selected.id}`); setConfirmDelete(false); setSelected(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove this relative."); setConfirmDelete(false); } finally { setBusy(false); } };
  const related = (person: FamilyPerson) => relationships.flatMap((relation) => {
    if (relation.person_a_id !== person.id && relation.person_b_id !== person.id) return [];
    const otherId = relation.person_a_id === person.id ? relation.person_b_id : relation.person_a_id;
    const other = people.find((item) => item.id === otherId); if (!other) return [];
    const label = relation.relationship === "partner" ? "Partner" : relation.person_a_id === person.id ? "Child" : "Parent";
    return [{ person: other, label }];
  });
  return <div className="page family-tree-page"><PageHeader eyebrow="ROOTS & BRANCHES" title="Our family tree" description="Connect every face to the people, relationships, and memories behind it." action={<button className="button primary" onClick={() => { setError(""); setShowAdd(true); }}><Plus size={17} />Add relative</button>} />
    {error && !showAdd && !selected && <Notice tone="error">{error}</Notice>}
    {people.length ? <Suspense fallback={<Skeleton />}><FamilyTreeCanvas people={people} relationships={relationships} activeId={activePersonId} onActive={(id) => setActivePersonId(id)} onOpenProfile={(person) => { setError(""); setEditing(false); setSelected(person); }} /></Suspense> : <div className="soft-empty family-tree-empty"><Network /><h3>Plant the first branch</h3><p>Add a parent, grandparent, sibling, partner, or child. The living tree will grow and rearrange itself as your family expands.</p><button className="button primary" onClick={() => setShowAdd(true)}><Plus size={16} />Add the first person</button></div>}
    {showAdd && <div className="modal-backdrop"><form className="modal stack-form family-person-form" onSubmit={createPerson}><header><div className="modal-heading"><span className="modal-icon"><Network /></span><div><p className="eyebrow">FAMILY TREE</p><h2>Add a relative</h2></div></div><button type="button" className="icon-button dialog-close" aria-label="Close" onClick={() => setShowAdd(false)}><X /></button></header><div className="person-name-fields"><label>First name<input name="firstName" required autoFocus /></label><label>Last name<input name="lastName" /></label></div><label>Nickname<input name="nickname" placeholder="What family calls them" /></label><label>Gender<select name="gender" defaultValue="unspecified"><option value="unspecified">Not specified</option><option value="female">Female · left of family line</option><option value="male">Male · right of family line</option></select></label><div className="person-name-fields"><label>Born<input name="birthDate" type="date" /></label><label>Died<input name="deathDate" type="date" /></label></div><label>Their story<textarea name="biography" rows={4} placeholder="A few words about their life…" /></label>{people.length > 0 && <div className="relationship-fields"><label>Connect to<select name="relativeTo"><option value="">No connection yet</option>{people.map((person) => <option value={person.id} key={person.id}>{familyPersonName(person)}</option>)}</select></label><label>New relative is their<select name="relation"><option value="child">Child</option><option value="parent">Parent</option><option value="partner">Partner</option></select></label></div>}{error && <Notice tone="error">{error}</Notice>}<button className="button primary wide" disabled={busy}>{busy ? "Adding…" : "Add to family tree"}</button></form></div>}
    {selected && <div className="modal-backdrop"><section className="modal family-person-profile"><header><div className="modal-heading"><PersonPortrait person={selected} /><div><p className="eyebrow">FAMILY PROFILE</p><h2>{familyPersonName(selected)}</h2></div></div><button className="icon-button dialog-close" aria-label="Close" onClick={() => setSelected(null)}><X /></button></header>{editing ? <form className="stack-form" onSubmit={savePerson}><div className="person-name-fields"><label>First name<input name="firstName" defaultValue={selected.first_name} required /></label><label>Last name<input name="lastName" defaultValue={selected.last_name} /></label></div><label>Nickname<input name="nickname" defaultValue={selected.nickname} /></label><label>Gender<select name="gender" defaultValue={selected.gender || "unspecified"}><option value="unspecified">Not specified</option><option value="female">Female · left of family line</option><option value="male">Male · right of family line</option></select></label><div className="person-name-fields"><label>Born<input name="birthDate" type="date" defaultValue={selected.birth_date || ""} /></label><label>Died<input name="deathDate" type="date" defaultValue={selected.death_date || ""} /></label></div><label>Their story<textarea name="biography" rows={5} defaultValue={selected.biography} /></label>{error && <Notice tone="error">{error}</Notice>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div></form> : <><p className="person-lifespan">{lifeSpan(selected)}</p>{selected.biography ? <p className="person-biography">{selected.biography}</p> : <p className="person-biography muted">Add a few words so future generations know their story.</p>}{related(selected).length > 0 && <div className="relative-links">{related(selected).map(({ person, label }) => <button key={`${label}-${person.id}`} onClick={() => setSelected(person)}><small>{label}</small><b>{familyPersonName(person)}</b></button>)}</div>}<div className="profile-actions"><button className="member-action" onClick={() => setEditing(true)}><Pencil size={15} />Edit profile</button>{(user?.role === "admin" || selected.created_by === user?.id) && <button className="member-action danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Remove</button>}</div><div className="section-title compact"><h3>Their memories</h3><span>{personPhotos.length}</span></div>{personError && <Notice tone="error">{personError}</Notice>}{personLoading ? <Skeleton /> : personPhotos.length ? <PhotoGrid photos={personPhotos} onSelect={(photo) => setSelectedPhoto(personPhotos.findIndex((item) => item.id === photo.id))} /> : <div className="person-photo-empty">Tag this relative from any photograph to collect their memories here.</div>}{personCursor && <button className="button secondary wide" disabled={personMoreBusy} onClick={()=>void loadMorePerson()}>{personMoreBusy ? "Loading…" : "Load more photographs"}</button>}</>}{error && !editing && <Notice tone="error">{error}</Notice>}</section></div>}
    {selectedPhoto !== null && <Viewer photos={personPhotos} index={selectedPhoto} setIndex={setSelectedPhoto} onClose={() => setSelectedPhoto(null)} />}
    {confirmDelete && selected && <ConfirmationDialog title={`Remove ${familyPersonName(selected)} from the tree?`} description="Their profile, relationships, and photo tags will be removed. The photographs themselves will stay safely in the vault." confirmLabel="Remove relative" busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deletePerson()} />}
  </div>;
}

function PersonPortrait({ person }: { person: FamilyPerson }) { return person.profile_photo_id ? <img className="person-portrait" src={photoUrl(person.profile_photo_id, "small")} alt="" /> : <span className="person-portrait initials">{person.first_name.charAt(0)}{person.last_name.charAt(0)}</span>; }
function familyPersonName(person: FamilyPerson): string { return `${person.first_name} ${person.last_name}`.trim(); }
function lifeSpan(person: FamilyPerson): string { const born = person.birth_date?.slice(0, 4); const died = person.death_date?.slice(0, 4); return born || died ? `${born || "?"}–${died || "Present"}` : "Dates not added"; }

function Timeline() {
  const {user}=useAuth();
  type Filters={year?:string;month?:string;album?:string;event?:string};
  const [initial]=useState(()=>readViewSnapshot<{photos:Photo[];filters:Filters;scroll:number;nextCursor?:string|null}>(user!.id,"timeline"));
  const [photos,setPhotos]=useState<Photo[]>(initial?.photos || []),[selected,setSelected]=useState<number|null>(null),[albums,setAlbums]=useState<Album[]>([]),[loading,setLoading]=useState(!initial),[filters,setFilters]=useState<Filters>(initial?.filters || {}),[timelineError,setTimelineError]=useState("");
  const [nextCursor,setNextCursor]=useState<string|null>(initial?.nextCursor || null),[loadingMore,setLoadingMore]=useState(false);
  const moreLock=useRef(false);
  const [draftFilters,setDraftFilters]=useState<Filters>(initial?.filters || {});
  const filtered=Object.values(filters).some(Boolean);
  const latest=useRef({photos,filters,nextCursor}),scroll=useRef(initial?.scroll || 0),requestId=useRef(0),restored=useRef(false);
  latest.current={photos,filters,nextCursor};
  const load=async(next:Filters={},restore=false)=>{
    const turn=++requestId.current;setNextCursor(null);setLoading(!photos.length);setTimelineError("");setFilters(next);setDraftFilters(next);
    const query=new URLSearchParams(Object.entries(next).filter(([,value])=>value) as string[][]);
    try{const data=await cachedRequest<PhotoPage>(`/api/timeline${query.size ? `?${query}` : ""}`);if(turn===requestId.current){
      const retained=restore && initial && initial.photos.length>data.photos.length;
      setPhotos(retained ? appendPhotos(data.photos,initial.photos.slice(100)) : data.photos);
      setNextCursor(retained ? initial.nextCursor ?? (data.nextCursor ? String(initial.photos.length) : null) : data.nextCursor);setSelected(null);
    }}
    catch(error){if(turn===requestId.current)setTimelineError(error instanceof Error ? error.message : "Unable to load the timeline.");}
    finally{if(turn===requestId.current)setLoading(false);}
  };
  useEffect(()=>{void load(initial?.filters || {},true);void cachedRequest<{albums:Album[]}>("/api/albums").then(data=>setAlbums(data.albums)).catch(()=>setAlbums([]));},[]);
  useLayoutEffect(()=>{
    let leaving=false;
    const track=()=>{if(!leaving)scroll.current=window.scrollY;};
    const save=()=>saveViewSnapshot(user!.id,"timeline",{...latest.current,scroll:scroll.current});
    const hidden=()=>{if(document.hidden)save();};
    const navigation=(event:MouseEvent)=>{if((event.target as Element)?.closest?.(".sidebar a[href]")){scroll.current=window.scrollY;leaving=true;save();}};
    document.addEventListener("click",navigation,true);
    window.addEventListener("scroll",track,{passive:true});window.addEventListener("pagehide",save);document.addEventListener("visibilitychange",hidden);
    return ()=>{document.removeEventListener("click",navigation,true);window.removeEventListener("scroll",track);window.removeEventListener("pagehide",save);document.removeEventListener("visibilitychange",hidden);save();};
  },[user!.id]);
  useLayoutEffect(()=>{if(!loading && !restored.current){restored.current=true;const frame=requestAnimationFrame(()=>window.scrollTo(0,initial?.scroll || 0));return ()=>cancelAnimationFrame(frame);}},[loading]);
  const loadMoreTimeline=async()=>{
    if(!nextCursor || moreLock.current)return;moreLock.current=true;setLoadingMore(true);setTimelineError("");const turn=requestId.current;
    const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value) as string[][]);query.set("cursor",nextCursor);
    try{const data=await request<PhotoPage>(`/api/timeline?${query}`);if(turn===requestId.current){setPhotos(items=>appendPhotos(items,data.photos));setNextCursor(data.nextCursor);}}
    catch(error){if(turn===requestId.current)setTimelineError(error instanceof Error ? error.message : "Unable to load more photographs.");}
    finally{moreLock.current=false;setLoadingMore(false);}
  };
  const groups = useMemo(() => photos.reduce<Record<string, Photo[]>>((all, photo) => {
    const key = photo.date_taken ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${photo.date_taken}T00:00:00Z`)) : "Undated memories";
    (all[key] ||= []).push(photo);
    return all;
  }, {}), [photos]);
  const applyFilters = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void load({ year: String(values.year || ""), month: String(values.month || ""), album: String(values.album || ""), event: String(values.event || "").trim() }); };
  return <div className="page"><PageHeader eyebrow="THROUGH THE YEARS" title="Family timeline" description="Travel through the moments that shaped your family." /><form className="timeline-filters" onSubmit={applyFilters}><label>Year<input name="year" value={draftFilters.year || ""} onChange={event=>setDraftFilters(current=>({...current,year:event.target.value}))} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="e.g. 1998" /></label><label>Month<select name="month" value={draftFilters.month || ""} onChange={event=>setDraftFilters(current=>({...current,month:event.target.value}))}><option value="">Any month</option>{Array.from({ length: 12 }, (_, index) => { const value = String(index + 1).padStart(2, "0"); return <option value={value} key={value}>{new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2020, index, 1))}</option>; })}</select></label><label>Album<select name="album" value={draftFilters.album || ""} onChange={event=>setDraftFilters(current=>({...current,album:event.target.value}))}><option value="">Any album</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select></label><label>Event or caption<input name="event" value={draftFilters.event || ""} onChange={event=>setDraftFilters(current=>({...current,event:event.target.value}))} placeholder="Birthday, reunion…" /></label><button className="button primary" disabled={loading}><Search size={16} />{loading ? "Loading…" : "Explore"}</button>{filtered && <button type="button" className="button secondary" onClick={(event) => { const form=event.currentTarget.form; if(form)for(const field of Array.from(form.elements)){if(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)field.value="";} void load(); }}>Clear</button>}</form>{timelineError && <Notice tone="error">{timelineError}</Notice>}{loading ? <Skeleton /> : photos.length ? <div className="timeline">{Object.entries(groups).map(([period, items]) => <section key={period}><header><span>{period}</span><i /></header><PhotoGrid photos={items || []} onSelect={(photo) => setSelected(photos.findIndex((item) => item.id === photo.id))} /></section>)}</div> : <div className="soft-empty"><Clock3 /><h3>{filtered ? "No memories match these filters" : "The timeline is waiting"}</h3><p>{filtered ? "Try a different year, month, event, or album." : "Add dates to photographs and your family's story will unfold here."}</p></div>}{nextCursor && <button className="button secondary wide" disabled={loadingMore || loading} onClick={()=>void loadMoreTimeline()}>{loadingMore ? "Loading…" : "Load more photographs"}</button>}{selected !== null && <Viewer photos={photos} index={selected} setIndex={setSelected} onClose={() => setSelected(null)} onUpdated={(updated) => setPhotos((items) => items.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => { setPhotos((items) => items.filter((item) => item.id !== id)); setSelected(null); }} />}</div>;
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ photos: Photo[]; albums: Album[] }>({ photos: [], albums: [] });
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const {photos:albumPhotos,setPhotos:setAlbumPhotos,loading:albumLoading,nextCursor:albumCursor,loadingMore:albumMoreBusy,error:albumError,loadMore:loadMoreAlbum}=usePhotoCollection(selectedAlbum ? `/api/photos?album=${encodeURIComponent(selectedAlbum.id)}&limit=100` : null);
  const [nextCursor,setNextCursor]=useState<string|null>(null),[total,setTotal]=useState(0),[submitted,setSubmitted]=useState(""),[loadingMore,setLoadingMore]=useState(false);
  const moreLock=useRef(false);
  const [albumPhotoIndex, setAlbumPhotoIndex] = useState<number | null>(null);
  const searchRequest = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  useEffect(() => () => searchAbort.current?.abort(), []);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) { setError("Enter at least two characters to search."); return; }
    const requestId = ++searchRequest.current;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setLoading(true); setError(""); setSearched(true); setSelected(null);setSubmitted(term);setNextCursor(null);
    try {
      const next = await request<{ photos: Photo[]; albums: Album[];total:number;nextCursor:string|null }>(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
      if (requestId === searchRequest.current) {setResult(next);setTotal(next.total);setNextCursor(next.nextCursor);}
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (requestId === searchRequest.current) { setResult({ photos: [], albums: [] });setTotal(0); setError(reason instanceof Error ? reason.message : "Search is temporarily unavailable."); }
    } finally { if (requestId === searchRequest.current) setLoading(false); }
  };
  const openAlbum=(album:Album)=>{setAlbumPhotoIndex(null);setSelectedAlbum(album);};
  const loadMoreSearch=async()=>{
    if(!nextCursor || moreLock.current)return;moreLock.current=true;setLoadingMore(true);const turn=searchRequest.current;
    try{const next=await request<{photos:Photo[];albums:Album[];total:number;nextCursor:string|null}>(`/api/search?q=${encodeURIComponent(submitted)}&cursor=${encodeURIComponent(nextCursor)}`,{signal:searchAbort.current?.signal});if(turn===searchRequest.current){setResult(current=>({photos:appendPhotos(current.photos,next.photos),albums:[...new Map([...current.albums,...next.albums].map(album=>[album.id,album])).values()]}));setTotal(next.total);setNextCursor(next.nextCursor);}}
    catch(reason){if(turn===searchRequest.current && !searchAbort.current?.signal.aborted)setError(reason instanceof Error ? reason.message : "Unable to load more results.");}
    finally{moreLock.current=false;setLoadingMore(false);}
  };
  const count=total;
  return <div className="page"><PageHeader eyebrow="FIND A MEMORY" title="Search the archive" description="Look by caption, event, album, month, year, or the person who shared it." /><form className="search-box" onSubmit={search}><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); if (error) setError(""); }} autoFocus aria-label="Search family memories" placeholder="Try “Christmas”, “October 2026”, or “Grandma”…" /><button className="button primary" disabled={loading}>{loading ? "Searching…" : "Search"}</button></form>{error && <Notice tone="error">{error}</Notice>}{loading ? <Skeleton /> : searched && !count && !error ? <div className="soft-empty"><Search /><h3>No memories found</h3><p>Try a shorter phrase, a month or year, an album name, or the name of the person who shared it.</p></div> : <>{searched && count > 0 && <p className="search-summary" role="status">{count} {count === 1 ? "result" : "results"} for “{submitted}”</p>}{result.albums.length > 0 && <><SectionTitle title="Albums" /><AlbumList albums={result.albums} onSelect={(album) => void openAlbum(album)} /></>}{result.photos.length > 0 && <><SectionTitle title="Photographs" /><PhotoGrid photos={result.photos} onSelect={(photo) => setSelected(result.photos.findIndex((item) => item.id === photo.id))} /></>}{nextCursor && <button className="button secondary wide" disabled={loadingMore} onClick={()=>void loadMoreSearch()}>{loadingMore ? "Loading…" : "Load more results"}</button>}</>}{selected !== null && <Viewer photos={result.photos} index={selected} setIndex={setSelected} onClose={() => setSelected(null)} onUpdated={(updated) => setResult((current) => ({ ...current, photos: current.photos.map((item) => item.id === updated.id ? updated : item) }))} onDeleted={(id) => { setResult((current) => ({ ...current, photos: current.photos.filter((item) => item.id !== id) })); setSelected(null); }} />}{selectedAlbum && <Modal title={selectedAlbum.name} icon={<AlbumIcon />} onClose={() => { setSelectedAlbum(null); setAlbumPhotos([]); }}><div className="album-dialog"><p>{selectedAlbum.description || "A family collection"}</p>{albumError && <Notice tone="error">{albumError}</Notice>}{albumLoading ? <Skeleton /> : albumPhotos.length ? <PhotoGrid photos={albumPhotos} onSelect={(photo) => setAlbumPhotoIndex(albumPhotos.findIndex((item) => item.id === photo.id))} /> : <div className="soft-empty"><Image /><h3>No photographs yet</h3><p>This album is waiting for its first memory.</p></div>}{albumCursor && <button className="button secondary wide" disabled={albumMoreBusy} onClick={()=>void loadMoreAlbum()}>{albumMoreBusy ? "Loading…" : "Load more photographs"}</button>}</div></Modal>}{albumPhotoIndex !== null && <Viewer photos={albumPhotos} index={albumPhotoIndex} setIndex={setAlbumPhotoIndex} onClose={() => setAlbumPhotoIndex(null)} onUpdated={(updated) => setAlbumPhotos((items) => items.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => { setAlbumPhotos((items) => items.filter((item) => item.id !== id)); setAlbumPhotoIndex(null); }} />}</div>;
}

function Admin() {
  const [tab, setTab] = useState("members");
  return <div className="page"><PageHeader eyebrow="CARETAKER TOOLS" title="Administration" description="Keep the family archive healthy, private, and within budget." /><div className="tabs">{[["members", Users, "Members"], ["media", LibraryBig, "Media"], ["storage", Archive, "Storage"], ["settings", Settings, "Settings"]].map(([id, Icon, label]) => <button className={tab === id ? "active" : ""} key={id as string} onClick={() => setTab(id as string)}><Icon size={17} />{label as string}</button>)}</div>{tab === "members" ? <Members /> : tab === "media" ? <AdminMedia /> : tab === "storage" ? <Storage /> : <AdminSettings />}</div>;
}

function AdminMedia() {
  const [photos, setPhotos] = useState<Photo[]>([]); const [albums, setAlbums] = useState<Album[]>([]); const [selected, setSelected] = useState<number | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { Promise.all([request<{ photos: Photo[] }>("/api/photos?limit=100"), cachedRequest<{ albums: Album[] }>("/api/albums")]).then(([photoData, albumData]) => { setPhotos(photoData.photos); setAlbums(albumData.albums); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load media." )).finally(() => setLoading(false)); }, []);
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Albums and uploaded media</h2><p>Review recent photographs, edit their details, or remove content from the authenticated viewer.</p></div><NavLink className="button secondary" to="/albums"><AlbumIcon size={17} />Manage albums</NavLink></div>{error && <Notice tone="error">{error}</Notice>}{loading ? <Skeleton /> : <><div className="admin-media-summary"><Metric label="Loaded photographs" value={String(photos.length)} /><Metric label="Albums" value={String(albums.length)} /></div>{photos.length ? <PhotoGrid photos={photos} onSelect={(photo) => setSelected(photos.findIndex((item) => item.id === photo.id))} /> : <div className="soft-empty"><Image /><h3>No media to review</h3><p>Uploaded photographs will appear here.</p></div>}</>}{selected !== null && <Viewer photos={photos} index={selected} setIndex={setSelected} onClose={() => setSelected(null)} onUpdated={(updated) => setPhotos((items) => items.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => { setPhotos((items) => items.filter((item) => item.id !== id)); setSelected(null); }} />}</section>;
}

function Members() {
  type Member = { id: string; email: string; display_name: string; role: string; status: string; created_at: string };
  type Invitation = { id: string; email: string | null; role: string; expires_at: string; used_at: string | null; revoked_at: string | null; created_at: string };
  const { user } = useAuth();
  const [data, setData] = useState<{ members: Member[]; invitations: Invitation[] }>({ members: [], invitations: [] }); const [shareLink, setShareLink] = useState<{ url: string; note: string } | null>(null); const [error, setError] = useState(""); const [showInvite, setShowInvite] = useState(false); const [inviting, setInviting] = useState(false); const [inviteToRevoke, setInviteToRevoke] = useState<Invitation | null>(null); const [revokingInvite, setRevokingInvite] = useState(false); const load = () => request<typeof data>("/api/admin/members").then(setData); useEffect(() => { void load(); }, []);
  const createInvite = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setInviting(true); setError(""); const values = Object.fromEntries(new FormData(event.currentTarget)); const email = String(values.email || "").trim(); const days = Number(values.days || 7); try { const result = await post<{ invitePath: string }>("/api/admin/invitations", { email: email || undefined, days, role: values.role }); setShowInvite(false); setShareLink({ url: `${location.origin}${result.invitePath}`, note: email ? `Share this one-time invitation privately with ${email}. It expires in ${days} days.` : `Share this one-time invitation privately. It expires in ${days} days.` }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create an invitation."); } finally { setInviting(false); } };
  const createRecovery = async (member: Member) => { setError(""); try { const result = await post<{ recoveryPath: string }>(`/api/admin/members/${member.id}/recovery`); setShareLink({ url: `${location.origin}${result.recoveryPath}`, note: `Send this only to ${member.display_name}. It expires in 2 hours and replaces any earlier recovery link.` }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create a recovery link."); } };
  const update = async (member: Member, changes: Partial<Pick<Member, "role" | "status">>) => { setError(""); try { await patch(`/api/admin/members/${member.id}`, { role: changes.role || member.role, status: changes.status || member.status }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update this member."); } };
  const revokeInvite = async () => { if (!inviteToRevoke) return; setRevokingInvite(true); setError(""); try { await remove(`/api/admin/invitations/${inviteToRevoke.id}`); setInviteToRevoke(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke this invitation."); setInviteToRevoke(null); } finally { setRevokingInvite(false); } };
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Family members</h2><p>Access is invitation-only. Revoking a member immediately ends all active sessions.</p></div><button className="button primary" onClick={() => setShowInvite(true)}><UserRound size={17} />Invite member</button></div>{shareLink && <div className="invite-box"><p>{shareLink.note}</p><code>{shareLink.url}</code><button onClick={() => void navigator.clipboard.writeText(shareLink.url)}>Copy link</button></div>}{error && <Notice tone="error">{error}</Notice>}<div className="member-list">{data.members.map(member => <div key={member.id}><div className="avatar">{member.display_name[0]}</div><span><b>{member.display_name}{member.id === user?.id ? " (you)" : ""}</b><small>{member.email}</small></span><span className={`status ${member.status}`}>{member.status}</span><select aria-label={`Role for ${member.display_name}`} value={member.role} disabled={member.id === user?.id} onChange={(event) => void update(member, { role: event.target.value })}><option value="member">Member</option><option value="admin">Admin</option></select><span className="member-actions"><button className="member-action" disabled={member.id === user?.id} onClick={() => void createRecovery(member)}>Recovery</button><button className={`member-action ${member.status === "active" ? "danger" : ""}`} disabled={member.id === user?.id} onClick={() => void update(member, { status: member.status === "active" ? "revoked" : "active" })}>{member.status === "active" ? "Revoke" : "Restore"}</button></span></div>)}</div>{data.invitations.length > 0 && <section className="invitation-list"><h3>Recent invitations</h3>{data.invitations.map((invitation) => { const status = invitationStatus(invitation); return <div key={invitation.id}><span><b>{invitation.email || "General family invitation"}</b><small>{invitation.role} · expires {prettyDate(invitation.expires_at)}</small></span><span className={`status ${status}`}>{status}</span>{status === "active" ? <button className="member-action danger" onClick={() => setInviteToRevoke(invitation)}>Revoke</button> : <span />}</div>; })}</section>}{showInvite && <Modal title="Invite someone you trust" icon={<Mail />} onClose={() => setShowInvite(false)}><form className="stack-form invite-form" onSubmit={createInvite}><p>Invitations are single-use. Enter an email to reserve this one for a specific person, or leave it blank for a general family invitation.</p><label>Email address <span>optional</span><input name="email" type="email" autoFocus autoComplete="email" placeholder="family@example.com" /></label><label>Role<select name="role" defaultValue="member"><option value="member">Family member</option><option value="admin">Administrator</option></select></label><label>Expires after<select name="days" defaultValue="7"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label><button className="button primary wide" disabled={inviting}>{inviting ? "Creating invitation…" : "Create private invitation"}</button></form></Modal>}{inviteToRevoke && <ConfirmationDialog title="Revoke this invitation?" description="The existing invitation link will stop working immediately. You can create a new one later." confirmLabel="Revoke invitation" busy={revokingInvite} onCancel={() => setInviteToRevoke(null)} onConfirm={() => void revokeInvite()} />}</section>;
}

function Storage() {
  type StorageData = { photo_count: number; total_bytes: number; quota_bytes: number; warning_percent: number; estimated_monthly_usd: number; can_seed_samples?: boolean };
  const [data, setData] = useState<StorageData | null>(null); const [seeding, setSeeding] = useState(false); const [seedMessage, setSeedMessage] = useState("");
  const load = () => request<StorageData>("/api/admin/storage").then(setData); useEffect(() => { void load(); }, []);
  const seed = async () => { setSeeding(true); setSeedMessage(""); try { const result = await post<{ imported: number; skipped: number }>("/api/admin/dev/seed"); setSeedMessage(`${result.imported} sample photographs imported${result.skipped ? `; ${result.skipped} already existed` : ""}.`); await load(); } catch (reason) { setSeedMessage(reason instanceof Error ? reason.message : "Unable to import sample photographs."); } finally { setSeeding(false); } };
  if (!data) return <Skeleton />; const percent = Math.min(100, data.total_bytes / data.quota_bytes * 100);
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Storage overview</h2><p>Database-tracked usage; provider bills remain authoritative.</p></div><div className="export-actions"><a className="button secondary" href="/api/admin/export"><Download size={17} />Metadata</a><a className="button primary" href="/api/admin/archive"><Archive size={17} />Full archive</a></div></div><div className="metric-grid"><Metric label="Photographs" value={String(data.photo_count)} /><Metric label="Stored media" value={formatBytes(data.total_bytes)} /><Metric label="Family quota" value={formatBytes(data.quota_bytes)} /><Metric label="Estimated R2 storage" value={`$${data.estimated_monthly_usd.toFixed(2)}/mo`} /></div><div className="quota"><span style={{ width: `${percent}%` }} /><p>{percent.toFixed(1)}% of your configured family limit</p></div>{data.can_seed_samples && <div className="sample-import"><div><b>Development sample library</b><p>Import six real Unsplash photographs into local R2 and a sample album. Re-running is safe and will skip existing samples.</p></div><button className="button secondary" disabled={seeding} onClick={() => void seed()}>{seeding ? "Importing…" : "Load sample photos"}</button>{seedMessage && <small>{seedMessage}</small>}</div>}<Notice tone="info">Download a full archive regularly and keep it on an independent drive. It contains metadata and the best available copy of every photograph.</Notice></section>;
}

function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null); const [saved, setSaved] = useState(false); const [error, setError] = useState(""); useEffect(() => { request<{ settings: Record<string, string> }>("/api/admin/settings").then(d => setSettings(d.settings)).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load settings.")); }, []); if (!settings) return error ? <Notice tone="error">{error}</Notice> : <Skeleton />;
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setError(""); const form = Object.fromEntries(new FormData(e.currentTarget)); try { await patch("/api/admin/settings", form); window.dispatchEvent(new CustomEvent("family-vault-name", { detail: String(form.site_name || "Family Vault") })); setSaved(true); setTimeout(() => setSaved(false), 2500); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save settings."); } };
  return <section className="admin-panel narrow"><div className="panel-heading"><div><h2>Vault settings</h2><p>Simple limits that keep costs predictable.</p></div></div><form className="stack-form" onSubmit={submit}><label>Site name<input name="site_name" required maxLength={80} defaultValue={settings.site_name} /></label><label>Maximum single photo (bytes)<input name="max_upload_bytes" type="number" min="1000000" max="100000000" defaultValue={settings.max_upload_bytes} /></label><label>Family storage quota (bytes)<input name="storage_quota_bytes" type="number" min="100000000" defaultValue={settings.storage_quota_bytes} /></label><label>Warning threshold (%)<input name="storage_warning_percent" type="number" min="50" max="99" defaultValue={settings.storage_warning_percent} /></label><input type="hidden" name="preserve_originals" value="false" /><label className="check"><input name="preserve_originals" type="checkbox" value="true" defaultChecked={settings.preserve_originals === "true"} />Preserve original files in addition to optimized copies</label><input type="hidden" name="members_can_create_albums" value="false" /><label className="check"><input name="members_can_create_albums" type="checkbox" value="true" defaultChecked={settings.members_can_create_albums !== "false"} />Allow family members to create albums</label>{error && <Notice tone="error">{error}</Notice>}<button className="button primary">{saved ? "Saved" : "Save settings"}</button></form></section>;
}

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null); const [files, setFiles] = useState<Array<{id:number;file:File}>>([]); const [progress, setProgress] = useState<Record<number, string>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const sequence=useRef(0);
  const chooseFiles=(chosen:File[])=>{if(busy)return;setFiles(chosen.map(file=>({id:++sequence.current,file})));setProgress({});setError("");};
  const run = async (queue = files.filter((item) => progress[item.id] !== "Complete")) => { setBusy(true); setError(""); for (const {id,file} of queue) { try { setProgress(p => ({ ...p, [id]: "Preparing…" })); const prepared = await preparePhoto(file); const init = await post<{ id: string; preserveOriginal: boolean; upload: { gallery: string; thumbnail: string; small?:string|null; original: string | null } }>("/api/photos/init", { filename: file.name, mimeType: file.type, originalBytes: file.size, galleryBytes: prepared.gallery.size, smallBytes: prepared.small.size, thumbnailBytes: prepared.thumbnail.size, width: prepared.width, height: prepared.height, hash: prepared.hash, dateTaken: prepared.dateTaken }); setProgress(p => ({ ...p, [id]: "Uploading…" })); const uploads = [fetch(init.upload.gallery, { method: "PUT", headers: { "Content-Type": prepared.gallery.type, "Content-Length": String(prepared.gallery.size) }, body: prepared.gallery }), fetch(init.upload.thumbnail, { method: "PUT", headers: { "Content-Type": prepared.thumbnail.type, "Content-Length": String(prepared.thumbnail.size) }, body: prepared.thumbnail })]; if(init.upload.small)uploads.push(fetch(init.upload.small,{method:"PUT",headers:{"Content-Type":prepared.small.type},body:prepared.small})); if (init.preserveOriginal && init.upload.original) uploads.push(fetch(init.upload.original, { method: "PUT", headers: { "Content-Type": file.type, "Content-Length": String(file.size) }, body: file })); const responses = await Promise.all(uploads); if (responses.some(r => !r.ok)) throw new Error("An upload did not complete."); await post(`/api/photos/${init.id}/complete`); window.dispatchEvent(new Event("family-vault-uploaded")); setProgress(p => ({ ...p, [id]: "Complete" })); } catch (err) { setProgress(p => ({ ...p, [id]: "Failed" })); setError((err as Error).message); } } setBusy(false); };
  const remaining = files.filter((item) => progress[item.id] !== "Complete").length;
  const hasFailed = files.some((item) => progress[item.id] === "Failed");
  return <Modal title="Add family memories" icon={<Upload />} onClose={busy ? () => undefined : onClose}><div className="upload-dialog"><button className="dropzone" disabled={busy} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseFiles(Array.from(e.dataTransfer.files)); }}><span><Camera /></span><h3>Choose photographs</h3><p>or drag them here · JPEG, PNG, or WebP</p></button><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={e => chooseFiles(Array.from(e.target.files || []))} />{files.length > 0 && <div className="upload-list">{files.map(f => <div key={f.id}><Image size={18} /><span>{f.file.name}<small>{formatBytes(f.file.size)}</small></span>{progress[f.id] === "Failed" ? <button className="upload-retry" disabled={busy} onClick={() => void run([f])}>Retry</button> : <b>{progress[f.id] || "Ready"}</b>}</div>)}</div>}{error && <Notice tone="error">{error}</Notice>}<button className="button primary wide" disabled={!remaining || busy} onClick={() => void run()}>{busy ? "Preserving memories…" : !remaining ? "All photographs uploaded" : hasFailed ? "Retry failed uploads" : `Upload ${remaining} ${remaining === 1 ? "photo" : "photos"}`}</button><p className="privacy-note"><ShieldCheck size={15} /> Photos are optimized in your browser, then sent through authenticated private storage.</p></div></Modal>;
}

function Modal({ title, icon, children, onClose }: { title: string; icon?: ReactNode; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal"><header><div className="modal-heading">{icon && <span className="modal-icon">{icon}</span>}<div><p className="eyebrow">FAMILY VAULT</p><h2 id="modal-title">{title}</h2></div></div><button type="button" className="icon-button dialog-close" aria-label="Close dialog" title="Close" onClick={onClose}><X /></button></header>{children}</div></div>; }
function ConfirmationDialog({ title, description, confirmLabel, busy, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="modal-backdrop confirmation-layer" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description"><div className="confirmation-dialog"><button className="icon-button dialog-close" aria-label="Cancel and close dialog" disabled={busy} onClick={onCancel}><X size={20} /></button><span className="confirmation-icon"><AlertTriangle /></span><div><p className="eyebrow">PLEASE CONFIRM</p><h2 id="confirmation-title">{title}</h2><p id="confirmation-description">{description}</p></div><div className="dialog-actions"><button className="button secondary" autoFocus disabled={busy} onClick={onCancel}>Keep it</button><button className="button danger-action" disabled={busy} onClick={onConfirm}><Trash2 size={17} />{busy ? "Deleting…" : confirmLabel}</button></div></div></div>; }
function Notice({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) { const Icon = tone === "error" ? CircleAlert : tone === "success" ? CheckCircle2 : Info; return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><Icon size={18} /><span>{children}</span></div>; }
function Empty({ onUpload, compact }: { onUpload: () => void; compact?: boolean }) { return <div className={`empty ${compact ? "compact" : ""}`}><div className="empty-icon"><Camera /></div><p className="eyebrow">A FRESH BEGINNING</p><h2>Your family story starts with one photograph.</h2><p>Add a favorite memory. It will appear here for everyone you invite.</p><button className="button primary" onClick={onUpload}><Upload size={17} />Add the first memory</button></div>; }
function Skeleton() { return <div className="skeleton"><span /><span /><span /><span /></div>; }
function SectionTitle({ title, link }: { title: string; link?: string }) { return <div className="section-title"><h2>{title}</h2>{link && <NavLink to={link}>See all <ChevronRight size={16} /></NavLink>}</div>; }
function AlbumList({ albums, onSelect }: { albums: Album[]; onSelect?: (album: Album) => void }) { return <div className="album-list">{albums.map((album, index) => { const content = <><span className={`mini-cover tone-${index % 4}`}>{(album.thumbnail_photo_id || album.cover_photo_id) ? <img loading="lazy" decoding="async" src={photoUrl((album.thumbnail_photo_id || album.cover_photo_id)!, "small")} alt="" /> : <AlbumIcon size={18} />}</span><p><b>{album.name}</b><small>{album.photo_count || 0} photographs</small></p><ChevronRight size={18} /></>; return onSelect ? <button type="button" className="album-list-item" key={album.id} onClick={() => onSelect(album)}>{content}</button> : <div key={album.id}>{content}</div>; })}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><p>{label}</p><strong>{value}</strong></div>; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING"; }
function greetingWord() { const hour = new Date().getHours(); return hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"; }
function prettyDate(value?: string | null) { if (!value) return "Date unknown"; return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(value)); }
function relativeDate(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); return days < 1 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`; }
function activityText(action: string) { return ({ "photo.uploaded": "A new photograph was added", "album.created": "A new album was created", "member.registered": "A family member joined", "invitation.created": "A family invitation was prepared" } as Record<string, string>)[action] || "The family archive was updated"; }
function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${units[i]}`; }
function invitationStatus(invitation: { expires_at: string; used_at: string | null; revoked_at: string | null }) { return invitation.revoked_at ? "revoked" : invitation.used_at ? "used" : new Date(invitation.expires_at).getTime() <= Date.now() ? "expired" : "active"; }

