/* v1.49.2 初期設定の案内と、再描画で入力途中の設定を消さないこと。
   Synthetic fixtures only (fictional names, example.com). In-memory Sheets; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),KEY='workhub_proto_v1',OWN='synthetic-onboarding-sheet-0001';
const hook='window.OB={get db(){return DB},get ui(){return ui},get G(){return G},go,render,save,obSteps,'+
 'mock(){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};'+
 'gLoadCalendarsRun=async()=>{await (window.__gate||Promise.resolve());G.cals=[{id:"work-a@example.com",name:"見本の仕事A",primary:false,owner:false,write:false},{id:"work-b@example.com",name:"見本の仕事B",primary:false,owner:false,write:false}];return G.cals};'+
 'gReadRange=async()=>({events:[],calendars:[],missing:0});gKeepSave=()=>{};corpRun=async()=>[]}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const sheets={};
async function device({width=390,height=844,db=null}={}){
 const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 if(db)await c.addInitScript(({KEY,db})=>{if(!sessionStorage.getItem('seed')){localStorage.setItem(KEY,JSON.stringify(db));sessionStorage.setItem('seed','1')}},{KEY,db});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}return r.continue()}
  if(u.hostname!=='sheets.googleapis.com')return r.fulfill({status:200,contentType:'application/json',body:'{}'});
  const m=u.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),id=m&&m[1],tail=decodeURIComponent(m&&m[2]||''),method=r.request().method(),S=sheets[id];
  const json=b=>r.fulfill({contentType:'application/json',body:JSON.stringify(b)});
  if(!S)return r.fulfill({status:404,body:'{}'});
  const body=method==='GET'?null:r.request().postDataJSON();
  if(method==='GET'&&!tail)return json({properties:{title:'CPG HUB_見本 一郎'},sheets:Object.keys(S).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:1000,columnCount:40}}}))});
  if(method==='GET'&&tail==='/values:batchGet'){const ts=u.searchParams.getAll('ranges').map(t=>t.replace(/^'|'$/g,''));if(ts.some(t=>!S[t]))return r.fulfill({status:400,body:'{}'});return json({valueRanges:ts.map(t=>({values:structuredClone(S[t])}))})}
  if(method==='POST'&&tail===':batchUpdate'){for(const q of body.requests){if(q.addSheet)S[q.addSheet.properties.title]=[];else if(q.updateCells)S['案件']=q.updateCells.rows.map(x=>x.values.map(v=>Object.values(v.userEnteredValue||{})[0]??''))}return json({})}
  const v=tail.match(/^\/values\/'([^']+)'(?:!A1)?(:clear)?$/);
  if(v&&S[v[1]]){if(method==='POST'&&v[2]){S[v[1]]=[];return json({})}if(method==='PUT'){S[v[1]]=structuredClone(body.values);return json({})}}
  return r.fulfill({status:400,body:'{}'});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-03T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.OB);await p.evaluate(()=>OB.mock());
 return {c,p,errors};
}
const cur=p=>p.evaluate(()=>{const x=OB.obSteps().find(s=>!s.done);return x?x.k:''});
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.ob,form,details')].map(x=>x.scrollWidth-x.clientWidth))});
const read=p=>p.evaluate(K=>JSON.parse(localStorage.getItem(K)),KEY);
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 sheets[OWN]={'案件':[],'入金':[],'立替':[],'情報':[]};
 const A=await device();
 await check('新しい端末：ホームの一番上に初期設定が出て、最初はカレンダーの共有、次に①ログイン',async()=>{
  assert.equal(await A.p.locator('main > section').first().getAttribute('id'),'onboarding');
  assert.equal(await cur(A.p),'calshare');
  const sh=await A.p.textContent('#onboarding');for(const s of ['calendar.google.com','「デスクトップ」','歯車','特定のユーザーまたはグループと共有する','予定の表示（すべての予定の詳細）','iPhoneの「Googleカレンダー」アプリでは共有の設定ができません','専務のGmail'])assert.ok(sh.includes(s),s);
  assert.ok(await overflow(A.p)<=0);
  await A.p.screenshot({path:path.join(root,'docs/preview/onboarding-calshare-390.png')});
  await A.p.click('[data-act=obcalshare]');assert.equal(await cur(A.p),'login');assert.equal((await read(A.p)).settings.data.ob.calShared,true,'kept on this device');
  const t=await A.p.textContent('#onboarding');for(const s of ['自分のGoogleカレンダーを社長と専務に共有する','Googleにログイン','本人の記録シートにつなぐ','氏名・会社を確かめる','最初の同期','記録を1件保存して、読み戻しを確かめる'])assert.ok(t.includes(s),s);
  assert.ok(await A.p.isVisible('[data-act=oblogin]'));assert.ok(await overflow(A.p)<=0);
  await A.p.screenshot({path:path.join(root,'docs/preview/onboarding-start-390.png')});
 });
 await check('順番を飛ばすと「先に○○をしてください」で止まる',async()=>{
  await A.p.evaluate(()=>{OB.db.settings.data.sheetId='synthetic-skip';OB.save()});
  await A.p.evaluate(()=>{OB.go('home')});await A.p.click('[data-act=gsync]');
  assert.match(await A.p.textContent('#onboarding'),/先に「氏名・会社を確かめる」をしてください/);
  assert.equal(await A.p.evaluate(()=>OB.db.settings.data.lastSync),'');
  await A.p.evaluate(()=>{OB.go('stats');document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});
  await A.p.fill('#d_view','https://docs.google.com/spreadsheets/d/synthetic-view-list-000000001/edit');await A.p.click('[data-act=dvlink]');
  assert.match(await A.p.textContent('main'),/先に「氏名・会社を確かめる」をしてください（ホームの初期設定）。逆の順番だと、会社・人の選択肢から自分が外れます/);
  assert.equal(await A.p.evaluate(()=>OB.db.settings.data.viewListId),'');
  await A.p.evaluate(()=>{OB.db.settings.data.sheetId='';OB.save();OB.go('home')});
 });
 await check('社員の順番どおりに進むと、1つずつ次へ進んで最後に「終わりました」',async()=>{
  await A.p.click('[data-act=oblogin]');await A.p.waitForFunction(()=>!OB.ui.obBusy);assert.equal(await cur(A.p),'sheet');
  await A.p.fill('#ob_sheet','https://docs.google.com/spreadsheets/d/'+OWN+'/edit');await A.p.click('[data-act=obsheet]');await A.p.waitForFunction(()=>!OB.ui.obBusy);
  assert.equal(await cur(A.p),'name',await A.p.textContent('#onboarding'));
  await A.p.fill('#ob_name','');await A.p.click('[data-act=obname]');assert.match(await A.p.textContent('#onboarding'),/氏名と会社を入れてください/);assert.equal(await cur(A.p),'name');
  await A.p.fill('#ob_name','見本 一郎');await A.p.selectOption('#ob_co','CPY');await A.p.click('[data-act=obname]');
  assert.equal(await cur(A.p),'sync');const saved=await read(A.p);assert.equal(saved.settings.rcpt.name,'見本 一郎');assert.equal(saved.settings.rcpt.lastCo,'CPY');assert.equal(saved.settings.data.ob.name,OWN);
  await A.p.addStyleTag({content:'#toast{display:none!important}'});
  await A.p.screenshot({path:path.join(root,'docs/preview/onboarding-sync-390.png')});
  await A.p.click('[data-act=obsync]');await A.p.waitForFunction(()=>OB.ui.gsync&&!OB.ui.gsync.busy);
  assert.equal(await cur(A.p),'check',JSON.stringify(await A.p.evaluate(()=>OB.ui.gsync.rows)));
  await A.p.click('[data-act=obcheck]');assert.match(await A.p.textContent('#onboarding'),/まだ記録がありません/);assert.equal(await cur(A.p),'check');
  await A.p.evaluate(()=>{OB.db.todos.push({id:'T900',title:'見本の初めての用事',due:'2026-11-04',tantou:'見本',done:false});OB.save();OB.render()});
  await A.p.click('[data-act=obcheck]');assert.equal(await cur(A.p),'');
  assert.match(await A.p.textContent('#onboarding'),/初期設定が終わりました/);assert.ok(await overflow(A.p)<=0);
  await A.p.click('[data-act=obclose]');assert.equal(await A.p.locator('#onboarding').count(),0);
  await A.p.reload();await A.p.waitForFunction(()=>!!window.OB);assert.equal(await A.p.locator('#onboarding').count(),0,'stays closed after reload');
  assert.ok((await read(A.p)).todos.some(t=>t.id==='T900'),'the record entered by the person is kept');
 });
 assert.deepEqual(A.errors,[]);await A.c.close();
 await check('GM・全社：①〜④のあとに⑤見る人用一覧。同期の前は見る人用一覧につなげない',async()=>{
  const B=await device();await B.p.click('[data-obrole=GM]');
  const t=await B.p.textContent('#onboarding');assert.ok(t.includes('見る人用一覧をつなぐ')&&!t.includes('記録を1件保存'));
  await B.p.evaluate(()=>{OB.go('stats');document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});
  await B.p.fill('#d_view','https://docs.google.com/spreadsheets/d/synthetic-view-list-000000001/edit');await B.p.click('[data-act=dvlink]');
  assert.match(await B.p.textContent('main'),/先に「自分のGoogleカレンダーを社長と専務に共有する」をしてください/);
  await B.p.evaluate(own=>{const d=OB.db.settings.data;d.ob={...d.ob,calShared:true,login:true,name:own};d.sheetId=own;d.lastSync='2026-11-03T00:30:00.000Z';OB.db.settings.rcpt.name='見本 進';OB.save();OB.go('home')},OWN);
  assert.equal(await cur(B.p),'view');assert.ok(await B.p.isVisible('#ob_view'));assert.ok(await overflow(B.p)<=0);
  await B.p.screenshot({path:path.join(root,'docs/preview/onboarding-gm-view-390.png')});
  await B.p.evaluate(()=>{OB.db.settings.data.viewListId='synthetic-view-list-000000001';OB.save();OB.render()});assert.equal(await cur(B.p),'');
  assert.deepEqual(B.errors,[]);await B.c.close();
 });
 await check('すでに使っている端末と社長の端末には出さない',async()=>{
  const old={schemaVersion:2,seq:0,rseq:0,cases:[],todos:[],receipts:[],settings:{data:{sheetId:'synthetic-old-sheet-00000000001',lastSync:'2026-11-01T00:00:00.000Z'}}};
  const L=await device({db:old});assert.equal(await L.p.locator('#onboarding').count(),0);assert.deepEqual(await L.p.evaluate(()=>OB.db.settings.data.ob),{legacy:true});await L.c.close();
  const adm={schemaVersion:2,seq:0,rseq:0,cases:[],todos:[],receipts:[],settings:{data:{admin:true,staff:[]}}};
  const M=await device({db:adm});assert.equal(await M.p.locator('#onboarding').count(),0);await M.c.close();
 });
 await check('360px・文字が大きくても横にはみ出さない',async()=>{
  const N=await device({width:360});await N.p.addStyleTag({content:'html{font-size:150%} .ob,.ob button,.ob input,.ob select{font-size:21px}'});
  for(const step of ['calshare','login','sheet','name']){if(step==='login')await N.p.evaluate(()=>{OB.db.settings.data.ob={calShared:true};OB.save();OB.render()});if(step==='sheet')await N.p.evaluate(()=>{OB.db.settings.data.ob={calShared:true,login:true};OB.save();OB.render()});
   if(step==='name')await N.p.evaluate(own=>{OB.db.settings.data.sheetId=own;OB.save();OB.render()},OWN);
   assert.equal(await cur(N.p),step);assert.ok(await overflow(N.p)<=0,step)}
  assert.deepEqual(N.errors,[]);await N.c.close();
 });
 /* 不具合の直し：カレンダーの読み込みが終わったときの再描画で、入力途中の設定が消えない */
 await check('カレンダーの対応設定：入力途中の値と開いた欄が、再描画・読み込み中・読み込み後も残る',async()=>{
  const old={schemaVersion:2,seq:0,rseq:0,cases:[],todos:[],receipts:[],settings:{rcpt:{name:'見本 一郎'},data:{sheetId:OWN,lastSync:'2026-11-03T00:30:00.000Z',ob:{legacy:true}}}};
  const C=await device({db:old});
  await C.p.evaluate(()=>{OB.G.cals=[{id:'work-a@example.com',name:'見本の仕事A',primary:false,owner:false,write:false},{id:'work-b@example.com',name:'見本の仕事B',primary:false,owner:false,write:false}];OB.go('stats')});
  await C.p.click('details[data-keep-open=calmap] > summary');
  await C.p.selectOption('#cs_cal','work-b@example.com');await C.p.selectOption('#cs_mode','person');await C.p.selectOption('#cs_company','unknown');await C.p.check('#cs_work');
  await C.p.evaluate(()=>OB.render());
  const v=()=>C.p.evaluate(()=>({open:document.querySelector('details[data-keep-open=calmap]').open,cal:document.getElementById('cs_cal')?.value,mode:document.getElementById('cs_mode')?.value,co:document.getElementById('cs_company')?.value,work:document.getElementById('cs_work')?.checked}));
  assert.deepEqual(await v(),{open:true,cal:'work-b@example.com',mode:'person',co:'unknown',work:true});
  await C.p.evaluate(()=>{OB.G.calsLoading=true;OB.render()});
  assert.match(await C.p.textContent('details[data-keep-open=calmap]'),/カレンダーの一覧を読み込み中です。終わってから選べます/);
  assert.equal(await C.p.locator('#cs_cal').count(),0);
  await C.p.evaluate(()=>{OB.G.calsLoading=false;OB.G.cals=[{id:'work-b@example.com',name:'見本の仕事B',primary:false,owner:false,write:false},{id:'work-a@example.com',name:'見本の仕事A',primary:false,owner:false,write:false}];OB.render()});
  assert.deepEqual(await v(),{open:true,cal:'work-b@example.com',mode:'person',co:'unknown',work:true});
  await C.p.screenshot({path:path.join(root,'docs/preview/calendar-draft-kept-390.png')});
  assert.ok(await overflow(C.p)<=0);
  assert.deepEqual(C.errors,[]);await C.c.close();
 });
 await check('本物の同期の流れでも、カレンダーの一覧の読み込み中は「読み込み中です」と出て、終わると入力が戻る',async()=>{
  const old={schemaVersion:2,seq:0,rseq:0,cases:[],todos:[],receipts:[],settings:{rcpt:{name:'見本 一郎'},data:{sheetId:OWN,lastSync:'2026-11-03T00:30:00.000Z',ob:{legacy:true}}}};
  const C=await device({db:old});
  await C.p.evaluate(()=>{OB.G.cals=[{id:'work-a@example.com',name:'見本の仕事A',primary:false,owner:false,write:false},{id:'work-b@example.com',name:'見本の仕事B',primary:false,owner:false,write:false}];OB.go('stats')});
  await C.p.click('details[data-keep-open=calmap] > summary');await C.p.selectOption('#cs_cal','work-a@example.com');await C.p.selectOption('#cs_mode','mixed');
  await C.p.evaluate(()=>{window.__gate=new Promise(r=>window.__release=r)});
  await C.p.click('[data-act=gsync]');
  await C.p.waitForFunction(()=>/読み込み中です/.test(document.querySelector('details[data-keep-open=calmap]')?.textContent||''));
  await C.p.evaluate(()=>window.__release());await C.p.waitForFunction(()=>OB.ui.gsync&&!OB.ui.gsync.busy);
  assert.equal(await C.p.$eval('#cs_cal',e=>e.value),'work-a@example.com');assert.equal(await C.p.$eval('#cs_mode',e=>e.value),'mixed');
  assert.equal(await C.p.$eval('details[data-keep-open=calmap]',e=>e.open),true);
  assert.deepEqual(C.errors,[]);await C.c.close();
 });
 await check('ToDoの手入力：入力途中は再描画で残り、追加したら空に戻る',async()=>{
  const old={schemaVersion:2,seq:0,rseq:0,cases:[],todos:[],receipts:[],settings:{data:{ob:{legacy:true}}}};
  const T=await device({db:old});await T.p.evaluate(()=>OB.go('todo'));
  await T.p.fill('#td_title','見本の入力途中');await T.p.evaluate(()=>OB.render());assert.equal(await T.p.inputValue('#td_title'),'見本の入力途中');
  await T.p.click('#todoForm button[type=submit]');assert.equal(await T.p.inputValue('#td_title'),'');
  assert.ok((await read(T.p)).todos.some(t=>t.title==='見本の入力途中'));
  await T.p.evaluate(()=>OB.render());assert.equal(await T.p.inputValue('#td_title'),'');
  assert.deepEqual(T.errors,[]);await T.c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
