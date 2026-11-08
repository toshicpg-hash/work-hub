/* v1.50.28 会社・人の切り替えを目立たせる（色の枠・太字・名前を最後まで）。経理・業務管理の端末からのタスクリクエストは「経理 ○○」「業務管理 ○○」の名前で出す。
   Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SP={get db(){return DB},get ui(){return ui},go,render,save,boxMe,canIssueTo};';
const LONG='見本 とても長い名前の社員さん';
const staff=[{name:'見本 一郎',email:'a@example.com',sheetId:'sheetA00000000000000000001',company:'CP',role:'社員'},{name:LONG,email:'l@example.com',sheetId:'sheetL00000000000000000002',company:'CPY',role:'社員',boxId:'boxL0000000000000000000002'},{name:'経理 見本',email:'k@example.com',sheetId:'sheetK00000000000000000003',company:'CP',role:'経理',charge:'CPY'},{name:'業務 見本',email:'g@example.com',sheetId:'sheetG00000000000000000004',company:'CP',role:'業務管理',charge:'CP',displayName:'業務担当'}];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u.startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SP);return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.scope-bar,.scope-row,[data-view-scope]')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const w of [400,360])await check('会社・人の切り替え（'+w+'px）：選んでいる名前を最後まで、色の枠の札で出す。押せば選べ、選ぶと札も変わる。横にはみ出さない',async()=>{
  const {c,p,errors}=await page(w);
  await p.evaluate(staff=>{const d=SP.db.settings.data;d.admin=true;d.ob={legacy:true};d.staff=staff;SP.save();SP.go('cases')},staff);
  await p.selectOption('[data-scope-person]',staff[1].sheetId);
  const pills=await p.$$eval('.scope-bar .vs-cur',els=>els.map(e=>({t:e.textContent,border:getComputedStyle(e).borderTopWidth,weight:getComputedStyle(e).fontWeight,w:e.getBoundingClientRect().width})));
  assert.equal(pills.length,2);assert.equal(pills[1].t,LONG,'the full name, not cut off');assert.equal(pills[0].t,'全社');
  assert.equal(pills[0].border,'2px');assert.ok(Number(pills[0].weight)>=700);
  assert.ok(pills[0].w<110,'the company pill is as wide as its text: '+pills[0].w);
  assert.ok(await overflow(p)<=1,'no horizontal overflow');
  const sel=await p.$eval('[data-scope-person]',s=>{const b=s.getBoundingClientRect(),l=s.closest('label').getBoundingClientRect();return {op:getComputedStyle(s).opacity,cover:Math.abs(b.width-l.width)<2&&Math.abs(b.height-l.height)<2}});
  assert.equal(sel.op,'0');assert.ok(sel.cover,'the real select covers the pill (tap opens the device picker)');
  await p.selectOption('[data-scope-person]','all');assert.equal(await p.$eval('.scope-bar .vs-pick:nth-of-type(2) .vs-cur',e=>e.textContent),'全員');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('経理・業務管理の端末：タスクリクエストを出す名前は「経理 ○○」「業務管理 ○○」。出せるのは担当の会社の社員だけ',async()=>{
  const {c,p,errors}=await page(400);
  const r=await p.evaluate(staff=>{const d=SP.db.settings.data;d.admin=false;d.viewListId='synthetic-view-list-0000000001';SP.ui.viewList=staff;
    d.viewEmail='k@example.com';const k=SP.boxMe(),kl=SP.canIssueTo(staff[1]),ka=SP.canIssueTo(staff[0]);
    d.viewEmail='g@example.com';const g=SP.boxMe();return {k:k.label,kl,ka,g:g.label}},staff);
  assert.equal(r.k,'経理 経理 見本');assert.equal(r.g,'業務管理 業務担当');assert.equal(r.kl,true,'CPY employee with a box');assert.equal(r.ka,false,'CP employee: outside the charged company (and no box)');
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
