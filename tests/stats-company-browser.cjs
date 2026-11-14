/* Synthetic fixtures only (fictional names, example.com). No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.ST={get db(){return DB},ui,go,render,roBuild,save,CASE_DEFAULTS};';
const TODAY='2026-10-29';
const staff=[
 {name:'見本 一郎',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'',role:'社員',lastSync:TODAY+' 08:00'},
 {name:'例題 花子',email:'test-b@example.com',sheetId:'sheetB00000000000000000002',company:'CPY',role:'社員',lastSync:TODAY+' 09:00'}];
const row=(no,prop,tan,o)=>Object.assign({'受付番号':no,'種類':'リノベーション','段階':'見積提出','物件':prop,'部屋':'1','担当':tan,'受付日':'2026-10-01','段階キー':'quoted'},o);
const data=[
 {s:staff[0],ok:true,rc:[],orders:[],todo:[],cases:[
  row('U-0001','試験荘見積','見本',{'会社':'CP','見積額':50000,'見積提出日':'2026-10-20'}),
  row('U-0001','試験荘見積','見本',{'会社':'CP','見積額':50000,'見積提出日':'2026-10-20'}), /* 同じ受付番号・同じ持ち主の重複行 */
  row('U-0002','試験荘受注','見本',{'会社':'CPY','段階キー':'won','段階':'受注','見積額':100000,'見積提出日':'2026-10-10','受注日':'2026-10-21'}),
  row('U-0003','試験荘請求','見本',{'会社':'CP','段階キー':'billed','段階':'請求済','見積額':80000,'受注日':'2026-09-10','請求日':'2026-10-05','請求額':80000,'入金予定日':'2026-10-31','入金済額':30000}),
  row('U-0004','試験荘失注','見本',{'会社':'AT','段階キー':'lost','段階':'失注','見積提出日':'2026-10-02','失注日':'2026-10-15'})]},
 {s:staff[1],ok:true,rc:[],orders:[],todo:[],cases:[
  row('U-0001','例題荘受注','例題',{'段階キー':'won','段階':'受注','見積額':200000,'見積提出日':'2026-10-03','受注日':'2026-10-12'})]}]; /* 会社の列なし → 人の会社 CPY */
