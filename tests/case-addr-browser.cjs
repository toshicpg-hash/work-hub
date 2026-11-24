/* Synthetic fixtures only. Google requests are intercepted; no live credentials or mutations.
   v1.50.138 登録済みの案件の住所を、あとから入れる・直す。Googleカレンダーの予定の場所も一緒に直す */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.CA={get db(){return DB},ui,go,emptyDB,CASE_DEFAULTS,save,G,render,gRegister};';
let server,browser,origin;
async function context(width,db){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.addInitScript(({db})=>{if(!localStorage.getItem('testSeed')){if(db)localStorage.setItem('workhub_proto_v1',JSON.stringify(db));localStorage.setItem('testSeed','1')}},{db});
 const errors=[],calls=[];
 await c.route('**/*',async r=>{
  const u=r.request().url(),m=r.request().method();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  if(u.startsWith('https://www.googleapis.com/')){calls.push({u,m,body:r.request().postData()?JSON.parse(r.request().postData()):null});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({htmlLink:'https://www.google.com/calendar/event?eid=x',items:[]})})}
  return r.fulfill({status:200,body:''});
 });
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-11-24T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CA);
 await require('./scope-selection-helper').allPeople(p);
 return {c,p,errors,calls};
}
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,details')].map(x=>x.scrollWidth-x.clientWidth))});
const openCase=(p,id)=>p.evaluate(id=>{CA.ui.caseId=id;CA.go('detail')},id);
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const seed=await context(400);const defs=await seed.p.evaluate(()=>CA.CASE_DEFAULTS());const db=await seed.p.evaluate(()=>CA.emptyDB());await seed.c.close();
 const mk=extra=>({...defs,company:'CP',client:'見本管理',clientKind:'管理会社',property:'見本ハイツ',room:'201',tantou:'トシ',receivedAt:'2026-11-18T00:00:00.000Z',addr:'',...extra});
 db.seq=203;
 db.cases=[mk({id:'U-0200',type:'taikyo',stage:'new',planDate:'2026-11-30',gcal:{id:'ev-200',cal:'test-calendar',calName:'CPG HUB',date:'2026-11-30',when:'2026-11-30|'}}),mk({id:'U-0201',type:'vacant',stage:'new'})];
 for(const width of [400,360])await check('住所を入れる・直す（カレンダーの場所も）'+width+'px',async()=>{
  const {p,c,errors,calls}=await context(width,db);
  /* ログインしていない：住所は保存し、カレンダーは次の同期で直す印 */
  await openCase(p,'U-0200');assert.match(await p.textContent('#main'),/住所—/);
  await p.click('[data-act=addredit]');assert.match(await p.textContent('#main'),/保存すると、Googleカレンダーの予定の「場所」も直します/);
  await p.fill('#d_addr','東京都見本区見本町1-2-3');await p.click('[data-act=addrsave]');
  let x=await p.evaluate(()=>CA.db.cases.find(c=>c.id==='U-0200'));assert.equal(x.addr,'東京都見本区見本町1-2-3');assert.equal(x.gcal.addrPending,true);
  assert.match(await p.textContent('#main'),/Googleカレンダーの予定の場所は、次の同期で直します/);assert.equal(calls.length,0);
  assert.ok(await overflow(p)<=0,'overflow');
  /* ログインしている：すぐ直す（場所だけ） */
  await p.evaluate(()=>{CA.G.token='t';CA.G.exp=Date.now()+3600e3});
  await p.click('[data-act=addredit]');await p.fill('#d_addr','東京都見本区見本町9-9');await p.click('[data-act=addrsave]');
  await p.waitForFunction(()=>!CA.db.cases.find(c=>c.id==='U-0200').gcal.addrPending);
  const patch=calls.filter(q=>q.m==='PATCH');assert.equal(patch.length,1);assert.match(patch[0].u,/calendars\/test-calendar\/events\/ev-200$/);assert.deepEqual(patch[0].body,{location:'東京都見本区見本町9-9'});
  x=await p.evaluate(()=>CA.db.cases.find(c=>c.id==='U-0200'));assert.equal(x.gcal.addr,'東京都見本区見本町9-9');assert.equal(x.gcal.date,'2026-11-30','other calendar info kept');
  assert.match(await p.textContent('#main'),/東京都見本区見本町9-9/);
  /* カレンダーに入れていない案件：住所だけ */
  await openCase(p,'U-0201');await p.click('[data-act=addredit]');assert.doesNotMatch(await p.textContent('#main'),/保存すると、Googleカレンダー/);
  await p.fill('#d_addr','神奈川県見本市1');await p.click('[data-act=addrsave]');
  assert.equal(await p.evaluate(()=>CA.db.cases.find(c=>c.id==='U-0201').addr),'神奈川県見本市1');assert.equal(calls.filter(q=>q.m==='PATCH').length,1,'no calendar call');
  /* 予定を書き直すとき：住所のない案件は場所を送らない（Googleで入れた場所を消さない）。住所のある案件は送る */
  const n=calls.length;
  await p.evaluate(async()=>{const c=CA.db.cases.find(c=>c.id==='U-0200');c.addr='';CA.G.cals=[{id:'test-calendar',name:'CPG HUB',write:true}];await CA.gRegister(c)});
  let last=calls.slice(n).find(q=>q.m==='PATCH');assert.ok(last);assert.equal('location' in last.body,false,'no location when the case has none');
  await p.evaluate(async()=>{const c=CA.db.cases.find(c=>c.id==='U-0200');c.addr='東京都見本区1';await CA.gRegister(c)});
  last=calls.filter(q=>q.m==='PATCH').at(-1);assert.equal(last.body.location,'東京都見本区1');
  assert.deepEqual(errors,[]);await c.close();
 });
 await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
