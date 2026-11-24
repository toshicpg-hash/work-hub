/* Synthetic fixtures only (fictional IDs and numbers). Google requests are answered by an in-memory fake; no live accounts or network writes.
   v1.50.132 受注の入力シートの行を、社長の端末の同期で売上報告の「受注」に入れる。前に入れた数字を直す行は止めて、社長に「直す／直さない」を出す */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.OI={get db(){return DB},get ui(){return ui},G,go,render,save,salesLoad,ordInParse,ordInPlan,ordInReflect,ordInPending,ordInDecide,salesFrom,salesSet,DSCOPE,GSCOPE};';
const SALES='salesfixture00000000000001',IN_A='inputfixture0000000000000a',IN_B='inputfixture0000000000000b';
const HEAD=['入れた日','月','会社','日','受注件数','受注金額','メモ','反映（運営企画室）','反映日時','運営メモ'];
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
function fixture(){
 return {
  [SALES]:{'2026-11 会社':[['会社','目標売上'],['CP',0],['CPY',0],['AT',0]],'2026-11 担当':[['会社','区分','担当','状態','物件数','基準値','金額','粗利']],
   '2026-11 受注':[['会社','日','受注件数','受注金額'],['CP',17,7,700000],['CP',18,36,1800000],['CPY',17,2,200000],['AT',17,5,500000]],'2026-11 確認':[['会社','日','社長','本部長','GM']]},
  [IN_A]:{'毎日の受注':[HEAD,
   ['2026/11/19','2026-11','CP','17','7','700,000','','反映済み','2026/11/19 07:10'],
   ['2026/11/19','2026-11','CP','18','36','1,800,000','','反映済み','2026/11/19 07:10'],
   ['2026/11/20','2026-11','CP','18','35','1,800,000','直し'],
   ['2026/11/20','2026-11','CP','19','2','300,000'],
   ['2026/11/20','2026-11','CPY','19','1','25,000'],
   ['2026/11/21','2026-11','CPY','20','2','50,000'],
   ['2026/11/21','2026-11','CPY','20','3','60,000','直した'],
   ['2026/11/21','2026-11','AT','20','1','1,000'],
   ['2026/11/21','2026-11','CP','30','1','1,000'],
   ['2026/11/21','2026-11','CP','21','abc','1,000'],
   ['2026/11/21','2026-10','CP','5','1','1,000']]},
  [IN_B]:{'毎日の受注':[HEAD,['2026/11/18','2026-11','AT','17','5','500,000','','同じ','2026/11/19 07:10'],['2026/11/22','2026-11','AT','21','0','0']]},
 }}
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const F=fixture(),calls=[];
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.addInitScript(()=>{if(!localStorage.getItem('seed')){localStorage.setItem('seed','1');localStorage.removeItem('workhub_ordin_v1')}});
 await c.route('**/*',async r=>{
  const u=r.request().url(),m=r.request().method();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  const J=(o,st=200)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)});
  const U=new URL(u),p=decodeURIComponent(U.pathname),mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
  if(!mm)return J({});const f=F[mm[1]],rest=mm[2];calls.push([m,mm[1],rest,U.search]);if(!f)return J({},404);
  if(m==='GET'&&!rest)return J({properties:{title:'見本'},sheets:Object.keys(f).map((t,i)=>({properties:{title:t,sheetId:i}}))});
  if(rest==='/values:batchGet'){const fmt=U.searchParams.get('valueRenderOption')==='FORMATTED_VALUE';return J({valueRanges:U.searchParams.getAll('ranges').map(x=>({values:(f[tabName(x)]||[]).map(row=>row.map(v=>fmt&&typeof v==='number'?v.toLocaleString('en-US'):v))}))})}
  if(rest==='/values:batchUpdate'&&m==='POST'){for(const d of r.request().postDataJSON().data){const q=d.range.match(/^'(.+)'!([A-Z])(\d+)(?::([A-Z])\d+)?$/),t=f[q[1]],row=Number(q[3])-1,c0=q[2].charCodeAt(0)-65;while(t.length<=row)t.push([]);d.values[0].forEach((v,j)=>{t[row][c0+j]=v})}return J({})}
  const ap=rest.match(/^\/values\/(.+):append$/);if(ap&&m==='POST'){f[tabName(ap[1])].push(...r.request().postDataJSON().values);return J({})}
  return J({});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-23T10:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.OI);
 await p.evaluate(({SALES,IN_A,IN_B})=>{const d=OI.db.settings.data;d.admin=true;d.salesId=SALES;OI.G.token='t';OI.G.exp=Date.now()+3600e3;OI.G.scope=OI.DSCOPE+' '+OI.GSCOPE;
  d.ordInputs=OI.ordInParse('伊藤｜https://docs.google.com/spreadsheets/d/'+IN_A+'/edit｜CP,CPY\n橋本｜'+IN_B+'｜AT');OI.save()},{SALES,IN_A,IN_B});
 await check('設定の読み方（名前｜IDかURL｜会社）',async()=>{
  const a=await p.evaluate(()=>OI.ordInParse('伊藤｜aaaaaaaaaaaaaaaaaaaaaaaa｜CP、CPY\n\nbbbbbbbbbbbbbbbbbbbbbbbb\nだめ｜短い'));
  assert.deepEqual(a,[{name:'伊藤',id:'aaaaaaaaaaaaaaaaaaaaaaaa',cos:['CP','CPY']},{name:'',id:'bbbbbbbbbbbbbbbbbbbbbbbb',cos:['CP','CPY','AT']}]);
 });
 await check('同期：まだ無い日は入れて「反映済み」、同じは「同じ」、直す行は「確認待ち」、形がおかしい行は「見送り」',async()=>{
  const r=await p.evaluate(async()=>{await OI.salesLoad();return OI.ordInReflect()});
  assert.equal(r.wrote,4,'CP19・CPY19・CPY20（下の行）・AT21');assert.match(r.msg,/前の数字を直す行が1件/);assert.match(r.msg,/2026-10のタブがない/);
 }).catch(async e=>{/* show state on failure */console.log(JSON.stringify(F[IN_A]['毎日の受注'].slice(1),null,0));throw e});
 const A=F[IN_A]['毎日の受注'],B=F[IN_B]['毎日の受注'],S=F[SALES]['2026-11 受注'];
 await check('入力シートの印と売上報告の行',async()=>{
  const mk=i=>[A[i][7],A[i][9]||''];
  assert.equal(mk(3)[0],'確認待ち');assert.match(mk(3)[1],/36件・1,800,000円/);
  assert.deepEqual([A[4][7],A[5][7]],['反映済み','反映済み']);assert.match(A[4][8],/^2026\/11\/23 19:00$/);
  assert.equal(A[6][7],'見送り');assert.match(A[6][9],/下の行（8行目）/);assert.equal(A[7][7],'反映済み');
  assert.match(A[8][9],/会社「AT」/);assert.match(A[9][9],/先の日付/);assert.match(A[10][9],/受注件数/);
  assert.equal(A[11][7]||'','','10月のタブがないので待つ（印なし）');
  assert.equal(B[2][7],'反映済み');
  assert.deepEqual(S.slice(5),[['CP',19,2,300000],['CPY',19,1,25000],['CPY',20,3,60000],['AT',21,0,0]]);
  assert.deepEqual(S[2],['CP',18,36,1800000],'直す行は書かない');
 }).catch(e=>{console.log(JSON.stringify({A:A.slice(1),S}));throw e});
 await check('2回目の同期では何も書かない（確認待ちは残る）',async()=>{
  const n=calls.length;const r=await p.evaluate(async()=>{await OI.salesLoad();return OI.ordInReflect()});assert.equal(r.wrote,0);
  assert.equal(calls.slice(n).filter(x=>x[0]==='POST').length,0,'no writes');assert.equal(await p.evaluate(()=>OI.ordInPending().length),1);
 });
 await check('売上報告の画面に「直す／直さない」（400px・はみ出しなし）→ 直す',async()=>{
  await p.evaluate(()=>{OI.go('home')});await p.waitForSelector('#home-orders .ord-wait');assert.match(await p.textContent('#home-orders .ord-wait'),/直し 1件/);await p.click('#home-orders');await p.waitForSelector('.ordin',{state:'visible'});
  assert.match(await p.textContent('.ordin'),/CP 11\/18.*36件 → 35件/s);
  const ov=await p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section')].map(x=>x.scrollWidth-x.clientWidth))});assert.ok(ov<=0,'overflow '+ov);
  await p.screenshot({path:path.join(require('node:os').tmpdir(),'ordin-400.png'),fullPage:false});
  await p.click('[data-act=ordinfix]');await p.waitForFunction(()=>OI.ui.ordInMsg&&!OI.ui.ordInBusy);
  assert.equal(await p.evaluate(()=>OI.ui.ordInMsg.ok),true,await p.evaluate(()=>OI.ui.ordInMsg.text));
  assert.deepEqual(S[2],['CP',18,35,1800000]);assert.equal(A[3][7],'反映済み');assert.match(A[3][9],/社長の確認で直しました（前は 36件・1,800,000円）/);
  assert.equal(await p.locator('.ordin').count(),0);
  /* v1.50.141 直し終わって枠が消えても、結果のお知らせは出る */
  assert.match(await p.textContent('.ordin-done'),/✓ 売上報告を直して、入力シートに「反映済み」を付けました/);
 });
 await check('直さない：見送りにして売上報告は変えない',async()=>{
  A.push(['2026/11/22','2026-11','CP','17','8','700,000']);await p.evaluate(async()=>{await OI.salesLoad();await OI.ordInReflect();OI.render()});
  assert.equal(A.at(-1)[7],'確認待ち');await p.click('[data-act=ordinskip]');await p.waitForFunction(()=>OI.ui.ordInMsg&&!OI.ui.ordInBusy);
  assert.equal(A.at(-1)[7],'見送り');assert.match(A.at(-1)[9],/直さないことにしました/);assert.deepEqual(S[1],['CP',17,7,700000]);
 });
 await check('入力シートの行が変わっていたら直さない',async()=>{
  A.push(['2026/11/22','2026-11','CPY','17','9','1']);await p.evaluate(async()=>{await OI.salesLoad();await OI.ordInReflect()});A.at(-1)[4]='10';
  const t=await p.evaluate(()=>OI.ordInDecide(0,true).then(()=>'ok',e=>e.message));assert.match(t,/入力シートの行が変わっています/);assert.deepEqual(S[3],['CPY',17,2,200000]);
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
