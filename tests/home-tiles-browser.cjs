/* Synthetic render/state fixtures and mocked sync execution only; no external requests. */
'use strict';const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),KEY='workhub_proto_v1',AT='2026-10-31T10:50:00Z';let browser,server,origin;const results=[];
const hook=`window.ST={get db(){return DB},ui,go,render,save,CASE_DEFAULTS,genTodos,roTodos,allCases,accessWaiting,roBuild,rPending,rSubmitted,setUncertain(v){caseSaveUncertain=v},gSyncPanel,gSyncAllRun,prepareRun(fault){gAuthorize=async()=>{};gLoadCalendars=async()=>[];gResetReads=()=>{};gReadRange=async()=>({events:[],calendars:[],missing:0});gKeepSave=()=>{};dataSync=async step=>{step('領収書の写真の控え',true,'0枚');if(fault&&!['corp-signin','corp-read','corp-error'].includes(fault)){const e=Error(fault);if(fault==='requestBoxStopped')e.requestBoxStopped=true;throw e}for(const t of ['案件','入金','立替','ToDo','情報'])step('記録シート「'+t+'」',true,'0行')};corpRun=async()=>{if(fault==='corp-signin')throw Error('signin');if(fault==='corp-error')throw Error('synthetic-read');if(fault==='corp-read')return [{ok:false}];return []}}};`;
async function setup(role,old=false,tz='Asia/Tokyo'){const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:tz,hasTouch:true});await ctx.route('**/*',r=>{if(r.request().url()===origin+'/'){const s=old?cp.execFileSync('git',['show','2792e1a:index.html'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'index.html'),'utf8');return r.fulfill({contentType:'text/html',body:s.replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')})}if(r.request().url().startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date(AT)});await p.goto(origin+'/');await p.waitForFunction(()=>window.ST);await p.evaluate(({role,AT})=>{ST.db.cases=[];ST.db.todos=[];ST.db.receipts=[];const d=ST.db.settings.data;d.sheetId='synthetic-own';d.lastSync=AT;d.admin=role==='admin';if(['company','gm'].includes(role)){d.viewListId='synthetic-list';d.viewEmail='viewer@example.com';ST.ui.viewList=[{email:d.viewEmail,role:role==='gm'?'GM':'全社',gmCo:'CP'}]}
const s={name:'合成社員',email:'sample@example.com',sheetId:'synthetic-source',company:'CP',lastSync:'2026-10-31 19:50'};ST.ui.corp={at:Date.parse(AT),data:[{s,ok:true,cases:[],rc:[],todo:[],orders:[]}]};ST.ui.gsync={busy:false,complete:true,at:Date.parse(AT),rows:['Googleにログイン','カレンダー一覧','予定の読み込み','領収書の写真の控え','タスクリクエスト','記録シート「案件」','記録シート「情報」',...(role==='employee'?[]:['社員の記録'])].map(name=>({name,ok:true,msg:name==='タスクリクエスト'?'未完了 3件':'合成成功'}))};ST.save();ST.go('home')},{role,AT});return {ctx,p,errors};}

async function fixture(p,role,warning){
 await p.evaluate(({role,warning})=>{
  const t='2026-10-31',d=ST.db;
  d.cases=[Object.assign(ST.CASE_DEFAULTS(),{id:'SYN-URGENT',type:'kinkyu',stage:'new',company:'CP',property:'合成・緊急点検',receivedAt:'2026-10-30T01:00:00Z'}),Object.assign(ST.CASE_DEFAULTS(),{id:'SYN-BILL',type:'reno',stage:'billed',company:'CP',property:'合成・入金確認',billAmount:25000,payDue:'2026-10-30',estimate:25000})];
  d.cases.push(Object.assign(ST.CASE_DEFAULTS(),{id:'SYN-WAIT',type:'reno',stage:'won',company:'CP',property:'合成・Access待ち',orderDate:t,jobNo:''}));
  d.todos=[{id:'SYN-TODAY',title:'合成・今日の確認',due:t,done:false},{id:'I-SYN',title:'合成・指示を確認',due:'2026-10-30',done:false,order:true,synced:true}];
  const x=ST.ui.corp.data[0];x.s.company='CP';x.s.lastSync=warning?'2026-10-30 08:00':'2026-10-31 19:50';x.rc=[{'会社':'CP','状態':'未提出','金額':'1200','支払い方法':'立替'},{'会社':'CP','状態':'提出済','金額':'2300','支払い方法':'立替'},{'会社':'CP','状態':'未提出','金額':'9999','支払い方法':'法人カード'}];
  x.cases=[{'受付番号':'SYN-REMOTE','依頼種類':'緊急対応','段階':'受付','段階キー':'new','物件':'合成・共有点検','会社':'CP','受付日':'2026-10-30'}];
  if(warning){ST.ui.gsync.rows[0].ok=false;d.settings.data.lastSync='2026-10-30T00:00:00Z';ST.ui.corp.data.push({s:{name:'合成未読社員',company:'CP'},ok:false,msg:'合成通信エラー'});}
  if(role!=='employee')ST.roBuild(ST.ui.corp.data);
  ST.save();ST.go('home');
 },{role,warning});
}
async function main(){
 server=http.createServer((req,res)=>{try{res.end(fs.readFileSync(path.join(root,req.url.split('?')[0])))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const width of [390,820]){
  for(const role of ['employee','admin','company','gm']){
   const a=await setup(role),p=a.p;await p.setViewportSize({width,height:width===390?844:900});await fixture(p,role,false);
   const raw=await p.evaluate(KEY=>localStorage.getItem(KEY),KEY);
   assert.equal(await p.locator('#home-summary .tile').count(),8);
   assert.equal(await p.locator('#home-company').count(),role==='employee'?0:1);
   assert.equal(await p.locator('main table').count(),0);assert.equal(await p.locator('[data-open]').count(),0);
   const counts=await p.evaluate(()=>{const all=ST.allCases(),t='2026-10-31',todos=ST.genTodos().concat(ST.roTodos());return [todos.filter(x=>x.due&&x.due<t).length,todos.filter(x=>x.due===t).length,all.filter(x=>x.type==='kinkyu'&&['new','site'].includes(x.stage)).length]});
   for(let i=0;i<3;i++)assert.equal(await p.locator('#home-summary .tile .v').nth(i).innerText(),String(counts[i]));
   assert.equal(await p.locator('#home-summary .tile').nth(0).evaluate(e=>e.classList.contains('alert')),true);
   assert.equal(await p.locator('.sync-result').count(),1);assert.equal(await p.locator('#home-access .v').innerText(),'1件');assert.equal(await p.locator('#home-access.alert').count(),1);
   if(['employee','admin','company'].includes(role))await p.screenshot({path:path.join(root,'docs/preview/home-'+role+'-'+width+'.png')});
   for(const [n,view] of [[0,'todo'],[1,'todo'],[2,'cases'],[3,'cases'],[4,'cases'],[5,'stats'],[6,'rcpt'],[7,'rcpt']]){
    await p.locator('#home-summary .tile').nth(n).click();assert.equal(await p.evaluate(()=>ST.ui.view),view);
    if(n===2){assert.equal(await p.evaluate(()=>ST.ui.type),'kinkyu');assert.match(await p.locator('main').innerText(),/合成・緊急点検/);assert.ok(await p.locator('[data-since]').count()>0);}
    if(n===4){assert.equal(await p.locator('#handoffOnly').isChecked(),true);assert.deepEqual(await p.locator('[data-open]').evaluateAll(xs=>xs.map(x=>x.dataset.open)),['SYN-WAIT']);}
    if(n===3)assert.equal(await p.evaluate(()=>ST.ui.type),'all');
    if(n===5){assert.equal(await p.locator('#stats-unpaid').count(),1);const box=await p.locator('#stats-unpaid').boundingBox();assert.ok(box.y<150);}
    if(n===7)assert.equal(await p.evaluate(()=>ST.ui.rTab),'claims');
    await p.evaluate(()=>ST.go('home'));
   }
   await p.locator('#home-requests').click();assert.equal(await p.evaluate(()=>ST.ui.view),'todo');await p.evaluate(()=>ST.go('home'));
   if(role!=='employee'){
    await p.locator('#home-company').click();assert.equal(await p.evaluate(()=>ST.ui.view),'company');assert.equal(await p.locator('nav [data-nav="company"]').count(),0);
    assert.match(await p.locator('main').innerText(),/同期の状況/);assert.match(await p.locator('main').innerText(),/合成社員/);
    assert.equal(await p.locator('[data-cco]').count(),role==='gm'?0:4);
    if(role==='company'){assert.equal(await p.evaluate(()=>ST.ui.viewList[0].role),'全社');assert.equal(await p.evaluate(()=>ST.ui.viewList[0].gmCo),'CP');}
    if(role==='admin')await p.screenshot({path:path.join(root,'docs/preview/home-company-page-'+width+'.png')});
    await p.getByRole('button',{name:'‹ ホームへ戻る'}).click();assert.equal(await p.evaluate(()=>ST.ui.view),'home');
    await p.evaluate(()=>ST.go('rcpt'));const table=p.locator('.panel').filter({has:p.getByRole('heading',{name:'立替',exact:true})});assert.match(await table.innerText(),/1,200/);assert.match(await table.innerText(),/2,300/);assert.doesNotMatch(await table.innerText(),/9,999/);await p.evaluate(()=>ST.go('home'));
   }else{await p.evaluate(()=>ST.go('company'));assert.equal(await p.evaluate(()=>ST.ui.view),'home');}
   assert.equal(await p.evaluate(KEY=>localStorage.getItem(KEY),KEY),raw);
   const transient=await p.evaluate(()=>({corp:ST.ui.corp,gsync:ST.ui.gsync,viewList:ST.ui.viewList}));await p.reload();await p.waitForFunction(()=>window.ST);assert.equal(await p.evaluate(KEY=>localStorage.getItem(KEY),KEY),raw);await p.evaluate(u=>Object.assign(ST.ui,u),transient);await fixture(p,role,false);
   await fixture(p,role,true);assert.match(await p.locator('#home-sync').innerText(),/同期エラー 1件/);assert.match(await p.locator('#home-sync').innerText(),/今日未同期 1件/);assert.equal(await p.locator('.sync-result').count(),0);
   if(role!=='employee'){assert.equal(await p.locator('#home-company.alert').count(),1);assert.match(await p.locator('#home-company').innerText(),/今日未同期 1人・読めなかった社員 1人/);}
   if(role==='admin'){await p.screenshot({path:path.join(root,'docs/preview/home-warning-'+width+'.png')});if(width===390){await p.locator('#home-sync').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(root,'docs/preview/home-warning-bottom-390.png')});}}
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(a.errors,[]);await a.ctx.close();results.push(role+' '+width+': counters/navigation/warnings/moved tables/role limits/storage unchanged');
  }
 }
 const boundary=await setup('admin');await boundary.p.evaluate(()=>{const mk=(id,o)=>Object.assign(ST.CASE_DEFAULTS(),{id,type:'reno',company:'CP',stage:'won',property:'合成境界 '+id,jobNo:''},o);ST.db.cases=[mk('WAIT',{}),mk('SPACE',{jobNo:'  '}),mk('NUMBER',{jobNo:'JOB-123'}),mk('CANCEL',{cancelledAt:'2026-10-29T00:00:00Z'}),mk('LOST',{stage:'lost'}),mk('HANDED',{stage:'handed',jobNo:'JOB-456'}),mk('PAID',{stage:'paid'}),mk('WORKING',{stage:'working'}),mk('QUOTED',{stage:'quoted'})];ST.ui.corpTodo=[];ST.ui.corpRO=[{...mk('RO-WAIT',{}),ro:true,owner:'合成社員',srcId:'REMOTE'}];ST.render();});
 assert.equal(await boundary.p.locator('#home-access .v').innerText(),'3件');await boundary.p.locator('#home-access').click();assert.deepEqual((await boundary.p.locator('[data-open]').evaluateAll(xs=>xs.map(x=>x.dataset.open))).sort(),['RO-WAIT','SPACE','WAIT']);
 await boundary.p.locator('#handoffOnly').uncheck();assert.ok(await boundary.p.locator('[data-open]').count()>3);await boundary.p.evaluate(()=>{ST.db.cases=[];ST.ui.corpRO=[];ST.go('home')});assert.equal(await boundary.p.locator('#home-access .v').innerText(),'0件');assert.equal(await boundary.p.locator('#home-access.alert').count(),0);await boundary.ctx.close();results.push('Access waiting: same tile/list predicate, whitespace, existing number, cancellation/lost/handed/working/paid/quoted, readonly, zero and clear filter');
 const a=await setup('employee');await a.p.setViewportSize({width:360,height:800});await a.p.evaluate(()=>{ST.db.cases=[];ST.db.todos=[];ST.render()});assert.equal(await a.p.locator('#home-summary .tile').count(),8);assert.equal(await a.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await a.ctx.close();results.push('360px empty tiles retained without horizontal overflow');
 console.log(results.map(x=>'PASS '+x).join('\n'));console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
