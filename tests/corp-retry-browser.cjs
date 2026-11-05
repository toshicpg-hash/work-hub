/* v1.50.5 社員の記録の読み込み：読めなかった人だけ少し待って最大2回やり直す。理由を分けて出す。かかった時間を出す。
   Synthetic fixtures only (fictional names, example.com). In-memory Sheets; no live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CR={get db(){return DB},get ui(){return ui},go,render,save,corpRun,corpReadMsg,corpRetryWait,setup(){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};adminSync=async()=>({});gReqTimeout=300;window.__waits=[];corpWait=async ms=>{window.__waits.push(ms)}}};';
const staff=[['見本 一郎','synthetic-ok-sheet-0000000001'],['見本 二郎','synthetic-429-sheet-000000002'],['見本 三郎','synthetic-slow-sheet-00000003'],['見本 四郎','synthetic-503-sheet-000000004'],['見本 五郎','synthetic-ra-sheet-0000000005'],['見本 六郎','synthetic-403-sheet-000000006']].map(([name,sheetId],i)=>({name,email:'s'+i+'@example.com',sheetId,company:'CP',role:'社員',gmCo:'',removed:false,addedAt:'2026-11-01'}));
const CASE=['受付番号','会社','種類','段階','物件','部屋','担当','受付日'];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const calls={};const J=(r,o,st=200,headers={})=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-expose-headers':'Retry-After',...headers},body:JSON.stringify(o)});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname!=='sheets.googleapis.com')return r.fulfill({status:200,body:''});
  const m=decodeURIComponent(u.pathname).match(/^\/v4\/spreadsheets\/([^/:]+)/),id=m&&m[1];calls[id]=(calls[id]||0)+1;const n=calls[id];
  if(id.includes('-429-')&&n===1)return J(r,{error:{code:429}},429);
  if(id.includes('-ra-')&&n===1)return J(r,{error:{code:429}},429,{'Retry-After':'2'});
  if(id.includes('-slow-')&&n===1){await new Promise(x=>setTimeout(x,900));return J(r,{}).catch(()=>{})}
  if(id.includes('-503-'))return J(r,{error:{code:503}},503);
  if(id.includes('-403-'))return J(r,{error:{code:403}},403);
  if(!u.pathname.includes('values'))return J(r,{sheets:['案件','入金','立替','情報'].map(title=>({properties:{title}}))});
  const ranges=u.searchParams.getAll('ranges');return J(r,{valueRanges:ranges.map(x=>x.includes('案件')?{values:[CASE,['U-'+id.slice(10,13),'CP','退去立会','受付','見本荘','101','見本','2026-11-01']]}:x.includes('情報')?{values:[['項目','値'],['最終同期','2026-11-05 09:00']]}:{values:[]})});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CR);
 await p.evaluate(staff=>{CR.setup();const d=CR.db.settings.data;d.admin=true;d.ob={legacy:true};d.listId='synthetic-list-0000000000001';d.staff=staff;CR.save()},staff);
 await check('429・時間切れ・Retry-After は待ってやり直して読める。503 は2回やり直しても読めず「Google側の一時的な不具合（503）・3回試しました」。403 はやり直さない。成功した人は読み直さない',async()=>{
  const data=await p.evaluate(async()=>{const d=await CR.corpRun();return d.map(x=>({name:x.s.name,ok:x.ok,msg:x.msg||'',tries:x.tries,status:x.status||'',cases:x.ok?x.cases.length:null}))});
  const by=n=>data.find(x=>x.name===n);
  assert.deepEqual([by('見本 一郎').ok,by('見本 一郎').tries],[true,1]);
  assert.deepEqual([by('見本 二郎').ok,by('見本 二郎').tries,by('見本 二郎').cases],[true,2,1],'429 then success');
  assert.deepEqual([by('見本 三郎').ok,by('見本 三郎').tries],[true,2],'timeout then success');
  assert.deepEqual([by('見本 五郎').ok,by('見本 五郎').tries],[true,2],'Retry-After then success');
  assert.equal(by('見本 四郎').ok,false);assert.equal(by('見本 四郎').msg,'Google側の一時的な不具合（503）・3回試しました');assert.equal(by('見本 四郎').tries,3);assert.equal(by('見本 四郎').status,503);assert.equal(by('見本 四郎').cases,null,'not shown as 0 cases');
  assert.equal(by('見本 六郎').ok,false);assert.equal(by('見本 六郎').tries,1,'403 is not retried');assert.match(by('見本 六郎').msg,/権限がありません（403）/);
  assert.deepEqual(await p.evaluate(()=>window.__waits),[5000,5000,5000,15000,2000],'429: 5s; timeout: 5s; 503: 5s→15s; Retry-After: 2s (in staff order)');
  assert.equal(calls['synthetic-ok-sheet-0000000001'],2,'a person read once is not read again (tabs + values)');
  assert.equal(calls['synthetic-503-sheet-000000004'],3);
 });
 await check('会社の動き：読めた人・何回目で読めたか・読めなかった理由と、全体と1人あたりの時間を出す。読めなかった人は「読めませんでした」のまま（0件と出さない）',async()=>{
  await p.evaluate(()=>{CR.go('company');document.querySelectorAll('details').forEach(x=>x.open=true)});
  const t=await p.textContent('main');
  assert.match(t,/見本 二郎.*（2回目で読めました）/);assert.match(t,/見本 四郎 読めませんでした（Google側の一時的な不具合（503）・3回試しました）/);
  assert.match(t,/読み込み：全体 [\d.]+秒・1人あたり [\d.]+秒/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.locator('main').screenshot({path:path.join(root,'docs/preview/corp-retry-400.png')});
 });
 await check('通信そのものの失敗は「通信の失敗（電波・接続）」として分けて出す',async()=>{
  const k=await p.evaluate(()=>{const e=new TypeError('Failed to fetch');e.network=true;return [CR.corpReadMsg(e),CR.corpReadMsg(Object.assign(new Error('http'),{status:429})),CR.corpReadMsg(Object.assign(new Error('x'),{name:'AbortError'})),CR.corpRetryWait(Object.assign(new Error('http'),{status:404}),1),CR.corpRetryWait(Object.assign(new Error('http'),{status:429,retryAfter:120}),1),CR.corpRetryWait(Object.assign(new Error('http'),{status:429}),3)]});
  assert.deepEqual(k,['通信の失敗（電波・接続）','Googleの回数制限（429）','時間切れ（45秒）',null,60000,null]);
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
