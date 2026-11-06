/* v1.50.10 社員の「数字」に「会社全体」。社長の端末が会社ごとの「会社の数字」シートに、その会社の案件の数字に使う列だけを書き出し、
   その会社の社員にだけ共有する。社員の端末は自分の記録シートの「会社の数字の場所」から読み、「数字」の「会社全体」でだけ使う。
   Synthetic fixtures only (fictional names, example.com). In-memory Google Sheets; no live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CN={get db(){return DB},get ui(){return ui},go,render,save,corpRun,numWriteAll,numSpecs,numPtrWrite,numLoad,statsCompanyMode,numWriteText,NUM_COLS,scopeCases,'+
 'setup(){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};gAuthorize();adminSync=async()=>({});corpWait=async()=>{}}};';
const CASE=['受付番号','会社','種類','段階','段階キー','物件','部屋','依頼元','担当','受付日','見積額','見積提出日','受注日','失注日','失注理由','請求日','請求額','入金予定日','入金済額','住所','メモ'];
const A='synthetic-a-sheet-0000000001',B='synthetic-b-sheet-0000000002',C='synthetic-c-sheet-0000000003',DX='synthetic-d-sheet-0000000004',E='synthetic-e-sheet-0000000005';
const staff=[
 {name:'見本 一郎',email:'a@example.com',sheetId:A,company:'CP',role:'社員'},
 {name:'見本 二郎',email:'b@example.com',sheetId:B,company:'CP,CPY',role:'社員'},
 {name:'見本 三郎',email:'c@example.com',sheetId:C,company:'CPY',role:'社員'},
 {name:'見本 四郎',email:'d@example.com',sheetId:DX,company:'CP',role:'社員',removed:true},
 {name:'見本 五郎',email:'e@example.com',sheetId:E,company:'AT',role:'社員'}];
const row=(no,co,extra={})=>CASE.map(k=>({'受付番号':no,'会社':co,'種類':'リノベーション','段階':'見積提出済','段階キー':'quoted','物件':'見本荘'+no,'部屋':'101','依頼元':'見本管理','担当':'見本','受付日':'2026-10-01','見積額':10000,'見積提出日':'2026-11-02','住所':'秘密の住所'+no,'メモ':'秘密のメモ'+no,...extra})[k]??'');
/* in-memory spreadsheets: id -> {tab: rows} */
function seed(){return {
 [A]:{'案件':[CASE,row('A-1','CP'),row('A-2','CP',{'段階':'請求済・入金待ち','段階キー':'billed','受注日':'2026-11-03','請求日':'2026-10-01','請求額':50000,'入金予定日':'2026-10-31','入金済額':10000})],'立替':[['日付','支払先','金額'],['2026-11-01','秘密の支払先',98765]],'情報':[['項目','値']]},
 [B]:{'案件':[CASE,row('B-1','CP',{'段階':'失注','段階キー':'lost','失注日':'2026-11-04','失注理由':'価格'}),row('B-2','CPY')],'立替':[['日付','支払先','金額'],['2026-11-01','秘密の支払先',98765]],'情報':[['項目','値']]},
 [C]:{'案件':[CASE,row('C-1','CPY'),row('C-2','AT')],'立替':[],'情報':[['項目','値']]},
 [E]:{'案件':[CASE,row('E-1','AT')],'立替':[],'情報':[['項目','値']]},
 'synthetic-num-cp-000000001':{'会社の数字':[],'情報':[['項目','値'],['会社','CP']]},
 'synthetic-num-cpy-00000002':{'会社の数字':[],'情報':[['項目','値'],['会社','CPY']]}};}
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
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const all=[];const store=seed();
 const admin=async(opts={})=>{const d=await device({store,...opts});all.push(d);await d.p.evaluate(staff=>{CN.setup();const d=CN.db.settings.data;d.admin=true;d.ob={legacy:true};d.sheetId='synthetic-boss-sheet-00000001';d.listId='synthetic-list-0000000000001';d.staff=staff;
  d.numbers={CP:'synthetic-num-cp-000000001',CPY:'synthetic-num-cpy-00000002'};
  CN.db.cases=[Object.assign({},CN.db.cases[0]||{},{id:'U-9001',company:'CP',type:'reno',stage:'quoted',client:'見本の依頼元',property:'社長の見本荘',room:'1',tantou:'社長',receivedAt:'2026-10-01T00:00:00Z',estAmount:20000,estSentDate:'2026-11-01',items:[],payments:[],payLog:[],note:'社長の秘密のメモ',addr:'社長の秘密の住所',symptom:''})];
  CN.save()},staff);return d};
 await check('社長：社員の記録を読み込むと、会社ごとの「会社の数字」にその会社の案件だけを書く（数字に使う列だけ。住所・メモ・立替は書かない）',async()=>{
  const d=await admin();await d.p.evaluate(async()=>{await CN.corpRun()});
  const cp=store['synthetic-num-cp-000000001']['会社の数字'],cpy=store['synthetic-num-cpy-00000002']['会社の数字'];
  const cols=await d.p.evaluate(()=>CN.NUM_COLS);assert.deepEqual(cp[0],cols);assert.deepEqual(cpy[0],cols);
  const coIdx=cols.indexOf('会社'),propIdx=cols.indexOf('物件');
  assert.deepEqual(cp.slice(1).map(r=>r[coIdx]),['CP','CP','CP','CP']);assert.deepEqual(cp.slice(1).map(r=>r[propIdx]).sort(),['社長の見本荘','見本荘A-1','見本荘A-2','見本荘B-1'].sort());
  assert.deepEqual(cpy.slice(1).map(r=>r[propIdx]).sort(),['見本荘B-2','見本荘C-1']);
  const text=JSON.stringify(store['synthetic-num-cp-000000001'])+JSON.stringify(store['synthetic-num-cpy-00000002']);
  assert.doesNotMatch(text,/秘密|98765|AT|E-1|C-2/,'no addresses, memos, receipts or other companies');
  assert.ok(!Object.keys(store).some(k=>/num-at/.test(k)),'no AT file without one being shared');
  assert.match(JSON.stringify(store['synthetic-num-cp-000000001']['情報']),/"会社","CP".*"書き出し日時"/);
  assert.match(await d.p.evaluate(()=>CN.ui.numWrite.map(x=>x.text).join('/')),/CP：会社の数字を書き出しました（4件）\/CPY：会社の数字を書き出しました（2件）/);
 });
 await check('社長：その会社の社員を1人でも読めなかったら、その会社の数字は前のまま（一部だけで上書きしない）。ほかの会社は書く',async()=>{
  const before=JSON.stringify(store['synthetic-num-cp-000000001']);
  const d=await admin({fail:new Set([A])});await d.p.evaluate(async()=>{await CN.corpRun()});
  assert.equal(JSON.stringify(store['synthetic-num-cp-000000001']),before);
  assert.match(await d.p.evaluate(()=>CN.ui.numWrite.map(x=>x.text).join('/')),/CP：読めなかった人がいるので、会社の数字は前のままです（見本 一郎）/);
 });
 await check('共有の対象：会社の数字は、その会社に所属する社員にだけ「閲覧者」。外した人・ほかの会社の人には付けない。社員ごとの「会社の数字の場所」はその人の会社の分だけ',async()=>{
  const d=all[0];
  const specs=await d.p.evaluate(staff=>CN.numSpecs(staff,{CP:'synthetic-num-cp-000000001',CPY:'synthetic-num-cpy-00000002'},staff.map(s=>s.email)),staff);
  assert.deepEqual(specs.map(x=>[x.label,x.want.map(w=>w.email+':'+w.role)]),[['会社の数字（CP）',['a@example.com:reader','b@example.com:reader']],['会社の数字（CPY）',['b@example.com:reader','c@example.com:reader']]]);
  await d.p.evaluate(async staff=>{for(const s of staff.filter(s=>!s.removed))await CN.numPtrWrite(s,{CP:'synthetic-num-cp-000000001',CPY:'synthetic-num-cpy-00000002'})},staff);
  assert.deepEqual(store[A]['会社の数字の場所'],[['会社','ファイルID'],['CP','synthetic-num-cp-000000001']]);
  assert.deepEqual(store[B]['会社の数字の場所'],[['会社','ファイルID'],['CP','synthetic-num-cp-000000001'],['CPY','synthetic-num-cpy-00000002']]);
  assert.deepEqual(store[E]['会社の数字の場所'],[['会社','ファイルID']],'no company sheet for AT');
 });
 const employee=async(sheetId,name,opts={})=>{const d=await device({store,...opts});all.push(d);await d.p.evaluate(({sheetId,name})=>{CN.setup();const d=CN.db.settings.data;d.ob={legacy:true};d.sheetId=sheetId;CN.db.settings.rcpt.name=name;
  CN.db.cases=[Object.assign({},{id:'U-0001',company:'CP',type:'reno',stage:'quoted',client:'自分の依頼元',property:'自分の見本荘',room:'1',tantou:name,receivedAt:'2026-10-01T00:00:00Z',estAmount:3000,estSentDate:'2026-11-05',items:[],payments:[],payLog:[]})];CN.save();CN.go('stats')},{sheetId,name});return d};
 const main_=p=>p.evaluate(()=>document.querySelector('main').innerText);
 await check('社員：「数字」に「自分／会社全体」。「自分」は今までどおり自分の案件だけ',async()=>{
  const d=await employee(A,'見本 一郎');
  assert.equal(await d.p.locator('[data-stats-who]').count(),2);assert.equal(await d.p.getAttribute('[data-stats-who="self"]','aria-pressed'),'true');
  const t=await main_(d.p);assert.match(t,/見積提出\s*1件/);assert.doesNotMatch(t,/見本荘A-2|見本荘B-1/);
 });
 await check('社員：「会社全体」を押すと、自分の会社（CP）の数字を読み、社長が会社を選んだときと同じ計算で出す（未入金の物件別も）',async()=>{
  const d=all[all.length-1];await d.p.click('[data-stats-who="company"]');await d.p.waitForFunction(()=>!CN.ui.numBusy);
  const t=await main_(d.p);
  assert.match(t,/CPの会社全体の数字です/);assert.match(t,/見積提出\s*4件/);assert.match(t,/受注\s*1件/);assert.match(t,/失注\s*1件/);
  assert.match(t,/未入金/);assert.match(t,/見本荘A-2/);assert.doesNotMatch(t,/自分の見本荘/,'own local cases are not mixed in');
  assert.doesNotMatch(t,/CPY|見本荘B-2|見本荘C-1/,'no other company');assert.doesNotMatch(t,/経理に入金確認を依頼/,'no accounting action in company view');
  assert.equal(await d.p.locator('[data-stats-numco]').count(),0,'one company: no company switch');
  /* 会社全体では、未入金（担当者別・物件別・最長の遅れ）を一番上に */
  const order=await d.p.evaluate(()=>[...document.querySelectorAll('main section.sec')].map(x=>x.id||x.querySelector('h2')?.textContent||''));
  assert.ok(order.indexOf('stats-unpaid')>=0&&order.indexOf('stats-unpaid')<order.indexOf('stats-won'),JSON.stringify(order));
  const up=await d.p.evaluate(()=>document.getElementById('stats-unpaid').innerText);assert.match(up,/最長の遅れ \d+日/);assert.match(up,/担当者別/);assert.match(up,/物件別/);assert.match(up,/見本荘A-2/);
 });
 await check('社員：ほかの画面（案件・ToDo・予定・領収書）は今までどおり自分の分だけ',async()=>{
  const d=all[all.length-1];
  for(const v of ['cases','todo','cal','rcpt','home']){await d.p.evaluate(v=>CN.go(v),v);const t=await main_(d.p);assert.doesNotMatch(t,/見本荘A-1|見本荘A-2|見本荘B-1|社長の見本荘/,v);}
  assert.deepEqual(await d.p.evaluate(()=>CN.scopeCases().map(c=>c.id)),['U-0001']);
 });
 await check('社員：2社に所属する人は会社を切り替えられる。ほかの会社のシートを指していても会社が違えば出さない',async()=>{
  const d=await employee(B,'見本 二郎');await d.p.click('[data-stats-who="company"]');await d.p.waitForFunction(()=>!CN.ui.numBusy);
  assert.equal(await d.p.locator('[data-stats-numco]').count(),2);
  await d.p.click('[data-stats-numco="CPY"]');let t=await main_(d.p);assert.match(t,/CPYの会社全体の数字です/);assert.match(t,/見積提出\s*2件/);assert.doesNotMatch(t,/見本荘A-1/);
  /* 場所のタブが書き換えられて、CPY の欄が CP のシートを指していても出さない */
  store[B]['会社の数字の場所']=[['会社','ファイルID'],['CPY','synthetic-num-cp-000000001']];
  await d.p.click('[data-act="numload"]');
  await d.p.waitForFunction(()=>!CN.ui.numBusy&&!document.querySelector('[data-act="numload"][disabled]'));
  t=await main_(d.p);assert.match(t,/読めなかった会社があります（CPY：会社が一致しません）/);assert.doesNotMatch(t,/見本荘A-1/);
 });
 await check('社員：共有されていない会社のシート（403）は読めず、出さない',async()=>{
  store[C]['会社の数字の場所']=[['会社','ファイルID'],['CPY','synthetic-num-cp-000000001']];
  const d=await employee(C,'見本 三郎',{deny:new Set(['synthetic-num-cp-000000001'])});await d.p.click('[data-stats-who="company"]');await d.p.waitForFunction(()=>!CN.ui.numBusy);
  const t=await main_(d.p);assert.match(t,/読めなかった会社があります/);assert.match(t,/会社全体の数字がまだ届いていません/);assert.doesNotMatch(t,/見本荘A-1|見本荘B-1/);
 });
 await check('社長・見る人の端末には「自分／会社全体」を出さず、数字の画面は今までどおり',async()=>{
  const d=all[0];await d.p.evaluate(()=>CN.go('stats'));assert.equal(await d.p.locator('[data-stats-who]').count(),0);
  assert.match(await d.p.evaluate(()=>CN.numWriteText()),/社員に見せる会社の数字：CP：会社の数字を書き出しました/,'shown in the ⓘ box');
 });
 await check('400px・360pxで横にはみ出さない・スクリプトのエラーなし',async()=>{
  for(const width of [400,360]){const d=await employee(A,'見本 一郎',{width});await d.p.click('[data-stats-who="company"]');await d.p.waitForFunction(()=>!CN.ui.numBusy);
   assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width);
   if(width===400)await d.p.screenshot({path:path.join(root,'docs/preview/company-numbers-400.png')});}
  for(const d of all)assert.deepEqual(d.errors,[]);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
