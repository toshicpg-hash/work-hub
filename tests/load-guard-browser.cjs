/* v1.50.21 端末の記録が読めない・見つからないとき：黙って空で始めない。読めない記録は控えに移し、控えに移せなければ保存を止める。
   見つからないときは、前に使っていた印があればホームに出す。Synthetic fixtures only. No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const KEY='workhub_proto_v1',META='workhub_proto_v1_meta',BP='workhub_proto_v1_broken:';
const hook='window.LG={get db(){return DB},save,get problem(){return loadProblem},get blocked(){return loadBlocked},get persist(){return storagePersist}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function open(seed,{failBackup=false,storage=null}={}){
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block',acceptDownloads:true});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});
 await c.addInitScript(({seed,failBackup,BP,storage})=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.clear();for(const [k,v] of Object.entries(seed))localStorage.setItem(k,v)}
   if(storage){const calls=window.__persistCalls=[];const st=storage==='none'?undefined:{persisted:async()=>{calls.push('persisted');return storage==='already'},persist:async()=>{calls.push('persist');return storage==='grant'}};Object.defineProperty(navigator,'storage',{get:()=>st,configurable:true})}
   if(failBackup){const o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).startsWith(BP))throw new DOMException('full','QuotaExceededError');return o.call(this,k,v)}}},{seed,failBackup,BP,storage});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-08T00:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.LG);
 return {c,p,errors};
}
const store=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const broken='{"schemaVersion":2,"cases":[{"id":"U-0001","client":"見本管理"';
 await check('読めない記録：消さずに控えに移し、ホームに理由と「控えをファイルに保存」を出す。開き直しても控えは増えない',async()=>{
  const {c,p,errors}=await open({[KEY]:broken,workhub_gcal_last_v1:'{}'});
  const t=await p.textContent('#load-problem');assert.match(t,/この端末の記録を読めませんでした/);assert.match(t,/元の記録は消さずに、控え/);assert.match(t,/初期設定のボタンや同期は押さずに/);
  let st=await store(p);const bks=Object.keys(st).filter(k=>k.startsWith(BP));assert.equal(bks.length,1);assert.equal(st[bks[0]],broken,'backup is byte-identical');assert.equal(st[KEY],broken,'not overwritten on load');
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('[data-act="loadbackup"]')]);assert.equal(fs.readFileSync(await dl.path(),'utf8'),broken);
  assert.ok(await overflow(p)<=1);
  await p.reload();await p.waitForFunction(()=>!!window.LG);st=await store(p);assert.equal(Object.keys(st).filter(k=>k.startsWith(BP)).length,1,'no second backup');
  assert.equal(await p.evaluate(()=>LG.save()),true,'saving is allowed once the backup is safe');st=await store(p);assert.equal(st[bks[0]],broken,'backup survives the next save');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('控えに移せないとき：保存を止め、前の記録を上書きしない',async()=>{
  const {c,p,errors}=await open({[KEY]:broken},{failBackup:true});
  assert.match(await p.textContent('#load-problem'),/控えに移せなかったため、前の記録を上書きしないように、この端末での保存を止めています/);
  assert.equal(await p.evaluate(()=>LG.blocked),true);assert.equal(await p.evaluate(()=>LG.save()),false);
  assert.equal((await store(p))[KEY],broken,'old data untouched');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('形の違う記録（JSONだが cases がない）も同じ扱い',async()=>{
  const {c,p}=await open({[KEY]:'{"settings":{}}'});assert.match(await p.textContent('#load-problem'),/記録の形が違う/);await c.close();
 });
 await check('記録が見つからない：最後に保存した時刻・社長の端末か・ほかのデータが残っているかを出す',async()=>{
  const meta=JSON.stringify({savedAt:'2026-11-07T12:34:00Z',bytes:1000,admin:true,sheet:true,cases:12});
  const {c,p,errors}=await open({[META]:meta,workhub_gcal_last_v1:'{}',workhub_corp_tabs_v1:'{}'});
  const t=await p.textContent('#load-problem');
  assert.match(t,/この端末の記録が見つかりません/);assert.match(t,/最後に保存したのは 11\/7 21:34（社長の管理端末・案件 12件）/);assert.match(t,/ほかのCPG HUBのデータは残っています（2件）/);
  assert.ok(await overflow(p)<=1);assert.deepEqual(errors,[]);await c.close();
 });
 await check('はじめての端末（何もない・畳み方の記録だけ）には出さない',async()=>{
  for(const seed of [{},{workhub_fold_v1:'{}'}]){const {c,p}=await open(seed);assert.equal(await p.locator('#load-problem').count(),0);assert.equal(await p.evaluate(()=>LG.problem),null);await c.close();}
 });
 await check('ふつうの端末：知らせは出ない。保存すると「最後に保存した時刻」のメモを残す',async()=>{
  const {c,p,errors}=await open({});
  await p.evaluate(()=>{LG.db.settings.data.admin=true;LG.save()});
  await p.reload();await p.waitForFunction(()=>!!window.LG);
  assert.equal(await p.locator('#load-problem').count(),0);
  const m=JSON.parse((await store(p))[META]);assert.equal(m.admin,true);assert.ok(Date.parse(m.savedAt));assert.equal(typeof m.cases,'number');
  assert.equal(await p.evaluate(()=>LG.db.settings.data.admin),true,'data kept');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('データの保護：起動時にブラウザへ「自動で消さない」よう頼む。認められた・すでに認められている・使えないブラウザでも止まらない',async()=>{
  for(const [mode,calls,val] of [['grant',['persisted','persist'],true],['already',['persisted'],true],['deny',['persisted','persist'],false],['none',[],null]]){
   const {c,p,errors}=await open({},{storage:mode});await p.waitForFunction(()=>window.LG.persist!==null||!navigator.storage,null,{timeout:5000});
   assert.deepEqual(await p.evaluate(()=>window.__persistCalls),calls,mode);
   assert.equal(await p.evaluate(()=>LG.persist),mode==='none'?null:val,mode);
   if(mode==='grant'){await p.evaluate(()=>LG.save());assert.equal(JSON.parse((await store(p))[META]).persisted,true)}
   assert.deepEqual(errors,[],mode);await c.close();}
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
