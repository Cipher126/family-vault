import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildFamilyTree,branchPeople} from '../src/lib/familyTreeModel';
import type {FamilyPerson,FamilyRelationship} from '../src/lib/api';
const sql=readFileSync(new URL('../db/seed-family-tree.sql',import.meta.url),'utf8');
const people:FamilyPerson[]=[...sql.matchAll(/\('(seed-(?!r-)[^']+)','([^']*)','([^']*)','([^']*)','([^']*)',(?:NULL|'[^']*'),/g)].map(m=>({id:m[1],first_name:m[2],last_name:m[3],nickname:m[4],birth_date:m[5],biography:'',photo_count:0}));
const rel:FamilyRelationship[]=[...sql.matchAll(/\('(seed-r-[^']+)','([^']+)','([^']+)','(parent|partner)'\)/g)].map(m=>({id:m[1],person_a_id:m[2],person_b_id:m[3],relationship:m[4] as 'parent'|'partner'}));
describe('connected family tree',()=>{
 it('represents every seeded person exactly once across four generations',()=>{const m=buildFamilyTree(people,rel);expect(people).toHaveLength(51);expect(m.nodes.flatMap(n=>n.people)).toHaveLength(51);expect(m.byPerson.size).toBe(51);expect(m.levels).toBe(4);expect(m.issues).toBe(false);});
 it('keeps the two marriages as separate parent junctions',()=>{const m=buildFamilyTree(people,rel);expect(m.limbs.some(b=>b.id.includes('seed-dad|seed-wife1'))).toBe(true);expect(m.limbs.some(b=>b.id.includes('seed-dad|seed-mum'))).toBe(true);});
 it('keeps each wife’s children in disjoint labelled groups and separate connector lanes',()=>{
  const m=buildFamilyTree(people,rel),first=m.families.find(f=>f.id==='seed-dad|seed-wife1')!,second=m.families.find(f=>f.id==='seed-dad|seed-mum')!;
  expect(first.childIds).toHaveLength(10);expect(second.childIds.sort()).toEqual(['seed-c11','seed-c12']);
  expect(first.focusId).toBe('seed-wife1');expect(second.focusId).toBe('seed-mum');
  expect(first.x+first.width).toBeLessThan(second.x);expect(first.color).not.toBe(second.color);
  const firstLine=m.limbs.find(l=>l.id==='union-seed-dad|seed-wife1-seed-dad')!,secondLine=m.limbs.find(l=>l.id==='union-seed-dad|seed-mum-seed-dad')!;
  expect(firstLine.routeY).not.toBe(secondLine.routeY);
  for(const family of [first,second])for(const id of family.childIds){const node=m.byPerson.get(id)!;expect(node.x-node.width/2).toBeGreaterThan(family.x);expect(node.x+node.width/2).toBeLessThan(family.x+family.width);}
 });
 it('does not include the first wife’s descendants when following Mum',()=>{const ids=branchPeople('seed-mum',rel);expect(ids.has('seed-c11')).toBe(true);expect(ids.has('seed-c12')).toBe(true);expect(ids.has('seed-dad')).toBe(true);expect(ids.has('seed-c01')).toBe(false);expect(ids.has('seed-wife1')).toBe(false);});
 it('terminates and flags a parent cycle',()=>{const m=buildFamilyTree(people,[...rel,{id:'bad',person_a_id:'seed-c11',person_b_id:'seed-pgf',relationship:'parent'}]);expect(m.issues).toBe(true);expect(m.byPerson.size).toBe(51);});
});
