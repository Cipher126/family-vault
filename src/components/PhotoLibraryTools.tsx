import { FormEvent, useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Album, patch, post, cachedRequest } from "../lib/api";

type Memory = { id: string; title: string; story: string; event_date: string | null; photo_count: number };
export default function PhotoLibraryTools({ query, onQuery, albums, selectedIds, action, onActionHandled, onUpdated }: {
  query: string; onQuery: (value: string) => void; albums: Album[]; selectedIds: Set<string>; action: "memory" | "edit" | null; onActionHandled: () => void; onUpdated: () => void;
}) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [mode, setMode] = useState<"memory" | "edit" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => { if (action) { setError(""); setMode(action); onActionHandled(); } }, [action, onActionHandled]);
  const filters = new URLSearchParams(query);
  useEffect(() => { let active = true; cachedRequest<{ memories: Memory[] }>("/api/memories").then((data) => { if (active) setMemories(data.memories); }).catch((reason) => { if (active) setError(reason.message); }); return () => { active = false; }; }, [reload]);
  const change = (name: string, value: string) => { const params = new URLSearchParams(query); if (value) params.set(name,value); else params.delete(name); onQuery(params.toString()); };
  const activeMemory = memories.find((memory) => memory.id === filters.get("memory"));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const photoIds = [...selectedIds];
      if (mode === "memory") {
        const result = await post<{ id: string }>("/api/memories", { photoIds, title:data.get("title"), story:data.get("story"), eventDate:data.get("eventDate") });
        setReload((n) => n + 1); onQuery(new URLSearchParams({ memory:result.id }).toString());
      } else {
        const body: Record<string, unknown> = { photoIds };
        for (const field of ["caption","eventDescription","dateTaken"]) if (data.get(`apply-${field}`)) body[field] = data.get(field);
        if (Object.keys(body).length === 1) throw new Error("Tick at least one detail to change.");
        await patch("/api/photos/bulk",body);
      }
      setMode(null); onUpdated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save."); } finally { setBusy(false); }
  };
  return <>
    <div className="library-filterbar">
      <select aria-label="Sort photographs" value={filters.get("sort") || "uploaded"} onChange={(e) => change("sort",e.target.value)}><option value="uploaded">Recently uploaded</option><option value="taken-newest">Date taken: newest</option><option value="taken-oldest">Date taken: oldest</option></select>
      <button className="library-filter-toggle" aria-expanded={filterOpen} aria-controls="library-filter-panel" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={16} />Filters{[...filters.keys()].filter((key) => key !== "sort").length > 0 && <b>{[...filters.keys()].filter((key) => key !== "sort").length}</b>}</button>
    </div>
    {filterOpen && <div className="library-filter-layer"><button className="library-filter-scrim" aria-label="Dismiss filters" onClick={() => setFilterOpen(false)} /><section id="library-filter-panel" className="library-filter-panel" role="dialog" aria-modal="true" aria-labelledby="filter-panel-title" onKeyDown={(e) => { if (e.key === "Escape") setFilterOpen(false); }}><header><h2 id="filter-panel-title">Filter photographs</h2><button className="icon-button" aria-label="Close filters" onClick={() => setFilterOpen(false)}><X size={20} /></button></header><div className="library-filters">
      <label>Uploaded<select value={filters.get("recent") || ""} onChange={(e) => change("recent",e.target.value)}><option value="">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
      <label>Album<select value={filters.get("album") || ""} onChange={(e) => change("album",e.target.value)}><option value="">All albums</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="library-filter-wide">Memory<select value={filters.get("memory") || ""} onChange={(e) => change("memory",e.target.value)}><option value="">All memories</option>{memories.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.photo_count})</option>)}</select></label>
      <label>Taken from<input type="date" value={filters.get("from") || ""} onChange={(e) => change("from",e.target.value)} /></label>
      <label>Taken to<input type="date" value={filters.get("to") || ""} onChange={(e) => change("to",e.target.value)} /></label>
      <label className="library-check"><input type="checkbox" checked={filters.get("undated") === "1"} onChange={(e) => change("undated",e.target.checked ? "1" : "")} />No capture date</label>
      <button className="member-action" onClick={() => onQuery("")}>Reset filters</button>
    </div><button className="button primary wide" onClick={() => setFilterOpen(false)}>Show photographs</button></section></div>}
    {activeMemory && <section className="memory-story"><p className="eyebrow">SHARED MEMORY{activeMemory.event_date ? ` · ${activeMemory.event_date}` : ""}</p><h2>{activeMemory.title}</h2>{activeMemory.story && <p>{activeMemory.story}</p>}<small>Individual photograph dates are preserved.</small></section>}
    {error && !mode && <p className="library-error" role="alert">{error}</p>}
    {mode && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="library-dialog-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setMode(null); }}><div className="modal"><header><div><p className="eyebrow">{selectedIds.size} PHOTOGRAPHS</p><h2 id="library-dialog-title">{mode === "memory" ? "Create a shared memory" : "Edit selected details"}</h2></div><button className="icon-button dialog-close" aria-label="Close dialog" disabled={busy} onClick={() => setMode(null)}><X /></button></header>
      <form className="stack-form" onSubmit={submit}>{mode === "memory" ? <>
        <label>Memory title<input name="title" required maxLength={160} autoFocus placeholder="Christmas 2025" /></label>
        <label>The shared story<textarea name="story" maxLength={2000} rows={4} /></label>
        <label>Event date (optional)<input name="eventDate" type="date" /></label><p>Each photograph keeps its original capture date and caption.</p>
      </> : <><p>Only ticked fields will change for every selected photo. A ticked field left blank clears that detail.</p>{[["caption","Caption"],["eventDescription","Photo story"],["dateTaken","Date taken"]].map(([field,label]) => <label key={field}><span className="library-check"><input type="checkbox" name={`apply-${field}`} />Apply {label.toLowerCase()} to all selected</span>{field === "eventDescription" ? <textarea name={field} maxLength={500} rows={3} /> : <input name={field} type={field === "dateTaken" ? "date" : "text"} maxLength={500} />}</label>)}</>}
      {error && <p className="library-error" role="alert">{error}</p>}<button className="button primary wide" disabled={busy}>{busy ? "Saving…" : mode === "memory" ? "Create memory" : "Save selected details"}</button></form>
    </div></div>}
  </>;
}
