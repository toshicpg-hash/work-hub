/* Synthetic fixtures only (fictional IDs and numbers). Google requests are answered by an in-memory fake; no live accounts or network writes.
   v1.50.159 確定前の月の担当ごとの「最後に見直した日」。3日以内に見直していない担当がいる会社は、確定前の確認を押せない */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.PC={get db(){return DB},get ui(){return ui},G,go,render,save,salesLoad,salesChkReflect,salesViewRows,salesViewParse,salesViewUse,pchkMonth,rvPeople,salesPchkPress,salesReview,DSCOPE,GSCOPE};';
const SALES='salesfixture00000000000002';
const CO=['会社','目標売上','目標粗利','実績売上','実績粗利','前月売上','前月粗利','最終粗利予想','人件費','Notes未入力','社長確認日','本部長確認日','GM確認日','GMの名前','更新日'];
const coRows=()=>[CO,['CP',100,50,80,40,0,0,'','','','','','','見本GM','11/20'],['AT',100,50,30,10,0,0,'','','','','','','見本GM2','11/20'],['CPY',100,50,70,30,0,0,'','','','','','','見本GM3','11/20']];
const st=k=>[['会社','区分','担当','状態','物件数','基準値','金額','粗利']].concat(k==='2026-10'?[['CP','見本部','見本A','完了',1,'',1000,500],['CP','見本部','見本A','施工中',2,'',2000,''],['CP','見本部','見本B','完了',0,'',0,0],['CP','見本部','見本B','施工中',1,'',3000,''],['CP','','営業外売上（見本）','その他',1,'',100,100]]:[]);
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const F={};for(const k of ['2026-09','2026-10','2026-11']){F[k+' 会社']=coRows();F[k+' 担当']=st(k);F[k+' 受注']=[['会社','日','受注件数','受注金額']];F[k+' 確認']=[['会社','日','社長','本部長','GM']]}
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

 const open=async()=>{await p.evaluate(()=>{PC.ui.salesMonth='2026-10';PC.ui.salesMonthPicked=true;PC.ui.salesCoOpen={CP:true};PC.go('stats')});await p.evaluate(()=>{document.querySelectorAll('details[data-fold="sales"]').forEach(d=>d.open=true);document.querySelectorAll('details.sales-card,details.sales-staff').forEach(d=>d.open=true)})};
 const card='details.sales-card[data-sales-co="CP"]';
 await check('見直しがないと、確定前の確認（社長）は押せず、理由（どの担当が見直していないか）を出す。担当者別に「最終見直し なし」（400px）',async()=>{
  await p.evaluate(async()=>{await PC.salesLoad()});await open();
  const b=p.locator(card+' .sales-pchk [data-act=salespchk][data-k=boss]');assert.equal(await b.count(),1);assert.equal(await b.isDisabled(),true);
  assert.match(await p.textContent(card+' .sales-rv-why'),/3日以内に見直していない担当がいます（見本A：見直しなし・見本B：見直しなし）/);
  const tbl=await p.textContent(card+' .sales-st');assert.match(tbl,/見本A最終見直し なし/);assert.doesNotMatch(tbl,/営業外売上（見本）最終見直し/,'その他 row has no review');
  assert.equal(await p.locator(card+' .sales-rv.stale').count(),2);
  const err=await p.evaluate(async()=>{try{await PC.salesPchkPress('2026-10','CP','boss');return ''}catch(e){return e.message}});assert.match(err,/見直していない担当があるので、確認は押せません/);
  assert.equal(F['確定前の確認'],undefined,'nothing written');
  /* 11月（今月）・9月（確定済み）には出さない */
  assert.deepEqual(await p.evaluate(()=>{const S=PC.ui.sales;return S.months.filter(m=>m.key!=='2026-10').map(m=>PC.pchkMonth(m.key))}),[false,false]);
  const ov=await p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section')].map(x=>x.scrollWidth-x.clientWidth))});assert.ok(ov<=0,'overflow '+ov);
  await p.locator(card+' .sales-pchk').screenshot({path:path.join(require('node:os').tmpdir(),'sales-review-400.png')});
 });
 await check('「見直した（変わりなし）」で、その担当の完了・施工中の行に今日の日付を残す（タブを作る・数字は変えない）。全員そろうと押せる',async()=>{
  const before=JSON.stringify(F['2026-10 担当']);
  await p.click(card+' [data-act=salesrv][data-name="見本A"]');await p.waitForFunction(()=>!PC.ui.salesBusy);
  assert.equal(await p.evaluate(()=>PC.ui.salesMsg&&PC.ui.salesMsg.ok),true,await p.evaluate(()=>JSON.stringify(PC.ui.salesMsg)));
  assert.deepEqual(F['担当の見直し'].map(r=>r.slice(0,6)),[['月','会社','担当','状態','見直した日','見直した人'],['2026-10','CP','見本A','完了','2026-11-24','社長'],['2026-10','CP','見本A','施工中','2026-11-24','社長']]);
  assert.equal(JSON.stringify(F['2026-10 担当']),before,'numbers untouched');
  await open();assert.equal(await p.locator(card+' .sales-pchk [data-act=salespchk][data-k=boss]').isDisabled(),true,'見本B still not reviewed');
  assert.match(await p.textContent(card+' .sales-rv-why'),/見本B：見直しなし/);assert.doesNotMatch(await p.textContent(card+' .sales-rv-why'),/見本A/);
  assert.match(await p.textContent(card+' .sales-st'),/見本A最終見直し 11\/24（今日）/);
  await p.click(card+' [data-act=salesrv][data-name="見本B"]');await p.waitForFunction(()=>!PC.ui.salesBusy);await open();
  assert.equal(await p.locator(card+' .sales-rv-why').count(),0);
  await p.click(card+' .sales-pchk [data-act=salespchk][data-k=boss]');await p.waitForFunction(()=>!PC.ui.salesBusy);
  assert.equal(await p.evaluate(()=>PC.ui.salesMsg&&PC.ui.salesMsg.ok),true);assert.deepEqual(F['確定前の確認'][1],['2026-10','CP','2026-11-24',true,false,false]);
 });
 await check('3日前までは押せる、4日前になると押せない（日付が進んだとき）',async()=>{
  const st=async day=>{await p.evaluate(day=>{PC.ui.sales.rv=PC.ui.sales.rv.map(x=>({...x,date:day}))},day);return p.evaluate(()=>{const S=PC.ui.sales,M=S.months.find(m=>m.key==='2026-10');return PC.rvPeople(S,M,'CP').map(x=>[x.name,x.ago,x.stale])})};
  assert.deepEqual(await st('2026-11-21'),[['見本A',3,false],['見本B',3,false]]);
  assert.deepEqual(await st('2026-11-20'),[['見本A',4,true],['見本B',4,true]]);
  await p.evaluate(async()=>{await PC.salesLoad()});
 });
 await check('GM・本部長の端末（売上報告を開けない）：記録シートの「売上の確認」に rv の行を書き、社長の同期で「担当の見直し」に入る。できない人のものは入れない',async()=>{
  await p.evaluate(()=>{const d=PC.db.settings.data;d.staff=[{name:'見本 本部',sheetId:'sheetHQ',role:'全社',company:'CP,CPY,AT',gmCo:'CP',removed:false},{name:'見本 社員',sheetId:'sheetST',role:'社員',company:'CP',gmCo:'',removed:false}];
   PC.ui.corp={data:[{ok:true,s:{sheetId:'sheetHQ'},salesChk:[{月:'2026-10',会社:'CP',日:'見本B',役割:'rv',押した日時:'2026-11-24T02:00:00Z',名前:'見本 本部'}]},{ok:true,s:{sheetId:'sheetST'},salesChk:[{月:'2026-10',会社:'CP',日:'見本A',役割:'rv',押した日時:'2026-11-24T02:00:00Z',名前:'見本 社員'}]}]}});
  const n0=F['担当の見直し'].length;await p.evaluate(()=>PC.salesChkReflect());
  const added=F['担当の見直し'].slice(n0).map(r=>r.slice(0,6));
  assert.deepEqual(added,[],'same day as already reviewed rows (by 社長) is not duplicated');
  await p.evaluate(()=>{PC.ui.corp.data[0].salesChk[0].押した日時='2026-11-24T23:00:00Z'});/* 11/25 JST */
  await p.clock.setFixedTime(new Date('2026-11-25T03:00:00Z'));await p.evaluate(async()=>{PC.G.exp=Date.now()+3600e3;await PC.salesLoad();await PC.salesChkReflect()});
  assert.deepEqual(F['担当の見直し'].slice(n0).map(r=>r.slice(0,6)),[['2026-10','CP','見本B','完了','2026-11-25','見本 本部'],['2026-10','CP','見本B','施工中','2026-11-25','見本 本部']],'only the 本部長 row; the 社員 row is ignored');
 });
 await check('見る人の端末：書き出しに「担当の見直し」が入り、見直しの日と押せない理由が同じように出る',async()=>{
  const raw=await p.evaluate(()=>PC.ui.salesRaw),rows=await p.evaluate(raw=>PC.salesViewRows(raw,'2026-11-25T03:00:00Z'),raw);
  assert.ok(rows.some(r=>r[0]==='担当の見直し'));const back=await p.evaluate(rows=>PC.salesViewParse(rows),rows);assert.equal(back.rv.length,F['担当の見直し'].length);
 });
 await check('担当の数字を直したときも、直した行に今日の見直しの日を残す',async()=>{
  await open();await p.evaluate(()=>{PC.ui.salesEdOpen=true;PC.render()});await p.evaluate(()=>{document.querySelectorAll('details').forEach(d=>{if(d.closest('#stats-sales'))d.open=true})});
  await p.click('[data-sales-edco="CP"]');await p.click('[data-sales-edkind="st"]');
  const n0=F['担当の見直し'].length;await p.fill('#se_st_1_amt','2,500');await p.click('[data-act=salessave]');await p.waitForFunction(()=>!PC.ui.salesBusy);
  assert.equal(await p.evaluate(()=>PC.ui.salesMsg&&PC.ui.salesMsg.ok),true,await p.evaluate(()=>JSON.stringify(PC.ui.salesMsg)));
  assert.equal(F['2026-10 担当'][2][6],2500,'number saved');
  assert.deepEqual(F['担当の見直し'].slice(n0).map(r=>r.slice(0,6)),[['2026-10','CP','見本A','施工中','2026-11-25','社長']],'only the edited row');
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
