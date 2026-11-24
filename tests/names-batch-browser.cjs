/* Synthetic fixtures only (fictional IDs). Google requests are answered by an in-memory fake; no live accounts or network writes.
   v1.50.140 担当の候補など（担当の候補・会社の住所・HUBの設定・依頼元の候補）を全員の記録シートに配るとき、1人につきタブの一覧1回・中身1回だけ読む。失敗した人だけ次にやり直す */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.NB={get db(){return DB},get ui(){return ui},G,save,namesAfterSync,syncDetailText,setDiag(v){syncDiag=v},DSCOPE,GSCOPE};';
const IDS=['recfixture0000000000000a','recfixture0000000000000b','recfixture0000000000000c'];
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const F=Object.fromEntries(IDS.map(id=>[id,{'情報':[['項目','値']]}])),calls=[],fail=new Set([IDS[1]]);
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{
  const u=r.request().url(),m=r.request().method();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  const J=(o,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
  const U=new URL(u),p=decodeURIComponent(U.pathname),mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);if(!mm)return J({});const id=mm[1],rest=mm[2],f=F[id];
  calls.push([id,m,rest||U.search]);if(!f)return J({},404);
  if(fail.has(id)&&rest==='/values:batchGet')return J({error:{message:'denied'}},403);
  if(m==='GET'&&!rest)return J({sheets:Object.keys(f).map((t,i)=>({properties:{title:t,sheetId:i}}))});
  if(rest==='/values:batchGet')return J({valueRanges:U.searchParams.getAll('ranges').map(x=>({values:structuredClone(f[tabName(x)]||[])}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests)if(q.addSheet)f[q.addSheet.properties.title]=[];return J({replies:[{}]})}
  const vp=rest.match(/^\/values\/(.+?)(:clear)?$/);if(vp&&m==='PUT'){f[tabName(vp[1])]=structuredClone(r.request().postDataJSON().values).map(row=>{while(row.length&&row[row.length-1]==='')row.pop();return row}).filter(row=>row.length);return J({})}
  return J({});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-24T05:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.NB);
 await p.evaluate(IDS=>{const d=NB.db.settings.data;d.admin=true;NB.G.token='t';NB.G.exp=Date.now()+3600e3;NB.G.scope=NB.DSCOPE+' '+NB.GSCOPE;
  d.staff=IDS.map((id,i)=>({name:'見本 '+i,email:'s'+i+'@example.com',company:'CP',role:'社員',sheetId:id,removed:false}));
  d.officeAddrs=[{name:'本社',addr:'見本県見本市1'}];d.clientNames=[{co:'CP',name:'見本管理'}];d.clientWritten=true;NB.save()},IDS);
 await check('1人につき「タブの一覧」1回・中身1回だけ読む。失敗した人がいれば、配れた人を覚える',async()=>{
  await p.evaluate(()=>{NB.setDiag({});return NB.namesAfterSync()});
  for(const id of [IDS[0],IDS[2]]){const mine=calls.filter(x=>x[0]===id);
   assert.equal(mine.filter(x=>x[1]==='GET'&&!x[2].startsWith('/values')).length,1,'one tab-list read: '+id);
   assert.equal(mine.filter(x=>x[2]==='/values:batchGet').length,1,'one batch read: '+id);
   assert.deepEqual(F[id]['会社の住所'],[['名前','住所'],['本社','見本県見本市1']]);assert.ok(F[id]['担当の候補']);assert.ok(F[id]['依頼元の候補'])}
  const d=await p.evaluate(()=>({w:NB.db.settings.data.namesWritten,done:NB.db.settings.data.namesDone}));
  assert.equal(d.w,undefined,'not finished while someone failed');assert.deepEqual([...d.done.ids].sort(),[IDS[0],IDS[2]].sort());
  const t=await p.evaluate(()=>NB.syncDetailText({detail:{names:{n:3,wrote:2,same:0,skip:0,bad:1,retry:0}}}));assert.match(t,/担当の候補など：3人・書いた 2人・同じ 0人・前に済み 0人・できなかった 1人（次の同期でその人だけ）/);
 });
 await check('次の同期では、失敗した人だけ読む。全員済んだら「配った」と覚え、その次は何も読まない',async()=>{
  fail.clear();const n=calls.length;
  await p.evaluate(()=>NB.namesAfterSync());
  assert.deepEqual([...new Set(calls.slice(n).map(x=>x[0]))],[IDS[1]],'only the failed person');
  const d=await p.evaluate(()=>({w:!!NB.db.settings.data.namesWritten,done:NB.db.settings.data.namesDone}));assert.deepEqual(d,{w:true,done:undefined});
  const n2=calls.length;await p.evaluate(()=>NB.namesAfterSync());assert.equal(calls.length,n2,'nothing when unchanged');
 });
 await check('中身が同じ人には書かない（読むだけ）',async()=>{
  await p.evaluate(()=>{const d=NB.db.settings.data;d.namesWritten='';NB.save()});const n=calls.length;
  await p.evaluate(()=>NB.namesAfterSync());assert.equal(calls.slice(n).filter(x=>x[1]==='PUT').length,0,'no writes when the same');
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
