import { describe, expect, it } from 'vitest';
import { api } from '../worker/routes/api';
import type { Env, RequestContext } from '../worker/types';

function localApi() {
  const records = new Map<string, Record<string, unknown>>();
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values = args; return statement; },
        async first() { return records.get(String(values[0])) || null; },
        async run() {
          if (sql.startsWith('INSERT INTO family_people')) {
            const columns = sql.match(/family_people\(([^)]+)\)/)![1].split(',');
            const row = Object.fromEntries(columns.map((column,index)=>[column,values[index]]));
            row.profile_photo_id = null; records.set(String(row.id), row);
          } else if (sql.startsWith('UPDATE family_people SET')) {
            const row = records.get(String(values.at(-1)))!;
            const columns = [...sql.matchAll(/([a-z_]+)=\?/g)].map(match=>match[1]);
            columns.slice(0,-1).forEach((column,index)=>row[column]=values[index]);
          }
          return { success: true };
        }
      };
      return statement;
    },
    async batch(statements: Array<{run:()=>Promise<unknown>}>) { return Promise.all(statements.map(statement=>statement.run())); }
  };
  const call = (method:string,path:string,body:Record<string,unknown>) => {
    const url = new URL(path,'http://localhost');
    const ctx:RequestContext = { url, request:new Request(url,{method,headers:{'Content-Type':'application/json','Origin':'http://localhost'},body:JSON.stringify(body)}),env:{DB:db} as unknown as Env,user:{id:'test-admin',email:'admin@example.test',displayName:'Test admin',role:'admin'} };
    return api(ctx);
  };
  return { records, call };
}

describe('family profile gender persistence',()=>{
 it('persists gender on creation and preserves it when updating unrelated fields',async()=>{
   const app=localApi();
   const response=await app.call('POST','/api/family-tree/people',{firstName:'Test relative',gender:'female'});
   expect(response.status).toBe(201);
   const {id}=await response.json() as {id:string};
   expect(app.records.get(id)?.gender).toBe('female');
   await app.call('PATCH',`/api/family-tree/people/${id}`,{nickname:'Updated name'});
   expect(app.records.get(id)?.gender).toBe('female');expect(app.records.get(id)?.nickname).toBe('Updated name');
   await app.call('PATCH',`/api/family-tree/people/${id}`,{gender:'male'});
   expect(app.records.get(id)?.gender).toBe('male');
 });
 it('defaults an omitted gender to unspecified',async()=>{
   const app=localApi();const response=await app.call('POST','/api/family-tree/people',{firstName:'Test relative'});const {id}=await response.json() as {id:string};expect(app.records.get(id)?.gender).toBe('unspecified');
 });
 it('rejects an invalid gender before saving a profile',async()=>{
   const app=localApi();await expect(app.call('POST','/api/family-tree/people',{firstName:'Test relative',gender:'invalid'})).rejects.toMatchObject({status:400});expect(app.records.size).toBe(0);
 });
});
