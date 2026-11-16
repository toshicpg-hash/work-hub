/* v1.50.101 同じ人・同じ件名・同じ時間の予定は1つだけ出す。Synthetic only (fictional names, example.com); no Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CD={byDay:gcalByDay,noMap:noMapPlace,setup(){DB.settings.gShow=null}};';
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
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CD);
 await check('同じ人の同じ予定（自分のカレンダーと共有カレンダー・同じカレンダーに2回）は1つ。別の人・別の時間・人の分からない別のカレンダーの予定はまとめない',async()=>{
  const by=await p.evaluate(()=>{CD.setup();const own='own@example.com',hub='hub@group.calendar.google.com',other='other@example.com';
   return CD.byDay({events:[
    {calendarId:own,calendar:'own',person:'S1',title:'見本自動車（車検）',start:'2026-11-19T10:00:00+09:00',end:'2026-11-19T11:00:00+09:00',location:''},
    {calendarId:hub,calendar:'CPG HUB',person:'S1',title:'見本自動車（車検）',start:'2026-11-19T10:00:00+09:00',end:'2026-11-19T11:00:00+09:00',location:'見本市1-1'},
    {calendarId:hub,calendar:'CPG HUB',person:'S1',title:'公休',allDay:true,start:'2026-11-17',end:'2026-11-18'},
    {calendarId:hub,calendar:'CPG HUB',person:'S1',title:'公休 ',allDay:true,start:'2026-11-17',end:'2026-11-18'},
    {calendarId:hub,calendar:'CPG HUB',person:'S2',title:'公休',allDay:true,start:'2026-11-17',end:'2026-11-18'},
    {calendarId:hub,calendar:'CPG HUB',person:'S1',title:'見本自動車（車検）',start:'2026-11-19T13:00:00+09:00',end:'2026-11-19T14:00:00+09:00'},
    {calendarId:own,calendar:'own',title:'打合せ',start:'2026-11-18T09:00:00+09:00',end:'2026-11-18T10:00:00+09:00'},
    {calendarId:other,calendar:'other',title:'打合せ',start:'2026-11-18T09:00:00+09:00',end:'2026-11-18T10:00:00+09:00'},
    {calendarId:hub,boss:true,calendar:'CPG HUB',title:'来社 見本銀行',start:'2026-11-18T13:00:00+09:00',end:'2026-11-18T14:00:00+09:00'},
    {calendarId:own,boss:true,calendar:'own',title:'来社 見本銀行',start:'2026-11-18T13:00:00+09:00',end:'2026-11-18T14:00:00+09:00'}]})});
  const d19=by['2026-11-19'].map(x=>[x.person,x.title,x.time,x.loc]);
  assert.deepEqual(d19,[['S1','見本自動車（車検）','10:00〜11:00','見本市1-1'],['S1','見本自動車（車検）','13:00〜14:00','']],'same person+title+time once (place kept); another time stays');
  assert.deepEqual(by['2026-11-17'].map(x=>[x.person,x.title]),[['S1','公休'],['S2','公休']],'double entry in one calendar once; another person stays');
  const d18=by['2026-11-18'].map(x=>[x.calId,x.title,x.boss]);
  assert.equal(d18.filter(x=>x[1]==='打合せ').length,2,'owner unknown: different calendars are not merged');
  assert.equal(d18.filter(x=>x[2]).length,1,'the boss event in two calendars once');
 });
 await check('v1.50.102 人のカレンダー（予定ごとの人は空、カレンダーの持ち主がその人）の予定も、「CPG HUB」の同じ予定とまとめる。持ち主の分からないカレンダーはまとめない',async()=>{
  const by=await p.evaluate(()=>{const own='own@example.com',hub='hub@group.calendar.google.com',x='x@example.com';
   return CD.byDay({events:[
    {calendarId:own,calendar:'own',title:'見本自動車（車検）',start:'2026-11-19T10:00:00+09:00',end:'2026-11-19T11:00:00+09:00',location:'見本市1-1'},
    {calendarId:hub,calendar:'CPG HUB',person:'S1',title:'見本自動車（車検）',start:'2026-11-19T10:00:00+09:00',end:'2026-11-19T11:00:00+09:00'},
    {calendarId:x,calendar:'x',title:'見本自動車（車検）',start:'2026-11-19T10:00:00+09:00',end:'2026-11-19T11:00:00+09:00'}]},e=>e.calId==='own@example.com'?'S1':'')});
  const d=by['2026-11-19'];assert.equal(d.length,2,JSON.stringify(d));assert.ok(d.some(e=>e.calId==='x@example.com'),'unknown-owner calendar stays');assert.ok(d.some(e=>e.loc==='見本市1-1'),'place kept');
 });
 await check('v1.50.103 「自宅」「職場」などは地図を出さない（Googleマップでは地図を開いた人の登録先が出るため）。住所・建物名は今までどおり出す',async()=>{
  const r=await p.evaluate(()=>['自宅',' 自宅 ','ｼﾞﾀｸ','家','職場','会社','Home','見本市中央1-2-3','見本ハイツ 101','自宅近くの見本公園'].map(x=>[x,CD.noMap(x)]));
  assert.deepEqual(r.filter(x=>x[1]).map(x=>x[0]),['自宅',' 自宅 ','家','職場','会社','Home']);
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
