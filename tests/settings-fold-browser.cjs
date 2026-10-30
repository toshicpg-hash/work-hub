/* Synthetic fixtures only. No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SF={get db(){return DB},ui,go,render};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function context(width,{admin=true,foldRaw=null}={}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.addInitScript(({foldRaw})=>{if(foldRaw!==null&&!sessionStorage.getItem('seeded')){localStorage.setItem('workhub_fold_v1',foldRaw);sessionStorage.setItem('seeded','1')}},{foldRaw});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SF);
 await p.evaluate(admin=>{SF.db.settings.data.admin=admin;SF.go('stats')},admin);
 return {c,p,errors};
}
const folds=p=>p.$$eval('details[data-fold]',a=>a.map(d=>({k:d.dataset.fold,open:d.open,h:d.querySelector('summary').getBoundingClientRect().height,t:d.querySelector('summary').textContent})));
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,details,.row,.form')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [320,400]){
  const {c,p,errors}=await context(width);
  await check('設定の欄は初めは閉じていて、見出しは44px以上 '+width+'px',async()=>{
   const f=await folds(p);
   for(const k of ['todoDays','gcal','dataAdmin'])assert.ok(f.some(x=>x.k===k),k+' missing: '+JSON.stringify(f));
   assert.ok(f.every(x=>!x.open),JSON.stringify(f));
   assert.ok(f.every(x=>x.h>=44),JSON.stringify(f));
   assert.ok(f.find(x=>x.k==='dataAdmin').t.includes('管理（社長用）'));
   assert.ok(!(await p.isVisible('#setForm')));
   assert.ok(await overflow(p)<=0);
  });
  await check('集計の部分は今まで通り開いたまま '+width+'px',async()=>{
   assert.ok(await p.isVisible('h2:text("未入金")'));
   assert.ok(await p.isVisible('h2:text-matches("月の見積と受注")'));
   assert.ok(await p.isVisible('h2:text-matches("月の担当別")'));
   assert.equal(await p.$$eval('details[data-fold] h2',a=>a.filter(x=>/未入金|見積と受注|担当別|失注の理由/.test(x.textContent)).length),0);
  });
  await check('開くと中のボタンはそのまま使え、開け閉めは端末に覚える（別のキー） '+width+'px',async()=>{
   await p.click('details[data-fold="todoDays"] > summary');
   assert.ok(await p.isVisible('#setForm'));
   await p.fill('#s_quote','5');await p.click('#setForm button[type=submit]');
   assert.equal(await p.evaluate(()=>SF.db.settings.quote),5);
   assert.ok(await p.isVisible('#setForm'),'stays open after saving');
   await p.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('workhub_fold_v1')||'{}').todoDays===true}catch(e){return false}});
   assert.ok(!(await p.evaluate(()=>localStorage.getItem('workhub_proto_v1')||'')).includes('todoDays'),'fold state is not in the app data');
   await p.reload();await p.waitForFunction(()=>!!window.SF);await p.evaluate(()=>{SF.db.settings.data.admin=true;SF.go('stats')});
   const f=await folds(p);
   assert.equal(f.find(x=>x.k==='todoDays').open,true);assert.equal(f.find(x=>x.k==='gcal').open,false);
   await p.click('details[data-fold="todoDays"] > summary');
   await p.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('workhub_fold_v1')||'{}').todoDays===false}catch(e){return false}});
   assert.ok(await overflow(p)<=0);
  });
  await check('メッセージや確認が出ている欄は開いたまま '+width+'px',async()=>{
   await p.evaluate(()=>{SF.ui.dmsg=[{ok:false,text:'テストのエラー'}];SF.render()});
   const f=await folds(p);
   assert.equal(f.find(x=>x.k==='dataAdmin').open,true);
   assert.ok(await p.isVisible('text=テストのエラー'));
   await p.evaluate(()=>{SF.ui.dmsg=null;SF.render()});
  });
  assert.deepEqual(errors,[]);await c.close();
 }
 await check('覚えた内容が壊れていても表示は崩れない',async()=>{
  const {c,p,errors}=await context(400,{foldRaw:'{not json'});
  const f=await folds(p);
  assert.ok(f.length>=3&&f.every(x=>!x.open));
  await p.click('details[data-fold="gcal"] > summary');
  await p.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('workhub_fold_v1')||'{}').gcal===true}catch(e){return false}});
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('社員の端末：記録の送り先と会社の動きを見るの欄も開け閉めできる',async()=>{
  const {c,p,errors}=await context(400,{admin:false});
  const f=await folds(p);
  assert.ok(f.some(x=>x.k==='dataSheet')&&f.some(x=>x.k==='dataView')&&!f.some(x=>x.k==='dataAdmin'),JSON.stringify(f));
  assert.ok(f.every(x=>!x.open));
  await p.click('details[data-fold="dataSheet"] > summary');
  assert.ok(await p.isVisible('#d_sheet'));
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
