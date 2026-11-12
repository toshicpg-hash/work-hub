/* v1.50.42 予定の週表示：ほかの画面から開いたら今日のある週から出し、今日の行が画面（見出しとメニューの間）に入るように動かす。
   入っていれば動かさない。「今週」と週表示への切り替えでも同じ。Synthetic only: no Google calls. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.WT={get ui(){return ui},go,render,addDays};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device(width,height,now){
 const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date(now));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.WT);
 return {c,p,errors};
}
/* 今日の行が見出しの下・メニューの上に入っているか */
const todayBox=p=>p.evaluate(()=>{const b=document.querySelector('.wkd[aria-current="date"]'),row=b&&b.closest('.wkrow');if(!row)return null;const r=row.getBoundingClientRect();
 return {top:r.top,bottom:r.bottom,head:document.querySelector('header.top').getBoundingClientRect().bottom,nav:document.querySelector('nav.bottom').getBoundingClientRect().top,y:window.scrollY}});
const inView=b=>!!b&&b.top>=b.head-0.5&&b.bottom<=b.nav+0.5;
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const openCal=async p=>{await p.click('nav.bottom [data-nav="cal"]');await settle(p)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [w,h] of [[400,560],[360,520]]){
  /* 土曜日（週の最後の行） */
  const S=await device(w,h,'2026-11-14T03:00:00Z');
  await check('土曜日：予定を開くと、動かさなくても今日の行が見える '+w+'x'+h,async()=>{
   await openCal(S.p);
   assert.equal(await S.p.evaluate(()=>WT.ui.calView),'week');
   const b=await todayBox(S.p);assert.ok(inView(b),JSON.stringify(b));assert.ok(b.y>0,'it had to move: the row is below the menu at the top of the page');
   if(w===400)await S.p.screenshot({path:path.join(require('node:os').tmpdir(),'week-today-400.png')});
   await S.p.evaluate(()=>window.scrollTo(0,0));assert.ok(!inView(await todayBox(S.p)),'precondition: hidden at the top of the page');
   assert.ok(await S.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'no horizontal overflow');
  });
  await check('次の週へ進んでから「今週」を押すと、今日の行まで戻る。週表示への切り替えでも見える '+w+'x'+h,async()=>{
   await S.p.evaluate(()=>window.scrollTo(0,0));await S.p.click('[data-shift="7"]');await settle(S.p);assert.equal(await todayBox(S.p),null);
   await S.p.click('[data-shift="today"]');await settle(S.p);assert.ok(inView(await todayBox(S.p)));
   await S.p.click('[data-cv="month"]');await S.p.evaluate(()=>window.scrollTo(0,0));await S.p.click('[data-cv="week"]');await settle(S.p);assert.ok(inView(await todayBox(S.p)));
  });
  await check('ほかの画面へ行って戻っても、今日の行が見える。前の週を見ていたときは、その週のまま（今までどおり） '+w+'x'+h,async()=>{
   await S.p.click('nav.bottom [data-nav="home"]');await openCal(S.p);assert.ok(inView(await todayBox(S.p)));
   await S.p.click('[data-shift="-7"]');await settle(S.p);await S.p.click('nav.bottom [data-nav="home"]');await openCal(S.p);
   assert.equal(await todayBox(S.p),null);assert.equal(await S.p.evaluate(()=>WT.ui.calDay),'2026-11-07');assert.equal(await S.p.evaluate(()=>window.scrollY),0);
   await S.p.click('[data-shift="today"]');await settle(S.p);
  });
  await check('同期などで描き直しても、勝手に動かない '+w+'x'+h,async()=>{
   await S.p.evaluate(()=>window.scrollTo(0,0));await S.p.evaluate(()=>WT.render());await settle(S.p);assert.equal(await S.p.evaluate(()=>window.scrollY),0);
   assert.deepEqual(S.errors,[]);
  });
  await S.c.close();
  /* 日曜日（週の最初の行）：見えているので動かさない */
  const U=await device(w,h,'2026-11-15T03:00:00Z');
  await check('日曜日：今日の行がはじめから見えているので動かさない '+w+'x'+h,async()=>{
   await openCal(U.p);const b=await todayBox(U.p);assert.ok(inView(b));assert.equal(b.y,0);assert.deepEqual(U.errors,[]);
  });
  await U.c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
