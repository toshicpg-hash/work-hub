/* v1.50.2 画面に出す名前：社長の担当は「社長」、社員一覧の「表示名」（任意）があればそれを出す。保存した記録は書き換えない。
   Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const N=require(path.join(root,'staff-names.js'));
const hook='window.DN={get db(){return DB},ui,go,render,roBuild,save,tantouLabel,personBadge,dispName,roleForm,roleVal,scopeContext,CASE_DEFAULTS};';
const TODAY='2026-11-05';
const staff=[
 {name:'黒木 試験一',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'CP,CPY,AT',role:'全社',gmCo:'',displayName:'専務',lastSync:TODAY+' 08:10'},
 {name:'例題 花子',email:'test-c@example.com',sheetId:'sheetC00000000000000000003',company:'CPY',role:'社員',gmCo:'',displayName:'',lastSync:TODAY+' 12:00'}];
const caseRow=(no,prop,tan)=>({'受付番号':no,'種類':'退去立会','段階':'見積提出','物件':prop,'部屋':'101','担当':tan,'受付日':'2026-10-20','実施日':'2026-10-21','見積提出日':'2026-10-22','段階キー':'quoted','会社':'CPY'});
const todoRow=(title,tan)=>({'内容':title,'期限':TODAY,'担当':tan,'受付番号':'','物件':'','部屋':'','種類':'手入力','状態':'今日'});
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width,staffList=staff){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:html.replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.DN);
 const data=[{s:staffList[1],ok:true,cases:[caseRow('U-0001','例題荘C','黒木'),caseRow('U-0002','例題荘D','トシ')],rc:[],orders:[],todo:[todoRow('社長の用事','トシ'),todoRow('専務の用事','黒木')]}];
 await p.evaluate(({staffList,data})=>{const d=DN.db.settings.data;d.admin=true;d.ob={legacy:true};d.staff=JSON.parse(JSON.stringify(staffList));
  DN.db.cases=[Object.assign(DN.CASE_DEFAULTS(),{id:'U-0100',company:'CP',type:'reno',stage:'new',client:'見本依頼元',clientKind:'管理会社',property:'見本荘',room:'1',tantou:'トシ',receivedAt:Date.now()}),Object.assign(DN.CASE_DEFAULTS(),{id:'U-0101',company:'CP',type:'reno',stage:'new',client:'見本依頼元',clientKind:'管理会社',property:'見本荘2',room:'2',tantou:'黒木',receivedAt:Date.now()})];
  DN.ui.corp={data:JSON.parse(JSON.stringify(data)).map(x=>Object.assign(x,{s:d.staff.find(s=>s.sheetId===x.s.sheetId)})),at:Date.now()};DN.roBuild(DN.ui.corp.data);DN.save();DN.render()},{staffList,data});
 return {c,p,errors};
}
async function main(){
 await check('表示名：あれば表示名、同じ表示名・同じ氏名の人がいれば氏名を添える。なければ今までどおり氏名',async()=>{
  const a={name:'黒木 試験一',sheetId:'a',displayName:'専務'},b={name:'例題 花子',sheetId:'b',displayName:''};
  assert.equal(N.label(a,[a,b]),'専務');assert.equal(N.label(b,[a,b]),'例題 花子');
  const c={name:'見本 三郎',sheetId:'c',displayName:'専務'};assert.equal(N.label(a,[a,b,c]),'専務（黒木 試験一）');assert.equal(N.label(c,[a,b,c]),'専務（見本 三郎）');
  const d={name:'見本 四郎',sheetId:'d',displayName:'例題 花子'};assert.equal(N.label(d,[a,b,d]),'例題 花子（見本 四郎）','a display name that is someone else’s name');
  assert.equal(N.label({...a},[a,b]),'専務','a copy of the same person is not a duplicate');
 });
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 await check('社長の担当「トシ」は「社長」、表示名のある人は表示名。案件・ToDo・会社の動き・選択肢で同じ。保存した記録は書き換えない',async()=>{
  const {c,p,errors}=await page(400);
  assert.equal(await p.evaluate(()=>DN.tantouLabel('トシ')),'社長');assert.equal(await p.evaluate(()=>DN.tantouLabel('黒木')),'専務');
  assert.match(await p.evaluate(()=>DN.personBadge('トシ')),/>社長</);assert.match(await p.evaluate(()=>DN.personBadge('黒木 試験一')),/>専務</);
  await p.evaluate(()=>DN.go('cases'));const ct=await p.textContent('main');assert.match(ct,/担当 社長/);assert.match(ct,/担当 専務/);assert.doesNotMatch(ct,/担当 トシ|担当 黒木/);
  await p.evaluate(()=>DN.go('todo'));const tt=await p.textContent('main');assert.doesNotMatch(tt,/トシ/);
  await p.evaluate(()=>DN.go('new'));const o=await p.$$eval('#n_tantou option',a=>a.map(x=>x.value+'='+x.textContent));assert.ok(o.includes('トシ=社長')&&o.includes('黒木=専務'),o.join());
  await p.evaluate(()=>DN.go('company'));const co=await p.textContent('main');assert.doesNotMatch(co,/トシ/);
  const sc=await p.evaluate(()=>DN.scopeContext().people.map(x=>x.label));assert.ok(sc.includes('専務')&&sc.includes('例題 花子'),sc.join());
  const opts=await p.evaluate(()=>[...document.querySelectorAll('main [data-scope-person] option')].map(x=>x.textContent));if(opts.length)assert.ok(opts.includes('専務'),opts.join());
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('workhub_proto_v1')).cases.map(x=>x.tantou));assert.deepEqual(saved,['トシ','黒木'],'stored values unchanged');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('社長の「会社・役割」で表示名を入れられる（空なら氏名）。社員一覧には氏名と表示名が出る。一覧の列の最後は「表示名」',async()=>{
  const {c,p,errors}=await page(400);
  await p.evaluate(()=>{DN.go('stats');document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)});
  const li=await p.evaluate(()=>[...document.querySelectorAll('[data-fold=dataAdmin] li')].map(l=>l.textContent).find(t=>t.includes('黒木 試験一')));assert.match(li,/黒木 試験一表示名 専務/);
  await p.click('[data-drole="0"]');assert.equal(await p.inputValue('#dr_disp'),'専務');
  await p.fill('#dr_disp','  役員　代理  ');assert.equal(await p.evaluate(()=>DN.roleVal('dr').displayName),'役員 代理');
  await p.fill('#dr_disp','');assert.equal(await p.evaluate(()=>DN.roleVal('dr').displayName),'');
  /* v1.50.19 表示名のあとに列を足すのは末尾だけ（社員一覧：受付番号の記号・GM統括、見る人用一覧：GM統括） */
  assert.ok(/STAFF_COLS=\[[^\]]*"指示箱ID","担当の会社","表示名","受付番号の記号","GM統括"\]/.test(html)&&/VIEW_COLS=\[[^\]]*"シートID","指示箱ID","担当の会社","表示名","GM統括"\]/.test(html),'表示名 stays after 担当の会社; new columns are only appended');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.locator('[data-fold=dataAdmin]').screenshot({path:path.join(root,'docs/preview/display-names-admin-400.png')});
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
