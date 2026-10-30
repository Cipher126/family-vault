import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FamilyGender, FamilyPerson, FamilyRelationship } from '../src/lib/api';
import { buildVerticalFamily, selectFamilyContext, familyLineageIds } from '../src/lib/familyTreeVertical';
import { layoutFamilyDiagram, isolateFamilyDiagram } from '../src/lib/familyDiagramLayout';
import { normalizeFamilyGender } from '../worker/routes/api';
const sql = readFileSync(new URL('../db/seed-family-tree.sql',import.meta.url),'utf8');
const genderSql = readFileSync(new URL('../db/seed-family-genders.sql',import.meta.url),'utf8');
const genders = new Map([...genderSql.matchAll(/\('(seed-[^']+)','(female|male)'\)/g)].map(m=>[m[1],m[2] as FamilyGender]));
const people:FamilyPerson[]=[...sql.matchAll(/\('(seed-(?!r-)[^']+)','([^']*)','([^']*)','([^']*)','([^']*)',(?:NULL|'[^']*'),/g)].map(m=>({id:m[1],first_name:m[2],last_name:m[3],nickname:m[4],gender:genders.get(m[1]),birth_date:m[5],biography:'',photo_count:0}));
const relationships:FamilyRelationship[]=[...sql.matchAll(/\('(seed-r-[^']+)','([^']+)','([^']+)','(parent|partner)'\)/g)].map(m=>({id:m[1],person_a_id:m[2],person_b_id:m[3],relationship:m[4] as 'parent'|'partner'}));
const family=buildVerticalFamily(people,relationships);
const diagram=(width=1000,all=false)=>layoutFamilyDiagram(family,{width,focusId:'seed-dad',ancestors:true,expanded:new Set(),all});

describe('approved family diagram',()=>{
 it('keeps one shared father, two partner connections and all six grandparents',()=>{
  const d=diagram();expect(d.nodes.filter(n=>n.role==='root').map(n=>n.primaryId)).toEqual(['seed-dad']);
  expect(d.nodes.filter(n=>n.role==='partner').map(n=>n.primaryId)).toEqual(['seed-wife1','seed-mum']);
  expect(d.nodes.filter(n=>n.role==='ancestors').flatMap(n=>n.personIds)).toHaveLength(6);
  expect(d.edges.some(e=>e.kind==='partner'&&e.personIds.includes('seed-dad')&&e.personIds.includes('seed-wife1'))).toBe(true);
  expect(d.edges.some(e=>e.kind==='partner'&&e.personIds.includes('seed-dad')&&e.personIds.includes('seed-mum'))).toBe(true);
 });
 it('positions females left and males right of the same sibling line using saved gender',()=>{
  const d=diagram(),g=d.groups.find(g=>g.label==='Tunde + Ifeoma')!,axis=g.x+g.width/2;
  const daughter=d.nodes.find(n=>n.role==='child'&&n.primaryId==='seed-c02')!,son=d.nodes.find(n=>n.role==='child'&&n.primaryId==='seed-c01')!;
  expect(daughter.side).toBe('left');expect(daughter.x+daughter.width).toBeLessThan(axis);
  expect(son.side).toBe('right');expect(son.x).toBeGreaterThan(axis);
  expect(d.edges.some(e=>e.personIds.includes('seed-c01')&&e.personIds.includes('seed-mum'))).toBe(false);
 });
 it('places unrecorded gender neutrally instead of guessing from a name',()=>{
  const f=buildVerticalFamily(people.map(p=>p.id==='seed-c02'?{...p,gender:undefined}:p),relationships);
  const d=layoutFamilyDiagram(f,{width:1000,focusId:'seed-dad',ancestors:true,expanded:new Set()});
  const node=d.nodes.find(n=>n.role==='child'&&n.primaryId==='seed-c02')!,g=d.groups.find(g=>g.label==='Tunde + Ifeoma')!;
  expect(node.side).toBe('neutral');expect(node.x+node.width/2).toBeCloseTo(g.x+g.width/2);
 });
 it.each([270,390,1000])('renders all generations inside a %s-pixel diagram without losing a member',width=>{
  const d=diagram(width,true),ids=new Set(d.nodes.flatMap(n=>n.personIds));
  expect(ids.size).toBe(51);expect(d.height).toBeGreaterThan(0);
  for(const n of d.nodes){expect(n.x).toBeGreaterThanOrEqual(0);expect(n.x+n.width).toBeLessThanOrEqual(width+.01);expect(Number.isFinite(n.y)).toBe(true);}
  for(const e of d.edges)for(const p of e.points){expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(width+.01);}
 });
 it('opens a selected child’s descendants without removing either marriage',()=>{
  const d=layoutFamilyDiagram(family,{width:1000,focusId:'seed-dad',ancestors:true,expanded:new Set(['seed-c01'])});
  expect(d.nodes.some(n=>n.primaryId==='seed-g0101')).toBe(true);expect(d.nodes.some(n=>n.primaryId==='seed-g0102')).toBe(true);
  expect(d.nodes.some(n=>n.primaryId==='seed-mum')).toBe(true);expect(d.nodes.some(n=>n.primaryId==='seed-c12')).toBe(true);
 });
 it('does not invent a second parent for a single-parent family',()=>{
  const f=buildVerticalFamily(people.filter(p=>['seed-dad','seed-c11'].includes(p.id)),relationships);
  const d=layoutFamilyDiagram(f,{width:390,focusId:'seed-dad',ancestors:true,expanded:new Set()});
  expect(d.nodes.filter(n=>n.personIds.includes('seed-dad'))).toHaveLength(1);
  expect(d.nodes.filter(n=>n.role==='partner')).toHaveLength(0);
 });
 it.each([270,1000])('preserves the original nodes, boxes and connections for every selection at %s pixels',width=>{
  const options={width,focusId:'seed-dad',ancestors:true,expanded:new Set<string>(),all:true};
  const original=layoutFamilyDiagram(family,options);
  for(const person of people)expect(layoutFamilyDiagram(family,{...options,selectedId:person.id})).toEqual(original);
 });
 it('centers selection in the shared family context without replacing Dad or either marriage',()=>{
  const context=selectFamilyContext(family,'seed-c02');
  expect(context.rootId).toBe('seed-dad');expect([...context.expanded]).toEqual(expect.arrayContaining(['seed-dad','seed-c02','seed-g0201','seed-g0202']));
  expect(context.groups.has('seed-c02|seed-s02')).toBe(true);expect(context.groups.has('seed-dad|seed-wife1')).toBe(true);
  const original=diagram();
  const selected=layoutFamilyDiagram(family,{width:1000,focusId:context.rootId,selectedId:'seed-c02',ancestors:true,expanded:context.expanded});
  expect(selected.nodes.find(n=>n.role==='root')!.primaryId).toBe('seed-dad');
  expect(selected.nodes.filter(n=>n.role==='partner').map(n=>n.primaryId)).toEqual(['seed-wife1','seed-mum']);
  for(const id of ['seed-dad','seed-c02']){const a=original.nodes.find(n=>n.primaryId===id&&n.role!=='ancestors')!,b=selected.nodes.find(n=>n.primaryId===id&&n.role!=='ancestors')!;expect([b.x,b.y,b.width,b.height]).toEqual([a.x,a.y,a.width,a.height]);}
 });
 it('keeps partners, grandparents and grandchildren in the original family when selected',()=>{
  for(const id of ['seed-dad','seed-mum','seed-wife1','seed-pgf','seed-s01','seed-g0101'])expect(selectFamilyContext(family,id).rootId).toBe('seed-dad');
 });
 it('never invents a connection for an unrelated person',()=>{
  const f=buildVerticalFamily([...people,{...people[0],id:'unrelated'}],relationships);
  expect(selectFamilyContext(f,'unrelated').rootId).toBe('unrelated');
 }); it('shows only the selected person’s ancestry, partner and descendants in their original boxes',()=>{
  const context=selectFamilyContext(family,'seed-c02');
  const original=layoutFamilyDiagram(family,{width:1000,focusId:context.rootId,ancestors:true,expanded:context.expanded});
  const visible=familyLineageIds(family,context.rootId,'seed-c02'),isolated=isolateFamilyDiagram(original,visible);
  expect(new Set(isolated.nodes.flatMap(n=>n.personIds))).toEqual(new Set(['seed-c02','seed-s02','seed-g0201','seed-g0202','seed-dad','seed-wife1','seed-pgf','seed-pgm','seed-ifgf','seed-ifgm']));
  for(const node of isolated.nodes){const before=original.nodes.find(n=>n.key===node.key)!;expect([node.x,node.y,node.width,node.height]).toEqual([before.x,before.y,before.width,before.height]);}
  expect(isolated.edges.every(edge=>edge.personIds.every(id=>visible.has(id)))).toBe(true);
  const branch=isolated.edges.find(edge=>edge.branchFor==='seed-c02')!;
  const trunks=isolated.edges.filter(edge=>edge.trunkFor===branch.trunkFor&&!edge.branchFor).sort((a,b)=>a.points[0].y-b.points[0].y);
  expect(trunks.length).toBeGreaterThan(0);for(let i=1;i<trunks.length;i++)expect(trunks[i-1].points.at(-1)!.y).toBeCloseTo(trunks[i].points[0].y);
  expect(trunks.at(-1)!.points.at(-1)!.y).toBeCloseTo(branch.points[0].y);
 });
 it('hides the other marriage and siblings when selecting Mum’s branch',()=>{
  const visible=familyLineageIds(family,'seed-dad','seed-mum');
  const isolated=isolateFamilyDiagram(diagram(),visible),ids=new Set(isolated.nodes.flatMap(n=>n.personIds));
  expect(ids.has('seed-wife1')).toBe(false);expect(ids.has('seed-c01')).toBe(false);expect(ids.has('seed-c11')).toBe(true);expect(ids.has('seed-c12')).toBe(true);expect(ids.has('seed-dad')).toBe(true);
 }); it('terminates safely on cyclic relationship data',()=>{
  const f=buildVerticalFamily(people,[...relationships,{id:'cycle',person_a_id:'seed-c01',person_b_id:'seed-pgf',relationship:'parent'}]);
  const d=layoutFamilyDiagram(f,{width:390,focusId:'seed-dad',ancestors:true,expanded:new Set(),all:true});
  expect(d.issues).toBe(true);expect(Number.isFinite(d.height)).toBe(true);expect(d.nodes.length).toBeLessThan(200);
 });
});
describe('family gender validation',()=>{
 it('accepts the supported values and defaults omitted values',()=>{expect(normalizeFamilyGender('female')).toBe('female');expect(normalizeFamilyGender('male')).toBe('male');expect(normalizeFamilyGender(undefined)).toBe('unspecified');expect(normalizeFamilyGender(null)).toBe('unspecified');});
 it('rejects invalid input rather than persisting it',()=>{expect(()=>normalizeFamilyGender('invalid')).toThrow();expect(()=>normalizeFamilyGender(1)).toThrow();});
});


