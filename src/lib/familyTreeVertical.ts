import type { FamilyPerson, FamilyRelationship } from './api';

export type VerticalHousehold = { id: string; parentId: string; coParentIds: string[]; childIds: string[] };
export type VerticalFamily = {
  people: Map<string, FamilyPerson>;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  partners: Map<string, string[]>;
  households: Map<string, VerticalHousehold[]>;
  defaultFocus: string | null;
};
const name = (person: FamilyPerson) => `${person.first_name} ${person.last_name}`.trim();

/** Keep biological/recorded parent links separate from partner relationships. */
export function buildVerticalFamily(people: FamilyPerson[], relationships: FamilyRelationship[]): VerticalFamily {
  const byId = new Map(people.map(person => [person.id, person]));
  const parents = new Map<string, string[]>(), children = new Map<string, string[]>(), partners = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => { const values = map.get(key) || []; if (!values.includes(value)) values.push(value); map.set(key, values); };
  for (const relationship of relationships) {
    const { person_a_id: a, person_b_id: b } = relationship;
    if (a === b || !byId.has(a) || !byId.has(b)) continue;
    if (relationship.relationship === 'parent') { add(children, a, b); add(parents, b, a); }
    else { add(partners, a, b); add(partners, b, a); }
  }
  const order = (a: string, b: string) => (byId.get(a)!.birth_date || '9999').localeCompare(byId.get(b)!.birth_date || '9999') || name(byId.get(a)!).localeCompare(name(byId.get(b)!));
  for (const map of [parents, children, partners]) for (const values of map.values()) values.sort(order);
  const households = new Map<string, VerticalHousehold[]>();
  for (const person of people) {
    const groups = new Map<string, VerticalHousehold>();
    for (const childId of children.get(person.id) || []) {
      const coParentIds = (parents.get(childId) || []).filter(id => id !== person.id).sort();
      const id = [person.id, ...coParentIds].sort().join('|');
      if (!groups.has(id)) groups.set(id, { id, parentId: person.id, coParentIds, childIds: [] });
      groups.get(id)!.childIds.push(childId);
    }
    // Include partners with no children recorded, without inventing any parent links.
    for (const partnerId of partners.get(person.id) || []) {
      if (![...groups.values()].some(group => group.coParentIds.includes(partnerId))) {
        const id = [person.id, partnerId].sort().join('|');
        groups.set(id, { id, parentId: person.id, coParentIds: [partnerId], childIds: [] });
      }
    }
    const sorted = [...groups.values()].sort((a, b) => {
      const firstA = a.childIds[0], firstB = b.childIds[0];
      if (firstA && firstB) return order(firstA, firstB);
      if (firstA || firstB) return firstA ? -1 : 1;
      return (a.coParentIds[0] && b.coParentIds[0]) ? order(a.coParentIds[0], b.coParentIds[0]) : a.id.localeCompare(b.id);
    });
    households.set(person.id, sorted);
  }
  const ranked = [...people].sort((a, b) => (children.get(b.id)?.length || 0) - (children.get(a.id)?.length || 0) || (partners.get(b.id)?.length || 0) - (partners.get(a.id)?.length || 0) || order(a.id, b.id));
  return { people: byId, parents, children, partners, households, defaultFocus: ranked[0]?.id || null };
}

export function ancestorIds(family: VerticalFamily, personId: string): Set<string> {
  const seen = new Set([personId]), ancestors = new Set<string>(), queue = [personId];
  for (let i = 0; i < queue.length; i++) for (const parentId of family.parents.get(queue[i]) || []) {
    if (seen.has(parentId)) continue;
    seen.add(parentId); ancestors.add(parentId); queue.push(parentId);
  }
  return ancestors;
}

export function descendantIds(family: VerticalFamily, personId: string): Set<string> {
  const seen = new Set([personId]), queue = [personId];
  for (let i = 0; i < queue.length; i++) for (const child of family.children.get(queue[i]) || []) {
    if (!seen.has(child)) { seen.add(child); queue.push(child); }
  }
  return seen;
}

/** Find the connection without treating a partner as the parent of their partner's children. */
export function familyPath(family: VerticalFamily, from: string, to: string): string[] | null {
  if (!family.people.has(from) || !family.people.has(to)) return null;
  const previous = new Map<string, string | null>([[from, null]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === to) { const path: string[] = []; let current: string | null = to; while (current !== null) { path.unshift(current); current = previous.get(current)!; } return path; }
    for (const next of [...(family.children.get(id) || []), ...(family.parents.get(id) || []), ...(family.partners.get(id) || [])]) {
      if (!previous.has(next)) { previous.set(next, id); queue.push(next); }
    }
  }
  return null;
}

/** Selection expands a route inside the shared family rather than re-rooting it at the person. */
export function selectFamilyContext(family: VerticalFamily, personId: string) {
  const originalRoot = family.defaultFocus || personId;
  const route = familyPath(family, originalRoot, personId);
  let rootId = originalRoot;
  const represented = descendantIds(family, originalRoot);
  for (const id of [...represented]) for (const partner of family.partners.get(id) || []) represented.add(partner);
  for (const id of [...represented]) for (const ancestor of ancestorIds(family, id)) represented.add(ancestor);
  if (!route) rootId = personId;
  else if (!represented.has(personId)) for (let i = 1; i < route.length && family.parents.get(rootId)?.includes(route[i]); i++) rootId = route[i];
  const expanded = new Set([...(familyPath(family, rootId, personId) || []), ...descendantIds(family, personId)]);
  const groups = new Set<string>();
  for (const [id, households] of family.households) if (expanded.has(id)) for (const group of households) {
    if (group.childIds.some(child => expanded.has(child))) groups.add(group.id);
  }
  return { rootId, expanded, groups };
}

export function familyLineageIds(family: VerticalFamily, rootId: string, personId: string): Set<string> {
  const route = familyPath(family, rootId, personId) || [];
  const descendants = descendantIds(family, personId);
  const visible = new Set([personId, ...route, ...route.flatMap(id => [...ancestorIds(family, id)]), ...ancestorIds(family, personId), ...descendants]);
  for (const id of descendants) {
    for (const partner of family.partners.get(id) || []) visible.add(partner);
    for (const group of family.households.get(id) || []) for (const coParent of group.coParentIds) visible.add(coParent);
  }
  return visible;
}
