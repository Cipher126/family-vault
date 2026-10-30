import { PointerEvent as ReactPointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { Focus, Maximize2, Minus, Plus, RotateCcw, Sprout } from "lucide-react";
import { FamilyPerson, FamilyRelationship, photoUrl } from "../lib/api";

type Props = {
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
  activeId: string | null;
  onActive: (id: string) => void;
  onOpenProfile: (person: FamilyPerson) => void;
};

type PositionedPerson = FamilyPerson & { x: number; y: number; level: number; delay: number };
type Scene = { width: number; height: number; people: PositionedPerson[]; visibleIds: Set<string>; levels: number };
type ViewBox = { x: number; y: number; width: number; height: number };

const nameOf = (person: FamilyPerson) => `${person.first_name} ${person.last_name}`.trim();
const initialsOf = (person: FamilyPerson) => `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`;

function descendantsOf(id: string, relationships: FamilyRelationship[]) {
  const visible = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    relationships.forEach((relation) => {
      if (relation.relationship === "partner" && (visible.has(relation.person_a_id) || visible.has(relation.person_b_id))) {
        if (!visible.has(relation.person_a_id) || !visible.has(relation.person_b_id)) changed = true;
        visible.add(relation.person_a_id); visible.add(relation.person_b_id);
      }
      if (relation.relationship === "parent" && visible.has(relation.person_a_id) && !visible.has(relation.person_b_id)) {
        visible.add(relation.person_b_id); changed = true;
      }
    });
  }
  relationships.forEach((relation) => {
    if (relation.relationship === "parent" && visible.has(relation.person_b_id)) visible.add(relation.person_a_id);
  });
  return visible;
}

function buildScene(people: FamilyPerson[], relationships: FamilyRelationship[], focusedId: string | null): Scene {
  const allIds = new Set(people.map((person) => person.id));
  const visibleIds = focusedId ? descendantsOf(focusedId, relationships) : allIds;
  const visiblePeople = people.filter((person) => visibleIds.has(person.id));
  const level = new Map(visiblePeople.map((person) => [person.id, 0]));
  for (let pass = 0; pass < visiblePeople.length + 2; pass += 1) {
    relationships.forEach((relation) => {
      if (!visibleIds.has(relation.person_a_id) || !visibleIds.has(relation.person_b_id)) return;
      if (relation.relationship === "parent") {
        level.set(relation.person_b_id, Math.max(level.get(relation.person_b_id) || 0, (level.get(relation.person_a_id) || 0) + 1));
      } else {
        const shared = Math.max(level.get(relation.person_a_id) || 0, level.get(relation.person_b_id) || 0);
        level.set(relation.person_a_id, shared); level.set(relation.person_b_id, shared);
      }
    });
  }
  const groups = new Map<number, FamilyPerson[]>();
  visiblePeople.forEach((person) => { const personLevel = level.get(person.id) || 0; groups.set(personLevel, [...(groups.get(personLevel) || []), person]); });
  const levelCount = Math.max(1, ...Array.from(level.values())) + 1;
  const widest = Math.max(1, ...Array.from(groups.values()).map((group) => group.length));
  const width = Math.max(980, widest * 156 + 180);
  const height = Math.max(720, levelCount * 180 + 210);
  const positioned: PositionedPerson[] = [];
  const partners = new Map<string, string[]>();
  relationships.forEach((relation) => {
    if (relation.relationship !== "partner" || !visibleIds.has(relation.person_a_id) || !visibleIds.has(relation.person_b_id)) return;
    partners.set(relation.person_a_id, [...(partners.get(relation.person_a_id) || []), relation.person_b_id]);
    partners.set(relation.person_b_id, [...(partners.get(relation.person_b_id) || []), relation.person_a_id]);
  });
  Array.from(groups.entries()).sort(([a], [b]) => a - b).forEach(([personLevel, group]) => {
    const groupIds = new Set(group.map((person) => person.id));
    const parentScore = (person: FamilyPerson) => {
      const parentIds = relationships.filter((relation) => relation.relationship === "parent" && relation.person_b_id === person.id).map((relation) => relation.person_a_id);
      const parentPositions = positioned.filter((item) => parentIds.includes(item.id));
      return parentPositions.length ? parentPositions.reduce((total, item) => total + item.x, 0) / parentPositions.length : width / 2;
    };
    const candidates = [...group].sort((a, b) => parentScore(a) - parentScore(b) || String(a.birth_date || "9999").localeCompare(String(b.birth_date || "9999")) || nameOf(a).localeCompare(nameOf(b)));
    const arranged: FamilyPerson[] = []; const used = new Set<string>();
    candidates.forEach((person) => {
      if (used.has(person.id)) return;
      arranged.push(person); used.add(person.id);
      (partners.get(person.id) || []).filter((id) => groupIds.has(id) && !used.has(id)).forEach((id) => {
        const partner = group.find((item) => item.id === id); if (partner) { arranged.push(partner); used.add(id); }
      });
    });
    const gap = Math.min(180, (width - 170) / Math.max(1, group.length));
    const rowWidth = gap * (arranged.length - 1);
    const startX = width / 2 - rowWidth / 2;
    arranged.forEach((person, index) => positioned.push({
      ...person, level: personLevel, x: startX + index * gap, y: height - 170 - personLevel * 176, delay: 420 + personLevel * 260 + index * 55
    }));
  });
  return { width, height, people: positioned, visibleIds, levels: levelCount };
}

