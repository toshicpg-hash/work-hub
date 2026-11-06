/* v1.50.17 受付番号の記号：人ごとのアルファベット2文字。社長の端末が自動で振って社員一覧と各社員の記録シートに書き、社員の端末は同期で受け取って新しい受付番号に使う。
   Synthetic fixtures only (fictional names, example.com). In-memory Google Sheets; no live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CN={get db(){return DB},get ui(){return ui},go,render,save,dataSync,newCaseCode,caseCodesAssign,caseCodeWrite,codeNorm,casePrefix,'+
 'setup(){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};gAuthorize();adminSync=async()=>({});corpWait=async()=>{}}};';
const A='synthetic-a-sheet-0000000001',B='synthetic-b-sheet-0000000002',C='synthetic-c-sheet-0000000003',DX='synthetic-d-sheet-0000000004';
const LIST='synthetic-list-0000000000001';
const staff=[
 {name:'見本 一郎',email:'a@example.com',sheetId:A,company:'CP',role:'社員'},
 {name:'見本 二郎',email:'b@example.com',sheetId:B,company:'CPY',role:'社員',caseCode:'QX'},
 {name:'見本 三郎',email:'c@example.com',sheetId:C,company:'AT',role:'社員'},
 {name:'見本 四郎',email:'d@example.com',sheetId:DX,company:'CP',role:'社員',removed:true,caseCode:'MK'}];
const info=[['項目','値']];
function seed(){return {[A]:{'案件':[['受付番号']],'情報':info},[B]:{'案件':[['受付番号']],'情報':info,'受付番号の記号':[['受付番号の記号'],['QX']]},[C]:{'案件':[['受付番号']],'情報':info},[LIST]:{'社員':[]}};}
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
  if(rest===''&&method==='GET')return J(r,{sheets:Object.keys(sh).map(title=>({properties:{title,sheetId:1}}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests||[])if(q.addSheet)sh[q.addSheet.properties.title]=[];return J(r,{})}
  if(rest==='/values:batchGet')return J(r,{valueRanges:u.searchParams.getAll('ranges').map(x=>({values:sh[tabOf(x)]||[]}))});
  const v=rest.match(/^\/values\/([^:]+)(:clear)?$/);if(v){const t=tabOf(v[1]);if(v[2]){sh[t]=[];return J(r,{})}const body=r.request().postDataJSON();const vals=body.values.map(x=>x.map(y=>y));while(vals.length&&vals[vals.length-1].every(y=>y===''))vals.pop();sh[t]=vals.map(x=>{const a=x.slice();while(a.length&&a[a.length-1]==='')a.pop();return a});return J(r,{})}
  return J(r,{});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-06T03:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CN);
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
async function newCase(p,prop){
 await p.evaluate(()=>CN.go('new'));await p.click('[data-nco="CP"]');await p.fill('#n_prop',prop);await p.fill('#n_client','見本管理');
 await p.evaluate(()=>document.getElementById('newForm').requestSubmit());
 return p.evaluate(prop=>CN.db.cases.find(c=>c.property===prop)?.id,prop);
}
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const store=seed(),all=[];
 const admin=async()=>{const d=await device({store});all.push(d);await d.p.evaluate(({staff,LIST})=>{CN.setup();const d=CN.db.settings.data;d.admin=true;d.ob={legacy:true};d.listId=LIST;d.staff=JSON.parse(JSON.stringify(staff));CN.save()},{staff,LIST});return d};
 await check('記号の作り方：アルファベット2文字・I/Oなし・CP/ATなし・使い済みは避ける',async()=>{
  const d=await admin();
  const r=await d.p.evaluate(()=>{const out=[];for(let i=0;i<300;i++)out.push(CN.newCaseCode([{caseCode:'QX'}]));
   const full=[];for(const x of 'ABCDEFGHJKLMNPQRSTUVWXYZ')for(const y of 'ABCDEFGHJKLMNPQRSTUVWXYZ')if(!(x+y==='ZZ'))full.push({caseCode:x+y});
   return {out,last:CN.newCaseCode(full),none:CN.newCaseCode(full.concat({caseCode:'ZZ'})),norm:[CN.codeNorm(' qx '),CN.codeNorm('CP'),CN.codeNorm('IO'),CN.codeNorm('Q1'),CN.codeNorm('ABC')]}});
  for(const c of r.out){assert.match(c,/^[A-HJ-NP-Z]{2}$/);assert.ok(!['CP','AT','QX'].includes(c),c)}
  assert.ok(new Set(r.out).size>50,'random');assert.equal(r.last,'ZZ');assert.equal(r.none,'');
  assert.deepEqual(r.norm,['QX','','','','']);
 });
 await check('社長：共有を合わせるときに、記号のない人に振る。共有を外した人・決まっている人の記号は変えない。重なりは下の人だけ振り直す',async()=>{
  const d=all[0];
  const r=await d.p.evaluate(()=>{const st=CN.db.settings.data.staff;const log=CN.caseCodesAssign(st);CN.save();
   const dup=[{name:'甲',sheetId:'x1',caseCode:'KM'},{name:'乙',sheetId:'x2',caseCode:'km'},{name:'丙',sheetId:'x3',caseCode:'CP'}];const log2=CN.caseCodesAssign(dup);
   return {codes:st.map(s=>[s.name,s.caseCode||'']),log,dup:dup.map(s=>s.caseCode),log2,again:CN.caseCodesAssign(st)}});
  const code=Object.fromEntries(r.codes);
  assert.equal(code['見本 二郎'],'QX');assert.equal(code['見本 四郎'],'MK');
  for(const n of ['見本 一郎','見本 三郎'])assert.match(code[n],/^[A-HJ-NP-Z]{2}$/);
  assert.equal(new Set(Object.values(code)).size,4,'unique');
  assert.equal(r.log.length,2);assert.deepEqual(r.again,[],'second time assigns nothing');
  assert.equal(r.dup[0],'KM');assert.notEqual(r.dup[1],'KM');assert.match(r.dup[1],/^[A-HJ-NP-Z]{2}$/);assert.notEqual(r.dup[2],'CP');assert.equal(r.log2.length,2);
 });
 await check('社長：各社員の記録シートに「受付番号の記号」を書き、同じなら書かない',async()=>{
  const d=all[0];
  const w1=await d.p.evaluate(async()=>{const out=[];for(const s of CN.db.settings.data.staff.filter(s=>!s.removed))out.push(await CN.caseCodeWrite(s));return out});
  const code=Object.fromEntries(await d.p.evaluate(()=>CN.db.settings.data.staff.map(s=>[s.name,s.caseCode])));
  assert.deepEqual(w1,[true,false,true],'B already had QX');
  assert.deepEqual(store[A]['受付番号の記号'],[['受付番号の記号'],[code['見本 一郎']]]);
  assert.deepEqual(store[C]['受付番号の記号'],[['受付番号の記号'],[code['見本 三郎']]]);
  const puts=[];d.p.on('request',r=>{if(r.method()!=='GET')puts.push(r.url())});
  const w2=await d.p.evaluate(async()=>{const out=[];for(const s of CN.db.settings.data.staff.filter(s=>!s.removed))out.push(await CN.caseCodeWrite(s));return out});
  assert.deepEqual(w2,[false,false,false]);assert.deepEqual(puts,[]);
  assert.deepEqual(d.errors,[]);
 });
 await check('社長の社員一覧に記号が出る（400px ではみ出さない）',async()=>{
  const d=all[0];await d.p.evaluate(()=>{CN.ui.dview='admin';CN.go('stats')});
  const t=await d.p.evaluate(()=>document.body.textContent);assert.match(t,/受付番号 QX-/);assert.match(t,/受付番号 MK-/);
  assert.ok(await overflow(d.p)<=1);
 });
 await check('社員の端末：同期で記号を受け取り、新しい受付番号は「記号-番号」。今までの番号は変えない。番号は続きから',async()=>{
  const d=await device({store});all.push(d);
  await d.p.evaluate(B=>{CN.setup();const d=CN.db.settings.data;d.ob={legacy:true};d.sheetId=B;CN.db.settings.rcpt.name='見本 二郎';CN.save()},B);
  assert.match(String(await newCase(d.p,'見本荘その1')),/^U-\d{4}$/,'before the code arrives');
  await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});
  assert.equal(await d.p.evaluate(()=>CN.casePrefix()),'QX');
  const ids=await d.p.evaluate(()=>CN.db.cases.map(c=>c.id));
  const id2=await newCase(d.p,'見本荘その2');
  const n1=Number(ids.find(x=>/^U-/.test(x)).slice(2));assert.equal(id2,'QX-'+String(n1+1).padStart(4,'0'));
  assert.ok(await d.p.evaluate(()=>CN.db.cases.some(c=>c.property==='見本荘その1'&&/^U-/.test(c.id))),'old id kept');
  await d.p.evaluate(()=>{CN.ui.dview='mine';CN.go('stats')});assert.match(await d.p.evaluate(()=>document.body.textContent),/受付番号の記号：QX-/);
  assert.ok(await overflow(d.p)<=1);
  assert.deepEqual(d.errors,[]);
 });
 await check('社員の端末：別の記録シートにつなぎ直すと、前の記号は使わない（U に戻る）',async()=>{
  const d=all[all.length-1];await d.p.evaluate(C=>{CN.db.settings.data.sheetId=C;CN.save()},C);
  assert.equal(await d.p.evaluate(()=>CN.casePrefix()),'U');
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
