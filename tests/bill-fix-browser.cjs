/* v1.50.96 請求額を直す（追加工事・値引きなど）。Synthetic only (fictional names, U-9xxx numbers); no Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.BF={get db(){return DB},get ui(){return ui},go,save,render,dataRows,CASE_DEFAULTS};';
let server,browser,origin;const results=[];
const check=async(n,fn)=>{await fn();results.push(n);console.log('PASS',n)};
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-16T03:00:00Z')});
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.BF);
 await p.evaluate(()=>{const d=BF.db.settings.data;d.ob={legacy:true};
  const mk=(id,stage,amt,pays)=>Object.assign(BF.CASE_DEFAULTS(),{id,type:'reno',stage,client:'見本管理',property:'見本ハイツ',room:'101',tantou:'見本',receivedAt:'2026-10-01T00:00:00.000Z',orderDate:'2026-10-05',builtDate:'2026-10-20',billDate:'2026-10-31',billAmount:amt,billTo:'見本管理',payDue:'2026-11-30',payments:pays,paidDate:stage==='paid'?pays[pays.length-1].date:'',payLog:[]});
  BF.db.cases.push(mk('U-9001','billed',100000,[]),mk('U-9002','billed',100000,[{date:'2026-11-10',amount:60000,by:'担当確認'}]),mk('U-9003','paid',100000,[{date:'2026-11-10',amount:100000,by:'経理連絡'}]));
  BF.save();BF.go('detail',{caseId:'U-9001'})});
 const fix=async(amt,why,dates)=>{await p.$eval('details.billfix',d=>d.open=true);await p.fill('#d_fixamt',String(amt));await p.fill('#d_fixwhy',why);if(dates){if(dates.b)await p.fill('#d_fixbdate',dates.b);if(dates.d)await p.fill('#d_fixpdue',dates.d)}await p.click('[data-act="billfix"]')};
 const cs=id=>p.evaluate(id=>JSON.parse(JSON.stringify(BF.db.cases.find(c=>c.id===id))),id);
 await check('入金待ちの案件：理由がないと直さない。直すと請求額・入金予定日が変わり、「入金についてのやり取り」に前の金額・日付・理由が残る。入金待ちのまま',async()=>{
  await fix(120000,'');assert.equal((await cs('U-9001')).billAmount,100000,'no reason, no change');
  await fix(120000,'追加工事',{d:'2026-12-31'});
  const x=await cs('U-9001');assert.equal(x.billAmount,120000);assert.equal(x.payDue,'2026-12-31');assert.equal(x.stage,'billed');
  assert.deepEqual(x.payLog.map(l=>[l.kind,l.at,l.from,l.to,l.reason]),[['billFix','2026-11-16',100000,120000,'追加工事']]);
  const t=await p.textContent('main');assert.match(t,/請求額を変更 ￥?100,000円?→￥?120,000円?・入金予定日 11\/30→12\/31（追加工事）/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at 400px');
 });
 await check('一部入金の案件：入金済みの合計に届く金額に下げると「入金済み（完了）」になる',async()=>{
  await p.evaluate(()=>BF.go('detail',{caseId:'U-9002'}));await fix(60000,'値引き');
  const x=await cs('U-9002');assert.equal(x.stage,'paid');assert.equal(x.paidDate,'2026-11-10');assert.equal(x.billAmount,60000);
 });
 await check('入金済み（完了）の案件：上げると残りがあるので「入金待ち」に戻る。下げても完了のままで、多く入金された分を出す',async()=>{
  await p.evaluate(()=>BF.go('detail',{caseId:'U-9003'}));await fix(130000,'追加工事');
  let x=await cs('U-9003');assert.equal(x.stage,'billed');assert.equal(x.paidDate,'');
  await fix(90000,'値引き');x=await cs('U-9003');assert.equal(x.stage,'paid');assert.equal(x.paidDate,'2026-11-10');
  assert.match(await p.textContent('main'),/請求額より ￥?10,000円? 多く入金されています/);
  assert.equal(x.payLog.length,2);
 });
 await check('記録シートの「案件」に新しい請求額、「入金」に「請求額を変更」の行が出る（区分は「100,000円→120,000円・…（理由）」の形）',async()=>{
  const d=await p.evaluate(()=>BF.dataRows());
  const cols=d.cases[0],row=d.cases.find(r=>r[0]==='U-9001');assert.equal(row[cols.indexOf('請求額')],120000);
  const pr=d.pay.filter(r=>r[0]==='U-9001'&&r[5]==='請求額を変更');assert.equal(pr.length,1);assert.equal(pr[0][6],120000);assert.match(String(pr[0][7]),/100,000円→.*120,000円・入金予定日 11\/30→12\/31（追加工事）$/);
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
