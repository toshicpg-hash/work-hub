/* Synthetic fixtures only (fictional names). No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.LM={get db(){return DB},ui,go,render,roBuild,save,lastMove,corpLastMove,dataRows,CASE_DEFAULTS};';
const TODAY='2026-10-29';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.LM);
 return {c,p,errors};
}
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const {c,p,errors}=await page(400);
 await check('未来の予定日がある案件：最終の動きは受付日（予定日を含めない）',async()=>{
  const r=await p.evaluate(()=>LM.lastMove(Object.assign(LM.CASE_DEFAULTS(),{id:'U-0901',type:'reno',stage:'new',receivedAt:'2026-10-26T01:00:00.000Z',planDate:'2026-11-11'})));
  assert.equal(r,'2026-10-26');
 });
 await check('予定日だけの案件：最終の動きは空',async()=>{
  const r=await p.evaluate(()=>LM.lastMove(Object.assign(LM.CASE_DEFAULTS(),{id:'U-0902',type:'reno',stage:'new',receivedAt:'',planDate:'2026-11-20'})));
  assert.equal(r,'');
 });
 await check('受注後に取り消した案件：取消日（日本時間）が最終の動き。未来の予定日は含めない',async()=>{
  const r=await p.evaluate(()=>LM.lastMove(Object.assign(LM.CASE_DEFAULTS(),{id:'U-0903',type:'reno',stage:'lost',receivedAt:'2026-10-20T01:00:00.000Z',orderDate:'2026-10-22',planDate:'2026-11-05',cancelledAt:'2026-10-27T16:30:00.000Z'})));
  assert.equal(r,'2026-10-28');
 });
 await check('保留の確認日：今日より先は含めず、今日以前なら含める',async()=>{
  const r=await p.evaluate(()=>[LM.lastMove(Object.assign(LM.CASE_DEFAULTS(),{id:'U-0904',type:'reno',stage:'hold',receivedAt:'2026-10-10T01:00:00.000Z',estSentDate:'2026-10-15',holdDate:'2026-11-02'})),
   LM.lastMove(Object.assign(LM.CASE_DEFAULTS(),{id:'U-0905',type:'reno',stage:'hold',receivedAt:'2026-10-10T01:00:00.000Z',estSentDate:'2026-10-15',holdDate:'2026-10-25'}))]);
  assert.deepEqual(r,['2026-10-15','2026-10-25']);
 });
 await check('入金・経理への依頼は実際の日付として数え、未来の日付は数えない',async()=>{
  const r=await p.evaluate(()=>LM.lastMove(Object.assign(LM.CASE_DEFAULTS(),{id:'U-0906',type:'reno',stage:'billed',receivedAt:'2026-10-01T01:00:00.000Z',billDate:'2026-10-20',payDue:'2026-11-30',payments:[{date:'2026-10-27',amount:1000}],payLog:[{kind:'req',at:'2026-10-24'}]})));
  assert.equal(r,'2026-10-27');
 });
 await check('記録シートの「最終の動き」列も同じ決まり（列の並びは同じ）',async()=>{
  const r=await p.evaluate(()=>{LM.db.cases=[Object.assign(LM.CASE_DEFAULTS(),{id:'U-0901',company:'CP',type:'reno',stage:'new',client:'試験管理',clientKind:'管理会社',property:'試験荘',room:'1',tantou:'トシ',receivedAt:'2026-10-26T01:00:00.000Z',planDate:'2026-11-11'})];
   const t=LM.dataRows().cases;return {head:t[0],row:t[1]}});
  const i=r.head.indexOf('最終の動き');
  assert.equal(i,20);assert.equal(r.row[i],'2026-10-26');assert.equal(r.row[r.head.indexOf('予定日')],'2026-11-11');
 });
 await check('会社の動き：古い版が送った未来の「最終の動き」は表示せず、行の実際の日付で決め直す。並びも同じ値',async()=>{
  await p.evaluate(()=>{const d=LM.db.settings.data;d.admin=true;
   d.staff=[{name:'見本 一郎',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'CP',role:'社員',lastSync:'2026-10-29 08:00'}];
   const row=(no,prop,o)=>Object.assign({'受付番号':no,'種類':'リノベーション','段階':'受付','物件':prop,'部屋':'1','担当':'見本','段階キー':'new','会社':'CP'},o);
   LM.ui.corp={at:Date.now(),data:[{s:d.staff[0],ok:true,rc:[],orders:[],todo:[],cases:[
    row('U-0001','試験荘未来',{'受付日':'2026-10-26','予定日':'2026-11-11','最終の動き':'2026-11-11'}),
    row('U-0002','試験荘実施',{'受付日':'2026-10-20','実施日':'2026-10-28','段階キー':'site','段階':'現地確認済','最終の動き':'2026-10-28'}),
    row('U-0003','試験荘予定のみ',{'受付日':'','予定日':'2026-11-20','最終の動き':'2026-11-20'})]}]};
   LM.roBuild(LM.ui.corp.data);LM.go('company')});
  const cards=await p.$$eval('.panel:has(h3:text-matches("動いている案件")) .card',a=>a.map(x=>({t:x.querySelector('.ttl').textContent.trim(),n:(x.querySelector(':scope > .note')||{}).textContent||''})));
  assert.deepEqual(cards.map(x=>x.t.split(' ')[0]),['試験荘実施','試験荘未来','試験荘予定のみ']);
  assert.ok(cards[0].n.includes('最終の動き 10/28'),JSON.stringify(cards));
  assert.ok(cards[1].n.includes('最終の動き 10/26')&&!cards[1].n.includes('11/11'),JSON.stringify(cards));
  assert.equal(cards[2].n,'');
  const o=await p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card')].map(x=>x.scrollWidth-x.clientWidth))});
  assert.ok(o<=0,'overflow '+o);
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
