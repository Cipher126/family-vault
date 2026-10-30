import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ancestorIds, buildVerticalFamily, descendantIds, familyPath } from '../src/lib/familyTreeVertical';
import type { FamilyPerson, FamilyRelationship } from '../src/lib/api';
const sql = readFileSync(new URL('../db/seed-family-tree.sql', import.meta.url), 'utf8');
const people: FamilyPerson[] = [...sql.matchAll(/\('(seed-(?!r-)[^']+)','([^']*)','([^']*)','([^']*)','([^']*)',(?:NULL|'[^']*'),/g)].map(m => ({ id: m[1], first_name: m[2], last_name: m[3], nickname: m[4], birth_date: m[5], biography: '', photo_count: 0 }));
const relationships: FamilyRelationship[] = [...sql.matchAll(/\('(seed-r-[^']+)','([^']+)','([^']+)','(parent|partner)'\)/g)].map(m => ({ id: m[1], person_a_id: m[2], person_b_id: m[3], relationship: m[4] as 'parent' | 'partner' }));

describe('vertical connected family', () => {
  const family = buildVerticalFamily(people, relationships);
  it('starts with the shared father and retains all 51 searchable relatives', () => {
    expect(family.defaultFocus).toBe('seed-dad');
    expect(family.people.size).toBe(51);
  });
  it('keeps both marriages attached to Dad with the correct children', () => {
    const groups = family.households.get('seed-dad')!;
    expect(groups).toHaveLength(2);
    expect(groups[0].parentId).toBe('seed-dad');
    expect(groups[0].coParentIds).toEqual(['seed-wife1']);
    expect(groups[0].childIds).toHaveLength(10);
    expect(groups[1].coParentIds).toEqual(['seed-mum']);
    expect(groups[1].childIds).toEqual(['seed-c11', 'seed-c12']);
  });
  it('preserves partners and grandchildren beneath their actual parents', () => {
    expect(family.partners.get('seed-c01')).toContain('seed-s01');
    expect(family.children.get('seed-c01')).toEqual(['seed-g0101', 'seed-g0102']);
    expect(family.parents.get('seed-g0101')).toEqual(expect.arrayContaining(['seed-c01', 'seed-s01']));
  });
  it('reveals a selected child through Dad while retaining the path to their grandparents', () => {
    expect(familyPath(family, 'seed-dad', 'seed-g0101')).toEqual(['seed-dad', 'seed-c01', 'seed-g0101']);
    expect(ancestorIds(family, 'seed-c01')).toEqual(new Set(['seed-dad', 'seed-wife1', 'seed-pgf', 'seed-pgm', 'seed-ifgf', 'seed-ifgm']));
    expect(descendantIds(family, 'seed-mum')).toEqual(new Set(['seed-mum', 'seed-c11', 'seed-c12']));
    expect(familyPath(family, 'seed-mum', 'seed-c01')).toEqual(['seed-mum', 'seed-dad', 'seed-c01']);
    expect(family.parents.get('seed-c01')).not.toContain('seed-mum');
  });
  it('handles cycles, dangling links, duplicate links, and an unconnected relative', () => {
    const outsider = { ...people[0], id: 'outsider' };
    const graph = buildVerticalFamily([...people, outsider], [...relationships, relationships[0], { id: 'cycle', person_a_id: 'seed-c01', person_b_id: 'seed-pgf', relationship: 'parent' }, { id: 'missing', person_a_id: 'missing', person_b_id: 'seed-dad', relationship: 'parent' }]);
    expect(ancestorIds(graph, 'seed-c01').size).toBeLessThan(people.length);
    expect(descendantIds(graph, 'seed-dad').size).toBeLessThan(people.length);
    expect(familyPath(graph, 'seed-dad', 'outsider')).toBeNull();
    expect(graph.parents.get('seed-dad')).not.toContain('missing');
    expect(new Set(graph.children.get(relationships[0].person_a_id)).size).toBe(graph.children.get(relationships[0].person_a_id)!.length);
  });
});
