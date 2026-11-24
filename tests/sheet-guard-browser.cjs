/* v1.50.99 売上報告のシート：「シートを開く」は社長の端末だけ。社長の同期のあと、保護のないタブに「警告だけの保護」を1日1回かける。
   Synthetic only; Google Sheets is mocked, nothing real is touched. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SG={get db(){return DB},get ui(){return ui},G,save,render,salesSec,sheetGuard,hubGuardAll,authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
let server,browser,origin;const results=[];
const check=async(n,fn)=>{await fn();results.push(n);console.log('PASS',n)};
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const posts=[];let gets=0;
 /* sheetId 0 は保護済み（Googleは sheetId 0 を range から省く）、1 は行だけの保護（タブ全体ではない）、2 は保護なし */
 let hubSheets=false;const hub=()=>({sheets:[{properties:{sheetId:0,title:'社員'}},{properties:{sheetId:1,title:'依頼元の候補'}},{properties:{sheetId:2,title:'共有管理履歴'}},{properties:{sheetId:3,title:'HUBの設定'}}]});
 const sheets=()=>({sheets:[{properties:{sheetId:0,title:'2026-12 会社'},protectedRanges:[{range:{},warningOnly:true}]},{properties:{sheetId:1,title:'2026-12 担当'},protectedRanges:[{range:{sheetId:1,startRowIndex:0,endRowIndex:1},warningOnly:true}]},{properties:{sheetId:2,title:'2026-12 受注'}}]});
 await c.route('**/*',async r=>{const u=new URL(r.request().url()),m=r.request().method();
  if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname==='sheets.googleapis.com'){if(m==='GET'){gets++;const id=u.pathname.split('/').pop();return r.fulfill({contentType:'application/json',body:JSON.stringify(hubSheets?(id.startsWith('synthetic-list')?hub():{sheets:[{properties:{sheetId:0,title:'一覧'}}]}):sheets())})}posts.push({path:u.pathname,body:r.request().postDataJSON()});return r.fulfill({contentType:'application/json',body:'{}'})}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SG);
 await check('社長の端末：保護のないタブ（タブ全体の保護がないもの）だけに警告だけの保護をかける。同じ日の2回目は問い合わせもしない',async()=>{
  const n=await p.evaluate(async()=>{SG.db.settings.data.admin=true;SG.db.settings.data.ob={legacy:true};SG.save();SG.authorize();return SG.sheetGuard('synthetic-sales-sheet-0000000001')});
  assert.equal(n,2);assert.equal(posts.length,1);
  const reqs=posts[0].body.requests.map(x=>x.addProtectedRange.protectedRange);
  assert.deepEqual(reqs.map(x=>x.range.sheetId).sort(),[1,2]);assert.ok(reqs.every(x=>x.warningOnly===true&&!x.editors),'warning only, no editor list (HUB writes keep working)');
  assert.equal(await p.evaluate(()=>SG.sheetGuard('synthetic-sales-sheet-0000000001')),0);assert.equal(gets,1,'once a day');assert.equal(posts.length,1);
 });
 await check('v1.50.131 社員一覧・見る人用一覧・会社の数字にも警告だけの保護。社員一覧の「依頼元の候補」「HUBの設定」は保護しない。1日1回',async()=>{
  hubSheets=true;posts.length=0;const g0=gets;
  const n=await p.evaluate(async()=>{const d=SG.db.settings.data;d.admin=true;d.listId='synthetic-list-0000000001';d.viewListId='synthetic-view-0000000001';d.numbers={CP:'synthetic-num-cp-0000001',AT:'synthetic-num-cp-0000001',CPY:'synthetic-num-cpy-000001'};SG.save();SG.authorize();return SG.hubGuardAll()});
  assert.equal(gets-g0,4,'4 distinct files (CP and AT share one in this fixture)');
  const byFile=Object.fromEntries(posts.map(x=>[x.path.split('/').pop().replace(':batchUpdate',''),x.body.requests.map(r=>r.addProtectedRange.protectedRange)]));
  const list=byFile['synthetic-list-0000000001'];assert.deepEqual(list.map(r=>r.range.sheetId).sort(),[0,2],'社員 and 共有管理履歴 only');
  assert.ok(list.every(r=>r.warningOnly===true&&!r.editors&&/手で書きかえないでください/.test(r.description)));
  assert.equal(n,list.length+3*1+0,'other files: one unprotected tab each');
  assert.equal(await p.evaluate(()=>SG.hubGuardAll()),0);assert.equal(gets-g0,4,'once a day');
  hubSheets=false;
 });
 await check('社員の端末では何もしない',async()=>{
  const g0=gets;assert.equal(await p.evaluate(async()=>{SG.db.settings.data.admin=false;SG.save();return SG.sheetGuard('synthetic-sales-sheet-0000000002')}),0);assert.equal(gets,g0);
 });
 await check('「シートを開く」は社長の端末だけに出る（入力できる人の端末には出さない）',async()=>{
  const staff=await p.evaluate(()=>{const d=SG.db.settings.data;d.admin=false;d.salesEditId='synthetic-sales-sheet-0000000001';SG.ui.sales=null;return SG.salesSec()});
  assert.doesNotMatch(staff,/シートを開く/);
  const admin=await p.evaluate(()=>{const d=SG.db.settings.data;d.admin=true;d.salesId='synthetic-sales-sheet-0000000001';SG.ui.sales=null;return SG.salesSec()});
  assert.match(admin,/シートを開く/);
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
