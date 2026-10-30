import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Focus, LayoutGrid, Sprout, TreePine } from "lucide-react";
import { FamilyPerson, FamilyRelationship, photoUrl } from "../lib/api";
import realBranch from "../assets/family-tree/real-branch.png";
import realTrunk from "../assets/family-tree/real-trunk.png";

type Props = { people: FamilyPerson[]; relationships: FamilyRelationship[]; activeId: string | null; onActive: (id: string) => void; onOpenProfile: (person: FamilyPerson) => void };
type ViewMode = "story" | "overview" | "branch";
type Generation = { level: number; people: FamilyPerson[] };
type Household = { id: string; parents: FamilyPerson[]; children: FamilyPerson[] };

const nameOf = (person: FamilyPerson) => `${person.first_name} ${person.last_name}`.trim();
const initialsOf = (person: FamilyPerson) => `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`;

function descendantsOf(id: string, relationships: FamilyRelationship[]) {
  const visible = new Set([id]); let changed = true;
  while (changed) {
    changed = false;
    relationships.forEach((relation) => {
      if (relation.relationship === "partner" && (visible.has(relation.person_a_id) || visible.has(relation.person_b_id))) {
        if (!visible.has(relation.person_a_id) || !visible.has(relation.person_b_id)) changed = true;
        visible.add(relation.person_a_id); visible.add(relation.person_b_id);
      }
      if (relation.relationship === "parent" && visible.has(relation.person_a_id) && !visible.has(relation.person_b_id)) { visible.add(relation.person_b_id); changed = true; }
    });
  }
  relationships.forEach((relation) => { if (relation.relationship === "parent" && visible.has(relation.person_b_id)) visible.add(relation.person_a_id); });
  return visible;
}

function generationsFor(people: FamilyPerson[], relationships: FamilyRelationship[], focusedId: string | null): Generation[] {
  const visibleIds = focusedId ? descendantsOf(focusedId, relationships) : new Set(people.map((person) => person.id));
  const visiblePeople = people.filter((person) => visibleIds.has(person.id));
  const level = new Map(visiblePeople.map((person) => [person.id, 0]));
  for (let pass = 0; pass < visiblePeople.length + 2; pass += 1) relationships.forEach((relation) => {
    if (!visibleIds.has(relation.person_a_id) || !visibleIds.has(relation.person_b_id)) return;
    if (relation.relationship === "parent") level.set(relation.person_b_id, Math.max(level.get(relation.person_b_id) || 0, (level.get(relation.person_a_id) || 0) + 1));
    else { const shared = Math.max(level.get(relation.person_a_id) || 0, level.get(relation.person_b_id) || 0); level.set(relation.person_a_id, shared); level.set(relation.person_b_id, shared); }
  });
  const groups = visiblePeople.reduce<Map<number, FamilyPerson[]>>((all, person) => { const key = level.get(person.id) || 0; all.set(key, [...(all.get(key) || []), person]); return all; }, new Map());
  const partnerOf = (id: string) => relationships.filter((item) => item.relationship === "partner" && (item.person_a_id === id || item.person_b_id === id)).map((item) => item.person_a_id === id ? item.person_b_id : item.person_a_id);
  return Array.from(groups.entries()).sort(([a], [b]) => a - b).map(([generation, members]) => {
    const memberIds = new Set(members.map((person) => person.id)); const used = new Set<string>(); const arranged: FamilyPerson[] = [];
    [...members].sort((a, b) => String(a.birth_date || "9999").localeCompare(String(b.birth_date || "9999")) || nameOf(a).localeCompare(nameOf(b))).forEach((person) => {
      if (used.has(person.id)) return; arranged.push(person); used.add(person.id);
      partnerOf(person.id).filter((id) => memberIds.has(id) && !used.has(id)).forEach((id) => { const partner = members.find((item) => item.id === id); if (partner) { arranged.push(partner); used.add(id); } });
    });
    return { level: generation, people: arranged };
  });
}

function householdsFor(people: FamilyPerson[], relationships: FamilyRelationship[]): Household[] {
  const byId = new Map(people.map((person) => [person.id, person])); const childParents = new Map<string, string[]>();
  relationships.filter((item) => item.relationship === "parent").forEach((item) => childParents.set(item.person_b_id, [...(childParents.get(item.person_b_id) || []), item.person_a_id]));
  const households = new Map<string, Set<string>>();
  childParents.forEach((parents, childId) => { const key = [...new Set(parents)].sort().join("+"); if (key) households.set(key, new Set([...(households.get(key) || []), childId])); });
  return Array.from(households.entries()).map(([id, childIds]) => ({ id, parents: id.split("+").map((parentId) => byId.get(parentId)).filter(Boolean) as FamilyPerson[], children: [...childIds].map((childId) => byId.get(childId)).filter(Boolean) as FamilyPerson[] })).sort((a, b) => b.children.length - a.children.length);
}

function chapterName(index: number, total: number) { if (index === 0) return "The roots"; if (index === total - 1) return "The newest branches"; return index === 1 ? "Their children" : `Generation ${index + 1}`; }