/* v1.50.55 数字タブのまとまりは最初は畳む。この試験は中の数字を見るので、開いた状態にしておく */
const OPEN_STATS=()=>{try{const k='workhub_fold_v1',v=JSON.parse(localStorage.getItem(k)||'{}');for(const x of ['st_won','st_unpaid','st_tantou','st_reasons','st_types'])if(!(x in v))v[x]=true;localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width,{admin=true,load=true}={}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();await p.addInitScript(OPEN_STATS);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.ST);
 await p.evaluate(({admin,load,staff,data})=>{const d=ST.db.settings.data;d.admin=admin;d.staff=admin?JSON.parse(JSON.stringify(staff)):[];
  /* この端末で入力した案件（会社 CP、今月見積提出） */
  ST.db.cases=[Object.assign(ST.CASE_DEFAULTS(),{id:'U-0001',company:'CP',type:'reno',stage:'quoted',client:'試験管理',clientKind:'管理会社',property:'自分の荘',room:'1',tantou:'トシ',receivedAt:'2026-10-01T01:00:00.000Z',estAmount:10000,estSentDate:'2026-10-25'})];
  if(admin&&load){const dd=JSON.parse(JSON.stringify(data));dd.forEach(x=>x.s=d.staff.find(s=>s.sheetId===x.s.sheetId));ST.ui.corp={data:dd,at:Date.now()};ST.roBuild(dd)}
  if(admin)CPGViewScope.save(localStorage,{account:'toshi.cpg@gmail.com',record:d.sheetId||'',viewer:d.listId||''},{company:'all',person:'all'});ST.go('stats')},{admin,load,staff,data});
 return {c,p,errors};
}
const sum=p=>p.$$eval('.sum .k',a=>Object.fromEntries(a.map(k=>[k.textContent,k.nextElementSibling.textContent])));
/* v1.50.55 未入金は畳める見出しになり、件数・金額のあとに「（現在残高）」などが続く */
const unpaidHead=p=>p.$eval('h2:text("未入金")+span',e=>e.textContent.replace(/（現在残高）.*$/,''));
// Wide tables may scroll inside .tbl-wrap; outer panels and the page must not overflow.
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [320,400]){
  const {c,p,errors}=await page(width);
  await check('社長の端末：社員の見積提出・受注・未入金が数字に入り、重複行は1件 '+width+'px',async()=>{
   const s=await sum(p);
   assert.equal(s['見積提出'],'5件',JSON.stringify(s)); /* 自分1＋見本3（U-0001は重複行でも1件）＋例題1 */
   assert.equal(s['受注'],'2件');assert.equal(s['受注額（見積額）'].replace(/\s/g,''),'300,000円');
   assert.ok((await p.textContent('main')).includes('受注 2件 ／ 失注 1件'));
   assert.equal(await unpaidHead(p),'1件 50,000円');
   await p.click('[data-info=stats]');assert.ok((await p.textContent('main')).includes('を含めた会社全体の数字です'));await p.click('[data-info=stats]');
   assert.ok(await overflow(p)<=0);
  });
  await check('担当別の表 '+width+'px',async()=>{
   const rows=await p.$$eval('h2:text-matches("月の担当別")+* tbody tr, .sec:has(h2:text-matches("月の担当別")) tbody tr',a=>[...new Set(a.map(x=>[...x.cells].map(c=>c.textContent).join('|')))]);
   assert.ok(rows.includes('見本 一郎|3件|1件|1件|100,000円|1件 50,000円'),rows.join(' / '));
   assert.ok(rows.includes('例題 花子|1件|1件|0件|200,000円|0件 0円'),rows.join(' / '));
   assert.ok(rows.includes('社長|1件|0件|0件|0円|0件 0円'),rows.join(' / '));
  });
  await check('会社の絞り込み（案件の明示会社・未設定は補完しない） '+width+'px',async()=>{
   await p.locator('[data-scope-company]').selectOption('CP');let s=await sum(p);
   assert.equal(s['見積提出'],'2件',JSON.stringify(s));assert.equal(s['受注'],'0件');assert.equal(await unpaidHead(p),'1件 50,000円');
   await p.locator('[data-scope-company]').selectOption('CPY');s=await sum(p);
   assert.equal(s['見積提出'],'1件',JSON.stringify(s));assert.equal(s['受注'],'1件');assert.equal(await unpaidHead(p),'0件 0円');
   await p.locator('[data-scope-company]').selectOption('AT');s=await sum(p);
   assert.equal(s['見積提出'],'1件');assert.ok((await p.textContent('main')).includes('受注 0件 ／ 失注 1件'));
   assert.ok(await overflow(p)<=0);
   await p.locator('[data-scope-company]').selectOption('all');
  });
  assert.deepEqual(errors,[]);await c.close();
 }
 await check('読み込み前は「まだ読み込んでいません」を出し、自分の分だけ',async()=>{
  const {c,p,errors}=await page(400,{load:false});
  const t=await p.textContent('main');
  assert.ok(t.includes('社員の記録はまだ読み込んでいません'));
  assert.equal((await sum(p))['見積提出'],'1件');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('GMの端末：GMの会社に固定し、ほかの会社は選べない',async()=>{
  const {c,p,errors}=await page(400,{admin:false});
  await p.evaluate(({staff,data})=>{const d=ST.db.settings.data;d.viewListId='viewList0000000000000001';d.viewEmail='test-b@example.com';
   d.sheetId=staff[1].sheetId;ST.ui.viewList=[Object.assign({},staff[0],{role:'社員',company:'CPY'}),Object.assign({},staff[1],{role:'GM',gmCo:'CPY'})];CPGViewScope.save(localStorage,{account:d.viewEmail,record:d.sheetId,viewer:d.viewListId},{company:'CPY',person:'all'});
   const dd=JSON.parse(JSON.stringify(data));ST.ui.corp={data:dd,at:Date.now()};ST.ui.sCo='CP';ST.roBuild(dd);ST.go('stats')},{staff,data});
  await p.click('[data-info=stats]');const t=await p.textContent('main');await p.click('[data-info=stats]');
  assert.ok(t.includes('CPY')&&t.includes('上で選んだ会社・人の分'),t.slice(0,300));
  assert.equal(await p.$$eval('[data-sco]',a=>a.length),0,'company buttons are not shown on a GM device');
  const s=await sum(p);
  assert.equal(s['見積提出'],'1件',JSON.stringify(s));assert.equal(s['受注'],'1件');assert.equal(await unpaidHead(p),'0件 0円');
  assert.ok(await overflow(p)<=0);
  const rows=await p.$$eval('.sec:has(h2:text-matches("月の担当別")) tbody tr',a=>a.map(x=>[...x.cells].map(c=>c.textContent).join('|')));
  assert.deepEqual(rows.sort(),['見本 一郎|1件|1件|0件|100,000円|0件 0円'],rows.join(' / '));
  /* 会社の動きも GMの会社に固定 */
  await p.evaluate(()=>{ST.ui.corpCo='AT';ST.roBuild(ST.ui.corp.data);ST.go('company')});
  assert.equal(await p.$$eval('[data-cco]',a=>a.length),0,'no company buttons in 会社の動き on a GM device');
  const home=await p.textContent('main');
  assert.ok(home.includes('CPY GM'));
  const cards=await p.$$eval('.panel:has(h3:text-matches("動いている案件")) .card .ttl',a=>a.map(x=>x.textContent.trim().split(' ')[0]).sort());
  assert.deepEqual(cards,['試験荘受注'],cards.join()); // same explicit CPY company selection as stats, not profile-inferred company
  await p.evaluate(()=>ST.go('cases'));
  assert.equal(await p.$$eval('.chip.ro',a=>a.length),1,'only explicit CPY company is included; missing company is not inferred');
  assert.ok(await overflow(p)<=0);
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('全社の端末：社長と同じく全社から選べる',async()=>{
  const {c,p,errors}=await page(400,{admin:false});
  await p.evaluate(({staff,data})=>{const d=ST.db.settings.data;d.viewListId='viewList0000000000000001';d.viewEmail='test-z@example.com';
   ST.ui.viewList=staff.concat([{name:'全社 太郎',email:'test-z@example.com',sheetId:'sheetZ00000000000000000009',company:'CP',role:'全社',gmCo:'CP'}]);
   const dd=JSON.parse(JSON.stringify(data));ST.ui.corp={data:dd,at:Date.now()};ST.roBuild(dd);ST.go('stats')},{staff,data});
  assert.deepEqual(await p.$$eval('[data-scope-company] option',a=>a.map(x=>x.value)),['all','CP','CPY','AT','none']);await p.locator('[data-scope-person]').selectOption('all');
  assert.equal((await sum(p))['見積提出'],'5件');
  await p.click('[data-info=stats]');assert.ok((await p.textContent('main')).includes('を含めた会社全体の数字です'));await p.click('[data-info=stats]');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('社員の端末は今まで通り自分の分だけ（注記なし）',async()=>{
  const {c,p,errors}=await page(400,{admin:false});
  const t=await p.textContent('main');
  assert.ok(!t.includes('社員の記録はまだ読み込んでいません')&&!t.includes('会社全体の数字'));
  assert.equal((await sum(p))['見積提出'],'1件');assert.equal((await sum(p))['受注'],'0件');
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
