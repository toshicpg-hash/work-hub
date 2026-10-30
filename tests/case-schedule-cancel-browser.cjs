/* Synthetic fixtures only; all external requests are blocked. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const sheetReply=require('./helpers/case-sheet-mock.cjs');
const root=path.resolve(__dirname,'..'),KEY='workhub_proto_v1';
const hook='window.testHub={get db(){return DB},ui,go,emptyDB,CASE_DEFAULTS,save,render,genTodos,dataRows,roCase,roDetail,upgrade,ended,gSyncAll,sheetWrite,sheetRead,vStats,get uncertain(){return caseSaveUncertain},authorize(){G.token="synthetic-token";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000;}};';
let server,browser,origin;const results=[];
async function setup(db,tz='Asia/Tokyo',width=390,network=null,baseline=false,touch=false){
 const ctx=await browser.newContext({timezoneId:tz,locale:'ja-JP',viewport:{width,height:900},hasTouch:touch,isMobile:touch,...(touch?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})}),requests=[],errors=[];
 await ctx.route('**/*',r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:(baseline?require('node:child_process').execFileSync('git',['show','c8db9bd:index.html'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'index.html'),'utf8')).replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u===origin+'/seed')return r.fulfill({contentType:'text/html',body:'<!doctype html>'});if(u.startsWith(origin+'/'))return r.continue();requests.push({url:u,method:r.request().method()});
 if(network&&u.includes('/calendar/v3/users/me/calendarList'))return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
 if(network&&u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic-own')){
  const answer=sheetReply(network,r.request());return r.fulfill({status:answer.status||200,contentType:'application/json',body:JSON.stringify(answer.body)});
 }
 return r.fulfill({status:200,body:''});});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-29T15:05:00Z'));await p.goto(origin+'/seed');if(db)await p.evaluate(({KEY,db})=>localStorage.setItem(KEY,JSON.stringify(db)),{KEY,db});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.testHub);return {ctx,p,requests,errors};
}
const setTime=async(p,time)=>{const [hour='',minute='']=time.split(':');await p.locator('#d_plan_hour').selectOption(hour);await p.locator('#d_plan_minute').selectOption(minute);};
const readTime=async p=>{const h=await p.locator('#d_plan_hour').inputValue(),m=await p.locator('#d_plan_minute').inputValue();return h!==''&&m!==''?h+':'+m:'';};
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
   await setTime(p,'10:00');await p.locator('[data-nav="cases"]').first().click();await open(p,'synthetic-emergency');assert.equal(await readTime(p),'');
   for(const [day,time] of [['2026-11-11','10:00'],['2026-11-12','00:05'],['2026-11-11','23:55']]){
    await p.locator('#d_plan').fill(day);await setTime(p,time);await click(p,'plan');let c=(await read(p)).cases[0];assert.equal(c.planDate,day);assert.equal(c.planTime,time);assert.equal(c.stage,'new');assert.equal(c.siteDate,'');assert.equal(c.gcal,null);assert.equal(await p.evaluate(()=>testHub.genTodos().find(t=>t.caseId==='synthetic-emergency').due),day);
    await p.reload();await open(p,c.id);assert.equal(await p.locator('#d_plan').inputValue(),day);assert.equal(await readTime(p),time);assert.match(await p.locator('#main').innerText(),/日本時間/);
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
    const a=await setup(db),{p}=a;await open(p,action==='cancel'?'synthetic-won':'synthetic-emergency');if(action==='cancel'){await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('保持する理由');}else{await p.locator('#d_plan').fill('2026-11-11');await setTime(p,'10:00');}
    await p.evaluate(({KEY,fault})=>{if(fault==='busy'){testHub.ui.gsync={busy:true};return}if(fault==='concurrent'){const other=JSON.parse(localStorage.getItem(KEY));other.unknown.newer=true;localStorage.setItem(KEY,JSON.stringify(other));return}const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===KEY){if(fault==='quota')throw new DOMException('quota','QuotaExceededError');return;}return original.call(this,k,v)};},{KEY,fault});const before=await read(p);await click(p,action==='cancel'?'woncancelsave':'plan');assert.deepEqual(await read(p),before);assert.equal(await p.evaluate(()=>testHub.db.cases[1].stage),'won');assert.equal(await p.evaluate(()=>testHub.db.cases[0].planDate),'');if(action==='cancel'){assert.equal(await p.locator('#d_cancel_reason').inputValue(),'保持する理由');assert.match(await p.locator('#wonCancelStatus').innerText(),/保存|処理中/);}assert.doesNotMatch(await p.locator('#toast').innerText(),/取消を記録しました|の予定を入れました/);await a.ctx.close();results.push(action+' failure '+fault+' preserves state and never reports success');
   }
  }
  {
   const a=await setup(db),{p}=a;await open(p,'synthetic-normal');assert.equal(await p.locator('#d_plan_hour,#d_plan_minute,input[type=time]').count(),0);await p.locator('#d_plan').fill('2026-11-15');await click(p,'plan');assert.equal((await read(p)).cases[2].planDate,'2026-11-15');
   await open(p,'synthetic-quoted');await click(p,'lose');assert.equal((await read(p)).cases.find(c=>c.id==='synthetic-quoted').stage,'lost');await click(p,'reopen');assert.equal((await read(p)).cases.find(c=>c.id==='synthetic-quoted').stage,'quoted');await p.locator('#d_hold').fill('2026-11-20');await click(p,'hold');assert.equal((await read(p)).cases.find(c=>c.id==='synthetic-quoted').holdDate,'2026-11-20');
   for(const stage of ['handed','working','built','billed','paid']){await open(p,'synthetic-'+stage);assert.equal(await p.locator('[data-act="woncancelask"]').count(),0);await stale(p,'woncancelask');assert.equal(await p.locator('#d_cancel_reason').count(),0);}
   const old=await p.evaluate(()=>testHub.roCase({'受付番号':'old','種類':'緊急対応','段階キー':'new'},{s:{name:'合成旧版'}}));assert.equal(old.planTime,'');assert.equal(old.cancelledAt,'');assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('Normal schedule/loss/reopen/hold, old share defaults and post-handoff scope');
  }
  {
   const syncDb=structuredClone(db);syncDb.settings.data.sheetId='synthetic-own';const network={exports:{}},a=await setup(syncDb,'Asia/Tokyo',390,network),{p}=a;
   await open(p,'synthetic-emergency');await p.locator('#d_plan').fill('2026-11-11');await setTime(p,'10:00');await click(p,'plan');
   await open(p,'synthetic-won');await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('合成同期確認');await click(p,'woncancelsave');const before=await read(p);
   for(let i=0;i<2;i++){
    await p.evaluate(async()=>{testHub.authorize();await testHub.gSyncAll();});assert.equal(await p.evaluate(()=>testHub.ui.gsync.busy),false);
    assert.equal(await p.evaluate(()=>testHub.ui.gsync.rows.every(r=>r.ok)),true);
    const rows=network.exports['案件'];assert(rows);assert.equal(rows[1][rows[0].indexOf('予定時刻（日本時間）')],'10:00');assert.equal(rows[2][rows[0].indexOf('受注後取消理由')],'合成同期確認');
    assert.equal(network.exports.ToDo.some(r=>r[3]==='synthetic-won'&&r[6]!=='手入力'),false);
    assert.deepEqual((await read(p)).cases,before.cases);assert.deepEqual((await read(p)).todos,before.todos);
   }
   await p.reload();assert.deepEqual((await read(p)).cases,before.cases);assert(a.requests.filter(r=>r.method!=='GET').every(r=>/^https:\/\/sheets.googleapis.com\/v4\/spreadsheets\/synthetic-own(?:\/|:batchUpdate)/.test(r.url)));assert.equal(network.grid.columnCount,32);assert.equal(network.caseClear,undefined);assert.equal(network.batches,2);assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('Repeated full mocked shared sync preserves schedule/cancellation and unrelated requests; no calendar writes');
  }
  for(const fault of ['read-throws','read-old','read-replaced'])for(const action of ['cancel','plan']){
   const syncDb=structuredClone(db);syncDb.settings.data.sheetId='synthetic-own';const network={exports:{}},a=await setup(syncDb,'Asia/Tokyo',390,network),{p}=a;
   await open(p,action==='cancel'?'synthetic-won':'synthetic-emergency');
   if(action==='cancel'){await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('合成保存結果不明');}else{await p.locator('#d_plan').fill('2026-11-11');await setTime(p,'00:05');}
   await p.evaluate(({KEY,fault})=>{
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem,old=get.call(localStorage,KEY);let written=false;
    window.keyWrites=0;window.actualRaw=()=>get.call(localStorage,KEY);window.restoreFault=()=>{Storage.prototype.getItem=get;Storage.prototype.setItem=set;};
    const toast=document.getElementById('toast'),descriptor=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');window.toastWrites=[];
    Object.defineProperty(toast,'textContent',{get(){return descriptor.get.call(this)},set(v){toastWrites.push(String(v));descriptor.set.call(this,v)}});
    Storage.prototype.setItem=function(k,v){if(k===KEY){keyWrites++;set.call(this,k,v);written=true;if(fault==='read-replaced'){const newer=JSON.parse(v);newer.unknown.concurrent='preserve-newer';set.call(this,k,JSON.stringify(newer));}return;}return set.call(this,k,v);};
    Storage.prototype.getItem=function(k){if(k===KEY&&written){if(fault==='read-throws')throw Error('synthetic readback error after successful write');if(fault==='read-old')return old;}return get.call(this,k);};
   },{KEY,fault});
   await click(p,action==='cancel'?'woncancelsave':'plan');const saved=await p.evaluate(()=>JSON.parse(actualRaw()));
   assert.equal(await p.evaluate(()=>keyWrites),1);assert.equal(await p.evaluate(()=>testHub.uncertain),true);assert.equal(await p.evaluate(()=>testHub.db.cases[1].stage),'won');assert.equal(await p.evaluate(()=>testHub.db.cases[0].planDate),'');
   if(action==='cancel'){assert.equal(saved.cases[1].stage,'lost');assert.equal(await p.locator('#d_cancel_reason').inputValue(),'合成保存結果不明');}else{assert.equal(saved.cases[0].planTime,'00:05');assert.equal(await readTime(p),'00:05');}
   if(fault==='read-replaced')assert.equal(saved.unknown.concurrent,'preserve-newer');
   const requestsBefore=a.requests.length;
   await click(p,action==='cancel'?'woncancelsave':'plan');await stale(p,'rushwin');
   assert.equal(await p.evaluate(()=>testHub.save()),false);
   await p.evaluate(async()=>{testHub.authorize();await testHub.gSyncAll();});
   assert.equal(a.requests.length,requestsBefore);assert.equal(await p.evaluate(()=>keyWrites),1);assert.deepEqual(await p.evaluate(()=>JSON.parse(actualRaw())),saved);
   assert.doesNotMatch((await p.evaluate(()=>toastWrites)).join('\n'),/取消を記録しました|の予定を入れました|受注にしました/);
   assert.match(await p.locator('#manualTodoStorageNotice').innerText(),/保存・共有を停止/);
   await p.evaluate(()=>restoreFault());await p.reload();assert.equal(await p.evaluate(()=>testHub.uncertain),false);assert.deepEqual(await read(p),saved);
   await open(p,action==='cancel'?'synthetic-won':'synthetic-emergency');
   if(action==='cancel'){assert.match(await p.locator('#main').innerText(),/受注後取消済み/);await stale(p,'woncancelsave');assert.equal((await read(p)).cases[1].cancelledAt,saved.cases[1].cancelledAt);}else assert.equal(await readTime(p),'00:05');
   await p.evaluate(async()=>{testHub.authorize();await testHub.gSyncAll();});assert.equal(await p.evaluate(()=>testHub.ui.gsync.rows.every(r=>r.ok)),true);assert.deepEqual((await read(p)).cases,saved.cases);
   const rows=network.exports['案件'],n=action==='cancel'?2:1,key=action==='cancel'?'受注後取消日時':'予定時刻（日本時間）';assert.equal(rows[n][rows[0].indexOf(key)],action==='cancel'?saved.cases[1].cancelledAt:'00:05');
   assert.deepEqual(a.errors,[]);await a.ctx.close();results.push(action+' actual write then '+fault+': no success toast, retry/save/sync blocked, reload restores latest once');
  }
  {
   const a=await setup(db),{p}=a;await open(p,'synthetic-won');const stats=await p.evaluate(()=>testHub.vStats());await click(p,'woncancelask');assert.match(await p.locator('#main').innerText(),/元の受注月の受注件数・受注額には残ります/);await p.locator('#d_cancel_reason').fill('合成集計確認');await click(p,'woncancelsave');assert.equal(await p.evaluate(()=>testHub.vStats()),stats);
   const backup=await read(p);await p.evaluate(({KEY,backup})=>localStorage.setItem(KEY,JSON.stringify(testHub.upgrade(JSON.parse(JSON.stringify(backup))))),{KEY,backup});await p.reload();assert.deepEqual(await read(p),backup);await open(p,'synthetic-won');assert.match(await p.locator('#main').innerText(),/受注後取消済み/);await a.ctx.close();results.push('Cancellation keeps original order/loss statistics and survives explicit JSON backup restore');
  }
  {
   const a=await setup(db),{p}=a;await open(p,'synthetic-emergency');const before=await read(p);await p.locator('#d_plan').fill('');await click(p,'plan');assert.match(await p.locator('#toast').innerText(),/予定日を入れて/);await setTime(p,'10:00');await click(p,'plan');assert.deepEqual(await read(p),before);await p.locator('#d_plan').fill('2026-11-11');await click(p,'plan');const booked=await read(p);await p.locator('#d_plan').fill('');await setTime(p,'');await click(p,'plan');assert.deepEqual(await read(p),booked);await p.reload();await open(p,'synthetic-emergency');assert.equal(await readTime(p),'10:00');await a.ctx.close();results.push('Empty date, time-only and clearing fields do not save or silently remove an appointment');
  }
  for(const fault of [null,'metadata','missing-grid','batch','expand','values']){
   const original=[['old header'],['old mirror']],network={exports:{'案件':structuredClone(original)},fault,grid:{sheetId:17,columnCount:29,rowCount:3}},a=await setup(db,'Asia/Tokyo',390,network),{p}=a;
   const outcome=await p.evaluate(async()=>{testHub.authorize();try{await testHub.sheetWrite('synthetic-own','案件',testHub.dataRows().cases);return 'ok'}catch(e){return e.message}});
   assert.equal(network.caseClear,undefined);
   if(fault){assert.notEqual(outcome,'ok');assert.deepEqual(network.exports['案件'],original);assert.equal(network.grid.columnCount,29);assert.equal(network.grid.rowCount,3);if(['metadata','missing-grid'].includes(fault))assert.equal(network.calls.filter(r=>r.method!=='GET').length,0);}
   else{assert.equal(outcome,'ok');assert.equal(network.grid.columnCount,32);assert.equal(network.grid.rowCount,db.cases.length+1);assert.equal(network.exports['案件'][0].length,32);const count=network.grid.rowCount;await p.evaluate(()=>testHub.sheetWrite('synthetic-own','案件',[testHub.dataRows().cases[0]]));assert.equal(network.grid.rowCount,count);assert.equal(network.grid.columnCount,32);assert.equal(network.exports['案件'].length,1);}
   assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('29-column bounded mirror '+(fault||'grow/repeat/header-only')+': no preclear and no partial mutation');
  }
  {
   const a=await setup(db),{p}=a;await open(p,'synthetic-emergency');await p.locator('#d_plan').fill('2026-11-11');await setTime(p,'10:00');await click(p,'plan');await open(p,'synthetic-won');await click(p,'woncancelask');await p.locator('#d_cancel_reason').fill('合成旧版互換');await click(p,'woncancelsave');
   const stored=await read(p),newRows=await p.evaluate(()=>testHub.dataRows().cases),old=await setup(stored,'Asia/Tokyo',390,null,true);
   const result=await old.p.evaluate(rows=>{const r=Object.fromEntries(rows[0].map((k,i)=>[k,rows[2][i]])),c=testHub.roCase(r,{s:{name:'合成旧版'}});return {stage:c.stage,ended:testHub.ended(c),save:testHub.save(),rows:testHub.dataRows().cases};},newRows);
   assert.equal(result.stage,'lost');assert.equal(result.ended,true);assert.equal(result.save,true);assert.deepEqual((await read(old.p)).cases,stored.cases);assert.equal(result.rows[0].length,29);
   const restored=await p.evaluate(rows=>{const r=Object.fromEntries(rows[0].map((k,i)=>[k,rows[2][i]])),c=testHub.roCase(r,{s:{name:'合成旧共有'}});return {stage:c.stage,ended:testHub.ended(c),reason:c.cancelReason};},result.rows);
   assert.equal(restored.stage,'lost');assert.equal(restored.ended,true);assert.equal(restored.reason,'');assert.deepEqual(old.errors,[]);await old.ctx.close();await a.ctx.close();results.push('Actual v1.45 reads new lost export and preserves unknown local fields on save; its 29-column re-export loses added detail but stays ended');
  }
  {
   const header=Array.from({length:32},(_,i)=>'column-'+i),many=[header,...Array.from({length:12},(_,i)=>['synthetic-row-'+i,...Array.from({length:31},(_,c)=>'old-value-'+i+'-'+c)])];
   const few=[header,...[2,7].map(i=>['synthetic-row-'+i,...Array.from({length:31},(_,c)=>'current-value-'+i+'-'+c)])];
   const oldValues=many.slice(1).flatMap(r=>r.slice(1)),removedIds=many.slice(1).map(r=>r[0]).filter(id=>!few.some(r=>r[0]===id));
   const network={exports:{},grid:{sheetId:17,columnCount:29,rowCount:3}},a=await setup(db,'Asia/Tokyo',390,network),{p}=a;
   const write=rows=>p.evaluate(async rows=>{testHub.authorize();await testHub.sheetWrite('synthetic-own','案件',rows);},rows);
   const get=()=>p.evaluate(async()=>{const data=await testHub.sheetRead('synthetic-own',['案件']);return data['案件'];});
   const check=(actual,expected,forbidden)=>{assert.deepEqual(actual,expected);const values=new Set(actual.flat());for(const v of forbidden)assert.equal(values.has(v),false,'retired value returned: '+v);for(const cell of Object.values(network.cells))assert.equal(forbidden.includes(cell.userEnteredValue?.stringValue),false,'retired value remains in stored cell');};
   await write(many);assert.deepEqual(await get(),many);const size={...network.grid};
   network.cells['11,31'].userEnteredFormat={backgroundColor:{red:0.5}};
   await write(few);check(await get(),few,[...removedIds,...oldValues]);
   await write(few);check(await get(),few,[...removedIds,...oldValues]);
   const allIds=many.slice(1).map(r=>r[0]),currentValues=few.slice(1).flatMap(r=>r.slice(1));
   await write([header]);check(await get(),[header],[...allIds,...oldValues,...currentValues]);
   await write([header]);check(await get(),[header],[...allIds,...oldValues,...currentValues]);
   assert.deepEqual(network.grid,size);assert.deepEqual(network.cells['11,31'].userEnteredFormat,{backgroundColor:{red:0.5}});assert.equal(network.cells['11,31'].userEnteredValue,undefined);assert.equal(network.caseClear,undefined);
   // Every committed state after removal is checked, not only the last GET response.
   assert.deepEqual(network.snapshots,[many,few,few,[header],[header]]);assert.equal(network.calls.filter(r=>r.method==='GET'&&r.path.endsWith('/values:batchGet')).length,5);
   assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('Persistent cells: many to few, GET, same resync, header only, GET and header resync never retain or revive removed IDs/values; formatting remains');
  }
  {
   // Negative controls: a bounded range or wrong field mask must NOT clear old values.
   const n={exports:{'案件':[['header'],['retired-id','retired-value']]},grid:{sheetId:17,columnCount:3,rowCount:4}};
   const batch=updateCells=>sheetReply(n,{url:()=> 'https://sheets.googleapis.com/v4/spreadsheets/synthetic-own:batchUpdate',method:()=> 'POST',postDataJSON:()=>({requests:[{updateCells}]})});
   const get=()=>sheetReply(n,{url:()=> "https://sheets.googleapis.com/v4/spreadsheets/synthetic-own/values/%27%E6%A1%88%E4%BB%B6%27",method:()=> 'GET'}).body.values;
   assert.equal(batch({range:{sheetId:17,startRowIndex:0,endRowIndex:1},rows:[{values:[{userEnteredValue:{stringValue:'new-header'}}]}],fields:'userEnteredValue'}).status,undefined);assert.deepEqual(get(),[['new-header'],['retired-id','retired-value']]);
   batch({range:{sheetId:17},rows:[],fields:'userEnteredFormat'});assert.deepEqual(get(),[['new-header'],['retired-id','retired-value']]);
   batch({range:{sheetId:17},rows:[{values:[{userEnteredValue:{stringValue:'new-header'}}]}],fields:'userEnteredValue'});assert.deepEqual(get(),[['new-header']]);results.push('Grid model negative controls: bounded ranges and format-only masks retain old values; full value range clears them');
  }
  for(const width of [320,390,822]){
   const a=await setup(db,'Asia/Tokyo',width,null,false,true),{p}=a;await open(p,'synthetic-emergency');
   const hour=p.getByLabel('時（日本時間・24時間）',{exact:true}),minute=p.getByLabel('分（日本時間）',{exact:true});
   assert.equal(await p.locator('input[type=time]').count(),0);assert.equal(await hour.inputValue(),'');assert.equal(await minute.inputValue(),'');assert.equal(await hour.getAttribute('required'),'');assert.equal(await minute.getAttribute('required'),'');
   await p.locator('#d_plan').fill('2026-11-11');const before=await read(p);
   for(const partial of [['',''],['10',''],['','07']]){await hour.selectOption(partial[0]);await minute.selectOption(partial[1]);await p.locator('[data-act=plan]').tap();assert.deepEqual(await read(p),before);assert.match(await p.locator('#toast').innerText(),/予定時刻/);}
   // Tap opens each select, then keyboard navigation selects its actual option. No fill/selectOption here.
   const choose=async(field,n)=>{await field.tap();await p.keyboard.press('Home');for(let i=0;i<=n;i++)await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');assert.equal(await field.inputValue(),String(n).padStart(2,'0'));};
   for(const [h,m] of [[0,0],[23,59],[10,7]]){await choose(hour,h);await choose(minute,m);await p.locator('[data-act=plan]').tap();const expected=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');assert.equal((await read(p)).cases[0].planTime,expected);await p.reload();await open(p,'synthetic-emergency');assert.equal(await readTime(p),expected);assert.equal(await p.evaluate(()=>testHub.genTodos().find(t=>t.caseId==='synthetic-emergency').due),'2026-11-11');}
   await choose(hour,12);await p.locator('[data-nav=cases]').first().tap();await open(p,'synthetic-emergency');assert.equal(await readTime(p),'10:07');
   const saved=await read(p);await hour.tap();await p.keyboard.press('Escape');assert.deepEqual(await read(p),saved);
   await p.addStyleTag({content:'#d_plan_hour,#d_plan_minute{font-size:24px} label.f:has(#d_plan_hour),label.f:has(#d_plan_minute){font-size:24px}'});
   for(const f of [hour,minute]){assert(await f.evaluate(e=>e.getBoundingClientRect().width>=42&&e.getBoundingClientRect().height>=42));assert(await f.evaluate(e=>e.scrollWidth<=e.clientWidth));}
   await p.evaluate(()=>{document.body.style.zoom='1.25'});for(const f of [hour,minute]){await f.scrollIntoViewIfNeeded();assert(await f.isVisible());assert(await f.evaluate(e=>e.scrollWidth<=e.clientWidth));}
   assert.deepEqual(a.errors,[]);assert.equal(a.requests.filter(r=>r.method!=='GET').length,0);await a.ctx.close();results.push('Touch/keyboard selects, required/partial, midnight/latest/minute precision, back/cancel/reload, large text and zoom '+width+'px');
  }
  {
   const malformed=structuredClone(db);malformed.cases[0].planTime='25:91';const a=await setup(malformed),{p}=a;await open(p,'synthetic-emergency');assert.equal(await readTime(p),'');assert.match(await p.locator('#main').innerText(),/保存済みの時刻を選択欄に表示できません/);await click(p,'plan');assert.equal((await read(p)).cases[0].planTime,'25:91');await p.reload();assert.equal((await read(p)).cases[0].planTime,'25:91');await a.ctx.close();results.push('Invalid legacy time remains unchanged and requires explicit valid selection');
  }
  {
   const malformed=structuredClone(db);malformed.cases[0].planTime=['10:00'];const a=await setup(malformed),{p}=a;const before=await read(p);
   await open(p,'synthetic-emergency');assert.equal(await readTime(p),'');assert.match(await p.locator('#main').innerText(),/保存済みの時刻を選択欄に表示できません/);assert.deepEqual(await read(p),before);
   await p.locator('[data-nav=cases]').first().click();await open(p,'synthetic-emergency');assert.deepEqual(await read(p),before);await p.reload();await open(p,'synthetic-emergency');assert.deepEqual(await read(p),before);assert.deepEqual(a.errors,[]);await a.ctx.close();results.push('Wrong-type legacy array never crashes detail and opening/back/reload preserve entire DB');
  }
  for(const r of results)console.log('PASS '+r);console.log(JSON.stringify({passed:results.length,liveData:false,liveGoogleWrites:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
