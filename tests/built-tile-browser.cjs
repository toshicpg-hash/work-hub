/* Synthetic fixtures only. No Google requests; nothing is written to real data.
   v1.50.65 ホームの「今月の完工」タイル（完工日が今月の案件。押すとその案件だけ） */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.BT={get db(){return DB},get ui(){return ui},save,go,render,CASE_DEFAULTS};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return d.scrollWidth-d.clientWidth});
async function main(){
 server=http.createServer((req,res)=>{let f=req.url.split('?')[0];if(f==='/')f='/index.html';try{let d=fs.readFileSync(path.join(root,f));if(f==='/index.html')d=d.toString().replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');res.end(d)}catch{res.writeHead(404).end()}}).listen(0);
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,400]){
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
  await c.route(u=>!u.href.startsWith(origin),r=>r.fulfill({status:200,body:''}));
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-14T03:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.BT);
  await p.evaluate(()=>{const D=BT.db,mk=(id,o)=>Object.assign(BT.CASE_DEFAULTS(),{id,type:'reno',company:'CP',property:'（架空）見本'+id,room:'101'},o);
   D.settings.data.ob={legacy:true};
   D.cases=[mk('T-1',{stage:'built',builtDate:'2026-11-03',estAmount:100000}),
    mk('T-2',{stage:'billed',builtDate:'2026-11-10',billDate:'2026-11-12',estAmount:250000}),
    mk('T-3',{stage:'paid',builtDate:'2026-11-01',billDate:'2026-11-02',paidDate:'2026-11-13',estAmount:50000,payments:[{date:'2026-11-13',amount:50000}],billAmount:50000}),
    mk('T-4',{stage:'built',builtDate:'2026-10-31',estAmount:999000}),/* 先月 */
    mk('T-5',{stage:'working',estAmount:777000}),/* まだ */
    mk('T-6',{stage:'lost',builtDate:'2026-11-05',estAmount:888000,lossDate:'2026-11-06'})];/* 失注は入れない */
   BT.save();BT.go('home')});
  await check('今月の完工：件数・見積額・うち請求済み（先月・施工中・失注は入れない） '+width+'px',async()=>{
   const t=await p.textContent('#home-built');
   assert.match(t,/今月の完工/);assert.match(t,/3件/);assert.match(t,/見積額 400,000円/);assert.match(t,/うち請求済み 2件/);
   const pos=await p.evaluate(()=>{const a=document.getElementById('home-access').getBoundingClientRect(),b=document.getElementById('home-built').getBoundingClientRect();return {sameRow:Math.abs(a.top-b.top)<2,right:b.left>a.left}});
   assert.ok(pos.sameRow&&pos.right,'next to Access tile '+JSON.stringify(pos));
   assert.ok(await overflow(p)<=0);
  });
  await check('押すと今月完工した案件だけ（入金済も出す） '+width+'px',async()=>{
   await p.click('#home-built');assert.equal(await p.evaluate(()=>BT.ui.view),'cases');
   const ids=await p.evaluate(()=>[...document.querySelectorAll('main')].map(m=>m.innerText).join(''));
   for(const id of ['T-1','T-2','T-3'])assert.ok(ids.includes('見本'+id),id);
   for(const id of ['T-4','T-5','T-6'])assert.ok(!ids.includes('見本'+id),id);
   assert.equal(await p.$eval('#builtOnly',x=>x.checked),true);
   /* v1.50.71 絞り込みは畳んだまま、見出しにかかっている絞り込みの名前 */
   assert.equal(await p.$eval('details.filters',d=>d.open),false);assert.match(await p.textContent('details.filters>summary'),/絞り込み：今月完工だけ/);
   await p.click('details.filters>summary');await p.waitForFunction(()=>BT.ui.filtersOpen===true);await p.evaluate(()=>BT.render());assert.equal(await p.$eval('details.filters',d=>d.open),true,'remembered');
   await p.evaluate(()=>BT.go('home'));await p.click('#home-access');assert.equal(await p.evaluate(()=>BT.ui.builtOnly),false,'other tiles clear it');
   assert.ok(await overflow(p)<=0);assert.deepEqual(errors,[]);
  });
  /* v1.50.70 会社・人の切り替えは、下までスクロールしても見出しのすぐ下に残る */
  await check('会社・人の切り替えは上の固定欄に残る '+width+'px',async()=>{
   await p.setViewportSize({width,height:360});/* v1.50.71 絞り込みを畳んで案件の画面が短くなったので、低い画面で見る */
   for(const v of ['stats','cases','home']){
    await p.evaluate(v=>{BT.go(v);window.scrollTo(0,document.body.scrollHeight)},v);await p.waitForTimeout(100);
    const r=await p.evaluate(()=>{const h=document.querySelector('header.top').getBoundingClientRect(),b=document.querySelector('main>.scope-bar').getBoundingClientRect(),y=scrollY;return {hb:h.bottom,bt:b.top,bb:b.bottom,y}});
    assert.ok(r.y>0,v+' scrolled '+JSON.stringify(r));assert.ok(Math.abs(r.bt-r.hb)<=6&&r.bb<250,v+' stays under the header '+JSON.stringify(r));
    const sel=await p.$('[data-scope-company]');if(sel){const hit=await p.evaluate(()=>{const e=document.querySelector('[data-scope-company]'),b=e.getBoundingClientRect();const t=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return e===t||e.contains(t)||(t&&t.closest&&t.closest('label')===e.closest('label'))});assert.ok(hit,v+' selector can be tapped')}
    assert.ok(await overflow(p)<=0);
   }
   assert.deepEqual(errors,[]);
  });
  await c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
