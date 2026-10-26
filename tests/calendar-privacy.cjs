/* Run the actual complete inline application in Node's VM with a minimal DOM/storage adapter.
   All Google responses are synthetic; this checks behavior, not browser layout or live OAuth. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='Asia/Tokyo';
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const KEY='));
const hook='globalThis.app={get db(){return DB},G,gAuthorize,gLoadCalendars,gShowIds,gReadOne,gReadRange,gWriteCal,gWritable,gSettings,gSafeData,gKeepLoad,gKeepSave,gcalRange,gcalByDay,gcalStatus,gSyncAll,gcalCache,gResetReads,gCleanReadPrefs,ui,go,render,isAdminDevice};';
new vm.Script(source);
const OWNER='toshi.cpg@gmail.com', STAFF='only.1.mybrand@gmail.com', SHARED='shared@example.test', KEEP='workhub_gcal_last_v1', KEY='workhub_proto_v1';
const TODAY='2026-10-26', NOW=Date.parse(TODAY+'T03:00:00Z');
const plain=x=>JSON.parse(JSON.stringify(x));
const cal=(id,primary=false,name=id)=>({id,primary,summary:name,accessRole:'owner'});
const ownerList=[cal(OWNER,true),cal(SHARED,false,'CPG HUB'),cal(STAFF,false,'employee')];
const staffList=[cal(STAFF,true),cal(OWNER,false,'renamed-private-calendar'),cal(SHARED,false,'CPG HUB')];
const evt=(id,title=id)=>({calendarId:id,calendar:id,title,location:'synthetic',allDay:true,start:TODAY,end:'2026-10-27'});
const kept=(events,policy=2)=>({policy,at:NOW,from:'2026-09-01',to:'2026-11-30',data:{events,calendars:events.map(e=>e.calendar),sources:events.map(e=>({id:e.calendarId,name:e.calendar}))}});
function boot({gShow=null,gWrite=SHARED,cache=null,storage:input,calendars=ownerList,fetcher}={}){
 const storage=new Map(input||[]),listeners={},els={},requests=[];
 if(!storage.has(KEY))storage.set(KEY,JSON.stringify({schemaVersion:2,seq:0,rseq:0,cases:[],todos:[],receipts:[],unknown:{preserve:true},settings:{gShow,gWrite}}));
 if(cache)storage.set(KEEP,JSON.stringify(cache));
 for(const k of ['toshi_v5','toshi_hub_safe_v1'])if(!storage.has(k))storage.set(k,'PAPA_UNCHANGED');
 const el=id=>els[id]||(els[id]={innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}});
 const document={getElementById:el,querySelector:el,querySelectorAll:()=>[],addEventListener:(k,fn)=>listeners[k]=fn};
 let token=0;
 const google={accounts:{oauth2:{initTokenClient:({callback})=>({requestAccessToken(){callback({access_token:'synthetic-'+(++token),expires_in:3600})}})}}};
 const context=vm.createContext({console,document,google,window:{google,scrollTo(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},URLSearchParams,AbortController,URL,Blob,crypto:require('node:crypto').webcrypto,Date:class extends Date{constructor(...args){super(...(args.length?args:[NOW]))}static now(){return NOW}},setInterval:()=>0,setTimeout:()=>0,clearTimeout(){},fetch:async(url,opt)=>{
  requests.push({url,method:opt.method,headers:opt.headers});
  let data=fetcher?await fetcher(url,opt):undefined;
  if(data===undefined)data=url.includes('/calendarList?')?{items:calendars}:{items:[{id:'synthetic-event',summary:'Work event',start:{date:TODAY},end:{date:'2026-10-27'}}]};
  return {status:200,ok:true,json:async()=>data};
 }});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,hook+'\n})();'),context);
 const app=context.app;
 const submit=(indices,write=gWrite)=>{el('g_write').value=write;listeners.submit({preventDefault(){},target:{id:'gsetForm',querySelectorAll:()=>indices.map(value=>({value:String(value)}))}})};
 return {app,storage,requests,els,context,submit};
}
const eventsRead=x=>x.requests.filter(r=>r.url.includes('/events?')).map(r=>decodeURIComponent(r.url.split('/calendars/')[1].split('/events?')[0]));
const guard=x=>{assert.equal(x.storage.get('toshi_v5'),'PAPA_UNCHANGED');assert.equal(x.storage.get('toshi_hub_safe_v1'),'PAPA_UNCHANGED');assert.deepEqual(plain(x.app.db.unknown),{preserve:true});assert(x.requests.every(r=>r.method==='GET'))};
const tests=[];async function test(name,fn){await fn();tests.push(name);console.log('PASS',name)}
(async()=>{
 await test('legacy cache removed before first render; exact private preference removed, unresolved primary retained',async()=>{
  const legacy=kept([{calendar:'自分',title:'PRIVATE_FIXTURE'},{calendar:'社長',title:'PRIVATE_FIXTURE_2'},{calendar:'CPG HUB',title:'old-shared'}]);delete legacy.policy;
  const x=boot({gShow:[OWNER,'primary',SHARED,STAFF],cache:legacy});assert(!x.storage.has(KEEP));assert(!x.els.main.innerHTML.includes('PRIVATE_FIXTURE'));assert.deepEqual(plain(x.app.db.settings.gShow),['primary',SHARED,STAFF]);assert.equal(x.app.db.settings.gWrite,SHARED);guard(x);
 });
 await test('owner sync: never fetch own private calendar; shared/staff stay; write/admin unchanged',async()=>{
  const x=boot({gWrite:OWNER});await x.app.gSyncAll();assert.deepEqual(eventsRead(x).sort(),[SHARED,STAFF].sort());assert.equal(x.app.G.cals.length,3);assert.equal(x.app.gWriteCal().id,OWNER);assert(x.app.isAdminDevice());assert.equal(x.app.gWritable().length,3);assert(!x.app.gSettings().includes('name="gshow" value="0"'));assert(x.app.gSettings().includes('option value="'+OWNER+'"'));assert.equal(JSON.parse(x.storage.get(KEEP)).policy,2);guard(x);
 });
 await test('staff default and saved primary remain readable; renamed owner email is blocked',async()=>{
  for(const gShow of [null,['primary',OWNER,SHARED]]){const x=boot({gShow,calendars:staffList});await x.app.gSyncAll();assert.deepEqual(eventsRead(x).sort(),[SHARED,STAFF].sort());assert(x.app.gSettings().includes('name="gshow" value="0"'));assert(!x.app.gSettings().includes('name="gshow" value="1"'));if(gShow)assert.deepEqual(plain(x.app.db.settings.gShow),[STAFF,SHARED]);guard(x)}
 });
 await test('owner-only or explicit empty saved selections never restore defaults',async()=>{
  for(const gShow of [[OWNER],['primary',OWNER],[]]){const x=boot({gShow});await x.app.gSyncAll();assert.deepEqual(eventsRead(x),[]);assert.deepEqual(plain(x.app.gShowIds()),[]);assert.deepEqual(plain(x.app.db.settings.gShow),[]);guard(x)}
 });
 await test('sync preserves business data, history, unknown fields, and registration destination',async()=>{
  const seed=boot();const db=plain(seed.app.db);db.cases=[{id:'U-TEST',type:'reno',stage:'new',client:'Synthetic client',property:'Synthetic property',room:'101',tantou:'Test',receivedAt:'2026-10-20T00:00:00Z',gcal:{cal:OWNER,id:'write-event',date:TODAY},unknown:{keep:7}}];db.todos=[{id:'T-test',title:'Synthetic todo',due:TODAY,done:false,tantou:'Test',unknown:8}];db.receipts=[{id:'R-test',date:TODAY,amount:1234,payee:'Synthetic merchant',photos:['preserve-photo-key'],edits:[{field:'keep'}],unknown:9}];db.history=[{at:'keep',payload:{untouched:true}}];db.settings.gWrite=OWNER;const x=boot({storage:[[KEY,JSON.stringify(db)]]});const before=plain(x.app.db);await x.app.gSyncAll();assert.deepEqual(plain(x.app.db),before);guard(x);
 });
 await test('direct reads fail closed for private ID and unresolved primary; staff primary resolves exactly',async()=>{
  const x=boot();for(const id of [OWNER,' TOSHI.CPG@GMAIL.COM ','primary'])assert.deepEqual(plain(await x.app.gReadOne({id},TODAY,TODAY)),[]);assert.equal(x.requests.length,0);
  x.app.G.token='synthetic';x.app.G.exp=NOW+3600000;x.app.G.cals=[{id:STAFF,primary:true,name:'自分'}];await x.app.gReadOne({id:'primary',primary:true,name:'自分'},TODAY,TODAY);assert.deepEqual(eventsRead(x),[STAFF]);guard(x);
 });
 await test('new cache sanitized on startup, storage, render, and offline reload without hiding staff primary',async()=>{
  const dirty=kept([evt(OWNER,'PRIVATE_FIXTURE'),evt('primary','ALIAS_FIXTURE'),evt(SHARED,'Shared event'),evt(STAFF,'Staff event'),{calendar:'自分',title:'NO_ID_FIXTURE'}]);
  const x=boot({cache:dirty});assert.deepEqual(JSON.parse(x.storage.get(KEEP)).data.events.map(e=>e.calendarId),[SHARED,STAFF]);x.app.go('cal');for(const bad of ['PRIVATE_FIXTURE','ALIAS_FIXTURE','NO_ID_FIXTURE'])assert(!x.els.main.innerHTML.includes(bad));assert(x.els.main.innerHTML.includes('Shared event'));assert(x.els.main.innerHTML.includes('Staff event'));
  const by=plain(x.app.gcalByDay(dirty.data));assert.deepEqual(by[TODAY].map(e=>e.title),['Shared event','Staff event']);const y=boot({storage:[...x.storage]});y.app.go('cal');assert(y.els.main.innerHTML.includes('Staff event'));assert.equal(y.requests.length,0);guard(x);guard(y);
 });
 await test('live in-memory cache and status labels are sanitized, not just localStorage',async()=>{
  const x=boot();x.app.G.token='synthetic';x.app.G.exp=NOW+3600000;x.app.G.cals=ownerList.map(c=>({...c,name:c.summary}));const ids=x.app.gShowIds().join(',');x.app.gcalCache.poison={ids,from:'2026-09-01',to:'2026-11-30',at:NOW,state:'ok',data:kept([evt(OWNER,'PRIVATE_MEMORY'),evt(SHARED,'Shared event')]).data};
  const r=x.app.gcalRange(TODAY,TODAY);assert.deepEqual(plain(r.data.events).map(e=>e.calendarId),[SHARED]);assert(!x.app.gcalStatus(r).includes(OWNER));guard(x);
 });
 await test('settings uses original checkbox indexes; clears stored events immediately and preserves write target',async()=>{
  const x=boot();await x.app.gSyncAll();x.submit([2],OWNER);assert.deepEqual(plain(x.app.db.settings.gShow),[STAFF]);assert.equal(x.app.db.settings.gWrite,OWNER);assert(!x.storage.has(KEEP));x.submit([],OWNER);assert.deepEqual(plain(x.app.gShowIds()),[]);const y=boot({storage:[...x.storage]});y.app.go('cal');assert(!y.els.main.innerHTML.includes('Work event'));guard(x);guard(y);
 });
 await test('delayed range response cannot repopulate cache after setting change',async()=>{
  let release,started;const pending=new Promise(r=>started=r);const x=boot({gShow:[SHARED],fetcher:url=>url.includes('/events?')?(started(),new Promise(r=>release=r)):undefined});
  await x.app.gAuthorize();await x.app.gLoadCalendars();const range=x.app.gcalRange(TODAY,TODAY);await pending;x.submit([]);release({items:[{summary:'STALE_FIXTURE',start:{date:TODAY}}]});await range.p;assert(!x.storage.has(KEEP));assert.equal(Object.keys(x.app.gcalCache).length,0);assert(!x.els.main.innerHTML.includes('STALE_FIXTURE'));guard(x);
 });
 await test('delayed full sync cannot repopulate cache after fresh OAuth/account change',async()=>{
  let release,started;const pending=new Promise(r=>started=r);const x=boot({gShow:[SHARED],fetcher:url=>url.includes('/events?')?(started(),new Promise(r=>release=r)):undefined});
  const sync=x.app.gSyncAll();await pending;x.app.G.exp=0;await x.app.gAuthorize();assert.equal(x.app.G.cals,null);release({items:[{summary:'STALE_AUTH_FIXTURE',start:{date:TODAY}}]});await sync;assert(!x.storage.has(KEEP));assert.equal(Object.keys(x.app.gcalCache).length,0);guard(x);
 });
 await test('stale calendar-list pagination cannot overwrite new authentication or request next page',async()=>{
  let release,started;const pending=new Promise(r=>started=r);const x=boot({fetcher:url=>url.includes('/calendarList?')?(started(),new Promise(r=>release=r)):undefined});await x.app.gAuthorize();const load=x.app.gLoadCalendars();await pending;x.app.G.exp=0;await x.app.gAuthorize();release({items:ownerList,nextPageToken:'next'});await assert.rejects(load,/stale/);assert.equal(x.app.G.cals,null);assert.equal(x.requests.length,1);guard(x);
 });
 await test('stale event pagination stops before page 2',async()=>{
  let release,started;const pending=new Promise(r=>started=r);const x=boot({fetcher:url=>url.includes('/events?')?(started(),new Promise(r=>release=r)):undefined});await x.app.gAuthorize();await x.app.gLoadCalendars();const read=x.app.gReadOne({id:SHARED,name:'Shared'},TODAY,TODAY);await pending;x.app.gResetReads(true);release({items:[],nextPageToken:'next'});await assert.rejects(read,/stale/);assert.equal(eventsRead(x).length,1);guard(x);
 });
 console.log(JSON.stringify({passed:tests.length,environment:'Node VM / actual inline application / synthetic DOM and Google responses / no live accounts',tests},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
