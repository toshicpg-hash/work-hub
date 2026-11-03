/* v1.49.6 社長の社員一覧の「最終同期」は、社員の記録（情報タブ）を読み込んだ値。古い一覧の値は出さない。
   Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SL={get db(){return DB},get ui(){return ui},go,save,render};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:390,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SL);
 await p.evaluate(()=>{const d=SL.db.settings.data;d.admin=true;d.ob={legacy:true};d.listId='synthetic-list-0000000000001';
  d.staff=[{name:'見本 一郎',email:'a@example.com',sheetId:'synthetic-a-sheet-00000000001',company:'CP',role:'全社',gmCo:'',addedAt:'2026-10-01',lastSync:'2026-10-24 13:20',removed:false},{name:'見本 二郎',email:'b@example.com',sheetId:'synthetic-b-sheet-00000000002',company:'CPY',role:'社員',gmCo:'',addedAt:'2026-10-01',lastSync:'',removed:false}];
  SL.save();SL.go('stats');document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)});
 const row=name=>p.evaluate(name=>{const li=[...document.querySelectorAll('[data-fold=dataAdmin] li')].find(l=>l.textContent.includes(name));return li?li.textContent:''},name);
 await check('社員の記録をまだ読み込んでいないときは、一覧に残った古い最終同期を出さず「未読込」と出す',async()=>{
  const t=await row('見本 一郎');assert.ok(!t.includes('2026-10-24'),t);assert.match(t,/最終同期 未読込（社員の記録を読み込むと出ます）/);
  assert.match(await row('見本 二郎'),/最終同期 未読込/);
 });
 await check('読み込んだあとは、記録シートの「情報」タブの最終同期を出す（読めなかった人は、そう出す）',async()=>{
  await p.evaluate(()=>{const st=SL.db.settings.data.staff;SL.ui.corp={at:Date.now(),data:[{s:{...st[0],lastSync:'2026-11-03 08:00'},ok:true,cases:[],rc:[],todo:[],orders:[]},{s:{...st[1]},ok:false,msg:'見本の失敗'}]};SL.render();document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)});
  const a=await row('見本 一郎');assert.match(a,/最終同期 2026-11-03 08:00/);assert.ok(!a.includes('2026-10-24'));
  assert.match(await row('見本 二郎'),/最終同期 読み込めませんでした/);
  assert.equal(await p.evaluate(()=>SL.db.settings.data.staff[0].lastSync),'2026-10-24 13:20','the stored list value is not rewritten by showing it');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
