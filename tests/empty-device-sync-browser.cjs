/* v1.49.1 空の端末から同期しても、共有の記録シートを空で上書きしない。
   Synthetic fixtures only (fictional names, example data). In-memory Sheets; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),KEY='workhub_proto_v1',OWN='synthetic-own-record-sheet-0001';
const hook='window.ED={get db(){return DB},get ui(){return ui},authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000;},dataSync,dataConnect,dataRows,go,render,save,CASE_DEFAULTS,RECEIPT_DEFAULTS};';
const DATA_TABS=['案件','入金','立替','ToDo'];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const sheets={};let calls=[],fault=null;
const blankSheet=()=>({'案件':[],'入金':[],'立替':[],'情報':[]});
async function device(width=400){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}return r.continue()}
  if(u.hostname!=='sheets.googleapis.com')return r.fulfill({status:200,body:''});
  const m=u.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),id=m&&m[1],tail=decodeURIComponent(m&&m[2]||''),method=r.request().method(),S=sheets[id];
  const json=b=>r.fulfill({contentType:'application/json',body:JSON.stringify(b)});
  if(!S)return r.fulfill({status:404,body:'{}'});
  const body=method==='GET'?null:r.request().postDataJSON();calls.push({method,tail,body});
  if(fault&&fault({method,tail,body}))return r.fulfill({status:503,body:'{}'});
  if(method==='GET'&&!tail)return json({properties:{title:'CPG HUB_見本 一郎'},sheets:Object.keys(S).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:1000,columnCount:40}}}))});
  if(method==='GET'&&tail==='/values:batchGet'){const ts=u.searchParams.getAll('ranges').map(t=>t.replace(/^'|'$/g,''));if(ts.some(t=>!S[t]))return r.fulfill({status:400,body:'{}'});return json({valueRanges:ts.map(t=>({values:structuredClone(S[t])}))})}
  if(method==='POST'&&tail===':batchUpdate'){for(const q of body.requests){if(q.addSheet)S[q.addSheet.properties.title]=[];else if(q.updateCells)S['案件']=q.updateCells.rows.map(x=>x.values.map(v=>Object.values(v.userEnteredValue||{})[0]??''))}return json({})}
  const v=tail.match(/^\/values\/'([^']+)'(?:!A1)?(:clear)?$/);
  if(v&&S[v[1]]){if(method==='POST'&&v[2]){S[v[1]]=[];return json({})}if(method==='PUT'){S[v[1]]=structuredClone(body.values);return json({})}}
  throw Error('unexpected Sheets call '+method+' '+tail);
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-03T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.ED);await p.evaluate(()=>ED.authorize());
 return {c,p,errors};
}
/* 記録のある端末（架空）：案件4件（請求・一部入金・入金済・退去立会）、立替2件、手入力ToDo1件 */
const fillDevice=(own)=>{const D=ED.db,C=(o)=>Object.assign(ED.CASE_DEFAULTS(),o);D.settings.rcpt.name='見本 一郎';D.settings.data.sheetId=own;
 D.cases=[C({id:'U-0021',company:'CP',type:'reno',stage:'quoted',client:'見本管理',clientKind:'管理会社',property:'見本荘',room:'101',tantou:'見本',receivedAt:'2026-10-01T01:00:00.000Z',siteDate:'2026-10-02',estAmount:12000,estSentDate:'2026-10-03'}),
  C({id:'U-0022',company:'CPY',type:'reno',stage:'billed',client:'試験不動産',clientKind:'管理会社',property:'試験ハイツ',room:'202',tantou:'見本',receivedAt:'2026-09-01T01:00:00.000Z',siteDate:'2026-09-02',estAmount:30000,estSentDate:'2026-09-03',orderDate:'2026-09-05',jobNo:'J-見本-1',builtDate:'2026-09-20',billDate:'2026-09-21',billAmount:30000,billTo:'試験不動産',payDue:'2026-10-31',payments:[{date:'2026-10-10',amount:10000,by:'振込'}],payLog:[{kind:'req',at:'2026-10-20'},{kind:'noPay',at:'2026-10-25'}]}),
  C({id:'U-0023',company:'AT',type:'reno',stage:'paid',client:'見本建物',clientKind:'家主',property:'見本コーポ',room:'3',tantou:'見本',receivedAt:'2026-08-01T01:00:00.000Z',siteDate:'2026-08-02',estAmount:5000,estSentDate:'2026-08-03',orderDate:'2026-08-04',builtDate:'2026-08-10',billDate:'2026-08-11',billAmount:5000,billTo:'見本建物',payDue:'2026-09-30',payments:[{date:'2026-09-15',amount:5000,by:'現金'}],paidDate:'2026-09-15'}),
  C({id:'U-0024',company:'CP',type:'taikyo',stage:'lost',client:'見本管理',clientKind:'管理会社',property:'見本荘',room:'102',tantou:'見本',receivedAt:'2026-10-05T01:00:00.000Z',siteDate:'2026-10-06',items:[{name:'見本の項目',amount:8000,burden:'家主'}],estSentDate:'2026-10-07',lossDate:'2026-10-15',lossReason:'見本の理由'})];
 D.seq=24;
 D.receipts=[Object.assign(ED.RECEIPT_DEFAULTS(),{id:'R-0031',date:'2026-10-11',payee:'見本商店',item:'見本の材料',amount:1200,company:'CP',method:'立替',cat:'材料費',site:'見本荘',status:'未提出'}),
  Object.assign(ED.RECEIPT_DEFAULTS(),{id:'R-0032',date:'2026-10-12',payee:'試験ストア',item:'試験の消耗品',amount:800,company:'CPY',method:'立替',cat:'消耗品費',status:'提出済',claimNo:'S-見本-1',everSub:true})];
 D.rseq=32;
 D.todos=[{id:'T100',title:'見本の手入力用事',due:'2026-11-05',tantou:'見本',done:false}];
 ED.save()};
