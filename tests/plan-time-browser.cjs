/* v1.49.6 立会・現調などの予定に時刻（開始・終了）を入れ、Googleカレンダーにその時間で登録する。
   Synthetic fixtures only (fictional names, example.com). Google Calendar is mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PT={get db(){return DB},get ui(){return ui},G,go,save,render,genTodos,dataRows,roCase,calendarDriftCases,authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const OLD_COLS=["受付番号","種類","段階","物件","部屋","依頼元","担当","受付日","予定日","実施日","見積額","受注日","仕事番号","施工完了日","請求日","請求額","入金予定日","入金済額","残額","遅れ日数","最終の動き","見積提出日","保留日","失注日","引渡日","入金日","段階キー","受付日時","会社","予定時刻（日本時間）","受注後取消日時","受注後取消理由","失注理由"];
async function device(width=390){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 const calls=[];
 await c.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/calendar/v3/calendars/')){const m=r.request().method();calls.push({method:m,path:decodeURIComponent(u.pathname),body:m==='GET'?null:r.request().postDataJSON()});return r.fulfill({contentType:'application/json',body:JSON.stringify({id:'x',htmlLink:'https://www.google.com/calendar/event?eid=synthetic'})})}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-03T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PT);
 await p.evaluate(()=>{const D=PT.db,C=o=>Object.assign({},{company:'CP',addr:'見本県見本市1-2-3',items:[],note:'',symptom:'',planDate:'',planTime:'',cancelledAt:'',cancelReason:'',estAmount:null,estSentDate:'',siteDate:'',lossReason:'',lossDate:'',holdDate:'',orderDate:'',jobNo:'',billingTenant:'入居者に直接',handedDate:'',gcal:null,builtDate:'',billDate:'',billAmount:null,billTo:'',payDue:'',payments:[],paidDate:'',payLog:[]},o);
  D.settings.data.ob={legacy:true};D.settings.rcpt.name='見本 一郎';
  D.cases=[C({id:'U-0201',type:'taikyo',stage:'new',client:'見本管理',clientKind:'管理会社',property:'見本荘',room:'101',tantou:'見本',receivedAt:'2026-11-02T01:00:00.000Z'}),
   C({id:'U-0202',type:'kinkyu',stage:'new',client:'見本管理',clientKind:'管理会社',property:'見本荘',room:'102',tantou:'見本',receivedAt:'2026-11-03T00:00:00.000Z',symptom:'水漏れ'})];
  D.settings.gWrite='work-cal@example.com';PT.G.cals=[{id:'work-cal@example.com',name:'見本の仕事',primary:false,owner:true,write:true}];PT.authorize();PT.save();PT.go('detail',{caseId:'U-0201'})});
 return {c,p,errors,calls};
}
const one=p=>p.evaluate(()=>JSON.parse(JSON.stringify(PT.db.cases.find(c=>c.id==='U-0201'))));
const setPlan=async(p,{date='2026-11-05',sh='',sm='',eh='',em=''}={})=>{await p.fill('#d_plan',date);for(const [id,v] of [['d_plan_hour',sh],['d_plan_minute',sm],['d_plan_end_hour',eh],['d_plan_end_minute',em]])await p.selectOption('#'+id,v);await p.click('[data-act=plan]')};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const {c,p,errors,calls}=await device();
 await check('立会の「日程を決める」に開始・終了の時・分があり、時刻なしは今までどおり終日',async()=>{
  for(const id of ['d_plan_hour','d_plan_minute','d_plan_end_hour','d_plan_end_minute'])assert.ok(await p.isVisible('#'+id),id);
  assert.match(await p.textContent('main'),/開始だけ入れたときは、開始から1時間の予定にします/);
  await setPlan(p);const k=await one(p);assert.equal(k.planDate,'2026-11-05');assert.equal(k.planTime,'');assert.equal(k.planEnd,'');
  assert.match(await p.textContent('#case-google-calendar'),/11\/5（.）.*（終日）/);
  await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy);
  const post=calls.find(x=>x.method==='POST');assert.deepEqual(post.body.start,{date:'2026-11-05'});assert.deepEqual(post.body.end,{date:'2026-11-06'});
  assert.equal(post.body.location,'見本県見本市1-2-3','the address handling is unchanged');
  assert.ok(!JSON.stringify(post.body).includes('null'),'no nulls when creating');
 });
 await check('時刻を入れると、その時間（日本時間）で登録・更新し、案件の画面にも「10:00〜11:30」と出る',async()=>{
  await setPlan(p,{sh:'10',sm:'00',eh:'11',em:'30'});const k=await one(p);assert.equal(k.planTime,'10:00');assert.equal(k.planEnd,'11:30');
  assert.match(await p.textContent('main'),/2026-11-05 10:00〜11:30/);
  assert.match(await p.textContent('#case-google-calendar'),/登録済みの時刻と予定の時刻が違います/);
  assert.match(await p.textContent('#case-google-calendar'),/11\/5（.）\s*10:00〜11:30/);
  assert.ok((await p.evaluate(()=>PT.calendarDriftCases().map(c=>c.id))).includes('U-0201'),'a time change is a drift');
  calls.length=0;await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy);
  const patch=calls.find(x=>x.method==='PATCH');
  assert.deepEqual(patch.body.start,{dateTime:'2026-11-05T10:00:00+09:00',timeZone:'Asia/Tokyo',date:null});
  assert.deepEqual(patch.body.end,{dateTime:'2026-11-05T11:30:00+09:00',timeZone:'Asia/Tokyo',date:null});
  assert.equal((await one(p)).gcal.when,'2026-11-05|10:00-11:30');assert.deepEqual(await p.evaluate(()=>PT.calendarDriftCases().map(c=>c.id)),[]);
  assert.match(await p.textContent('#case-google-calendar'),/登録済み/);
 });
 await check('開始だけなら開始から1時間。時刻を消すと終日に戻して更新する',async()=>{
  await setPlan(p,{sh:'14',sm:'15'});assert.equal((await one(p)).planEnd,'');
  calls.length=0;await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy);
  let patch=calls.find(x=>x.method==='PATCH');assert.equal(patch.body.end.dateTime,'2026-11-05T15:15:00+09:00');
  await setPlan(p,{sh:'23',sm:'30'});calls.length=0;await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy);
  patch=calls.find(x=>x.method==='PATCH');assert.equal(patch.body.end.dateTime,'2026-11-06T00:00:00+09:00','ends at the end of the day');
  await setPlan(p);calls.length=0;await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy);
  patch=calls.find(x=>x.method==='PATCH');assert.deepEqual(patch.body.start,{date:'2026-11-05',dateTime:null,timeZone:null});
  assert.match(await p.textContent('#case-google-calendar'),/（終日）/);
 });
 await check('保存されている終了が開始以下（古い列が残った場合など）は、使わずに開始から1時間として出し・登録する',async()=>{
  await p.evaluate(()=>{const k=PT.db.cases.find(c=>c.id==='U-0201');k.planDate='2026-11-05';k.planTime='15:00';k.planEnd='11:00';PT.save();PT.render()});
  assert.match(await p.textContent('main'),/2026-11-05 15:00〜16:00/);
  calls.length=0;await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy);
  const patch=calls.find(x=>x.method==='PATCH');assert.equal(patch.body.start.dateTime,'2026-11-05T15:00:00+09:00');assert.equal(patch.body.end.dateTime,'2026-11-05T16:00:00+09:00');
  await p.evaluate(()=>{const k=PT.db.cases.find(c=>c.id==='U-0201');k.planEnd='';PT.save();PT.render()});
 });
 await check('終了が開始より前・同じ、片方だけの選択、終了だけは保存しない（理由を出す）',async()=>{
  const before=await one(p);
  for(const [v,re] of [[{sh:'11',sm:'00',eh:'10',em:'00'},/終了は開始より後/],[{sh:'11',sm:'00',eh:'11',em:'00'},/終了は開始より後/],[{sh:'11',sm:''},/開始の「時」と「分」を両方/],[{sh:'11',sm:'00',eh:'12'},/終了の「時」と「分」を両方/],[{eh:'12',em:'00'},/終了だけは入れられません/]]){
   await setPlan(p,v);assert.match(await p.textContent('#toast'),re,JSON.stringify(v));assert.deepEqual(await one(p),before);}
 });
 await check('自動ToDoの期限は予定日のまま。記録シートの列は今までの位置のまま、終了時刻は一番右に足す',async()=>{
  await setPlan(p,{date:'2026-11-07',sh:'09',sm:'30',eh:'10',em:'15'});
  const todo=await p.evaluate(()=>PT.genTodos().find(t=>t.caseId==='U-0201'));assert.equal(todo.due,'2026-11-07');
  const rows=await p.evaluate(()=>PT.dataRows().cases);
  assert.deepEqual(rows[0].slice(0,OLD_COLS.length),OLD_COLS);assert.equal(rows[0][OLD_COLS.length],'予定終了時刻（日本時間）');assert.equal(rows[0].length,OLD_COLS.length+1);
  const r=rows.find(x=>x[0]==='U-0201');assert.equal(r[OLD_COLS.indexOf('予定時刻（日本時間）')],'09:30');assert.equal(r[OLD_COLS.length],'10:15');
  /* 共有の記録（社長・GMの画面と取り込み）でも終了時刻を読む。古い記録（列なし）は終了なし */
  const back=await p.evaluate(({head,row})=>{const o=Object.fromEntries(head.map((k,i)=>[k,row[i]]));const x={s:{name:'見本 一郎'}};const a=PT.roCase(o,x);delete o['予定終了時刻（日本時間）'];const b=PT.roCase(o,x);o['予定終了時刻（日本時間）']='08:00';const c=PT.roCase(o,x);o['予定時刻（日本時間）']='';o['予定終了時刻（日本時間）']='10:00';const d=PT.roCase(o,x);return [a.planTime,a.planEnd,b.planEnd,c.planEnd,d.planEnd]},{head:rows[0],row:r});
  assert.deepEqual(back,['09:30','10:15','','',''],'an end not after the start (e.g. a stale column) is ignored');
 });
 await check('古い記録（日付だけ・登録時刻を覚えていない）はそのまま読め、日付が同じならずれ扱いにしない',async()=>{
  await p.evaluate(()=>{const k=PT.db.cases.find(c=>c.id==='U-0201');delete k.planEnd;k.planTime='';k.planDate='2026-11-08';k.gcal={cal:'work-cal@example.com',calName:'見本の仕事',id:'cpghubold',date:'2026-11-08',link:''};PT.save();PT.render()});
  assert.deepEqual(await p.evaluate(()=>PT.calendarDriftCases().map(c=>c.id)),[]);assert.match(await p.textContent('main'),/2026-11-08 終日/);
  assert.match(await p.textContent('#case-google-calendar'),/登録済み/);
 });
 await check('緊急対応は今までどおり（時刻は必須、終了の欄はない）',async()=>{
  await p.evaluate(()=>PT.go('detail',{caseId:'U-0202'}));assert.equal(await p.locator('#d_plan_end_hour').count(),0);
  await p.fill('#d_plan','2026-11-03');await p.click('[data-act=plan]');assert.match(await p.textContent('#toast'),/予定時刻（日本時間）を入れてください/);
  await p.selectOption('#d_plan_hour','08');await p.selectOption('#d_plan_minute','05');await p.click('[data-act=plan]');
  const k=await p.evaluate(()=>JSON.parse(JSON.stringify(PT.db.cases.find(c=>c.id==='U-0202'))));assert.equal(k.planTime,'08:05');assert.ok(!('planEnd' in k)||k.planEnd==='');
 });
 await check('390px・360pxで横にはみ出さない',async()=>{
  await p.evaluate(()=>PT.go('detail',{caseId:'U-0201'}));
  for(const w of [390,360]){await p.setViewportSize({width:w,height:900});assert.ok(await p.evaluate(()=>Math.max(document.documentElement.scrollWidth-innerWidth,...[...document.querySelectorAll('main .panel,main .form')].map(x=>x.scrollWidth-x.clientWidth))<=0),String(w))}
  await p.setViewportSize({width:390,height:900});await p.evaluate(()=>{document.getElementById('toast').hidden=true;document.querySelector('.plan-time').scrollIntoView({block:'center'})});await p.screenshot({path:path.join(root,'docs/preview/plan-time-390.png')});
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
