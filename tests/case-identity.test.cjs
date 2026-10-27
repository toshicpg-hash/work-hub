'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../case-identity.js');
const KEY='workhub_proto_v1',at='2026-10-27T03:00:00Z',patch={property:'架空の物件（訂正）',room:'206'};
class Storage{
 constructor(db){this.data=new Map([[KEY,JSON.stringify(db)]]);this.writes=[];}
 get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}
 getItem(k){if(this.onGet)this.onGet(k,this);return this.data.get(k)??null;}
 setItem(k,v){if(this.onSet&&this.onSet(k,v,this)===false)return;this.data.set(k,String(v));this.writes.push(k);}
}
const fixture=()=>({schemaVersion:2,seq:2,rseq:1,settings:{data:{sheetId:'synthetic-sheet',unknown:true}},cases:[{id:'synthetic-case',property:'架空の物件',room:'406',stage:'site',siteDate:'2026-10-26',planDate:'2026-10-26',gcal:{id:'same-event',cal:'same-calendar'},estAmount:99000,items:[{amount:500}],payments:[{amount:100}],payLog:[{preserve:true}],history:[{preserve:true}],unknown:{keep:['all']}},{id:'other-case',stage:'new',property:'別の架空物件',room:''}],todos:[{id:'existing-order',order:true,done:false}],receipts:[{id:'receipt',photos:['photo'],edits:['keep']}],history:['preserve-root'],unknownRoot:7});
const commit=(s,session,input=patch,id='operation-0001')=>M.commit(s,KEY,session,input,{operationId:id,at});
test('name and room correction keeps the same ID, progress, dates, amounts, calendar linkage, history and unrelated records',()=>{
 const db=fixture(),s=new Storage(db),raw=s.getItem(KEY),r=commit(s,M.open(s,KEY,'synthetic-case')),expected=structuredClone(db);Object.assign(expected.cases[0],patch);assert.deepEqual(r.db,expected);assert.equal(r.raw,s.getItem(KEY));assert.equal(r.verified,true);const record=M.history(s,'synthetic-case').records[0];assert.equal(record.verified,true);assert.equal(record.beforeRaw,raw);assert.deepEqual(record.before,db.cases[0]);
});
test('latest unrelated case, ToDo, receipt and setting edits survive instead of being overwritten',()=>{
 const s=new Storage(fixture()),session=M.open(s,KEY,'synthetic-case'),newer=JSON.parse(s.getItem(KEY));newer.cases[1].note='newer';newer.todos.push({id:'newer'});newer.receipts[0].edits.push('newer');newer.settings.data.lastSync='newer';s.setItem(KEY,JSON.stringify(newer));const r=commit(s,session);Object.assign(newer.cases[0],patch);assert.deepEqual(r.db,newer);
});
test('target changes, stage transitions, removal, duplicate IDs and readonly changes stop without overwriting',()=>{
 for(const mutate of [d=>d.cases[0].room='other',d=>d.cases[0].stage='quoted',d=>d.cases[0].gcal.id='newer-event',d=>d.cases.shift(),d=>d.cases.push({...d.cases[0]}),d=>d.cases[0].ro=true]){const s=new Storage(fixture()),session=M.open(s,KEY,'synthetic-case'),db=JSON.parse(s.getItem(KEY));mutate(db);s.setItem(KEY,JSON.stringify(db));const raw=s.getItem(KEY);assert.throws(()=>commit(s,session));assert.equal(s.getItem(KEY),raw);assert.equal(M.history(s,'synthetic-case').records.length,0);}
});
test('shared readonly cases and all locked post-handover stages are rejected; existing pre-handover stages remain eligible',()=>{
 for(const stage of ['handed','working','built','billed','paid','unknown']){const db=fixture();db.cases[0].stage=stage;const s=new Storage(db);assert.throws(()=>M.open(s,KEY,'synthetic-case'),{code:'READONLY'});}
 const db=fixture();db.cases[0].ro=true;assert.throws(()=>M.open(new Storage(db),KEY,'synthetic-case'),{code:'READONLY'});
 for(const stage of ['new','site','quoted','hold','won','lost'])assert.equal(M.editable({id:'case',stage}),true);
});
test('only the two text fields are accepted; alphanumeric and leading-zero rooms or no room are preserved',()=>{
 for(const value of [{...patch,stage:'paid'},{...patch,id:'new-id'},{...patch,estAmount:0},{...patch,property:' '},{...patch,room:206},{...patch,room:'x'.repeat(101)}]){const s=new Storage(fixture());assert.throws(()=>commit(s,M.open(s,KEY,'synthetic-case'),value));assert.equal(s.writes.length,0);}
 for(const room of ['00206','203A','']){const s=new Storage(fixture()),r=commit(s,M.open(s,KEY,'synthetic-case'),{property:' 架空の物件 ',room});assert.equal(r.db.cases[0].room,room);assert.equal(r.db.cases[0].property,'架空の物件');}
});
test('backup quota or failed backup readback blocks the live write',()=>{
 for(const mode of ['throw','ignore']){const s=new Storage(fixture()),session=M.open(s,KEY,'synthetic-case'),raw=s.getItem(KEY);s.onSet=k=>{if(k.startsWith(M.PREFIX)){if(mode==='throw')throw Error('quota');return false;}};assert.throws(()=>commit(s,session),{code:'BACKUP'});assert.equal(s.getItem(KEY),raw);}
});
test('a race immediately before the live write is detected even after the backup',()=>{
 const s=new Storage(fixture()),session=M.open(s,KEY,'synthetic-case');let latest;s.onGet=(k,storage)=>{if(k===KEY&&storage.data.has(M.PREFIX+'operation-0001')){latest=fixture();latest.cases.push({id:'late'});storage.data.set(KEY,JSON.stringify(latest));storage.onGet=null;}};assert.throws(()=>commit(s,session),{code:'CONFLICT'});assert.deepEqual(JSON.parse(s.getItem(KEY)),latest);assert.equal(M.history(s,'synthetic-case').records[0].verified,false);
});
test('live write failure and mismatching readback retain the backup and never roll back newer data',()=>{
 const s=new Storage(fixture()),session=M.open(s,KEY,'synthetic-case'),raw=s.getItem(KEY);s.onSet=k=>{if(k===KEY)throw Error('quota');};assert.throws(()=>commit(s,session),{code:'WRITE'});assert.equal(s.getItem(KEY),raw);assert.equal(M.history(s,'synthetic-case').records[0].beforeRaw,raw);
 const other=new Storage(fixture()),opened=M.open(other,KEY,'synthetic-case');let newer;other.onSet=(k,v,storage)=>{if(k===KEY){newer=JSON.parse(v);newer.todos.push({id:'concurrent'});storage.data.set(k,JSON.stringify(newer));return false;}};assert.throws(()=>commit(other,opened),{code:'READBACK',mayHaveSaved:true});assert.deepEqual(JSON.parse(other.getItem(KEY)),newer);
});
test('restoring prior fields creates another history without reverting progress or financial history',()=>{
 const s=new Storage(fixture());commit(s,M.open(s,KEY,'synthetic-case'));const fields=M.previousFields(M.history(s,'synthetic-case').records[0],'synthetic-case');assert.deepEqual(Object.keys(fields).sort(),['property','room']);const db=JSON.parse(s.getItem(KEY));db.cases[0].stage='quoted';db.cases[0].estAmount=123000;s.setItem(KEY,JSON.stringify(db));commit(s,M.open(s,KEY,'synthetic-case'),fields,'operation-0002');const c=JSON.parse(s.getItem(KEY)).cases[0];assert.equal(c.room,'406');assert.equal(c.stage,'quoted');assert.equal(c.estAmount,123000);assert.equal(M.history(s,'synthetic-case').records.length,2);
});
test('no-op, corrupted records, proof-only failures and retry after success are distinguished',()=>{
 const s=new Storage(fixture()),session=M.open(s,KEY,'synthetic-case');assert.equal(commit(s,session,{property:session.before.property,room:session.before.room}).changed,false);assert.equal(s.writes.length,0);
 s.onSet=k=>{if(k.endsWith(':verified'))throw Error('quota');};const r=commit(s,session);assert.equal(r.verified,true);assert.equal(r.proofSaved,false);assert.throws(()=>commit(s,session,patch,'operation-0002'),{code:'CONFLICT'});assert.equal(JSON.parse(s.getItem(KEY)).cases.filter(x=>x.id==='synthetic-case').length,1);
 s.setItem(M.PREFIX+'bad','invalid');assert.equal(M.history(s,'synthetic-case').warnings.length,1);s.setItem(KEY,'invalid');assert.throws(()=>M.open(s,KEY,'synthetic-case'));assert.equal(s.getItem(KEY),'invalid');
});
