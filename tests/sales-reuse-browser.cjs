/* Synthetic fixtures only (fictional IDs and numbers). Google requests are answered by an in-memory fake; no live accounts or network writes.
   v1.50.148 社長の同期の売上報告：ドライブの更新日時が前に読んだときと同じなら、端末に残した前の中身を使い、表計算を読まない */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.SL={get db(){return DB},get ui(){return ui},G,save,salesLoadSync,syncDetailText,setDiag(v){syncDiag=v},getDiag(){return syncDiag},DSCOPE,GSCOPE};';
const SALES='salesfixture00000000000009';
const CO=['会社','目標売上','目標粗利','実績売上','実績粗利','前月売上','前月粗利','最終粗利予想','人件費','Notes未入力','社長確認日','本部長確認日','GM確認日','GMの名前','更新日'];
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const F={'2026-11 会社':[CO,['CP',100,50,80,40,0,0,'','','','','','','見本GM','11/24']],'2026-11 担当':[['会社','区分','担当','状態','物件数','基準値','金額','粗利']],'2026-11 受注':[['会社','日','受注件数','受注金額'],['CP',1,2,300]],'2026-11 確認':[['会社','日','社長','本部長','GM']]};
 let modified='2026-11-25T00:00:00.000Z';const calls={batch:0,drive:0,list:0};
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{
  const u=r.request().url(),m=r.request().method();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  const J=(o,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
  const U=new URL(u),p=decodeURIComponent(U.pathname);
  if(p.startsWith('/drive/v3/files/')){calls.drive++;return J(modified?{modifiedTime:modified,name:'見本'}:{name:'見本'})}
  const mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);if(!mm)return J({});const rest=mm[2];
  if(m==='GET'&&!rest){if(U.searchParams.get('fields')==='properties.title')return J({properties:{title:'見本'}});calls.list++;return J({sheets:Object.keys(F).map((t,i)=>({properties:{title:t,sheetId:i}}))})}
  if(rest==='/values:batchGet'){calls.batch++;return J({valueRanges:U.searchParams.getAll('ranges').map(x=>({values:structuredClone(F[tabName(x)]||[])}))})}
  return J({});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-25T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SL);
 await p.evaluate(SALES=>{const d=SL.db.settings.data;d.admin=true;d.salesId=SALES;SL.G.token='t';SL.G.exp=Date.now()+3600e3;SL.G.scope=SL.DSCOPE+' '+SL.GSCOPE;SL.save()},SALES);
 const run=()=>p.evaluate(async()=>{SL.setDiag({});await SL.salesLoadSync();const d=SL.getDiag();return {reuse:!!d.salesReuse,cos:SL.ui.sales.months.find(m=>m.key==='2026-11').cos.length,days:SL.ui.sales.months.find(m=>m.key==='2026-11').days.length}});
 await check('はじめは全部読み、中身を端末に残す',async()=>{
  const r=await run();assert.deepEqual(r,{reuse:false,cos:1,days:1});assert.equal(calls.batch,1);
  assert.ok(await p.evaluate(()=>!!localStorage.getItem('workhub_salesraw_v1')));
 });
 await check('更新日時が同じなら、表計算を読まずに前の中身を使う（ドライブを1回見るだけ）',async()=>{
  const b=calls.batch,l=calls.list,dr=calls.drive;const r=await run();assert.deepEqual(r,{reuse:true,cos:1,days:1});
  assert.equal(calls.batch,b,'no sheet read');assert.equal(calls.list,l,'no tab list');assert.equal(calls.drive,dr+1,'one drive look');
 });
 await check('アプリを開き直しても、残した中身を使う',async()=>{
  await p.reload();await p.waitForFunction(()=>!!window.SL);await p.evaluate(()=>{SL.G.token='t';SL.G.exp=Date.now()+3600e3;SL.G.scope=SL.DSCOPE+' '+SL.GSCOPE});
  const b=calls.batch;const r=await run();assert.equal(r.reuse,true);assert.equal(calls.batch,b);
 });
 await check('更新日時が変わったら読み直す（新しい行が入る）',async()=>{
  F['2026-11 受注'].push(['CP',2,1,100]);modified='2026-11-25T02:00:00.000Z';const b=calls.batch;
  const r=await run();assert.deepEqual(r,{reuse:false,cos:1,days:2});assert.equal(calls.batch,b+1);
 });
 await check('更新日時が取れないときは、今までどおり全部読む',async()=>{
  modified='';const b=calls.batch;const r=await run();assert.equal(r.reuse,false);assert.equal(calls.batch,b+1);
 });
 await check('内訳に「変わっていないので読み直さず」を出す',async()=>{
  const t=await p.evaluate(()=>SL.syncDetailText({detail:{salesReuse:true,salesSteps:{load:300,ordin:1200,ord:100,chk:50,view:80,rest:20}}}));
  assert.match(t,/^売上報告：読み込み 0\.3秒（変わっていないので読み直さず）・受注の入力シート 1\.2秒・今月の受注の書き出し 0\.1秒・本部長・GMの確認 0\.1秒・見るだけの書き出し 0\.1秒・タブ・保護など 0\.0秒$/);
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
