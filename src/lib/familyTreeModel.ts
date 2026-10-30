import type { FamilyPerson, FamilyRelationship } from './api';

export type TreePoint = { x: number; y: number };
export type TreeNode = TreePoint & { id: string; people: FamilyPerson[]; level: number; width: number; height: number; childCount: number };
export type TreeLimb = { id: string; from: TreePoint; to: TreePoint; width: number; level: number; seed: number; kind: 'root' | 'ancestry' | 'union'; color?: string; routeY?: number };
export type TreeFamily = { id: string; label: string; x: number; y: number; width: number; height: number; level: number; color: string; childIds: string[]; focusId: string };
export type FamilyTreeModel = { nodes: TreeNode[]; limbs: TreeLimb[]; families: TreeFamily[]; width: number; height: number; levels: number; issues: boolean; byPerson: Map<string, TreeNode> };
export const personName = (person: FamilyPerson) => `${person.first_name} ${person.last_name}`.trim();

/** Partners are grouped for display, but ancestry is always routed from the exact parent set. */
export function buildFamilyTree(people: FamilyPerson[], relationships: FamilyRelationship[]): FamilyTreeModel {
  const byId = new Map(people.map(p => [p.id, p]));
  const valid = relationships.filter(r => r.person_a_id !== r.person_b_id && byId.has(r.person_a_id) && byId.has(r.person_b_id));
  const directParents = new Map<string, Set<string>>();
  valid.filter(r => r.relationship === 'parent').forEach(r => directParents.set(r.person_b_id, new Set([...(directParents.get(r.person_b_id) || []), r.person_a_id])));
  const representative = new Map(people.map(p => [p.id, p.id]));
  function find(id: string): string {
    let root = id;
    while (representative.get(root) !== root) root = representative.get(root)!;
    while (id !== root) { const next = representative.get(id)!; representative.set(id, root); id = next; }
    return root;
  }
  valid.filter(r => r.relationship === 'partner').forEach(r => { representative.set(find(r.person_b_id), find(r.person_a_id)); });
  const groups = new Map<string, FamilyPerson[]>();
  people.forEach(p => { const key = find(p.id); groups.set(key, [...(groups.get(key) || []), p]); });
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  let issues = false;
  valid.filter(r => r.relationship === 'parent').forEach(r => {
    const parent = find(r.person_a_id), child = find(r.person_b_id);
    if (parent === child) { issues = true; return; }
    parents.set(child, new Set([...(parents.get(child) || []), parent]));
    children.set(parent, new Set([...(children.get(parent) || []), child]));
  });
  // Kahn's algorithm keeps arbitrary generations linear and safely terminates on malformed cycles.
  const indegree = new Map([...groups.keys()].map(id => [id, parents.get(id)?.size || 0]));
  const queue = [...groups.keys()].filter(id => !indegree.get(id));
  const level = new Map([...groups.keys()].map(id => [id, 0]));
  let visited = 0;
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]; visited++;
    children.get(id)?.forEach(child => {
      level.set(child, Math.max(level.get(child)!, level.get(id)! + 1));
      indegree.set(child, indegree.get(child)! - 1);
      if (!indegree.get(child)) queue.push(child);
    });
  }
  issues ||= visited !== groups.size;
  const levels = Math.max(0, ...level.values()) + 1;
  const rows: TreeNode[][] = Array.from({ length: levels }, () => []);
  const personChildren = new Map<string, Set<string>>();
  valid.filter(r => r.relationship === 'parent').forEach(r => personChildren.set(r.person_a_id, new Set([...(personChildren.get(r.person_a_id) || []), r.person_b_id])));
  groups.forEach((members, id) => {
    // Place a shared parent between multiple partners; ordinary couples remain in birth order.
    const degree = (p: FamilyPerson) => valid.filter(r => r.relationship === 'partner' && (r.person_a_id === p.id || r.person_b_id === p.id)).length;
    members.sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999') || personName(a).localeCompare(personName(b)));
    if (members.length > 2) { const hub = [...members].sort((a, b) => degree(b) - degree(a))[0]; members.splice(members.indexOf(hub), 1); members.splice(Math.floor(members.length / 2), 0, hub); }
    const l = level.get(id)!;
    const childIds = new Set(members.flatMap(p => [...(personChildren.get(p.id) || [])]));
    rows[l].push({ id, people: members, level: l, x: 0, y: 0, width: Math.max(156, members.length * 108 + 22), height: 152, childCount: childIds.size });
  });
  const widths = rows.map(row => row.reduce((sum, n) => sum + n.width + 58, 0));
  let width = Math.max(560, ...widths) + 180;
  const height = (levels - 1) * 320 + 480;
  const nodeByGroup = new Map(rows.flat().map(n => [n.id, n]));
  rows.forEach((row, l) => {
    const parentCenter = (node: TreeNode) => {
      const previous = [...(parents.get(node.id) || [])].map(id => nodeByGroup.get(id)!).filter(n => n.level < l);
      return previous.length ? previous.reduce((s, n) => s + n.x, 0) / previous.length : width / 2;
    };
    row.sort((a, b) => parentCenter(a) - parentCenter(b) || (a.people[0].birth_date || '').localeCompare(b.people[0].birth_date || '') || a.id.localeCompare(b.id));
    let cursor = (width - widths[l]) / 2 + 29;
    row.forEach(node => { node.x = cursor + node.width / 2; node.y = 240 + l * 320; cursor += node.width + 58; });
  });
  // Reserve a complete horizontal span per household, including childless siblings.
  // A shared descendant has one layout owner while retaining every real parent link.
  const owner = new Map<string, string>(), owned = new Map<string, TreeNode[]>();
  rows.flat().forEach(node => {
    const next = [...(children.get(node.id) || [])].map(id => nodeByGroup.get(id)!).filter(child => child.level > node.level && !owner.has(child.id));
    const familyKey = (child: TreeNode) => {
      const member = child.people.find(person => [...(directParents.get(person.id) || [])].some(id => node.people.some(parent => parent.id === id)));
      return member ? [...(directParents.get(member.id) || [])].sort().join('|') : child.id;
    };
    const dates = new Map<string, string>();
    next.forEach(child => { const key = familyKey(child), date = child.people[0].birth_date || '9999'; if (!dates.has(key) || date < dates.get(key)!) dates.set(key, date); });
    next.sort((a, b) => (dates.get(familyKey(a))! + familyKey(a)).localeCompare(dates.get(familyKey(b))! + familyKey(b)) || (a.people[0].birth_date || '').localeCompare(b.people[0].birth_date || ''));
    next.forEach(child => owner.set(child.id, node.id)); owned.set(node.id, next);
  });
  const spans = new Map<string, number>();
  const span = (node: TreeNode): number => {
    if (spans.has(node.id)) return spans.get(node.id)!;
    const next = owned.get(node.id) || [];
    const value = Math.max(node.width, next.reduce((sum, child) => sum + span(child), 0) + Math.max(0, next.length - 1) * 80);
    spans.set(node.id, value); return value;
  };
  const place = (node: TreeNode, start: number) => {
    node.x = start + span(node) / 2;
    const next = owned.get(node.id) || [], total = next.reduce((sum, child) => sum + span(child), 0) + Math.max(0, next.length - 1) * 80;
    let cursor = start + (span(node) - total) / 2;
    next.forEach(child => { place(child, cursor); cursor += span(child) + 80; });
  };
  let forestCursor = 90;
  rows.flat().filter(node => !owner.has(node.id)).forEach(node => { place(node, forestCursor); forestCursor += span(node) + 80; });
  // Place the earliest ancestors near their shared child without duplicating that child.
  const firstRow = rows[0];
  const firstDesired = new Map(firstRow.map(node => { const next = [...(children.get(node.id) || [])].map(id => nodeByGroup.get(id)!).filter(child => child.level > 0); return [node.id, next.length ? next.reduce((sum, child) => sum + child.x, 0) / next.length : node.x]; }));
  firstRow.sort((a, b) => firstDesired.get(a.id)! - firstDesired.get(b.id)!);
  let firstEdge = -Infinity;
  firstRow.forEach(node => { node.x = Math.max(firstDesired.get(node.id)!, firstEdge + node.width / 2); firstEdge = node.x + node.width / 2 + 80; });
  const left = Math.min(...rows.flat().map(node => node.x - node.width / 2));
  const right = Math.max(...rows.flat().map(node => node.x + node.width / 2));
  width = Math.max(560, right - left) + 180;
  rows.flat().forEach(node => { node.x += (width - (right - left)) / 2 - left; });
  const byPerson = new Map<string, TreeNode>();
  rows.flat().forEach(node => node.people.forEach(p => byPerson.set(p.id, node)));
  const limbs: TreeLimb[] = [];
  const families: TreeFamily[] = [];
  let seed = 3;
  const add = (id: string, from: TreePoint, to: TreePoint, thickness: number, l: number, kind: TreeLimb['kind'], color?: string, routeY?: number) => limbs.push({ id, from, to, width: thickness, level: l, kind, seed: seed++, color, routeY });
  const parentSets = new Map<string, { parents: string[]; children: Set<string> }>();
  directParents.forEach((ids, childId) => {
    const sorted = [...ids].sort(), key = sorted.join('|');
    if (!parentSets.has(key)) parentSets.set(key, { parents: sorted, children: new Set() });
    parentSets.get(key)!.children.add(childId);
  });
  const setsByNode = new Map<string, string[]>();
  parentSets.forEach((set, id) => { const n = byPerson.get(set.parents[0])!; setsByNode.set(n.id, [...(setsByNode.get(n.id) || []), id]); });
  parentSets.forEach((set, id) => {
    const source = byPerson.get(set.parents[0])!;
    const childNodes = [...new Set([...set.children].map(child => byPerson.get(child)!))].filter(n => n.level > source.level);
    if (!childNodes.length) return;
    const sets = setsByNode.get(source.id)!;
    const index = sets.indexOf(id), blended = sets.length > 1;
    const color = blended ? ['#a65f43', '#367f91', '#7760a5', '#758c3d'][index % 4] : undefined;
    const childAnchors = childNodes.map(child => {
      const members = child.people.map((person, memberIndex) => ({ person, memberIndex })).filter(({ person }) => set.children.has(person.id));
      const offset = members.reduce((sum, { memberIndex }) => sum + (memberIndex - (child.people.length - 1) / 2) * 90, 0) / Math.max(1, members.length);
      return { child, anchor: { x: child.x + offset, y: child.y - 76 } };
    });
    const junction = { x: childAnchors.reduce((sum, item) => sum + item.anchor.x, 0) / childAnchors.length, y: Math.min(...childNodes.map(child => child.y)) - 145 };
    if (blended) {
      const left = Math.min(...childNodes.map(child => child.x - child.width / 2)) - 22;
      const right = Math.max(...childNodes.map(child => child.x + child.width / 2)) + 22;
      const names = set.parents.map(parent => byId.get(parent)!).sort((a, b) => (personChildren.get(b.id)?.size || 0) - (personChildren.get(a.id)?.size || 0)).map(parent => parent.first_name);
      const focusId = [...set.parents].sort((a, b) => (personChildren.get(a)?.size || 0) - (personChildren.get(b)?.size || 0))[0];
      families.push({ id, label: `${names.join(' + ')} · ${set.children.size} ${set.children.size === 1 ? 'child' : 'children'}`, x: left, y: Math.min(...childNodes.map(child => child.y)) - 133, width: right - left, height: Math.max(...childNodes.map(child => child.y)) - Math.min(...childNodes.map(child => child.y)) + 245, level: childNodes[0].level, color: color!, childIds: [...set.children], focusId });
    }
    set.parents.forEach(parent => {
      const n = byPerson.get(parent)!; const idx = n.people.findIndex(p => p.id === parent);
      const anchor = { x: n.x + (idx - (n.people.length - 1) / 2) * 90, y: n.y + 76 };
      add(`union-${id}-${parent}`, anchor, junction, 14, n.level + .35, 'union', color, n.y + 108 + index * 26);
    });
    childAnchors.forEach(({ child, anchor }) => {
      add(`child-${id}-${child.id}`, junction, anchor, Math.min(40, 21 + child.childCount), source.level + .65, 'ancestry', color, child.y - 100);
    });
  });
  return { nodes: rows.flat(), limbs, families, width, height, levels, issues, byPerson };
}

/** Follow descendants of the chosen person, then add their partners for display only.
 * Partners' other marriages never become traversal roots (important in blended families). */
export function branchPeople(id: string, relationships: FamilyRelationship[]): Set<string> {
  const children = new Map<string, Set<string>>();
  relationships.filter(r => r.relationship === 'parent').forEach(r => children.set(r.person_a_id, new Set([...(children.get(r.person_a_id) || []), r.person_b_id])));
  const blood = new Set([id]), queue = [id];
  for (let i = 0; i < queue.length; i++) children.get(queue[i])?.forEach(child => { if (!blood.has(child)) { blood.add(child); queue.push(child); } });
  const visible = new Set(blood);
  relationships.filter(r => r.relationship === 'partner').forEach(r => {
    if (blood.has(r.person_a_id)) visible.add(r.person_b_id);
    if (blood.has(r.person_b_id)) visible.add(r.person_a_id);
  });
  return visible;
}
