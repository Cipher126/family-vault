import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, UserRound, X } from 'lucide-react';
import { FamilyPerson, FamilyRelationship, photoUrl } from '../lib/api';
import { personName } from '../lib/familyTreeModel';
import { buildVerticalFamily, familyLineageIds, selectFamilyContext } from '../lib/familyTreeVertical';
import { DiagramNode, isolateFamilyDiagram, layoutFamilyDiagram } from '../lib/familyDiagramLayout';
import './connected-family-diagram.css';

type Props = { people: FamilyPerson[]; relationships: FamilyRelationship[]; activeId: string | null; onActive: (id: string) => void; onOpenProfile: (person: FamilyPerson) => void };
export default function ConnectedFamilyTree({ people, relationships, activeId, onActive, onOpenProfile }: Props) {
  const family = useMemo(() => buildVerticalFamily(people, relationships), [people, relationships]);
  const [hubId, setHubId] = useState<string | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [directory, setDirectory] = useState(false);
  const [ancestors, setAncestors] = useState(true), [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState(new Set<string>()), [collapsed, setCollapsed] = useState(new Set<string>()), [closedGroups, setClosedGroups] = useState(new Set<string>());
  const [width, setWidth] = useState(1000), [selectionStep, setSelectionStep] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const drawing = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const rootId = hubId && family.people.has(hubId) ? hubId : family.defaultFocus;
  const marked = useMemo(() => selectedId ? familyLineageIds(family, rootId || '', selectedId) : new Set<string>(), [family, rootId, selectedId]);
  const diagram = useMemo(() => {
    const original = layoutFamilyDiagram(family, { width, focusId: rootId || '', ancestors, expanded, collapsed, closedGroups, all, selectedId, viewportHeight });
    return selectedId ? isolateFamilyDiagram(original, marked) : original;
  }, [family, width, rootId, ancestors, expanded, collapsed, closedGroups, all, selectedId, viewportHeight, marked]);
  const focusedNodeKey = useMemo(() => selectedId ? (diagram.nodes.find(item => item.role !== 'ancestors' && item.primaryId === selectedId) || diagram.nodes.find(item => item.personIds.includes(selectedId)))?.key : undefined, [diagram, selectedId]);
  const cameraX = selectedId ? width / 2 : 0, cameraY = selectedId ? viewportHeight / 2 : 0;
  const matches = query.trim() ? people.filter(person => `${personName(person)} ${person.nickname || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12) : [];
  useEffect(() => { if (selectedId && !family.people.has(selectedId)) overview(); }, [family, selectedId]);

  useEffect(() => {
    const el = drawing.current; if (!el) return;
    const observer = new ResizeObserver(() => {
      const panel = scroll.current;
      if (panel) { const css = getComputedStyle(panel); setWidth(panel.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)); setViewportHeight(panel.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)); }
    }); observer.observe(el); if (scroll.current) observer.observe(scroll.current);
    return () => observer.disconnect();
  }, [directory]);
  useEffect(() => {
    if (!selectedId || directory) return;
    const target = drawing.current?.querySelector<HTMLElement>('.fd-focused-person');
    const panel = scroll.current;
    if (target && panel) { const card = target.getBoundingClientRect(), view = panel.getBoundingClientRect(); panel.scrollTo({ top: panel.scrollTop + card.top + card.height / 2 - view.top - panel.clientHeight / 2, left: panel.scrollLeft + card.left + card.width / 2 - view.left - panel.clientWidth / 2, behavior: 'instant' }); }
  }, [selectedId, selectionStep, directory, width, ancestors, viewportHeight]);

  function follow(id: string) {
    if (!rootId) return;
    const context = selectFamilyContext(family, id);
    setHubId(context.rootId); setSelectedId(id); onActive(id); setAncestors(true); setDirectory(false); setQuery('');
    setClosedGroups(values => new Set([...values].filter(key => ![...context.groups].some(group => key.endsWith(`/${group}`)))));
    setCollapsed(values => new Set([...values].filter(person => !context.expanded.has(person))));
    setExpanded(values => new Set([...values, ...context.expanded])); setSelectionStep(step => step + 1);
  }
  function overview() {
    setHubId(null); setSelectedId(null); setDirectory(false); setQuery(''); setExpanded(new Set()); setCollapsed(new Set()); setClosedGroups(new Set()); setAll(false);
    scroll.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  function toggle(id: string, open: boolean) {
    setExpanded(values => { const next = new Set(values); open ? next.delete(id) : next.add(id); return next; });
    setCollapsed(values => { const next = new Set(values); open ? next.add(id) : next.delete(id); return next; });
  }
  function profile(person: FamilyPerson) { onActive(person.id); onOpenProfile(person); }
  function jumpTo(where: 'ancestors' | 'descendants') {
    if (where === 'ancestors') { setAncestors(true); scroll.current?.scrollTo({ top: 0, left: cameraX, behavior: 'instant' }); }
    else {
      const group = diagram.groups.find(item => item.parentIds.includes(selectedId || ''));
      const target = [...(drawing.current?.querySelectorAll<HTMLElement>('[data-group-key]') || [])].find(el => el.dataset.groupKey === group?.key);
      target?.scrollIntoView({ block: 'start', inline: 'center', behavior: 'instant' });
    }
  }
  function personButton(person: FamilyPerson, secondary = false) {
    return <button className={`${secondary ? 'fd-relative-name' : 'fd-name'} ${selectedId === person.id ? 'fd-selected-name' : ''}`} onClick={() => follow(person.id)} aria-current={selectedId === person.id ? 'true' : undefined} aria-label={`See family of ${personName(person)}`} data-person-id={person.id} title={personName(person)}>
      {!secondary && <span className="fd-avatar">{person.profile_photo_id ? <img src={photoUrl(person.profile_photo_id, 'thumbnail')} alt="" loading="lazy" /> : `${person.first_name[0] || ''}${person.last_name[0] || ''}`}</span>}
      <span><strong>{personName(person)}</strong>{!secondary && <small>{person.birth_date?.slice(0, 4) || 'Dates not added'}{person.death_date ? `–${person.death_date.slice(0, 4)}` : ''}</small>}</span>
    </button>;
  }
  function nodeCard(item: DiagramNode) {
    const person = family.people.get(item.primaryId)!;
    const highlighted = !!selectedId && item.personIds.some(id => marked.has(id));
    const small = item.width < 125;
    const focused = item.key === focusedNodeKey;
    return <article key={item.key} className={`fd-node ${item.role} ${small ? 'small' : ''} ${highlighted ? 'highlighted' : ''} ${item.role !== 'ancestors' && activeId === item.primaryId ? 'chosen' : ''} ${focused ? 'fd-focused-person' : ''}`} data-node-key={item.key} data-side={item.side} aria-current={focused ? 'true' : undefined} aria-label={focused ? `${personName(person)} — person in focus` : undefined} style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>
      {item.role === 'ancestors' ? <><div className="fd-ancestor-label">{item.label}</div>{item.personIds.map(id => <div className="fd-ancestor-row" key={id}>{personButton(family.people.get(id)!, true)}<button className="fd-profile-icon" onClick={() => profile(family.people.get(id)!)} aria-label={`View profile of ${personName(family.people.get(id)!)}`}><UserRound size={13} /></button></div>)}</> : <>
        {personButton(person)}
        {item.personIds.filter(id => id !== item.primaryId).map(id => <div className="fd-partner-row" key={id}><span>with</span>{personButton(family.people.get(id)!, true)}</div>)}
        {person.death_date && <span className="fd-memory">In loving memory</span>}
        {item.role === 'child' && item.side === 'neutral' && <span className="fd-unspecified">Gender not set</span>}
        <div className="fd-node-actions">{item.role === 'child' && item.childCount > 0 && <button className="fd-expand" onClick={() => toggle(item.primaryId, item.expanded)} aria-expanded={item.expanded} aria-label={`${item.expanded ? 'Hide' : 'Show'} children of ${personName(person)}`}>{item.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{item.childCount}</button>}{item.role === 'reference' && <small>Earlier connection</small>}<button className="fd-profile-icon" onClick={() => profile(person)} aria-label={`View profile of ${personName(person)}`}><UserRound size={14} /></button></div>
      </>}
    </article>;
  }

  return <section className="family-diagram"><header className="fd-header"><div className="fd-toolbar"><div className="fd-tabs"><button className={!directory ? 'active' : ''} onClick={overview}>Family view</button><button className={directory ? 'active' : ''} onClick={() => { setDirectory(true); setQuery(''); }}>All relatives · {people.length}</button></div><div className="fd-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Find a relative" placeholder="Find a relative" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}{query.trim() && <div className="fd-results">{matches.length ? matches.map(person => <button key={person.id} onClick={() => follow(person.id)}>{personName(person)}<small>See connections</small></button>) : <p>No relatives found.</p>}</div>}</div></div><div className="fd-heading"><div><h2>{directory ? 'Everyone in the family' : selectedId && family.people.has(selectedId) ? personName(family.people.get(selectedId)!) : 'One connected family'}</h2><p>{directory ? 'Choose a name to follow their connections.' : selectedId ? 'Selected in the original tree · drag or scroll to explore' : 'Female ← family line → Male · Tap a name to follow their connections'}</p></div>{!directory && <div className="fd-view-actions">{selectedId ? <><button onClick={overview}>Whole family</button><button onClick={() => jumpTo('ancestors')}>Trace roots</button><button onClick={() => jumpTo('descendants')} disabled={!family.children.get(selectedId)?.length}>Descendants</button></> : <><button onClick={() => setAncestors(!ancestors)}>{ancestors ? 'Hide ancestors' : 'Ancestors'}</button><button onClick={() => { setAll(!all); setExpanded(new Set()); setCollapsed(new Set()); }}>{all ? 'Collapse generations' : 'Expand all'}</button></>}</div>}</div></header><div className={`fd-scroll ${selectedId ? "fd-camera" : ""}`} ref={scroll} role="region" aria-label="Connected family diagram" tabIndex={0} onPointerDown={event => { if (!selectedId || event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('button,input,select,a')) return; drag.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop}; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }} onPointerMove={event => { const start=drag.current; if (!start) return; event.currentTarget.scrollLeft=start.left-(event.clientX-start.x); event.currentTarget.scrollTop=start.top-(event.clientY-start.y); }} onPointerUp={() => { drag.current=null; }} onPointerCancel={() => { drag.current=null; }} onLostPointerCapture={() => { drag.current=null; }}>
      {directory ? <div className="fd-directory">{[...people].sort((a, b) => personName(a).localeCompare(personName(b))).map(person => <div className="fd-directory-row" key={person.id}>{personButton(person)}<button onClick={() => profile(person)} className="fd-profile-icon" aria-label={`View profile of ${personName(person)}`}><UserRound size={16} /></button></div>)}</div> : <div className="fd-scene" style={{ width: diagram.width + cameraX * 2, height: diagram.height + cameraY * 2 }}><div className="fd-canvas" ref={drawing} style={{ position: 'absolute', left: cameraX, top: cameraY, width: diagram.width, height: diagram.height }}>
        <svg className="fd-lines" width="100%" height={diagram.height} viewBox={`0 0 ${diagram.width} ${diagram.height}`} aria-hidden="true">{diagram.edges.map(item => <polyline key={item.key} points={item.points.map(point => `${point.x},${point.y}`).join(' ')} className={selectedId && item.personIds.length && item.personIds.every(id => marked.has(id)) ? 'is-highlighted' : ''} />)}{diagram.junctions.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={3.5} />)}</svg>
        {diagram.nodes.map(nodeCard)}
        {diagram.groups.map(group => <div key={group.key} data-group-key={group.key} className="fd-group-heading" style={{ left: group.x, top: group.y, width: group.width }}><span>{group.label}<small>{group.childCount} {group.childCount === 1 ? 'child' : 'children'}</small></span>{group.childCount > 0 && <button onClick={() => setClosedGroups(values => { const next = new Set(values); next.has(group.key) ? next.delete(group.key) : next.add(group.key); return next; })} aria-label={`${group.closed ? 'Expand' : 'Collapse'} children of ${group.label}`} aria-expanded={!group.closed}>{group.closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>}</div>)}
        {diagram.issues && <p className="fd-issues">A repeated relationship needs checking in the family profiles.</p>}
      </div></div>}
    </div></section>;
}