/* v1.50.38 つなぐときの「書けるか」の確かめ（requests が空の batchUpdate）は何も変えないので数えない */
const dataCalls=()=>calls.filter(x=>x.method!=='GET'&&!(x.tail===':batchUpdate'&&x.body&&Array.isArray(x.body.requests)&&!x.body.requests.length)&&DATA_TABS.concat(['情報']).some(t=>x.tail.includes("'"+t+"'")||x.tail===':batchUpdate'));
const syncRows=async p=>p.evaluate(async()=>{const rows=[];await ED.dataSync((name,ok,msg)=>rows.push({name,ok,msg}));return rows});
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.ro,.gsync,.sheet-guard')].map(x=>x.scrollWidth-x.clientWidth))});
const snap=()=>structuredClone(sheets[OWN]);
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 sheets[OWN]=blankSheet();
 const A=await device();
 let filled;
 await check('記録のある端末は今までどおり同期でき、共有の記録シートに行が入る',async()=>{
  await A.p.evaluate(fillDevice,OWN);const rows=await syncRows(A.p);
  assert.ok(rows.every(x=>x.ok),JSON.stringify(rows));
  assert.equal(sheets[OWN]['案件'].length,5);assert.equal(sheets[OWN]['立替'].length,3);assert.ok(sheets[OWN]['入金'].length>=6);
  assert.ok(sheets[OWN]['ToDo'].some(r=>r[0]==='見本の手入力用事'&&r[6]==='手入力'));
  filled=snap();
  calls=[];const again=await syncRows(A.p);assert.ok(again.every(x=>x.ok),JSON.stringify(again));
  assert.equal(calls.filter(x=>x.tail.endsWith(':clear')&&DATA_TABS.some(t=>x.tail.includes("'"+t+"'"))).length,0,'data tabs are overwritten in one write, not cleared first');
  assert.deepEqual(sheets[OWN]['案件'],filled['案件']);assert.deepEqual(sheets[OWN]['立替'],filled['立替']);
 });
 const B=await device();
 await check('空の端末で同期すると、書き込まずに止まる',async()=>{
  await B.p.evaluate(own=>{ED.db.settings.data.sheetId=own;ED.db.settings.rcpt.name='見本 一郎';ED.save()},OWN);
  calls=[];const rows=await syncRows(B.p);
  assert.equal(dataCalls().length,0,JSON.stringify(dataCalls()));
  assert.deepEqual(snap(),filled);
  const g=rows.find(x=>x.name==='共有の記録シートの確認');assert.ok(g&&!g.ok,JSON.stringify(rows));
  assert.match(g.msg,/この端末には記録がありません。共有の記録シートに案件4件・立替2件/);
  assert.ok(!rows.some(x=>x.name.startsWith('記録シート「')),'no write step ran');
  assert.equal(await B.p.evaluate(()=>ED.db.settings.data.lastSync),'');
 });
 await check('ホームに確認が出て、400px・360pxで横にはみ出さない',async()=>{
  for(const w of [400,360]){await B.p.setViewportSize({width:w,height:900});await B.p.evaluate(()=>ED.go('home'));
   assert.ok(await B.p.isVisible('.sheet-guard'));const t=await B.p.textContent('.sheet-guard');
   assert.match(t,/この端末には記録がありません。共有の記録シートに案件4件/);assert.ok(t.includes('共有の記録から、この端末に取り込む')&&t.includes('やめる'));
   assert.ok(!/空のまま|上書きする/.test(await B.p.textContent('.sheet-guard .row')),'no button to overwrite');
   assert.ok(await overflow(B.p)<=0);
   if(w===400)await B.p.screenshot({path:path.join(root,'docs/preview/empty-device-guard-400.png'),fullPage:false});}
 });
 await check('「やめる」でも共有は変えず、次の同期もまた止まる',async()=>{
  await B.p.click('[data-act=sgno]');assert.equal(await B.p.locator('.sheet-guard').count(),0);
  calls=[];await syncRows(B.p);assert.equal(dataCalls().length,0);assert.deepEqual(snap(),filled);
 });
 await check('取り込みの読み込みが途中で切れたら、端末も共有も変えない',async()=>{
  await B.p.evaluate(()=>ED.go('home'));const before=await B.p.evaluate(K=>localStorage.getItem(K),KEY);
  fault=({tail})=>tail==='/values:batchGet';calls=[];
  await B.p.click('[data-act=sgrestore]');await B.p.waitForFunction(()=>!ED.ui.sgBusy);fault=null;
  assert.equal(await B.p.evaluate(K=>localStorage.getItem(K),KEY),before);assert.deepEqual(snap(),filled);assert.equal(dataCalls().length,0);
  assert.ok(await B.p.isVisible('.sheet-guard'),'the choice stays');
 });
 await check('「共有の記録から、この端末に取り込む」で復元し、読み戻して件数と内容が一致する',async()=>{
  calls=[];await B.p.click('[data-act=sgrestore]');await B.p.waitForFunction(()=>!ED.ui.sgBusy);
  assert.equal(dataCalls().length,0,'restore only reads');assert.deepEqual(snap(),filled);
  assert.match(await B.p.textContent('#home-sync'),/案件4件・立替2件・手入力のToDo1件 を取り込み、読み戻して一致を確かめました/);
  const saved=await B.p.evaluate(K=>JSON.parse(localStorage.getItem(K)),KEY);
  assert.deepEqual(saved.cases.map(c=>c.id).sort(),['U-0021','U-0022','U-0023','U-0024']);assert.deepEqual(saved.receipts.map(r=>r.id).sort(),['R-0031','R-0032']);
  assert.equal(saved.seq,24);assert.equal(saved.rseq,32);
  const c22=saved.cases.find(c=>c.id==='U-0022');assert.deepEqual(c22.payments,[{date:'2026-10-10',amount:10000,by:'振込'}]);assert.equal(c22.billTo,'試験不動産');assert.equal(c22.payLog.length,2);
  assert.ok(saved.todos.some(t=>t.title==='見本の手入力用事'&&t.due==='2026-11-05'&&!t.done));
  const a=await A.p.evaluate(()=>ED.dataRows()),b=await B.p.evaluate(()=>ED.dataRows());
  assert.deepEqual(b.cases,a.cases);assert.deepEqual(b.pay,a.pay);assert.deepEqual(b.rc,a.rc);
  assert.deepEqual(b.todo.filter(r=>r[6]==='手入力'),a.todo.filter(r=>r[6]==='手入力'));
  await B.p.setViewportSize({width:400,height:900});await B.p.screenshot({path:path.join(root,'docs/preview/empty-device-restored-400.png')});
 });
 await check('復元したあとの同期は止まらず、共有の記録はそのまま',async()=>{
  const rows=await syncRows(B.p);assert.ok(rows.every(x=>x.ok),JSON.stringify(rows));
  assert.deepEqual(sheets[OWN]['案件'],filled['案件']);assert.deepEqual(sheets[OWN]['入金'],filled['入金']);assert.deepEqual(sheets[OWN]['立替'],filled['立替']);
 });
 assert.deepEqual(A.errors,[]);assert.deepEqual(B.errors,[]);await B.c.close();
 await check('共有の件数が読めない（通信が切れた）ときは、何も書かない',async()=>{
  fault=({tail})=>tail==='/values:batchGet';calls=[];const rows=await syncRows(A.p);fault=null;
  assert.equal(dataCalls().length,0);assert.deepEqual(snap(),filled);
  const g=rows.find(x=>x.name==='共有の記録シートの確認');assert.ok(g&&!g.ok&&/書き込みを止めました/.test(g.msg));
 });
 await check('書き込みの途中で通信が切れても、共有の表が空にならない',async()=>{
  fault=({method,tail})=>method==='PUT'&&tail.includes("'入金'");const rows=await syncRows(A.p);fault=null;
  assert.ok(rows.some(x=>x.name==='記録シート「入金」'&&!x.ok));
  assert.deepEqual(sheets[OWN]['入金'],filled['入金']);assert.ok(sheets[OWN]['立替'].length===3);
 });
 await check('行の減った表は、余った行を空で上書きする（古い行が残らない）',async()=>{
  await A.p.evaluate(()=>{ED.db.todos=[];ED.save()});const rows=await syncRows(A.p);assert.ok(rows.every(x=>x.ok),JSON.stringify(rows));
  assert.ok(!sheets[OWN]['ToDo'].some(r=>r[0]==='見本の手入力用事'));
  await A.p.evaluate(()=>{ED.db.todos=[{id:'T100',title:'見本の手入力用事',due:'2026-11-05',tantou:'見本',done:false}];ED.save()});await syncRows(A.p);filled=snap();
 });
 assert.deepEqual(A.errors,[]);await A.c.close();
 await check('新しい端末で最初につないだときも同じ確認が出る',async()=>{
  const N=await device();await N.p.evaluate(()=>ED.go('stats'));
  calls=[];await N.p.evaluate(async own=>{await ED.dataConnect(own);ED.render()},OWN);
  assert.equal(dataCalls().length,0);
  assert.equal(await N.p.evaluate(()=>ED.db.settings.data.sheetId),OWN);
  assert.ok(await N.p.evaluate(()=>!!ED.ui.sheetGuard&&ED.ui.sheetGuard.empty));
  await N.p.evaluate(()=>{document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});
  assert.ok(await N.p.isVisible('.sheet-guard'));assert.ok(await overflow(N.p)<=0);
  assert.deepEqual(N.errors,[]);await N.c.close();
 });
 await check('記録が明らかに少ない端末も止まり、取り込みはない分だけ足して手元の記録は変えない',async()=>{
  const F=await device();
  await F.p.evaluate(own=>{const D=ED.db;D.settings.data.sheetId=own;D.settings.rcpt.name='見本 一郎';
   D.cases=[Object.assign(ED.CASE_DEFAULTS(),{id:'U-0021',company:'CP',type:'reno',stage:'site',client:'見本管理',clientKind:'管理会社',property:'見本荘',room:'101',tantou:'見本',receivedAt:'2026-10-01T01:00:00.000Z',siteDate:'2026-10-02',note:'この端末だけのメモ'})];D.seq=21;ED.save()},OWN);
  calls=[];const rows=await syncRows(F.p);assert.equal(dataCalls().length,0);assert.deepEqual(snap(),filled);
  assert.match(rows.find(x=>x.name==='共有の記録シートの確認').msg,/明らかに少なく/);
  await F.p.evaluate(()=>ED.go('home'));await F.p.click('[data-act=sgrestore]');await F.p.waitForFunction(()=>!ED.ui.sgBusy);
  const saved=await F.p.evaluate(K=>JSON.parse(localStorage.getItem(K)),KEY);
  assert.equal(saved.cases.length,4);const own=saved.cases.find(c=>c.id==='U-0021');assert.equal(own.stage,'site');assert.equal(own.note,'この端末だけのメモ');
  assert.equal(saved.seq,24);assert.deepEqual(snap(),filled);
  assert.deepEqual(F.errors,[]);await F.c.close();
 });
 await check('共有の内容と取り込んだ内容が合わないときは、端末を変えない',async()=>{
  const X=await device();await X.p.evaluate(own=>{ED.db.settings.data.sheetId=own;ED.db.settings.rcpt.name='見本 一郎';ED.save()},OWN);
  const bad=snap();const i=bad['案件'][0].indexOf('段階キー');bad['案件'][1][i]='unknown-stage';sheets[OWN]=bad;
  await syncRows(X.p);await X.p.evaluate(()=>ED.go('home'));const before=await X.p.evaluate(K=>localStorage.getItem(K),KEY);
  await X.p.click('[data-act=sgrestore]');await X.p.waitForFunction(()=>!ED.ui.sgBusy);
  assert.equal(await X.p.evaluate(K=>localStorage.getItem(K),KEY),before);
  assert.match(await X.p.textContent('.sheet-guard'),/一致しないため、取り込みをやめました/);
  assert.deepEqual(sheets[OWN],bad);
  assert.deepEqual(X.errors,[]);await X.c.close();sheets[OWN]=filled;
 });
 await check('共有の記録シートが空なら、空の端末でも今までどおり同期できる',async()=>{
  sheets['synthetic-own-record-sheet-0002']=blankSheet();const E=await device();
  await E.p.evaluate(()=>{ED.db.settings.data.sheetId='synthetic-own-record-sheet-0002';ED.db.settings.rcpt.name='見本 二郎';ED.save()});
  const rows=await syncRows(E.p);assert.ok(rows.every(x=>x.ok),JSON.stringify(rows));assert.equal(await E.p.locator('.sheet-guard').count(),0);
  assert.deepEqual(E.errors,[]);await E.c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