export default function FamilyTreeCanvas({ people, relationships, activeId, onActive, onOpenProfile }: Props) {
  const [mode, setMode] = useState<"overview" | "branch">("overview");
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width: 1000, height: 720 });
  const [drag, setDrag] = useState<{ x: number; y: number; view: ViewBox } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const focusedId = mode === "branch" ? activeId : null;
  const scene = useMemo(() => buildScene(people, relationships, focusedId), [people, relationships, focusedId]);
  const byId = useMemo(() => new Map(scene.people.map((person) => [person.id, person])), [scene.people]);
  const active = activeId ? people.find((person) => person.id === activeId) || null : null;

  const fit = () => setViewBox({ x: 0, y: 0, width: scene.width, height: scene.height });
  useEffect(() => { fit(); }, [scene.width, scene.height, mode]);

  const zoom = (factor: number, clientX?: number, clientY?: number) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    const pointerX = bounds && clientX !== undefined ? viewBox.x + ((clientX - bounds.left) / bounds.width) * viewBox.width : viewBox.x + viewBox.width / 2;
    const pointerY = bounds && clientY !== undefined ? viewBox.y + ((clientY - bounds.top) / bounds.height) * viewBox.height : viewBox.y + viewBox.height / 2;
    const nextWidth = Math.min(scene.width * 1.2, Math.max(280, viewBox.width * factor));
    const nextHeight = nextWidth * (viewBox.height / viewBox.width);
    const ratio = nextWidth / viewBox.width;
    setViewBox({ x: pointerX - (pointerX - viewBox.x) * ratio, y: pointerY - (pointerY - viewBox.y) * ratio, width: nextWidth, height: nextHeight });
  };
  const wheel = (event: WheelEvent<SVGSVGElement>) => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.12 : .88, event.clientX, event.clientY); };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ x: event.clientX, y: event.clientY, view: viewBox }); };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    setViewBox({ ...drag.view, x: drag.view.x - (event.clientX - drag.x) * (drag.view.width / bounds.width), y: drag.view.y - (event.clientY - drag.y) * (drag.view.height / bounds.height) });
  };
  const stopDrag = () => setDrag(null);

  const parentBranches = relationships.flatMap((relation, index) => {
    if (relation.relationship !== "parent" || !scene.visibleIds.has(relation.person_a_id) || !scene.visibleIds.has(relation.person_b_id)) return [];
    const parent = byId.get(relation.person_a_id); const child = byId.get(relation.person_b_id);
    if (!parent || !child) return [];
    const middleY = (parent.y + child.y) / 2;
    const path = `M ${parent.x} ${parent.y - 37} C ${parent.x} ${middleY + 18}, ${child.x} ${middleY - 18}, ${child.x} ${child.y + 38}`;
    return [{ id: relation.id, path, level: child.level, delay: 140 + child.level * 240 + index * 25 }];
  });
  const partnerBranches = relationships.flatMap((relation, index) => {
    if (relation.relationship !== "partner" || !scene.visibleIds.has(relation.person_a_id) || !scene.visibleIds.has(relation.person_b_id)) return [];
    const one = byId.get(relation.person_a_id); const two = byId.get(relation.person_b_id);
    if (!one || !two) return [];
    return [{ id: relation.id, path: `M ${one.x + 32} ${one.y} C ${(one.x + two.x) / 2} ${one.y + 22}, ${(one.x + two.x) / 2} ${two.y + 22}, ${two.x - 32} ${two.y}`, level: one.level, delay: 340 + index * 30 }];
  });
  const oldest = scene.people.filter((person) => person.level === 0);

  return <section className={`living-tree ${drag ? "is-dragging" : ""}`} aria-label="Interactive family tree">
    <header className="tree-toolbar">
      <div className="tree-view-switch" aria-label="Tree view">
        <button className={mode === "overview" ? "active" : ""} onClick={() => setMode("overview")}><Maximize2 size={15} />Overview</button>
        <button className={mode === "branch" ? "active" : ""} disabled={!activeId} onClick={() => setMode("branch")}><Focus size={15} />Focused branch</button>
      </div>
      <p><Sprout size={15} /><span>{people.length} people</span><i />Scroll to zoom · drag to explore</p>
      <div className="tree-zoom-controls">
        <button aria-label="Zoom out" onClick={() => zoom(1.18)}><Minus /></button><button aria-label="Fit whole tree" onClick={fit}><RotateCcw /></button><button aria-label="Zoom in" onClick={() => zoom(.84)}><Plus /></button>
      </div>
    </header>
    <div className="tree-stage">
      <svg ref={svgRef} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} onWheel={wheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} role="img" aria-label={mode === "overview" ? "Overview of the entire family" : `Focused family branch for ${active ? nameOf(active) : "the selected person"}`}>
        <defs>
          <linearGradient id="tree-bark" x1="0" x2="1"><stop offset="0" stopColor="#4d2d19"/><stop offset=".42" stopColor="#8b5a32"/><stop offset=".72" stopColor="#5f3820"/><stop offset="1" stopColor="#3d2316"/></linearGradient>
          <linearGradient id="tree-root" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#754828"/><stop offset="1" stopColor="#342015"/></linearGradient>
          <radialGradient id="tree-glow"><stop stopColor="#dce9be" stopOpacity=".58"/><stop offset="1" stopColor="#dce9be" stopOpacity="0"/></radialGradient>
          <filter id="tree-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#25160d" floodOpacity=".22"/></filter>
          <filter id="tree-texture"><feTurbulence baseFrequency=".025 .14" numOctaves="2" seed="8" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter>
        </defs>
        <ellipse className="tree-canopy-glow" cx={scene.width / 2} cy={scene.height * .4} rx={scene.width * .44} ry={scene.height * .4}/>
        <g className="tree-roots" filter="url(#tree-texture)">
          <path pathLength="1" d={`M ${scene.width / 2} ${scene.height - 36} C ${scene.width / 2 - 70} ${scene.height - 8}, ${scene.width / 2 - 150} ${scene.height - 24}, ${scene.width / 2 - 245} ${scene.height - 5}`} />
          <path pathLength="1" d={`M ${scene.width / 2} ${scene.height - 36} C ${scene.width / 2 + 70} ${scene.height - 8}, ${scene.width / 2 + 160} ${scene.height - 24}, ${scene.width / 2 + 265} ${scene.height - 5}`} />
          <path pathLength="1" d={`M ${scene.width / 2} ${scene.height - 36} C ${scene.width / 2 + 6} ${scene.height - 15}, ${scene.width / 2 + 12} ${scene.height - 5}, ${scene.width / 2 + 34} ${scene.height + 12}`} />
        </g>
        <g className="tree-limbs">
          {oldest.map((person, index) => <path key={`base-${person.id}`} pathLength="1" style={{ "--grow-delay": `${index * 90}ms`, "--limb-width": `${Math.max(10, 24 - person.level * 3)}px` } as React.CSSProperties} d={`M ${scene.width / 2} ${scene.height - 38} C ${scene.width / 2} ${scene.height - 112}, ${person.x} ${person.y + 95}, ${person.x} ${person.y + 38}`} />)}
          {parentBranches.map((branch) => <path key={branch.id} pathLength="1" style={{ "--grow-delay": `${branch.delay}ms`, "--limb-width": `${Math.max(6, 15 - branch.level * 2)}px` } as React.CSSProperties} d={branch.path} />)}
        </g>
        <g className="tree-partner-vines">{partnerBranches.map((branch) => <path key={branch.id} pathLength="1" style={{ "--grow-delay": `${branch.delay}ms` } as React.CSSProperties} d={branch.path} />)}</g>
        <g className="tree-people">{scene.people.map((person) => <g key={person.id} transform={`translate(${person.x} ${person.y})`}>
          <g className={`tree-person ${activeId === person.id ? "active" : ""}`} style={{ "--bloom-delay": `${person.delay}ms` } as React.CSSProperties} onPointerDown={(event) => event.stopPropagation()} onClick={() => onActive(person.id)} role="button" tabIndex={0} aria-label={`${nameOf(person)}, ${person.photo_count || 0} memories`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActive(person.id); } }}>
            <defs><clipPath id={`portrait-${person.id}`}><circle r="34"/></clipPath></defs>
            <circle className="leaf-halo" r="49"/><circle className="leaf-frame" r="39"/>
            {person.profile_photo_id ? <image href={photoUrl(person.profile_photo_id, "thumbnail")} x="-34" y="-34" width="68" height="68" preserveAspectRatio="xMidYMid slice" clipPath={`url(#portrait-${person.id})`}/> : <><circle className="leaf-initials-bg" r="34"/><text className="leaf-initials" y="2">{initialsOf(person)}</text></>}
            <g className="leaf-label"><rect x="-65" y="47" width="130" height="39" rx="13"/><text y="63">{nameOf(person)}</text><text className="memory-count" y="77">{person.photo_count || 0} memories</text></g>
          </g>
        </g>)}</g>
      </svg>
      <div className="tree-ground" />
      {active && <aside className="tree-selection-card"><span className="tree-selection-portrait">{active.profile_photo_id ? <img src={photoUrl(active.profile_photo_id, "thumbnail")} alt="" /> : initialsOf(active)}</span><div><small>SELECTED BRANCH</small><b>{nameOf(active)}</b><em>{active.photo_count || 0} memories</em></div><button onClick={() => { setMode("branch"); }}>Explore branch</button><button className="secondary" onClick={() => onOpenProfile(active)}>View profile</button></aside>}
    </div>
    <footer className="tree-legend"><span><i className="legend-person" />Person</span><span><i className="legend-partner" />Partners</span><span><i className="legend-branch" />Parent and child</span><p>{mode === "overview" ? "Select a portrait to explore one household in depth." : "Focused view keeps parents for context and follows every descendant."}</p></footer>
  </section>;
}
