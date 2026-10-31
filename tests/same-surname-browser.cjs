/* Synthetic fixtures only (fictional names, example.com). No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SS={get db(){return DB},ui,go,render,roBuild,save,csvText,gDesc,tantouLabel,CASE_DEFAULTS};';
const TODAY='2026-10-29';
const staff=[
 {name:'黒木 試験一',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'CP',role:'全社',gmCo:'',lastSync:TODAY+' 08:10'},
 {name:'黒木　見本二',email:'test-b@example.com',sheetId:'sheetB00000000000000000002',company:'CP',role:'社員',gmCo:'',lastSync:'2026-10-28 18:00'},
 {name:'例題 花子',email:'test-c@example.com',sheetId:'sheetC00000000000000000003',company:'CPY',role:'社員',gmCo:'',lastSync:TODAY+' 12:00'}];
const caseRow=(no,prop,tan,stage)=>({'受付番号':no,'種類':'退去立会','段階':'見積提出','物件':prop,'部屋':'101','担当':tan,'受付日':'2026-10-20','実施日':'2026-10-21','見積提出日':'2026-10-22','段階キー':stage||'quoted','会社':'CP'});
const todoRow=(title,tan,no,prop)=>({'内容':title,'期限':TODAY,'担当':tan,'受付番号':no||'','物件':prop||'','部屋':no?'101':'','種類':'手入力','状態':'今日'});
const data=[
 {s:staff[0],ok:true,cases:[caseRow('U-0001','試験荘A','黒木')],rc:[],orders:[],todo:[todoRow('担当が空の用事','',''),todoRow('氏名で書いた用事','黒木 試験一',''),todoRow('姓だけの用事','黒木','U-0001','試験荘A')]},
 {s:staff[1],ok:true,cases:[caseRow('U-0001','見本荘B','黒木')],rc:[],orders:[],todo:[todoRow('二人目の用事','黒木','U-0001','見本荘B')]},
 {s:staff[2],ok:true,cases:[caseRow('U-0001','例題荘C','例題','site')],rc:[],orders:[],todo:[]}];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width,{admin=true,staffList=staff,rsName=''}={}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SS);
 await p.evaluate(({admin,staffList,data,rsName})=>{const d=SS.db.settings.data;d.admin=admin;d.staff=JSON.parse(JSON.stringify(staffList));if(rsName)SS.db.settings.rcpt.name=rsName;
  if(admin){SS.ui.corp={data:JSON.parse(JSON.stringify(data)).map(x=>Object.assign(x,{s:d.staff.find(s=>s.sheetId===x.s.sheetId)||x.s})).filter(x=>x.s),at:Date.now()};SS.roBuild(SS.ui.corp.data)}SS.render()},{admin,staffList,data,rsName});
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [320,400]){
  const {c,p,errors}=await page(width);
  await check('ToDoの担当の絞り込みで同姓2人が分かれる '+width+'px',async()=>{
   await p.evaluate(()=>SS.go('todo',{tPeriod:'all'}));
   const tt=await p.$$eval('[data-tt]',a=>a.map(x=>x.dataset.tt));
   assert.ok(tt.includes('黒木試')&&tt.includes('黒木見')&&tt.includes('例題'),tt.join());
   assert.ok(!tt.includes('黒木'),'plain 黒木 must not remain when two people share it: '+tt.join());
   await p.click('[data-tt="黒木試"]');
   const a=await p.$$eval('main .list .card',x=>x.map(e=>e.textContent));
   assert.ok(['担当が空の用事','氏名で書いた用事','姓だけの用事'].every(w=>a.some(t=>t.includes(w))),'owner A rows: '+a.join('|'));
   assert.ok(!a.some(t=>t.includes('二人目の用事')));
   await p.click('[data-tt="黒木見"]');
   const b=await p.$$eval('main .list .card',x=>x.map(e=>e.textContent));
   assert.ok(b.some(t=>t.includes('二人目の用事'))&&!b.some(t=>t.includes('担当が空の用事')),b.join('|'));
   assert.ok(await overflow(p)<=0);
  });
  await check('バッジの色と表記が人ごとに分かれる '+width+'px',async()=>{
   await p.click('[data-tt="all"]');
   const bs=await p.$$eval('main .pbadge',a=>[...new Set(a.map(x=>x.className+'|'+x.textContent))]);
   const cls=l=>bs.filter(x=>x.endsWith('|'+l)).map(x=>x.split('|')[0]);
   assert.equal(cls('黒木試').length,1);assert.equal(cls('黒木見').length,1);
   assert.notEqual(cls('黒木試')[0],cls('黒木見')[0]);
   assert.ok(!bs.some(x=>x.endsWith('|黒木')),bs.join());
  });
  await check('ガントの担当の絞り込みと行のバッジ '+width+'px',async()=>{
   await p.evaluate(()=>SS.go('gantt'));
   const gt=await p.$$eval('[data-gt]',a=>a.map(x=>x.dataset.gt));
   assert.deepEqual(gt.filter(x=>x!=='all').sort(),['例題','黒木見','黒木試'].sort());
   await p.click('[data-gt="黒木見"]');
   const rows=await p.$$eval('.grow:not(.ghead)',a=>a.map(x=>x.textContent));
   assert.equal(rows.length,1);assert.ok(rows[0].includes('見本荘B'));
   assert.ok(await overflow(p)<=0);
  });
  await check('会社の動き：担当別のまとめと同期の状況 '+width+'px',async()=>{
   await p.evaluate(()=>SS.go('company'));
   const sums=await p.$$eval('.panel:has(h3:text-matches("動いている案件")) details > summary',a=>a.map(x=>x.textContent));
   assert.ok(sums.some(x=>x.startsWith('黒木試（1件）'))&&sums.some(x=>x.startsWith('黒木見（1件）')),sums.join('|'));
   const li=await p.$$eval('h3:text("同期の状況")+ul li',a=>a.map(x=>({t:x.textContent,c:getComputedStyle(x).color})));
   const a=li.find(x=>x.t.startsWith('黒木試')),b=li.find(x=>x.t.startsWith('黒木見')),ex=li.find(x=>x.t.startsWith('例題'));
   assert.ok(a&&!a.t.includes('今日まだ同期していません'),JSON.stringify(li));
   assert.ok(b&&b.t.includes('（今日まだ同期していません）'),JSON.stringify(li));
   assert.notEqual(a.c,b.c,'not-synced-today line is red');
   assert.ok(ex&&!ex.t.includes('今日まだ'));
   assert.ok(!li.some(x=>x.t.includes('3日以上')));
   assert.ok(await overflow(p)<=0);
  });
  await check('受付と手入力ToDoの担当の選択肢 '+width+'px',async()=>{
   await p.evaluate(()=>SS.go('new'));
   const o=await p.$$eval('#n_tantou option',a=>a.map(x=>x.textContent));
   assert.ok(o.includes('黒木試')&&o.includes('黒木見')&&o.includes('例題')&&o.includes('トシ')&&!o.includes('黒木'),o.join());
   await p.evaluate(()=>SS.go('todo'));
   const t=await p.$$eval('#td_tantou option',a=>a.map(x=>x.textContent));
   assert.ok(t.includes('黒木試')&&t.includes('黒木見'),t.join());
  });
  assert.deepEqual(errors,[]);await c.close();
 }
 await check('HUBの担当と同じ姓（黒木）は1人でも姓＋名の1字、ほかの姓は1人なら姓だけ',async()=>{
  const two=[staff[0],staff[2],{name:'例題 次郎',email:'test-d@example.com',sheetId:'sheetD00000000000000000004',company:'AT',role:'社員',lastSync:TODAY+' 09:00'}];
  const {c,p,errors}=await page(400,{staffList:[staff[0],staff[2]]});
  await p.evaluate(()=>SS.go('todo',{tPeriod:'all'}));
  let tt=await p.$$eval('[data-tt]',a=>a.map(x=>x.dataset.tt));
  assert.ok(tt.includes('黒木試')&&!tt.includes('黒木')&&tt.includes('例題'),tt.join());
  await c.close();
  const q=await page(400,{staffList:two});
  await q.p.evaluate(()=>SS.go('todo',{tPeriod:'all'}));
  tt=await q.p.$$eval('[data-tt]',a=>a.map(x=>x.dataset.tt));
  assert.ok(tt.includes('例題花')&&tt.includes('例題次')&&!tt.includes('例題'),tt.join());
  assert.deepEqual(errors,[]);assert.deepEqual(q.errors,[]);await q.c.close();
 });
 await check('受付の担当：HUBの担当は今までの値「黒木」で保存し、表示は区別した名前',async()=>{
  const {c,p,errors}=await page(400);
  await p.evaluate(()=>SS.go('new'));
  const o=await p.$$eval('#n_tantou option',a=>a.map(x=>x.value+'='+x.textContent));
  assert.ok(o.includes('黒木=黒木試')&&o.includes('黒木　見本二=黒木見')&&o.includes('トシ=トシ'),o.join());
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('社員の端末：自分の姓のHUBの担当は自分の区別した名前で出る',async()=>{
  const {c,p,errors}=await page(400,{admin:false,staffList:[],rsName:'黒木 見本二'});
  await p.evaluate(()=>SS.go('new'));
  const o=await p.$$eval('#n_tantou option',a=>a.map(x=>x.value+'='+x.textContent));
  assert.ok(o.includes('黒木=黒木見')&&o.includes('トシ=トシ')&&o.length===2,o.join());
  const raw=await p.evaluate(()=>localStorage.getItem('workhub_proto_v1')||'');
  assert.ok(!raw.includes('黒木見'),'labels are not written to saved data');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('帳票・外に出す名前はフルネーム（Access用CSV・カレンダーの説明）',async()=>{
  const {c,p,errors}=await page(400,{admin:false,staffList:[],rsName:'黒木 見本二'});
  const r=await p.evaluate(()=>{const c=Object.assign(SS.CASE_DEFAULTS(),{id:'U-0009',company:'CP',type:'taikyo',stage:'won',client:'試験管理',clientKind:'管理会社',property:'試験荘',room:'1',tantou:'黒木',receivedAt:'2026-10-20T00:00:00.000Z',orderDate:'2026-10-25'});
   return {csv:SS.csvText([c]),desc:SS.gDesc(c),label:SS.tantouLabel('黒木')}});
  assert.ok(r.csv.split('\n')[1].includes(',黒木 見本二,'),r.csv);
  assert.ok(r.desc.includes('担当：黒木 見本二'),r.desc);
  assert.equal(r.label,'黒木見');
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
