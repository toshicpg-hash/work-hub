/* Synthetic fixtures only (fictional IDs and numbers). Google requests are answered by an in-memory fake; no live accounts or network writes.
   v1.50.139 確定前の月（今なら10月）にも毎日の確認。社長はシートの「確定前の確認」タブに直接、本部長・GMは記録シート経由で社長の同期のときに入る */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.PC={get db(){return DB},get ui(){return ui},G,go,render,save,salesLoad,salesChkReflect,salesViewRows,salesViewParse,salesViewUse,pchkMonth,DSCOPE,GSCOPE};';
const SALES='salesfixture00000000000002';
const CO=['会社','目標売上','目標粗利','実績売上','実績粗利','前月売上','前月粗利','最終粗利予想','人件費','Notes未入力','社長確認日','本部長確認日','GM確認日','GMの名前','更新日'];
const coRows=()=>[CO,['CP',100,50,80,40,0,0,'','','','','','','見本GM','11/20'],['AT',100,50,30,10,0,0,'','','','','','','見本GM2','11/20'],['CPY',100,50,70,30,0,0,'','','','','','','見本GM3','11/20']];
const st=()=>[['会社','区分','担当','状態','物件数','基準値','金額','粗利']];
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const F={};for(const k of ['2026-09','2026-10','2026-11']){F[k+' 会社']=coRows();F[k+' 担当']=st();F[k+' 受注']=[['会社','日','受注件数','受注金額']];F[k+' 確認']=[['会社','日','社長','本部長','GM']]}
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{
  const u=r.request().url(),m=r.request().method();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  const J=(o,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
  const U=new URL(u),p=decodeURIComponent(U.pathname),mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);if(!mm)return J({});const rest=mm[2];
  if(m==='GET'&&!rest)return J({properties:{title:'見本'},sheets:Object.keys(F).map((t,i)=>({properties:{title:t,sheetId:i}}))});
  if(rest==='/values:batchGet')return J({valueRanges:U.searchParams.getAll('ranges').map(x=>({values:structuredClone(F[tabName(x)]||[])}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests)if(q.addSheet)F[q.addSheet.properties.title]=[];return J({replies:[{}]})}
  if(rest==='/values:batchUpdate'){for(const d of r.request().postDataJSON().data){const q=d.range.match(/^'(.+)'!([A-Z])(\d+)$/),t=F[q[1]],row=Number(q[3])-1,col=q[2].charCodeAt(0)-65;while(t.length<=row)t.push([]);t[row][col]=d.values[0][0]===true||d.values[0][0]==='TRUE'?true:d.values[0][0]}return J({})}
  const ap=rest.match(/^\/values\/(.+):append$/);if(ap){F[tabName(ap[1])].push(...r.request().postDataJSON().values);return J({})}
  const vp=rest.match(/^\/values\/(.+?)(:clear)?$/);if(vp){const t=tabName(vp[1]);if(vp[2]){F[t]=[];return J({})}if(m==='PUT'){F[t]=structuredClone(r.request().postDataJSON().values);return J({})}}
  return J({});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-24T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PC);
 await p.evaluate(SALES=>{const d=PC.db.settings.data;d.admin=true;d.salesId=SALES;PC.G.token='t';PC.G.exp=Date.now()+3600e3;PC.G.scope=PC.DSCOPE+' '+PC.GSCOPE;PC.save()},SALES);
 await check('確定前の月だけ（今月・確定した月は出さない）',async()=>{
  assert.deepEqual(await p.evaluate(()=>[PC.pchkMonth('2026-10'),PC.pchkMonth('2026-11'),PC.pchkMonth('2026-09'),PC.pchkMonth('2026-10','2026-12-16')]),[true,false,false,false]);
 });
 await check('社長：10月の会社の欄に「毎日の確認（確定前）」→押すとタブを作って今日の行（400px・はみ出しなし）',async()=>{
  await p.evaluate(async()=>{await PC.salesLoad();PC.ui.salesMonth='2026-10';PC.ui.salesMonthPicked=true;PC.go('stats')});
  await p.evaluate(()=>{const f=document.querySelector('details[data-fold="sales"]');if(f)f.open=true;document.querySelectorAll('details.sales-card').forEach(d=>d.open=true)});
  const box=p.locator('details.sales-card[data-sales-co="CP"] .sales-pchk');assert.equal(await box.count(),1);
  assert.match(await box.textContent(),/毎日の確認（確定前・今日 24日）社長 未本部長 未GM 未確定前の間（12\/15確定）：社長 0日・本部長 0日・GM 0日/);
  const ov=await p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section')].map(x=>x.scrollWidth-x.clientWidth))});assert.ok(ov<=0,'overflow '+ov);
  await box.screenshot({path:path.join(require('node:os').tmpdir(),'pchk-400.png')});
  await p.click('details.sales-card[data-sales-co="CP"] .sales-pchk [data-act=salespchk][data-k=boss]');await p.waitForFunction(()=>!PC.ui.salesBusy);
  assert.equal(await p.evaluate(()=>PC.ui.salesMsg&&PC.ui.salesMsg.ok),true,await p.evaluate(()=>JSON.stringify(PC.ui.salesMsg)));
  assert.deepEqual(F['確定前の確認'],[['月','会社','日付','社長','本部長','GM'],['2026-10','CP','2026-11-24',true,false,false]]);
  await p.evaluate(()=>{document.querySelectorAll('details.sales-card').forEach(d=>d.open=true)});
  assert.match(await p.textContent('details.sales-card[data-sales-co="CP"] .sales-pchk'),/社長 ✓ 済.*社長 1日/s);
  assert.equal(await p.locator('details.sales-card[data-sales-co="CP"] [data-act=salespchk][data-k=boss]').count(),0,'no button after pressing');
  /* 今月（11月）には出さない */
  await p.evaluate(()=>{PC.ui.salesMonth='2026-11';PC.render()});assert.equal(await p.locator('.sales-pchk').count(),0);
 });
 await check('本部長・GM：記録シートの「売上の確認」（hq_p・gm_p）を、社長の同期でタブに入れる。押した日が確定前でないもの・できない人のものは入れない',async()=>{
  await p.evaluate(()=>{const d=PC.db.settings.data;d.staff=[{name:'見本 本部',sheetId:'sheetHQ',role:'全社',company:'CP,CPY,AT',gmCo:'CP',removed:false},{name:'見本 社員',sheetId:'sheetST',role:'社員',company:'AT',gmCo:'',removed:false}];
   PC.ui.corp={data:[{ok:true,s:{sheetId:'sheetHQ'},salesChk:[{月:'2026-10',会社:'CP',日:'確定前',役割:'hq_p',押した日時:'2026-11-24T01:00:00Z'},{月:'2026-10',会社:'CP',日:'確定前',役割:'gm_p',押した日時:'2026-11-24T01:05:00Z'},{月:'2026-10',会社:'AT',日:'確定前',役割:'hq_p',押した日時:'2026-11-23T01:00:00Z'},{月:'2026-11',会社:'CP',日:'確定前',役割:'hq_p',押した日時:'2026-11-24T01:00:00Z'}]},
    {ok:true,s:{sheetId:'sheetST'},salesChk:[{月:'2026-10',会社:'AT',日:'確定前',役割:'gm_p',押した日時:'2026-11-24T01:00:00Z'}]}]}});
  const n=await p.evaluate(()=>PC.salesChkReflect());assert.equal(n,3,'CP row: hq and gm cells (2) and AT 11/23 row added (1)');
  const t=F['確定前の確認'];
  assert.deepEqual(t[1],['2026-10','CP','2026-11-24',true,true,true]);
  assert.deepEqual(t[2],['2026-10','AT','2026-11-23',false,true,false]);
  assert.equal(t.length,3,'nothing for the current month or a person who cannot check');
  assert.equal(await p.evaluate(()=>PC.salesChkReflect()),0,'second time writes nothing');
 });
 await check('見るだけの書き出しにも入る（本部長・GMの端末で今日押したかが出る）',async()=>{
  const r=await p.evaluate(()=>{const rows=PC.salesViewRows(PC.ui.salesRaw,new Date().toISOString());const back=PC.salesViewParse(rows);PC.salesViewUse(back);return {n:PC.ui.sales.pchk.length,view:PC.ui.sales.view}});
  assert.deepEqual(r,{n:2,view:true});
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
