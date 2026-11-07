/* v1.50.19 1つの会社にGMを2人以上：すでにGMがいる会社を選ぶと「n人目のGMとして追加する」「○○さんと入れ替える」「やめる」を選べる。
   その会社のGMのままの人を保存するときは聞かない。Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.MG={get db(){return DB},ui,go,render,save,stub(){window.__calls=[];adminRoleSave=async(id,v,swap)=>{window.__calls.push(["role",id,v.role,v.gmCo,swap])};adminAdd=async(name,mail,log,rv,swap)=>{window.__calls.push(["add",mail,rv.role,rv.gmCo,swap])}}};';
const staff=[
 {name:'見本 一',email:'gm-a@example.com',sheetId:'sheetGA0000000000000000001',company:'CPY',role:'GM',gmCo:'CPY'},
 {name:'見本 二',email:'emp-b@example.com',sheetId:'sheetEB0000000000000000002',company:'CPY',role:'社員',gmCo:''},
 {name:'見本 三',email:'emp-c@example.com',sheetId:'sheetEC0000000000000000003',company:'CPY',role:'社員',gmCo:''},
 {name:'見本 四',email:'all-d@example.com',sheetId:'sheetAD0000000000000000004',company:'CP,CPY,AT',role:'全社',gmCo:'CP'}];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card,.seg,.ro')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.MG);
 const reset=async(list)=>p.evaluate(list=>{const d=MG.db.settings.data;d.admin=true;d.ob={legacy:true};d.staff=JSON.parse(JSON.stringify(list));MG.ui.dAsk=null;MG.ui.dRole=null;MG.stub();MG.save();MG.go('stats')},list);
 const editAsGm=async i=>{await p.evaluate(i=>{MG.ui.dRole=i;MG.render()},i);await p.selectOption('#dr_role','GM');await p.selectOption('#dr_gm','CPY');await p.evaluate(()=>document.querySelector('[data-act="droledo"]').click())};
 const calls=()=>p.evaluate(()=>window.__calls);
 await check('GMがいる会社に2人目：追加・入れ替え・やめるを選べる。追加は今のGMを外さない（入れ替えの相手なし）',async()=>{
  await reset(staff);await editAsGm(2);
  const t=await p.textContent('main');
  assert.match(t,/CPYのGMはすでに見本 一さんです。2人目のGMとして追加しますか？ 入れ替えますか？/);
  assert.equal(await p.locator('[data-act="daskadd"]').textContent(),'2人目のGMとして追加する');
  assert.deepEqual(await p.locator('[data-act="daskswap"]').allTextContents(),['見本 一さんと入れ替える']);
  assert.ok(await overflow(p)<=1,'no horizontal overflow at 400px');
  await p.click('[data-act="daskadd"]');
  assert.deepEqual(await calls(),[['role','sheetEC0000000000000000003','GM','CPY','']]);
 });
 await check('入れ替えを選ぶと、選んだ人と入れ替える。やめるでは何もしない',async()=>{
  await reset(staff);await editAsGm(2);await p.click('[data-act="daskno"]');assert.deepEqual(await calls(),[]);
  await editAsGm(2);await p.click('[data-act="daskswap"]');
  assert.deepEqual(await calls(),[['role','sheetEC0000000000000000003','GM','CPY','sheetGA0000000000000000001']]);
 });
 const two=staff.map((s,i)=>i===2?{...s,role:'GM',gmCo:'CPY'}:s);
 await check('GMが2人いる会社：GMのままの人を保存しても聞かない。3人目は2人の名前と入れ替えの相手を出す',async()=>{
  await reset(two);await p.evaluate(()=>{MG.ui.dRole=0;MG.render()});await p.fill('#dr_disp','見本の表示名');await p.evaluate(()=>document.querySelector('[data-act="droledo"]').click());
  assert.equal(await p.locator('[data-act="daskadd"]').count(),0,'no question');
  assert.deepEqual(await calls(),[['role','sheetGA0000000000000000001','GM','CPY','']]);
  await reset(two);await editAsGm(1);
  assert.match(await p.textContent('main'),/CPYのGMはすでに見本 一さん・見本 三さんです。3人目のGMとして追加しますか？/);
  assert.deepEqual(await p.locator('[data-act="daskswap"]').allTextContents(),['見本 一さんと入れ替える','見本 三さんと入れ替える']);
  assert.ok(await overflow(p)<=1);
  await p.locator('[data-act="daskswap"]').nth(1).click();
  assert.deepEqual(await calls(),[['role','sheetEB0000000000000000002','GM','CPY','sheetEC0000000000000000003']]);
 });
 await check('社員の追加でも同じ：GMがいる会社をGMで追加すると選べる。追加は入れ替えの相手なし',async()=>{
  await reset(staff);
  await p.fill('#d_name','見本 五');await p.fill('#d_mail','new-e@example.com');await p.selectOption('#da_role','GM');await p.selectOption('#da_gm','CPY');
  await p.evaluate(()=>document.querySelector('[data-act="dadd"]').click());
  assert.match(await p.textContent('main'),/2人目のGMとして追加しますか/);
  await p.click('[data-act="daskadd"]');
  assert.deepEqual(await calls(),[['add','new-e@example.com','GM','CPY','']]);
 });
 await check('GMのいない会社は今までどおり聞かない',async()=>{
  await reset(staff);await p.evaluate(()=>{MG.ui.dRole=1;MG.render()});await p.selectOption('#dr_role','GM');await p.selectOption('#dr_gm','AT');
  await p.evaluate(()=>document.querySelector('[data-act="droledo"]').click());
  assert.equal(await p.locator('[data-act="daskadd"]').count(),0);
  assert.deepEqual(await calls(),[['role','sheetEB0000000000000000002','GM','AT','']]);
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
