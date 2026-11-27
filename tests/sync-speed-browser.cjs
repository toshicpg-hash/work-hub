/* v1.50.18 同期の速さ：社員の記録は3人ずつ同時に読む（並びは一覧の順）。あとから増えるタブがそろっている人は、タブの一覧を問い合わせない。
   自分の記録シートの同期は、タブの一覧の問い合わせを1回にし、案件・入金・立替・ToDo を同時に書き、「情報」を消さずに1回で書く。
   Synthetic fixtures only (fictional names, example.com). In-memory Google Sheets; no live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SP={tabsOld(){const a=corpTabsAtAll();for(const k of Object.keys(a))a[k]-=7*3600e3},get db(){return DB},get ui(){return ui},render,save,corpRun,dataSync,setup(){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};gAuthorize();adminSync=async()=>({});corpWait=async()=>{};backupPhotos=async()=>({done:0,fail:0})}};';
const ALL=['案件','入金','立替','情報','ToDo','指示','指示の報告','予定の共有の記録'];
const ids=[1,2,3,4,5,6,7].map(i=>'synthetic-speed-sheet-00000000'+i);
const staff=ids.map((id,i)=>({name:'見本 '+(i+1)+'郎',email:'s'+(i+1)+'@example.com',sheetId:id,company:'CP',role:'社員'}));
const CASE=['受付番号','物件'];
function seed(){const st={};ids.forEach((id,i)=>{st[id]={'案件':[CASE,['U-000'+(i+1),'見本荘'+(i+1)]],'入金':[],'立替':[],'情報':[['項目','値'],['最終同期','2026-11-07 09:00']]};
  if(i<4)for(const t of ['ToDo','指示','指示の報告','予定の共有の記録'])st[id][t]=[];});return st;}
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device(store,delay=0){
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const J=(r,o,st=200)=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 const tabOf=x=>{let t=decodeURIComponent(x).replace(/!.*$/,'');if(t.startsWith("'"))t=t.slice(1,-1).replace(/''/g,"'");return t};
 const log=[];let inflight=0,max=0;
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname!=='sheets.googleapis.com')return J(r,{});
  const m=decodeURIComponent(u.pathname).match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),id=m[1],rest=m[2],method=r.request().method();
  const sh=store[id];if(!sh)return J(r,{error:{code:404}},404);
  inflight++;max=Math.max(max,inflight);log.push({id,rest,method,at:Date.now()});
  try{if(delay)await new Promise(x=>setTimeout(x,delay));
  if(rest===''&&method==='GET')return J(r,{sheets:Object.keys(sh).map(title=>({properties:{title,sheetId:1,gridProperties:{rowCount:1000,columnCount:26}}}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests||[]){if(q.addSheet)sh[q.addSheet.properties.title]=[];if(q.updateCells)sh['案件']=q.updateCells.rows.map(x=>x.values.map(v=>v.userEnteredValue?Object.values(v.userEnteredValue)[0]:''))}return J(r,{})}
  if(rest==='/values:batchGet'){const rs=u.searchParams.getAll('ranges').map(tabOf);if(rs.some(t=>!(t in sh)))return J(r,{error:{code:400,message:'Unable to parse range'}},400);return J(r,{valueRanges:rs.map(t=>({values:sh[t]}))})}
  const v=rest.match(/^\/values\/([^:]+)(:clear)?$/);if(v){const t=tabOf(v[1]);if(v[2]){sh[t]=[];return J(r,{})}const vals=r.request().postDataJSON().values.map(x=>{const a=x.slice();while(a.length&&a[a.length-1]==='')a.pop();return a}).filter(x=>x.length);sh[t]=vals;return J(r,{})}
  return J(r,{});}finally{inflight--}
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SP);
 return {c,p,errors,log,get max(){return max},reset(){log.length=0;max=0}};
}
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const store=seed(),d=await device(store,150);
 await d.p.evaluate(staff=>{SP.setup();const x=SP.db.settings.data;x.admin=true;x.ob={legacy:true};x.listId='synthetic-list-0000000000001';x.staff=staff;SP.save()},staff);
 await check('社長：社員の記録は同時に5人まで読み（v1.50.31 で3→5）、結果は一覧の順のまま',async()=>{
  const data=await d.p.evaluate(async()=>(await SP.corpRun()).map(x=>[x.s.name,x.ok,x.cases.length]));
  assert.deepEqual(data,staff.map(s=>[s.name,true,1]));
  assert.ok(d.max>1,'reads overlap: '+d.max);assert.ok(d.max<=5,'at most 5 at once: '+d.max);
 });
 await check('2回目：あとから増えるタブがそろっている人は、タブの一覧を問い合わせない。そろっていない人は今までどおり問い合わせる',async()=>{
  d.reset();await d.p.evaluate(async()=>{await SP.corpRun()});
  const tabQ=id=>d.log.filter(x=>x.id===id&&x.rest===''&&x.method==='GET').length;
  for(const id of ids.slice(0,4))assert.equal(tabQ(id),0,id);
  /* v1.50.158 そろっていない人も、タブの一覧を問い合わせてから6時間は問い合わせない */
  for(const id of ids.slice(4))assert.equal(tabQ(id),0,id);
  assert.equal(await d.p.evaluate(()=>!!localStorage.getItem('workhub_corp_tabs_v1')&&!/見本荘/.test(localStorage.getItem('workhub_corp_tabs_v1'))),true,'only tab names are kept');
 });
 await check('v1.50.158 6時間たったら、そろっていない人だけタブの一覧を問い合わせ直す',async()=>{
  await d.p.evaluate(()=>SP.tabsOld());
  d.reset();await d.p.evaluate(async()=>{await SP.corpRun()});
  const tabQ=id=>d.log.filter(x=>x.id===id&&x.rest===''&&x.method==='GET').length;
  for(const id of ids.slice(0,4))assert.equal(tabQ(id),0,id);
  for(const id of ids.slice(4))assert.equal(tabQ(id),1,id);
 });
 await check('v1.50.158 「情報」の「タブ」の行に、まだ読んでいないタブがあれば、そのタブだけ読み足す（一覧は問い合わせない）',async()=>{
  const id=ids[4],sh=store[id],has=Object.keys(sh);
  const add=['指示','ToDo','指示の報告','予定の共有の記録'].find(t=>!has.includes(t));assert.ok(add,'fixture lacks an optional tab: '+has.join(','));
  sh[add]=add==='指示'?[['指示ID','内容'],['I-TEST-1','架空の指示']]:[['見出し']];
  sh['情報']=(sh['情報']||[['項目','値']]).filter(r=>r[0]!=='タブ').concat([['タブ',Object.keys(sh).join('|')]]);
  d.reset();const r=await d.p.evaluate(async id=>{const x=(await SP.corpRun()).find(x=>x.s.sheetId===id);return {ok:x.ok,t:SP.ui.corp.timing.tabsAdded}},id);
  assert.equal(r.ok,true);assert.ok(r.t>=1,JSON.stringify(r));
  assert.equal(d.log.filter(x=>x.id===id&&x.rest===''&&x.method==='GET').length,0,'no tab list query');
  const gets=d.log.filter(x=>x.id===id&&x.rest==='/values:batchGet');assert.equal(gets.length,2,'one read plus one read for the new tab');
  assert.ok(await d.p.evaluate(id=>JSON.parse(localStorage.getItem('workhub_corp_tabs_v1'))[id].length>0,id));
  d.reset();await d.p.evaluate(async()=>{await SP.corpRun()});
  assert.equal(d.log.filter(x=>x.id===id&&x.rest==='/values:batchGet').length,1,'next time read together');
 });
 await check('タブが消えていたら（前の一覧で読めない）、問い合わせ直して読み直す。「読めませんでした」にしない',async()=>{
  delete store[ids[0]]['指示'];store[ids[0]]['予定の共有の記録']=[];d.reset();
  const x=await d.p.evaluate(async id=>{const r=(await SP.corpRun()).find(x=>x.s.sheetId===id);return [r.ok,r.cases.length,r.tries]},ids[0]);
  assert.deepEqual(x,[true,1,1]);
  assert.equal(d.log.filter(x=>x.id===ids[0]&&x.rest===''&&x.method==='GET').length,1);
 });
 await check('自分の記録シートの同期：タブの一覧は1回、案件・入金・立替・ToDoは同時に書き、「情報」は消さずに1回で書く。結果はタブの順のまま',async()=>{
  const s2=await device(store,150);
  const own=ids[5];store[own]['案件']=[CASE];store[own]['ToDo']=[];
  await s2.p.evaluate(own=>{SP.setup();const x=SP.db.settings.data;x.ob={legacy:true};x.sheetId=own;SP.db.settings.rcpt.name='見本 6郎';SP.save()},own);
  /* v1.50.116 前回の同期の内訳も「情報」に書く */
  await s2.p.evaluate(()=>localStorage.setItem('workhub_sync_timing_v1',JSON.stringify({total:5000,button:2000,steps:[],after:[{name:'今月の受注',ms:3000}],ver:'1.50.116',at:'2026-11-20T00:00:00.000Z',detail:{ord:{ptr:400,sales:2500},salesTabs:16}})));
  s2.reset();const steps=await s2.p.evaluate(async()=>{const st=[];await SP.dataSync((name,ok,msg)=>st.push([name,ok]));return st});
  const mine=s2.log.filter(x=>x.id===own);
  assert.equal(mine.filter(x=>x.rest===''&&x.method==='GET').length,2,'tab list once (+1 for the 案件 grid size)');
  assert.equal(mine.filter(x=>/:clear$/.test(x.rest)).length,0,'情報 is not cleared first');
  assert.deepEqual(steps.filter(x=>/^記録シート「/.test(x[0])),[['記録シート「案件」',true],['記録シート「入金」',true],['記録シート「立替」',true],['記録シート「ToDo」',true],['記録シート「情報」',true]]);
  assert.ok(s2.max>=3,'the four tabs are written at the same time: '+s2.max);
  assert.equal(store[own]['情報'][2][0],'最終同期');
  {const r=store[own]['情報'].find(x=>x[0]==='前回の同期の内訳');assert.ok(r,JSON.stringify(store[own]['情報']));assert.equal(r[1],'今月の受注：場所 0.4秒・売上報告の読み込み 2.5秒（売上報告のタブ 16）')}
  assert.deepEqual(s2.errors,[]);await s2.c.close();
 });
 assert.deepEqual(d.errors,[]);await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