export default function FamilyTreeExperience({ people, relationships, activeId, onActive, onOpenProfile }: Props) {
  const [mode, setMode] = useState<ViewMode>("story"); const [revealed, setRevealed] = useState<Set<number>>(new Set([0])); const [currentChapter, setCurrentChapter] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null); const active = activeId ? people.find((person) => person.id === activeId) || null : null;
  const generations = useMemo(() => generationsFor(people, relationships, mode === "branch" ? activeId : null), [people, relationships, mode, activeId]);
  const households = useMemo(() => householdsFor(people, relationships), [people, relationships]);
  useEffect(() => {
    setRevealed(new Set([0])); setCurrentChapter(0); if (mode === "overview") return;
    const root = storyRef.current; if (!root) return;
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (!entry.isIntersecting) return; const index = Number((entry.target as HTMLElement).dataset.chapter || 0); setRevealed((items) => new Set([...items, index])); setCurrentChapter(index); }), { rootMargin: "-28% 0px -42%", threshold: .06 });
    root.querySelectorAll("[data-chapter]").forEach((section) => observer.observe(section)); return () => observer.disconnect();
  }, [mode, generations.length]);
  const selectMode = (next: ViewMode) => { if (next === "branch" && !activeId) return; setMode(next); requestAnimationFrame(() => storyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };

  return <section className="ancestry-experience" aria-label="Family ancestry experience">
    <header className="ancestry-toolbar"><div className="ancestry-view-switch" aria-label="Family tree view">
      <button className={mode === "story" ? "active" : ""} onClick={() => selectMode("story")}><TreePine size={15}/>Story</button>
      <button className={mode === "overview" ? "active" : ""} onClick={() => selectMode("overview")}><LayoutGrid size={15}/>Overview</button>
      <button className={mode === "branch" ? "active" : ""} disabled={!activeId} onClick={() => selectMode("branch")}><Focus size={15}/>Focused branch</button>
    </div><p><Sprout size={15}/><span>{mode === "overview" ? `${households.length} family households` : `${people.length} people across ${generations.length} generations`}</span></p>
      {mode !== "overview" && <div className="ancestry-progress"><span style={{ width: `${((currentChapter + 1) / Math.max(1, generations.length)) * 100}%` }}/><small>{currentChapter + 1} / {generations.length}</small></div>}
    </header>
    {mode === "overview" ? <div className="family-overview"><div className="overview-intro"><img src={realTrunk} alt=""/><div><p className="eyebrow">THE WHOLE FAMILY</p><h2>{people.length} lives, one continuing story</h2><p>This view keeps the big picture quiet. Open a household to walk through its full branch.</p></div></div>
      <div className="overview-households">{households.slice(0,12).map((household,index) => <button key={household.id} style={{ "--house-delay": `${index * 55}ms` } as CSSProperties} onClick={() => { const person=household.parents[0]; if(person){ onActive(person.id); setMode("branch"); } }}><span>{household.parents.slice(0,2).map(initialsOf).join(" + ")}</span><div><b>{household.parents.slice(0,2).map(nameOf).join(" & ")}</b><small>{household.children.length} {household.children.length===1?"child":"children"}</small></div><ArrowDown size={16}/></button>)}</div></div>
    : <div className="family-scroll-story" ref={storyRef}><div className="story-opening"><p className="eyebrow">BEGIN AT THE ROOTS</p><h2>{mode === "branch" && active ? `${nameOf(active)}’s branch` : "Every branch begins with someone"}</h2><p>Scroll slowly. Each generation appears only when you reach its place in the story.</p><ArrowDown/></div>
      {generations.map((generation,index) => <article className={`ancestry-chapter ${revealed.has(index)?"is-revealed":""}`} data-chapter={index} key={generation.level}><div className="chapter-copy"><small>CHAPTER {String(index+1).padStart(2,"0")}</small><h3>{chapterName(index,generations.length)}</h3><p>{generation.people.length} {generation.people.length===1?"person":"people"} in this generation</p></div><div className="real-tree-scene">
        {index===0?<img className="real-tree-root" src={realTrunk} alt=""/>:<img className="real-tree-spine" src={realBranch} alt=""/>}<img className="real-tree-bough left" src={realBranch} alt=""/><img className="real-tree-bough right" src={realBranch} alt=""/>
        <div className="generation-rail" aria-label={`${chapterName(index,generations.length)} relatives`}>{generation.people.map((person,personIndex)=><button className={`ancestry-person-card ${activeId===person.id?"active":""}`} key={person.id} style={{ "--person-delay": `${180+personIndex*75}ms` } as CSSProperties} onClick={()=>onActive(person.id)}><span className="ancestry-portrait">{person.profile_photo_id?<img src={photoUrl(person.profile_photo_id,"thumbnail")} alt=""/>:initialsOf(person)}</span><span className="ancestry-person-copy"><small>{person.nickname?`“${person.nickname}”`:`GENERATION ${index+1}`}</small><b>{nameOf(person)}</b><em>{person.birth_date?.slice(0,4)||"?"}–{person.death_date?.slice(0,4)||"Present"}</em><i>{person.photo_count||0} memories</i></span></button>)}</div>
      </div></article>)}<div className="story-ending"><Sprout/><p>The tree keeps growing.</p><small>Add a relative and a new place opens naturally in their generation.</small></div></div>}
    {active && <aside className="ancestry-selection"><span>{active.profile_photo_id?<img src={photoUrl(active.profile_photo_id,"thumbnail")} alt=""/>:initialsOf(active)}</span><div><small>SELECTED</small><b>{nameOf(active)}</b><em>{active.photo_count||0} memories</em></div><button onClick={()=>selectMode("branch")}>Follow branch</button><button className="secondary" onClick={()=>onOpenProfile(active)}>View profile</button></aside>}
  </section>;
}
