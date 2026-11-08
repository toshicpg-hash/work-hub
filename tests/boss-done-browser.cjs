/* v1.50.26 担当が社長の、社員の記録の ToDo（見るだけ）を社長の端末で「済み」にできる。社員の記録は書き換えず、社長の社員一覧の「社長の済み」タブに残す。
   見るだけの ToDo には「○○さんの記録」と出す。Synthetic fixtures only (fictional names, example.com). In-memory Google Sheets; no live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CN={get db(){return DB},get ui(){return ui},go,render,save,corpRun,adminWriteList,'+
 'setup(stubSync){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};gAuthorize();if(stubSync)adminSync=async()=>({});corpWait=async()=>{}}};';
const S='synthetic-senmu-sheet-000000001',LIST='synthetic-list-0000000000001';
const TODO=['内容','期限','担当','受付番号','物件','部屋','種類','状態'];
const staff=[{name:'見本 専務',email:'senmu@example.com',sheetId:S,company:'CP,CPY,AT',role:'全社',displayName:'専務',addedAt:'2026-10-01'}];
function seed(){return {[S]:{'案件':[['受付番号']],'入金':[],'立替':[],'情報':[['項目','値']],'ToDo':[TODO,['見本の資金移動連絡','2026-11-05','トシ','','','','手入力','期限切れ'],['見本の自分の用事','2026-11-05','見本 専務','','','','手入力','期限切れ']]},[LIST]:{'社員':[]}};}
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device({store,deny=new Set(),width=400,fail=new Set()}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 const J=(r,o,st=200)=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 const tabOf=x=>{let t=decodeURIComponent(x).replace(/!.*$/,'');if(t.startsWith("'"))t=t.slice(1,-1).replace(/''/g,"'");return t};
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname!=='sheets.googleapis.com')return J(r,{});
  const m=decodeURIComponent(u.pathname).match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),id=m[1],rest=m[2],method=r.request().method();
  if(deny.has(id))return J(r,{error:{code:403}},403);
  if(fail.has(id))return J(r,{error:{code:404}},404);
  const sh=store[id];if(!sh)return J(r,{error:{code:404}},404);
  if(rest===''&&method==='GET')return J(r,{sheets:Object.keys(sh).map(title=>({properties:{title,sheetId:1,gridProperties:{rowCount:1000,columnCount:40}}}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests||[]){if(q.addSheet)sh[q.addSheet.properties.title]=[];if(q.updateCells)sh['案件']=q.updateCells.rows.map(x=>(x.values||[]).map(v=>v.userEnteredValue?Object.values(v.userEnteredValue)[0]:'')).filter(x=>x.some(y=>y!==''))}return J(r,{})}
  if(rest==='/values:batchGet')return J(r,{valueRanges:u.searchParams.getAll('ranges').map(x=>({values:sh[tabOf(x)]||[]}))});
  const v=rest.match(/^\/values\/([^:]+)(:clear)?$/);if(v){const t=tabOf(v[1]);if(v[2]){sh[t]=[];return J(r,{})}const body=r.request().postDataJSON();const vals=body.values.map(x=>x.map(y=>y));while(vals.length&&vals[vals.length-1].every(y=>y===''))vals.pop();sh[t]=vals.map(x=>{const a=x.slice();while(a.length&&a[a.length-1]==='')a.pop();return a});return J(r,{})}
  return J(r,{});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-06T03:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CN);
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const store=seed(),all=[];
 const admin=async(stub)=>{const d=await device({store});all.push(d);await d.p.evaluate(({staff,LIST,stub})=>{CN.setup(stub);const x=CN.db.settings.data;x.admin=true;x.ob={legacy:true};x.folder='synthetic-folder-0000000001';x.listId=LIST;x.staff=JSON.parse(JSON.stringify(staff));CN.save()},{staff,LIST,stub});
  d.p.on('dialog',dl=>dl.accept());return d};
 const todoText=async p=>{await p.evaluate(()=>CN.go('todo'));await require('./scope-selection-helper').allPeople(p);return p.textContent('main')};
 const doneBtn=p=>p.locator('[data-bossdone]');
 await check('社長の端末：見るだけの ToDo に「専務さんの記録」と出る。担当が社長のものだけ「済みにする」がある（400px）',async()=>{
  const d=await admin(true);await d.p.evaluate(()=>CN.adminWriteList());await d.p.evaluate(async()=>{await CN.corpRun()});
  const t=await todoText(d.p);assert.match(t,/見本の資金移動連絡/);assert.match(t,/見本の自分の用事/);assert.match(t,/専務さんの記録/);
  assert.equal(await doneBtn(d.p).count(),1,'only the ToDo assigned to the president');
  assert.match(t,/専務さんの端末で作った ToDo です。「済みにする」と社長の画面から消えます/);
  assert.ok(await overflow(d.p)<=1);assert.deepEqual(d.errors,[]);
 });
 await check('「済みにする」：社長の画面から消え、社員一覧の「社長の済み」に残る。専務の記録は変わらない',async()=>{
  const d=all[0],before=JSON.stringify(store[S]);
  await doneBtn(d.p).click();await d.p.waitForFunction(()=>CN.db.settings.data.bossDone&&CN.db.settings.data.bossDone.every(x=>x.synced),null,{timeout:5000});
  const t=await todoText(d.p);assert.doesNotMatch(t,/見本の資金移動連絡/);assert.match(t,/見本の自分の用事/);
  assert.deepEqual(store[LIST]['社長の済み'].map(r=>r.slice(0,3)),[['記録シートID','内容','期限'],[S,'見本の資金移動連絡','2026-11-05']]);
  assert.equal(JSON.stringify(store[S]),before,'the employee record is untouched');
  assert.deepEqual(d.errors,[]);
 });
 await check('社長のもう1台の端末：社員一覧を読むと、同じ ToDo は出ない',async()=>{
  const e=await admin(false);await e.p.evaluate(()=>{CN.db.settings.data.staff=[];CN.save()});
  await e.p.evaluate(async()=>{await CN.corpRun()});
  const t=await todoText(e.p);assert.doesNotMatch(t,/見本の資金移動連絡/);assert.match(t,/見本の自分の用事/);
  assert.equal(await e.p.evaluate(()=>CN.db.settings.data.bossDone.length),1);assert.deepEqual(e.errors,[]);
 });
 await check('同じ内容でも期限が違う新しい ToDo は、済みにしたものとは別（出る）',async()=>{
  store[S]['ToDo'].push(['見本の資金移動連絡','2026-12-05','トシ','','','','手入力','今後']);
  const d=all[0];await d.p.evaluate(async()=>{await CN.corpRun();CN.ui.tPeriod='all'});
  const t=await todoText(d.p);assert.match(t,/見本の資金移動連絡（|見本の資金移動連絡/);assert.match(t,/12\/5/);assert.equal(await doneBtn(d.p).count(),1);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
