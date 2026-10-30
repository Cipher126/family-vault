import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Tree from '../src/components/ConnectedFamilyTree';
import '../src/styles.css';
import seed from '../db/seed-family-tree.sql?raw';
import genderSeed from '../db/seed-family-genders.sql?raw';
import type { FamilyGender } from '../src/lib/api';
const genders = new Map([...genderSeed.matchAll(/\('(seed-[^']+)','(female|male)'\)/g)].map(match=>[match[1],match[2] as FamilyGender]));
const people=[...seed.matchAll(/\('(?<id>seed-(?!r-)[^']+)','(?<first>[^']*)','(?<last>[^']*)','(?<nick>[^']*)','(?<born>[^']*)',(?<died>NULL|'[^']*'),/g)].map(m=>({id:m.groups!.id,gender:genders.get(m.groups!.id) || "unspecified" as const,first_name:m.groups!.first,last_name:m.groups!.last,nickname:m.groups!.nick,birth_date:m.groups!.born,death_date:m.groups!.died==='NULL'?null:m.groups!.died.replaceAll("'",''),biography:'Fictional test relative from the local family seed.',photo_count:0}));
const relationships=[...seed.matchAll(/\('(seed-r-[^']+)','([^']+)','([^']+)','(parent|partner)'\)/g)].map(m=>({id:m[1],person_a_id:m[2],person_b_id:m[3],relationship:m[4] as 'parent'|'partner'}));
function Preview(){const[id,setId]=useState<string|null>(null);return <main style={{maxWidth:1350,margin:'auto'}}><div className="page family-tree-page"><header className="page-header"><div><p className="eyebrow">ROOTS & BRANCHES</p><h1>Our family tree</h1><p>Design preview · 51 fictional relatives</p></div><span className="muted">Family Vault</span></header><Tree people={people} relationships={relationships} activeId={id} onActive={setId} onOpenProfile={p=>setId(p.id)}/></div></main>;}createRoot(document.getElementById('root')!).render(<Preview/>);

