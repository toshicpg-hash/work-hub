/* Synthetic fixtures only (fictional names, example.com). No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.RT={get db(){return DB},ui,go,render,roBuild,CASE_DEFAULTS};';
const TODAY='2026-10-30';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width,setup){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T00:30:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.RT);
 await p.evaluate(setup);
 return {c,p,errors};
}
/* 社員の端末：期限切れの自動ToDoを6件（見積提出から日が経った案件）と、リクエスト3件（期限切れ・未来・期限なし）、完了済みのリクエスト1件 */
const staffSetup=()=>{const D=RT.db;D.settings.rcpt.name='見本 一郎';
 D.cases=[1,2,3,4,5,6].map(i=>Object.assign(RT.CASE_DEFAULTS(),{id:'U-000'+i,company:'CP',type:'reno',stage:'quoted',client:'試験管理',clientKind:'管理会社',property:'試験荘'+i,room:'1',tantou:'黒木',receivedAt:'2026-09-01T01:00:00.000Z',siteDate:'2026-09-02',estAmount:1000,estSentDate:'2026-09-05'}));
 D.todos=[{id:'I-20261020-aaaaaa',order:true,title:'期限切れのリクエスト（テスト）',due:'2026-10-28',orderedAt:'2026-10-20',tantou:'見本 一郎',done:false},
  {id:'I-20261021-bbbbbb',order:true,title:'来月のリクエスト（テスト）',due:'2026-11-20',orderedAt:'2026-10-21',tantou:'見本 一郎',done:false},
  {id:'I-20261022-cccccc',order:true,title:'期限なしのリクエスト（テスト）',due:'',orderedAt:'2026-10-22',tantou:'見本 一郎',done:false},
  {id:'I-20261019-dddddd',order:true,title:'済んだリクエスト（テスト）',due:'2026-10-25',orderedAt:'2026-10-19',tantou:'見本 一郎',done:true,synced:true},
  {id:'T1',title:'手入力の用事（テスト）',due:'2026-10-29',tantou:'黒木',done:false}];
 RT.go('todo',{tPeriod:'today',tTantou:'all'})};
const adminSetup=()=>{const d=RT.db.settings.data;d.admin=true;
 d.staff=[{name:'見本 一郎',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'CP',role:'社員',lastSync:'2026-10-30 08:00'}];
 const data=[{s:d.staff[0],ok:true,rc:[],cases:[],
  todo:[{'内容':'見積書をExcelで作成して提出','期限':'2026-10-01','担当':'見本','種類':'自動','状態':'期限切れ'},{'内容':'古い書き出しの取消済みリクエスト','期限':'2026-10-29','担当':'見本','種類':'リクエスト','状態':'今日'}],
  orders:[{'指示ID':'I-1','内容':'社員への未来のリクエスト（テスト）','期限':'2026-11-10','状態':'未完了'},{'指示ID':'I-2','内容':'社員への期限切れのリクエスト（テスト）','期限':'2026-10-20','状態':'未完了'},
   {'指示ID':'I-3','内容':'取り消したリクエスト（テスト）','期限':'2026-10-25','状態':'取り消し'},{'指示ID':'I-4','内容':'完了したリクエスト（テスト）','期限':'2026-10-25','状態':'完了'}]}];
 RT.ui.corp={data,at:Date.now()};RT.roBuild(data);RT.go('todo',{tPeriod:'today',tTantou:'all'})};
const top=p=>p.evaluate(()=>{const box=document.querySelector('.reqbox'),lists=[...document.querySelectorAll('main .list')];
 return {box:!!box,first:box&&lists[0]&&box.contains(lists[0]),head:box?box.querySelector('.sec-h').textContent:'',
  reqs:box?[...box.querySelectorAll('.card')].map(c=>({t:c.querySelector('.ttl').textContent,boss:c.classList.contains('boss'),chip:!!c.querySelector('.chip.boss'),badge:(c.querySelector('.pbadge')||{}).textContent||'',over:!!c.querySelector('.due.over'),line:getComputedStyle(c).borderLeftWidth})):[],
  rest:lists.slice(1).flatMap(l=>[...l.querySelectorAll('.card .ttl')].map(x=>x.textContent))}});
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card,.reqbox,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [320,400]){
  const {c,p,errors}=await page(width,staffSetup);
  await check('社員の端末：期限切れの自動ToDoが多くても、リクエストが一番上に期限の早い順で出る '+width+'px',async()=>{
   const r=await top(p);
   assert.ok(r.box&&r.first,JSON.stringify(r));
   assert.deepEqual(r.reqs.map(x=>x.t),['期限切れのリクエスト（テスト）','来月のリクエスト（テスト）','期限なしのリクエスト（テスト）']);
   assert.ok(r.head.includes('3件')&&r.head.includes('期限切れ 1件'),r.head);
   assert.ok(r.reqs.every(x=>x.boss&&x.chip&&parseFloat(x.line)>=6),JSON.stringify(r.reqs));
   assert.ok(r.reqs[0].over&&!r.reqs[1].over);
   assert.ok(r.rest.filter(t=>t.includes('受注か失注か')).length===6,'automatic ToDos stay below: '+r.rest.join('|'));
   assert.ok(!r.rest.some(t=>t.includes('リクエスト')));
   assert.ok(!JSON.stringify(r).includes('済んだリクエスト'));
   assert.ok(await overflow(p)<=0);
  });
  await check('期間の絞り込みでもリクエストは消えず、担当の絞り込みは効く '+width+'px',async()=>{
   for(const k of ['today','week','all']){await p.click('[data-tp="'+k+'"]');assert.equal((await top(p)).reqs.length,3,k)}
   const tt=await p.$$eval('[data-tt]',a=>a.map(x=>x.dataset.tt));
   const other=tt.find(x=>x!=='all'&&x!=='見本');
   await p.click('[data-tt="'+other+'"]');assert.equal((await top(p)).box,false,'requests of another person are filtered out');
   await p.click('[data-tt="all"]');assert.equal((await top(p)).reqs.length,3);
  });
  assert.deepEqual(errors,[]);await c.close();
  const a=await page(width,adminSetup);
  await check('社長の端末：読み込んだ社員のリクエストが一番上に担当のバッジ付きで出て、取消・完了は出ない '+width+'px',async()=>{
   const r=await top(a.p);
   assert.ok(r.box&&r.first,JSON.stringify(r));
   assert.deepEqual(r.reqs.map(x=>x.t),['社員への期限切れのリクエスト（テスト）','社員への未来のリクエスト（テスト）']);
   assert.ok(r.reqs.every(x=>x.boss&&x.chip&&x.badge==='見本'),JSON.stringify(r.reqs));
   assert.ok(r.reqs[0].over);
   assert.ok(!JSON.stringify(r).includes('取り消した')&&!JSON.stringify(r).includes('完了した')&&!JSON.stringify(r).includes('古い書き出し'));
   assert.ok(r.rest.includes('見積書をExcelで作成して提出'));
   assert.ok(await overflow(a.p)<=0);
  });
  assert.deepEqual(a.errors,[]);await a.c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
