/* Synthetic fixtures only; all external requests are blocked. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),KEY='workhub_proto_v1';
const hook='window.testHub={get db(){return DB},ui,go,emptyDB,CASE_DEFAULTS,save,render,genTodos,dataRows,roCase,roDetail,upgrade,ended,gSyncAll,authorize(){G.token="synthetic-token";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000;}};';
let server,browser,origin;const results=[];
async function setup(db,tz='Asia/Tokyo',width=390,network=null){
 const ctx=await browser.newContext({timezoneId:tz,locale:'ja-JP',viewport:{width,height:900}}),requests=[],errors=[];
 await ctx.route('**/*',r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u===origin+'/seed')return r.fulfill({contentType:'text/html',body:'<!doctype html>'});if(u.startsWith(origin+'/'))return r.continue();requests.push({url:u,method:r.request().method()});
 if(network&&u.includes('/calendar/v3/users/me/calendarList'))return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
 if(network&&u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic-own')){
  const req=r.request(),decoded=decodeURIComponent(new URL(u).pathname);let body={};
  if(req.method()==='GET')body={sheets:['案件','入金','立替','情報','ToDo'].map(title=>({properties:{title}}))};
  else if(req.method()==='PUT'){const tab=decoded.split('/values/')[1].split('!')[0].replace(/^'|'$/g,'');network.exports[tab]=req.postDataJSON().values;}
  return r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 }
 return r.fulfill({status:200,body:''});});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-29T15:05:00Z'));await p.goto(origin+'/seed');if(db)await p.evaluate(({KEY,db})=>localStorage.setItem(KEY,JSON.stringify(db)),{KEY,db});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.testHub);return {ctx,p,requests,errors};
}
const read=p=>p.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)),KEY);
const open=(p,id)=>p.evaluate(id=>testHub.go('detail',{caseId:id}),id);
const click=(p,a)=>p.locator('[data-act="'+a+'"]').click();
const stale=(p,a)=>p.evaluate(a=>{const b=document.createElement('button');b.dataset.act=a;document.getElementById('main').append(b);b.click();b.remove();},a);
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const init=await setup(),db=await init.p.evaluate(()=>testHub.emptyDB());await init.ctx.close();
  const base={type:'kinkyu',stage:'new',client:'合成依頼元Z',clientKind:'管理会社',property:'合成検証棟Z',room:'901',tantou:'合成担当Z',receivedAt:'2026-10-29T01:00:00Z',items:[],unknown:{keep:true}};
  db.cases=[{...base,id:'synthetic-emergency'}, {...base,type:'reno',id:'synthetic-won',stage:'won',orderDate:'2026-10-28',estAmount:123456,note:'合成元記録',lossReason:'以前の理由',lossDate:'2026-09-01',payLog:[{kind:'noPay',at:'2026-10-28'}]}, {...base,type:'reno',id:'synthetic-normal'}, ...['quoted','hold','handed','working','built','billed','paid'].map(stage=>({...base,type:'reno',id:'synthetic-'+stage,stage,estSentDate:'2026-10-28',holdDate:'2026-11-01'}))];
  db.todos=[{id:'synthetic-manual',title:'合成手入力',caseId:'synthetic-won',done:false},{id:'synthetic-request',title:'合成指示',order:true,done:false}];db.receipts=[{id:'synthetic-receipt',caseId:'synthetic-won',date:'2026-10-28',amount:500,payee:'合成店',photos:[],edits:[]}];db.unknown={keep:true};
  for(const tz of ['Asia/Tokyo','UTC','America/Los_Angeles']){
   const a=await setup(db,tz),{p}=a;await open(p,'synthetic-emergency');assert.equal(await p.locator('[data-act="plan"]').isVisible(),true);if(process.env.CPG_CASE_ARTIFACTS&&tz==='Asia/Tokyo')await p.screenshot({path:path.join(process.env.CPG_CASE_ARTIFACTS,'emergency-plan.png')});
   assert.equal(await p.evaluate(()=>testHub.genTodos().find(t=>t.caseId==='synthetic-emergency').due),tz==='America/Los_Angeles'?'2026-10-28':'2026-10-29');
   assert.match(await p.locator('.since').innerText(),/受付から/);
   await p.locator('#d_plan').fill('2026-11-11');await click(p,'plan');assert.equal((await read(p)).cases[0].planDate,undefined);
   await p.locator('#d_plan_time').fill('10:00');await p.locator('[data-nav="cases"]').first().click();await open(p,'synthetic-emergency');assert.equal(await p.locator('#d_plan_time').inputValue(),'');
   for(const [day,time] of [['2026-11-11','10:00'],['2026-11-12','00:05'],['2026-11-11','23:55']]){
    await p.locator('#d_plan').fill(day);await p.locator('#d_plan_time').fill(time);await click(p,'plan');let c=(await read(p)).cases[0];assert.equal(c.planDate,day);assert.equal(c.planTime,time);assert.equal(c.stage,'new');assert.equal(c.siteDate,'');assert.equal(c.gcal,null);assert.equal(await p.evaluate(()=>testHub.genTodos().find(t=>t.caseId==='synthetic-emergency').due),day);
    await p.reload();await open(p,c.id);assert.equal(await p.locator('#d_plan').inputValue(),day);assert.equal(await p.locator('#d_plan_time').inputValue(),time);assert.match(await p.locator('#main').innerText(),/日本時間/);
   }
   // JSON backup/restore through actual upgrade and reload; unknown data survives.
   const backup=await read(p);await p.evaluate(({KEY,backup})=>{localStorage.setItem(KEY,JSON.stringify(testHub.upgrade(JSON.parse(JSON.stringify(backup)))));},{KEY,backup});await p.reload();assert.deepEqual(await read(p),backup);
   // Existing shared serializer and readonly decoder (headers resolved by name).
   const projected=await p.evaluate(()=>{const rows=testHub.dataRows().cases,r=Object.fromEntries(rows[0].map((k,i)=>[k,rows[1][i]])),c=testHub.roCase(r,{s:{name:'合成閲覧Z'}});return {c,html:testHub.roDetail(c)};});assert.equal(projected.c.planDate,'2026-11-11');assert.equal(projected.c.planTime,'23:55');assert.match(projected.html,/23:55/);assert(!projected.html.includes('data-act="plan"'));
   assert.deepEqual(a.errors,[]);assert.equal(a.requests.filter(r=>r.method!=='GET').length,0);await a.ctx.close();results.push('Emergency date/time, unsaved back, day boundaries, reload, backup and shared readonly in '+tz);
  }
  for(const width of [320,390,822,1280]){
   const a=await setup(db,'Asia/Tokyo',width),{p}=a;await open(p,'synthetic-won');const before=await p.evaluate(()=>JSON.parse(JSON.stringify(testHub.db)));
   await click(p,'woncancelask');if(process.env.CPG_CASE_ARTIFACTS)await p.screenshot({path:path.join(process.env.CPG_CASE_ARTIFACTS,'won-cancel-'+width+'.png')});assert.match(await p.locator('#main [role="alert"]').innerText(),/synthetic-won.*合成検証棟Z/);await click(p,'woncancelsave');assert.match(await p.locator('#wonCancelStatus').innerText(),/理由/);await p.locator('#d_cancel_reason').fill('合成理由 <script>');await click(p,'woncancelno');assert.deepEqual(await read(p),db);
   await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('合成取消理由');await p.locator('[data-nav="cases"]').first().click();await open(p,'synthetic-won');assert.equal(await p.locator('#d_cancel_reason').count(),0);
   await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('合成取消理由 <script>');await click(p,'woncancelsave');const after=await read(p),expected=structuredClone(before);Object.assign(expected.cases[1],{stage:'lost',cancelReason:'合成取消理由 <script>',cancelledAt:'2026-10-29T15:05:00.000Z'});assert.deepEqual(after,expected);
   assert.match(await p.locator('#main').innerText(),/受注後取消済み/);assert.match(await p.locator('#main').innerText(),/2026\/10\/30 00:05:00（日本時間）/);assert.equal(await p.locator('[data-act="reopen"]').count(),0);assert.equal(await p.locator('#main script').count(),0);
   await stale(p,'woncancelsave');await stale(p,'reopen');await stale(p,'hand');assert.deepEqual(await read(p),after);
   assert.equal(await p.evaluate(()=>testHub.genTodos().some(t=>t.auto&&t.caseId==='synthetic-won')),false);assert.equal(await p.evaluate(()=>testHub.genTodos().filter(t=>t.id==='synthetic-manual'||t.id==='synthetic-request').length),2);assert.equal(await p.evaluate(()=>testHub.ended(testHub.db.cases[1])),true);
   await p.evaluate(()=>testHub.go('cases'));assert.equal(await p.locator('[data-open="synthetic-won"]').count(),0);await p.evaluate(()=>{testHub.ui.showEnded=true;testHub.render();});assert.match(await p.locator('#main').innerText(),/受注後取消済み/);
   const projected=await p.evaluate(()=>{const rows=testHub.dataRows().cases,r=Object.fromEntries(rows[0].map((k,i)=>[k,rows[2][i]])),c=testHub.roCase(r,{s:{name:'合成閲覧Z'}});return {r,c,html:testHub.roDetail(c)};});assert.equal(projected.r['段階'],'失注');assert.equal(projected.c.cancelReason,after.cases[1].cancelReason);assert.equal(projected.c.cancelledAt,after.cases[1].cancelledAt);assert.match(projected.html,/受注後取消済み/);assert.match(projected.html,/123,456円/);
   await p.reload();await open(p,'synthetic-won');assert.deepEqual(await read(p),after);assert.match(await p.locator('#main').innerText(),/受注後取消済み/);assert.deepEqual(a.errors,[]);assert.equal(a.requests.filter(r=>r.method!=='GET').length,0);await a.ctx.close();results.push('Cancellation confirm/abort, reason/date, preservation, history, exclusions, repeat/stale click and reload '+width+'px');
  }
  for(const fault of ['quota','readback','concurrent','busy']){
   for(const action of ['cancel','plan']){
    const a=await setup(db),{p}=a;await open(p,action==='cancel'?'synthetic-won':'synthetic-emergency');if(action==='cancel'){await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('保持する理由');}else{await p.locator('#d_plan').fill('2026-11-11');await p.locator('#d_plan_time').fill('10:00');}
    await p.evaluate(({KEY,fault})=>{if(fault==='busy'){testHub.ui.gsync={busy:true};return}if(fault==='concurrent'){const other=JSON.parse(localStorage.getItem(KEY));other.unknown.newer=true;localStorage.setItem(KEY,JSON.stringify(other));return}const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===KEY){if(fault==='quota')throw new DOMException('quota','QuotaExceededError');return;}return original.call(this,k,v)};},{KEY,fault});const before=await read(p);await click(p,action==='cancel'?'woncancelsave':'plan');assert.deepEqual(await read(p),before);assert.equal(await p.evaluate(()=>testHub.db.cases[1].stage),'won');assert.equal(await p.evaluate(()=>testHub.db.cases[0].planDate),'');if(action==='cancel'){assert.equal(await p.locator('#d_cancel_reason').inputValue(),'保持する理由');assert.match(await p.locator('#wonCancelStatus').innerText(),/保存|処理中/);}await a.ctx.close();results.push(action+' failure '+fault+' preserves state and never reports success');
   }
  }
  {
   const a=await setup(db),{p}=a;await open(p,'synthetic-normal');assert.equal(await p.locator('#d_plan_time').count(),0);await p.locator('#d_plan').fill('2026-11-15');await click(p,'plan');assert.equal((await read(p)).cases[2].planDate,'2026-11-15');
   await open(p,'synthetic-quoted');await click(p,'lose');assert.equal((await read(p)).cases.find(c=>c.id==='synthetic-quoted').stage,'lost');await click(p,'reopen');assert.equal((await read(p)).cases.find(c=>c.id==='synthetic-quoted').stage,'quoted');await p.locator('#d_hold').fill('2026-11-20');await click(p,'hold');assert.equal((await read(p)).cases.find(c=>c.id==='synthetic-quoted').holdDate,'2026-11-20');
   for(const stage of ['handed','working','built','billed','paid']){await open(p,'synthetic-'+stage);assert.equal(await p.locator('[data-act="woncancelask"]').count(),0);await stale(p,'woncancelask');assert.equal(await p.locator('#d_cancel_reason').count(),0);}
   const old=await p.evaluate(()=>testHub.roCase({'受付番号':'old','種類':'緊急対応','段階キー':'new'},{s:{name:'合成旧版'}}));assert.equal(old.planTime,'');assert.equal(old.cancelledAt,'');assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('Normal schedule/loss/reopen/hold, old share defaults and post-handoff scope');
  }
  {
   const syncDb=structuredClone(db);syncDb.settings.data.sheetId='synthetic-own';const network={exports:{}},a=await setup(syncDb,'Asia/Tokyo',390,network),{p}=a;
   await open(p,'synthetic-emergency');await p.locator('#d_plan').fill('2026-11-11');await p.locator('#d_plan_time').fill('10:00');await click(p,'plan');
   await open(p,'synthetic-won');await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('合成同期確認');await click(p,'woncancelsave');const before=await read(p);
   for(let i=0;i<2;i++){
    await p.evaluate(async()=>{testHub.authorize();await testHub.gSyncAll();});assert.equal(await p.evaluate(()=>testHub.ui.gsync.busy),false);
    assert.equal(await p.evaluate(()=>testHub.ui.gsync.rows.every(r=>r.ok)),true);
    const rows=network.exports['案件'];assert(rows);assert.equal(rows[1][rows[0].indexOf('予定時刻（日本時間）')],'10:00');assert.equal(rows[2][rows[0].indexOf('受注後取消理由')],'合成同期確認');
    assert.equal(network.exports.ToDo.some(r=>r[3]==='synthetic-won'&&r[6]!=='手入力'),false);
    assert.deepEqual((await read(p)).cases,before.cases);assert.deepEqual((await read(p)).todos,before.todos);
   }
   await p.reload();assert.deepEqual((await read(p)).cases,before.cases);assert(a.requests.filter(r=>r.method!=='GET').every(r=>r.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic-own/')));assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('Repeated full mocked shared sync preserves schedule/cancellation and unrelated requests; no calendar writes');
  }
  for(const r of results)console.log('PASS '+r);console.log(JSON.stringify({passed:results.length,liveData:false,liveGoogleWrites:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
