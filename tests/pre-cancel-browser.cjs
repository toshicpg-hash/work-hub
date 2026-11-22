/* Synthetic fixtures only. Google requests are intercepted; no live credentials or mutations.
   v1.50.126 見積前のキャンセル（受付・現地確認済の段階で、理由を付けてキャンセルにする） */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.testHub={get db(){return DB},ui,go,genTodos,emptyDB,CASE_DEFAULTS,save,G,render,isPreCancel};';
let server,browser,origin;
async function context(width,db){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.addInitScript(({db})=>{if(!localStorage.getItem('testSeed')){if(db)localStorage.setItem('workhub_proto_v1',JSON.stringify(db));localStorage.setItem('testSeed','1')}},{db});
 const errors=[],deletes=[];
 await c.route('**/*',async r=>{
  const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){
   const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');
   return r.fulfill({contentType:'text/html',body:s});
  }
  if(u.startsWith(origin+'/'))return r.continue();
  if(u.startsWith('https://www.googleapis.com/')){if(r.request().method()==='DELETE')deletes.push(u);return r.fulfill({status:r.request().method()==='DELETE'?204:200,contentType:'application/json',body:r.request().method()==='DELETE'?'':JSON.stringify({items:[]})})}
  return r.fulfill({status:200,body:''});
 });
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-11-22T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.testHub);
 await require('./scope-selection-helper').allPeople(p);
 return {c,p,errors,deletes};
}
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,details')].map(x=>x.scrollWidth-x.clientWidth))});
const openCase=(p,id)=>p.evaluate(id=>{testHub.ui.caseId=id;testHub.go('detail')},id);
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const seed=await context(400);const defs=await seed.p.evaluate(()=>testHub.CASE_DEFAULTS());const db=await seed.p.evaluate(()=>testHub.emptyDB());await seed.c.close();
 const mk=extra=>({...defs,company:'CP',client:'見本管理',clientKind:'管理会社',property:'見本ハイツ',room:'101',tantou:'トシ',receivedAt:'2026-11-18T00:00:00.000Z',...extra});
 db.seq=103;
 db.cases=[mk({id:'U-0100',type:'taikyo',stage:'new',planDate:'2026-11-25',gcal:{id:'ev-100',cal:'test-calendar',date:'2026-11-25'}}),
  mk({id:'U-0101',type:'vacant',stage:'site',siteDate:'2026-11-19'}),mk({id:'U-0102',type:'eizen',stage:'new'}),
  mk({id:'U-0103',type:'reno',stage:'quoted',siteDate:'2026-11-10',estSentDate:'2026-11-12',estAmount:100000})];
 for(const width of [400,360])await check('受付・現地確認済でキャンセル（理由・カレンダー・ToDo・数字） '+width+'px',async()=>{
  const {p,c,errors,deletes}=await context(width,db);
  /* 見積提出済には出ない（失注のボタンを使う） */
  await openCase(p,'U-0103');assert.equal(await p.locator('details.precancel').count(),0,'not on quoted');
  /* 受付（立会前）：ToDoがある → キャンセル。カレンダーの予定も消す（ログイン済みとして） */
  assert.ok(await p.evaluate(()=>testHub.genTodos().some(t=>t.caseId==='U-0100')),'todo before');
  await openCase(p,'U-0100');await p.click('details.precancel>summary');
  assert.equal(await p.locator('#d_pccal').isChecked(),true,'calendar checkbox on');
  /* 「その他」は詳しい理由が必ず */
  await p.selectOption('#d_pcr','その他');await p.click('[data-act=precancel]');
  assert.match(await p.textContent('#preCancelStatus'),/詳しい理由を入れてください/);
  assert.equal(await p.evaluate(()=>testHub.db.cases.find(x=>x.id==='U-0100').stage),'new','not changed');
  /* ログインしていなければ、カレンダーを消せない旨を出して止まる */
  await p.selectOption('#d_pcr','入居者の都合');await p.fill('#d_pcd','退去が取りやめになった');await p.click('[data-act=precancel]');
  assert.match(await p.textContent('#preCancelStatus'),/ログインしていない/);
  await p.evaluate(()=>{testHub.G.token='t';testHub.G.exp=Date.now()+3600e3});
  await p.click('[data-act=precancel]');await p.waitForFunction(()=>testHub.db.cases.find(x=>x.id==='U-0100').stage==='lost');
  const a=await p.evaluate(()=>testHub.db.cases.find(x=>x.id==='U-0100'));
  assert.equal(a.lossReason,'キャンセル：入居者の都合（退去が取りやめになった）');assert.equal(a.lossDate,'2026-11-22');assert.equal(a.gcal,null);
  assert.equal(deletes.length,1);assert.match(deletes[0],/calendars\/test-calendar\/events\/ev-100$/);
  assert.equal(await p.evaluate(()=>testHub.genTodos().some(t=>t.caseId==='U-0100')),false,'todo gone');
  assert.match(await p.textContent('#main'),/見積前のキャンセル（入居者の都合（退去が取りやめになった）・11\/22）/);
  assert.ok(await overflow(p)<=0,'overflow');
  /* 現地確認済：カレンダーの予定がなければチェックは出ない。キャンセル → 取り消して元に戻す */
  await openCase(p,'U-0101');await p.click('details.precancel>summary');assert.equal(await p.locator('#d_pccal').count(),0);
  await p.selectOption('#d_pcr','他社に依頼');await p.click('[data-act=precancel]');
  assert.equal(await p.evaluate(()=>testHub.db.cases.find(x=>x.id==='U-0101').lossReason),'キャンセル：他社に依頼');
  await p.click('[data-act=reopen]');
  assert.deepEqual(await p.evaluate(()=>{const x=testHub.db.cases.find(x=>x.id==='U-0101');return [x.stage,x.lossReason,x.lossDate]}),['site','','']);
  /* 営繕（受付）にも出る */
  await openCase(p,'U-0102');assert.equal(await p.locator('details.precancel').count(),1,'eizen new');
  /* 数字：失注には数えず「見積前のキャンセル」に出る */
  await p.evaluate(()=>testHub.go('stats'));
  const t=await p.textContent('#stats-precancel');assert.match(t,/入居者の都合\s*1件/);
  assert.equal(await p.evaluate(()=>testHub.isPreCancel(testHub.db.cases.find(x=>x.id==='U-0100'))),true);
  assert.match(await p.locator('.sec:has(h2:text("失注の理由")) .statfold-sub').textContent(),/^0件$/);
  assert.ok(await overflow(p)<=0,'overflow stats');
  assert.deepEqual(errors,[]);await c.close();
 });
 await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
