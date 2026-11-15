/* v1.50.73 予定を入れる：種類を12語から選び、共有の「CPG HUB」カレンダーに登録する。
   Synthetic fixtures only (fictional names, example.com). Google APIs are mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PA={get db(){return DB},get ui(){return ui},G,go,save,render,authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const OWN='staff-own@example.com',SHARED='shared-hub@group.example.com';
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return d.scrollWidth-d.clientWidth});
async function device(width,sharedWrite=true){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 const calls=[];
 await c.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/calendar/v3/calendars/')){const m=r.request().method(),p=decodeURIComponent(u.pathname);calls.push({method:m,path:p,body:m==='GET'?null:r.request().postDataJSON()});
   if(m==='GET')return r.fulfill({contentType:'application/json',body:JSON.stringify({items:[]})});
   return r.fulfill({contentType:'application/json',body:JSON.stringify({id:'x'})})}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-06T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PA);
 await p.evaluate(({OWN,SHARED,sharedWrite})=>{const D=PA.db;D.settings.data.ob={legacy:true};D.settings.rcpt.name='見本 一郎';
  PA.G.cals=[{id:OWN,name:'自分',primary:true,owner:true,write:true},{id:SHARED,name:'CPG HUB',primary:false,owner:false,write:sharedWrite}];PA.authorize();PA.save();PA.go('cal',{calView:'day',calDay:'2026-11-06'})},{OWN,SHARED,sharedWrite});
 return {c,p,errors,calls};
}
const posts=d=>d.calls.filter(x=>x.method==='POST');
const add=async p=>{await p.click('[data-act=planadd]');await p.waitForFunction(()=>!PA.ui.planBusy)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0);
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,400]){
  const d=await device(width);
  await check('予定を入れる：12語のボタン、在社は時刻つきで「CPG HUB」に登録 '+width+'px',async()=>{
   await d.p.click('#plan-add>summary');
   assert.deepEqual(await d.p.$$eval('[data-plan-kind]',a=>a.map(x=>x.dataset.planKind)),['在社','会議','打合せ','来社','直行','直帰','作業','営業','資材','緊急','公休','有給','午前休','午後休']);
   /* 種類を選ばないと登録しない */
   await add(d.p);assert.match(await d.p.textContent('#plan-add'),/種類を選んでください/);assert.equal(posts(d).length,0);
   await d.p.click('[data-plan-kind="在社"]');
   /* v1.50.81 種類ごとの記入例 */
   assert.match(await d.p.getAttribute('#pl_text','placeholder'),/見積書作成/);assert.equal(await d.p.getAttribute('#pl_place','placeholder'),'例：会社');
   await d.p.click('[data-plan-kind="資材"]');assert.match(await d.p.getAttribute('#pl_text','placeholder'),/資材の買い出し/);assert.match(await d.p.getAttribute('#pl_place','placeholder'),/ホームセンター/);
   await d.p.click('[data-plan-kind="在社"]');
   /* v1.50.80 時刻はプルダウン（Androidの時計の画面を使わない）。分は5分刻み */
   assert.equal(await d.p.$$eval('#plan-add input[type=time]',a=>a.length),0);
   {const b=await d.p.$eval('[data-act=planadd]',e=>{const r=e.getBoundingClientRect();return {h:r.height,w:r.width}}),s=await d.p.$eval('#pl_sh',e=>e.getBoundingClientRect().height);assert.ok(b.h>=52&&b.w>=width-80,JSON.stringify(b));assert.ok(s>=48,'select '+s)}assert.deepEqual(await d.p.$$eval('#pl_sm option',a=>a.map(x=>x.value)).then(v=>[v.length,v[1],v.at(-1)]),[13,'00','55']);await d.p.fill('#pl_text','見積書作成');await d.p.fill('#pl_date','2026-11-06');
   /* 時刻がないと登録しない */
   await add(d.p);assert.match(await d.p.textContent('#plan-add'),/開始と終了の時刻を入れてください/);
   await d.p.selectOption('#pl_sh','15');await d.p.selectOption('#pl_sm','00');await d.p.selectOption('#pl_eh','13');await d.p.selectOption('#pl_em','00');await add(d.p);assert.match(await d.p.textContent('#plan-add'),/終了は開始より後/);
   await d.p.selectOption('#pl_sh','13');await d.p.selectOption('#pl_sm','00');await d.p.selectOption('#pl_eh','15');await d.p.selectOption('#pl_em','00');
   /* v1.50.76 場所がないと登録しない */
   await add(d.p);assert.match(await d.p.textContent('#plan-add'),/場所を書いてください/);assert.equal(posts(d).length,0);
   await d.p.fill('#pl_place','見本ビル 101号室');await add(d.p);
   const b=posts(d)[0];assert.equal(b.body.location,'見本ビル 101号室');assert.equal(b.path,'/calendar/v3/calendars/'+SHARED+'/events','only the shared CPG HUB calendar');
   assert.equal(b.body.summary,'在社　見積書作成');assert.equal(b.body.start.dateTime,'2026-11-06T13:00:00+09:00');assert.equal(b.body.end.dateTime,'2026-11-06T15:00:00+09:00');
   assert.match(b.body.description,/担当：見本 一郎/);assert.match(b.body.description,/（CPG HUBから登録）/);assert.equal(b.body.extendedProperties.private.cpgHubPlan,'在社');
   assert.ok(!posts(d).some(x=>x.path.includes(OWN)),'never written to the personal calendar');
   assert.match(await d.p.textContent('#plan-add'),/「在社　見積書作成」を「CPG HUB」に登録しました/);
   assert.ok(await overflow(d.p)<=0);
  });
  await check('公休は終日・内容なしで登録。休み以外は内容がいる '+width+'px',async()=>{
   await d.p.click('[data-plan-kind="会議"]');await d.p.selectOption('#pl_sh','09');await d.p.selectOption('#pl_sm','00');await d.p.selectOption('#pl_eh','10');await d.p.selectOption('#pl_em','00');await add(d.p);assert.match(await d.p.textContent('#plan-add'),/内容を書いてください/);
   await d.p.click('[data-plan-kind="公休"]');assert.equal(await d.p.$$eval('#pl_sh',a=>a.length),0,'no time for all-day');assert.equal(await d.p.$$eval('#pl_place',a=>a.length),0,'no place for rest');
   await d.p.fill('#pl_date','2026-11-08');await add(d.p);
   const b=posts(d).at(-1);assert.equal(b.body.summary,'公休');assert.deepEqual(b.body.start,{date:'2026-11-08'});assert.deepEqual(b.body.end,{date:'2026-11-09'});assert.ok(!('location' in b.body));
   assert.ok(await overflow(d.p)<=0);assert.deepEqual(d.errors,[]);
  });
  await d.c.close();
 }
 await check('「CPG HUB」に書けないときは理由を出して登録しない',async()=>{
  const d=await device(400,false);await d.p.click('#plan-add>summary');await d.p.click('[data-plan-kind="公休"]');await add(d.p);
  assert.match(await d.p.textContent('#plan-add'),/「CPG HUB」カレンダーに書き込めません/);assert.equal(posts(d).length,0);assert.deepEqual(d.errors,[]);await d.c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
