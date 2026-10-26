/* Synthetic fixtures only. Google requests are intercepted; no live credentials or mutations. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'), results=[];
const hook='window.testHub={get db(){return DB},ui,go,genTodos,roCase,roBuild,typeKeyOf,stepBar,vCal,gReadOne,gcalByDay,gcalStatus,upgrade,emptyDB,CASE_DEFAULTS,save,G,render,dataRows,photoPut,photoGet};';
const fixtureCase=(defs,extra)=>({...defs,id:'U-0100',company:'CP',type:'reno',stage:'new',client:'既存依頼元',clientKind:'管理会社',property:'既存物件',room:'101',tantou:'トシ',receivedAt:'2026-10-20T00:00:00.000Z',...extra});
let server,browser,origin;
async function context(width,db){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.addInitScript(({db})=>{if(!localStorage.getItem('testSeed')){if(db)localStorage.setItem('workhub_proto_v1',JSON.stringify(db));localStorage.setItem('toshi_v5','{"diary":"keep-original"}');localStorage.setItem('toshi_hub_safe_v1','{"history":["keep"]}');localStorage.setItem('testSeed','1')}},{db});
 const errors=[],requests=[];
 await c.route('**/*',async r=>{
  const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){
   const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');
   return r.fulfill({contentType:'text/html',body:s});
  }
  if(u.startsWith(origin+'/'))return r.continue();
  if(u.startsWith('https://www.googleapis.com/')){requests.push({url:u,method:r.request().method()});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[]})})}
  return r.fulfill({status:200,body:''});
 });
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-10-25T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.testHub);await p.evaluate(()=>testHub.photoPut('keep-photo-key',new Blob(['original-photo-bytes'],{type:'image/jpeg'})));
 return {c,p,errors,requests};
}
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const raw=p=>p.evaluate(()=>localStorage.getItem('workhub_proto_v1'));
const go=(p,view,extra={})=>p.evaluate(({view,extra})=>testHub.go(view,extra),{view,extra});
const storageGuards=async p=>{assert.equal(await p.evaluate(()=>localStorage.getItem('toshi_v5')),'{"diary":"keep-original"}');assert.equal(await p.evaluate(()=>localStorage.getItem('toshi_hub_safe_v1')),'{"history":["keep"]}')};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const seed=await context(390);const defs=await seed.p.evaluate(()=>testHub.CASE_DEFAULTS());const db=await seed.p.evaluate(()=>testHub.emptyDB());await seed.c.close();
 db.seq=102;db.history=[{at:'keep-history',unknown:{preserve:true}}];db.unknown={keep:'all-fields'};
 db.settings.gShow=['test-calendar'];db.settings.gWrite='test-calendar';db.settings.data.sheetId='existing-sheet';db.settings.rcpt.cards=[{id:'C1',name:'keep-card',unknown:7}];
 db.cases=[fixtureCase(defs,{planDate:'2026-10-25',gcal:{id:'existing-event',cal:'test-calendar',date:'2026-10-25'},unknown:{keep:true}}),fixtureCase(defs,{id:'U-0101',stage:'quoted',siteDate:'2026-10-25',estSentDate:'2026-10-25',orderDate:'2026-10-25',payments:[{date:'2026-10-24',amount:123}],payLog:[{kind:'req',at:'2026-10-24'}]})];
 db.todos=[{id:'late',title:'未完了・超過',due:'2026-10-23',done:false,tantou:'トシ',history:['keep']},{id:'today',title:'未完了・今日',due:'2026-10-25',done:false,tantou:'トシ'},{id:'future',title:'未完了・未来',due:'2026-10-26',done:false},{id:'none',title:'期限なし',due:'',done:false},{id:'done',title:'完了済み',due:'2026-10-25',done:true}];
 db.todos.forEach(t=>{if(t.tantou===undefined)t.tantou=''});
 db.receipts=[{id:'R-0100',date:'2026-10-24',payee:'既存取引先',amount:1234,photos:['keep-photo-key'],edits:[{reason:'keep'}],drive:{file:'keep-file'},pext:{invoice:'keep'},status:'未提出',method:'立替',company:'CP',payments:['unknown-keep']}];db.rseq=100;
 for(const width of [320,390,822,1280])await check('月・週・日とデータ保持 '+width+'px',async()=>{
  const {p,c,errors}=await context(width,db);const before=await raw(p);
  await p.evaluate(()=>{testHub.ui.corp={at:Date.now(),kept:true};testHub.ui.corpRO=[{...testHub.CASE_DEFAULTS(),id:'remote・社員',srcId:'remote',ro:true,type:'reno',stage:'new',property:'社員案件',room:'',tantou:'社員',planDate:'2026-10-25'}];testHub.ui.corpTodo=[{title:'社員・超過',due:'2026-10-24',ro:true,tantou:'社員',caseId:'remote・社員'},{title:'社員・未来',due:'2026-10-26',ro:true}];testHub.db.settings.data.admin=true});
  // Seed the existing last-calendar cache, including both local and staff-linked events.
  await p.evaluate(()=>localStorage.setItem('workhub_gcal_last_v1',JSON.stringify({policy:2,at:Date.now(),from:'2026-09-01',to:'2026-11-30',data:{sources:[{id:'test-calendar',name:'テスト'}],calendars:['テスト'],events:[{calendarId:'test-calendar',hub:'U-0100',calendar:'テスト',title:'Googleから取得した予定',allDay:true,start:'2026-10-25',end:'2026-10-26'},{calendarId:'test-calendar',hub:'remote',calendar:'テスト',title:'Google社員予定',allDay:true,start:'2026-10-25',end:'2026-10-26'}]}})));
  await go(p,'cal');assert.equal(await p.locator('.cal [data-day="2026-10-25"] .ev.td').innerText(),'ToDo 4');assert.equal(await p.locator('.cal [data-day="2026-10-23"] .ev.td').count(),0);assert.equal(await p.locator('.cal [data-day="2026-10-26"] .ev.td').count(),0);
  assert.equal(await p.locator('.cal [data-day="2026-10-25"] .gc0').count(),2);assert.equal(await p.locator('#main [data-open]').count(),0);
  for(const mode of ['week','day']){
   await p.locator('[data-cv="'+mode+'"]').click();const text=await p.locator('main').innerText();assert(text.includes('Googleから取得した予定'));assert(text.includes('Google社員予定'));assert(text.includes('未完了・超過'));assert(text.includes('社員・超過'));assert(!text.includes('未完了・未来'));assert(!text.includes('社員・未来'));assert(!text.includes('完了済み'));assert(!text.includes('現地調査予定'));assert(!text.includes('見積提出済'));assert.equal(await p.locator('main [data-done],main [data-odone]').count(),0);
   if(mode==='week'){assert.equal(await p.locator('.wkrow').filter({has:p.locator('[data-day="2026-10-25"]')}).locator('.td').count(),8);assert.equal(await p.locator('.wkrow').filter({has:p.locator('[data-day="2026-10-26"]')}).locator('.td').count(),0)}
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await p.screenshot({path:path.resolve(root,'..','calendar-'+width+'.png'),fullPage:true});
  await p.locator('main [data-nav="todo"]').first().click();assert((await p.locator('main').innerText()).includes('ToDo'));await go(p,'cal',{calDay:'2026-10-26',calView:'day'});assert(!(await p.locator('main').innerText()).includes('未完了・今日'));
  // In-memory admin used for the test is not written simply by navigating.
  assert.equal(await raw(p),before);assert.equal(await p.evaluate(async()=>await (await testHub.photoGet('keep-photo-key')).text()),'original-photo-bytes');await storageGuards(p);assert.deepEqual(errors,[]);await c.close();
 });
 await check('Google取込・HUB紐付予定・非公開・複数日・エラー表示',async()=>{
  const {p,c,requests,errors}=await context(390,db);
  await p.route('https://www.googleapis.com/calendar/v3/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({items:[{id:'linked',summary:'紐付予定',start:{date:'2026-10-25'},end:{date:'2026-10-26'},extendedProperties:{private:{cpgHubCase:'U-0100'}}},{id:'private',summary:'秘密',location:'秘密場所',visibility:'private',start:{date:'2026-10-25'},end:{date:'2026-10-26'}},{status:'cancelled',start:{date:'2026-10-25'}}]})}));
  const events=await p.evaluate(async()=>{testHub.G.token='test-token';testHub.G.exp=Date.now()+3600000;return testHub.gReadOne({id:'test-calendar',name:'テスト',primary:false,owner:false},'2026-10-01','2026-10-31',new Set(['U-0100']))});
  assert.equal(events.length,2);assert.equal(events[0].title,'紐付予定');assert.equal(events[1].title,'予定あり');assert.equal(events[1].location,'');
  const days=await p.evaluate(()=>Object.keys(testHub.gcalByDay({events:[{calendarId:'test-calendar',title:'複数日',calendar:'test',allDay:true,start:'2026-10-24',end:'2026-10-27'}]})));assert.deepEqual(days,['2026-10-24','2026-10-25','2026-10-26']);
  const status=await p.evaluate(()=>[testHub.gcalStatus({state:'error',msg:'offline'}),testHub.gcalStatus({state:'error',msg:'offline',data:{events:[]}})]);assert(status[0].includes('表示できません'));assert(status[1].includes('前回取得'));assert(!status.join('').includes('HUBの予定だけ'));assert(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);await c.close();
 });
 await check('営繕：受付→見積→保留→施工→請求→一部入金→完了・再読込',async()=>{
  const {p,c,errors,requests}=await context(390,db);await p.locator('[data-act="new"]').click();await p.locator('[data-nco="CP"]').click();await p.locator('#n_type').selectOption('eizen');await p.locator('#n_client').fill('アレップス');await p.locator('#n_prop').fill('営繕テスト');await p.locator('#newForm button[type="submit"]').click();
  assert.equal(await p.locator('#d_site').count(),0);assert.equal(await p.locator('#d_job').count(),0);assert.deepEqual(await p.locator('.steps span').allTextContents(),['受付','見積','施工','請求']);
  await p.locator('#d_est').fill('10000');await p.locator('[data-act="quote"]').click();await p.locator('#d_hold').fill('2026-10-27');await p.locator('[data-act="hold"]').click();await p.locator('[data-act="win"]').click();assert.equal(await p.locator('[data-act="built"]').count(),1);assert.equal(await p.locator('#d_job').count(),0);
  let state=JSON.parse(await raw(p));let item=state.cases.find(x=>x.property==='営繕テスト');assert.equal(item.stage,'working');assert.equal(item.handedDate,'');assert.equal(item.siteDate,'');assert.equal(item.orderDate,'2026-10-25');assert.equal(item.holdDate,'');
  await p.reload();await go(p,'detail',{caseId:item.id});await p.locator('[data-act="built"]').click();await p.locator('[data-act="bill"]').click();await p.locator('#d_payamt').fill('4000');await p.locator('[data-act="pay"]').click();await p.locator('[data-act="pay"]').click();
  state=JSON.parse(await raw(p));item=state.cases.find(x=>x.property==='営繕テスト');assert.equal(item.stage,'paid');assert.equal(item.payments.length,2);assert.equal(item.payments.reduce((n,x)=>n+x.amount,0),10000);assert.equal(item.handedDate,'');assert.equal(item.jobNo,'');
  assert.deepEqual(state.cases.filter(x=>x.id!=='U-0103'),db.cases);assert.deepEqual(state.todos,db.todos);assert.equal(state.receipts[0].photos[0],'keep-photo-key');assert.deepEqual(state.receipts[0].edits,db.receipts[0].edits);assert.deepEqual(state.history,db.history);assert.deepEqual(state.unknown,db.unknown);assert.deepEqual(state.settings.data,db.settings.data);assert.deepEqual(state.settings.gShow,db.settings.gShow);assert.equal(requests.length,0);assert.equal(await p.evaluate(async()=>await (await testHub.photoGet('keep-photo-key')).text()),'original-photo-bytes');await storageGuards(p);assert.deepEqual(errors,[]);await c.close();
 });
 await check('空室見積・既存リノベの流れ・候補8件と自由入力・社員側の種類/施工段階',async()=>{
  const {p,c,errors}=await context(390,db);
  for(const type of ['vacant','reno']){
   await p.locator('[data-act="new"]').click();await p.locator('[data-nco="CPY"]').click();await p.locator('#n_type').selectOption(type);assert.equal(await p.locator('#client_names option').count(),8);await p.locator('#n_client').fill('候補外の会社');await p.locator('#n_prop').fill(type+'テスト');await p.locator('#newForm button[type="submit"]').click();assert.equal(await p.locator('#d_site').count(),1);await p.locator('[data-act="site"]').click();await p.locator('#d_est').fill('20000');await p.locator('[data-act="quote"]').click();await p.locator('[data-act="win"]').click();await p.locator('#d_job').fill('JOB-'+type);await p.locator('[data-act="hand"]').click();assert.equal(await p.locator('[data-act="built"]').count(),1);
  }
  const exports=await p.evaluate(()=>testHub.dataRows().cases);assert(exports.some(r=>r[1]==='空室見積'));
  const remote=await p.evaluate(()=>testHub.roCase({'種類':'営繕','段階キー':'working','段階':'施工中','受付番号':'staff-test','会社':'CP'},{s:{name:'社員'}}));assert.equal(remote.type,'eizen');assert.equal(remote.stage,'working');assert.equal(remote.ro,true);
  assert.equal(await p.evaluate(()=>testHub.typeKeyOf('空室見積')),'vacant');assert.deepEqual(errors,[]);await c.close();
 });
 await check('ToDo完了は対象だけ・同期設定と領収書保持・翌日の今日欄',async()=>{
  const {p,c,errors}=await context(390,db);await go(p,'todo');await p.locator('[data-done="today"]').click();const after=JSON.parse(await raw(p));assert(after.todos.find(x=>x.id==='today').done);assert.deepEqual(after.cases,db.cases);assert.deepEqual(after.settings,db.settings);assert.deepEqual(after.history,db.history);
  await p.clock.setFixedTime(new Date('2026-10-26T03:00:00Z'));await go(p,'cal',{calDay:'2026-10-26',calView:'day'});const text=await p.locator('main').innerText();assert(text.includes('未完了・未来'));assert(!text.includes('未完了・今日'));assert(text.includes('未完了・超過'));await go(p,'rcpt');assert((await p.locator('main').innerText()).includes('既存取引先'));assert.equal(await p.evaluate(async()=>await (await testHub.photoGet('keep-photo-key')).text()),'original-photo-bytes');await storageGuards(p);assert.deepEqual(errors,[]);await c.close();
 });
 await check('既存4種別の各段階・社員の新種別・同期出力と画面の読み取り',async()=>{
  const old=structuredClone(db);old.cases=[];let n=200;
  for(const type of ['kinkyu','taikyo','reno','teiki','vacant','eizen'])for(const stage of ['new','site','quoted','hold','won','handed','built','billed','paid','lost',...(type==='eizen'?['working']:[])])old.cases.push(fixtureCase(defs,{id:'U-'+(++n),type,stage,siteDate:stage==='new'?'':'2026-10-21',estSentDate:'2026-10-22',holdDate:'2026-10-27',orderDate:'2026-10-23',builtDate:'2026-10-24',billDate:'2026-10-24',billAmount:10000,payDue:'2026-10-26',estAmount:10000}));
  const {p,c,errors}=await context(390,old);const before=await raw(p);
  for(const item of old.cases)await go(p,'detail',{caseId:item.id});
  for(const v of ['cases','gantt','stats','rcpt','todo','cal'])await go(p,v);
  const out=await p.evaluate(()=>testHub.dataRows());assert.equal(out.cases.length,old.cases.length+1);assert(out.cases.some(r=>r[1]==='営繕'&&r[2]==='施工中'&&r[26]==='working'));assert(out.cases.some(r=>r[1]==='空室見積'));assert.equal(await raw(p),before);assert.deepEqual(errors,[]);await c.close();
 });
 console.log(JSON.stringify({passed:results.length,environment:'Chromium / synthetic Google / Asia/Tokyo',results},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});

