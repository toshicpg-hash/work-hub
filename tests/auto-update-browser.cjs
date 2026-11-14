/* Synthetic fixtures only. No Google requests; nothing is written to real data.
   v1.50.56 新しい版が出たら自動で更新する（下に引っ張らなくてよい）試験 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.AU={get next(){return updNext},check:updCheck,get ui(){return ui},get db(){return DB},save,go,render};';
const SRC=fs.readFileSync(path.join(root,'index.html'),'utf8');
const CUR=SRC.match(/class="ver"[^>]*>v(\d+\.\d+\.\d+)/)[1];
const withVer=v=>SRC.replace(/(class="ver"[^>]*>)v\d+\.\d+\.\d+/,'$1v'+v).replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
/* page: 開くときに返す版、latest: 版を確かめる読み直しで返す版 */
const state={page:CUR,latest:CUR,docs:[],checks:0};
async function context(width){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin&&(u.pathname==='/'||u.pathname==='/index.html')){
   if(u.searchParams.has('vc')){state.checks++;return r.fulfill({contentType:'text/html',body:withVer(state.latest),headers:{'cache-control':'no-store'}})}
   state.docs.push(u.pathname+u.search);return r.fulfill({contentType:'text/html',body:withVer(state.page)})}
  if(u.origin===origin)return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.AU);
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return d.scrollWidth-d.clientWidth});
const verText=p=>p.textContent('.ver');
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0);
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [320,400]){
  Object.assign(state,{page:CUR,latest:CUR,docs:[],checks:0});
  const {c,p,errors}=await context(width);
  await check('同じ版のときは開き直さない（開いて少しあとに確かめる） '+width+'px',async()=>{
   await p.clock.runFor(6000);await p.waitForFunction(()=>true);
   await p.waitForTimeout(300);
   assert.ok(state.checks>=1,'checked once after start');
   assert.equal(await p.evaluate(()=>AU.next),'');assert.deepEqual(state.docs,['/']);
   assert.match(await verText(p),new RegExp('v'+CUR.replace(/\./g,'\\.')));
  });
  await check('新しい版があっても、入力の途中なら開き直さず、終わってから自動で更新する '+width+'px',async()=>{
   state.latest='9.0.1';state.page='9.0.1';
   await p.evaluate(()=>{AU.db.settings.quote=7;AU.save()});
   await p.evaluate(()=>{const i=document.createElement('input');i.id='au_typing';document.body.appendChild(i);i.focus()});
   await p.evaluate(()=>AU.check(true));
   assert.equal(await p.evaluate(()=>AU.next),'9.0.1');assert.deepEqual(state.docs,['/'],'no reload while typing');
   await p.clock.runFor(16000);assert.deepEqual(state.docs,['/'],'still typing');
   await p.evaluate(()=>document.getElementById('au_typing').blur());
   const nav=p.waitForURL(u=>true,{waitUntil:'load'}).catch(()=>{});
   await p.clock.runFor(16000);await nav;await p.waitForFunction(()=>!!window.AU);
   assert.equal(state.docs.length,2);assert.equal(state.docs[1],'/?u=9.0.1');
   assert.match(await verText(p),/v9\.0\.1/);
   assert.equal(new URL(p.url()).search,'','URL mark removed');
   await p.clock.runFor(500);
   assert.match(await p.textContent('#toast'),/新しい版（v9\.0\.1）にしました/);
   assert.ok(await overflow(p)<=0);
  });
  await check('古い版が返ってきても、同じ版への更新は繰り返さない（5分に1回まで） '+width+'px',async()=>{
   state.latest='9.0.2';state.page='9.0.1';/* 確かめると新しいが、開くとまだ古いのが返る */
   const nav=p.waitForURL(u=>true,{waitUntil:'load'}).catch(()=>{});
   await p.evaluate(()=>AU.check(true)).catch(()=>{});await nav;await p.waitForFunction(()=>!!window.AU);
   assert.equal(state.docs.length,3);assert.equal(state.docs[2],'/?u=9.0.2');
   await p.evaluate(()=>AU.check(true));await p.clock.runFor(16000);await p.clock.runFor(16000);
   assert.equal(state.docs.length,3,'no loop');
   assert.doesNotMatch(await p.textContent('#toast'),/9\.0\.2/);
  });
  await check('同期の途中・確認の画面が開いているときも開き直さない '+width+'px',async()=>{
   state.latest='9.0.3';state.page='9.0.3';
   await p.evaluate(()=>{AU.ui.gsync={busy:true,rows:[]}});
   await p.evaluate(()=>AU.check(true));await p.clock.runFor(16000);assert.equal(state.docs.length,3,'sync busy');
   await p.evaluate(()=>{AU.ui.gsync=null;const d=document.createElement('dialog');d.id='au_dlg';document.body.appendChild(d);d.show()});
   await p.clock.runFor(16000);assert.equal(state.docs.length,3,'dialog open');
   const nav=p.waitForURL(u=>true,{waitUntil:'load'}).catch(()=>{});
   await p.evaluate(()=>document.getElementById('au_dlg').close());await p.clock.runFor(16000);await nav;await p.waitForFunction(()=>!!window.AU);
   assert.equal(state.docs[3],'/?u=9.0.3');assert.match(await verText(p),/v9\.0\.3/);
  });
  await check('案件などの記録（workhub_proto_v1）は開き直しても残る '+width+'px',async()=>{
   assert.ok((await p.evaluate(()=>localStorage.getItem('workhub_proto_v1')||'')).length>0);
   assert.equal(await p.evaluate(()=>AU.db.settings.quote),7,'a setting saved before the update is still there');
   assert.deepEqual(errors,[]);
  });
  await c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
