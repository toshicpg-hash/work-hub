/* v1.50.0 予定の共有ボタンと、役割「経理」「業務管理」。
   Synthetic fixtures only (fictional names, example.com). In-memory Sheets and Calendar ACL; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const OWN='synthetic-calshare-sheet-00001',ME='mihon.ichiro@example.com';
const hook='window.CS={get db(){return DB},get ui(){return ui},get G(){return G},go,render,save,calShareTargets,calShareTargetsWrite,ADMIN_ACCOUNT,ACL_SCOPE,corpRun,signIn(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const SHARE_COLS=['氏名','Gmail','役割'],REC_COLS=['Gmail','氏名','役割','結果','日時'];

/* ---- 役割と共有先の判定（ページのコードをそのまま読む） ---- */
function roleUnit(){
 const block=html.slice(html.indexOf('const ROLES='),html.indexOf('const gmLine='));
 const share=html.slice(html.indexOf('const mailOK='),html.indexOf('/* 社長の端末：有効な社員それぞれの記録シートに'));
 const ctx={};vm.createContext(ctx);vm.runInContext("const COMPANIES=['CP','CPY','AT'];const ADMIN_ACCOUNT='boss@example.com';const eq=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();"+block+share+';globalThis.T={canSee,canOrder,isViewer,roleLabel,calShareTargets,ROLES,chargeNorm};',ctx);
 return ctx.T;
}
const staff=[
 {name:'見本 全社',email:'zensha@example.com',sheetId:'s-zen',company:'CP,CPY,AT',role:'全社',gmCo:'CP'},
 {name:'見本 GM',email:'gm-cpy@example.com',sheetId:'s-gm',company:'CPY',role:'GM',gmCo:'CPY'},
 {name:'見本 経理',email:'keiri@example.com',sheetId:'s-kei',company:'CP',role:'経理',gmCo:'',charge:'CPY'},
 {name:'見本 業務',email:'gyomu@example.com',sheetId:'s-gyo',company:'AT',role:'業務管理',gmCo:'',charge:'CP,CPY,AT'},
 {name:'見本 一郎',email:ME,sheetId:OWN,company:'CPY',role:'社員',gmCo:''},
 {name:'見本 二郎',email:'jiro@example.com',sheetId:'s-jiro',company:'AT',role:'社員',gmCo:''},
 {name:'見本 退職',email:'old@example.com',sheetId:'s-old',company:'CPY',role:'経理',gmCo:'',charge:'CPY',removed:true}];

async function main(){
 const T=roleUnit();
 await check('役割：経理・業務管理は担当の会社の人だけ（GMも、所属のどれかが担当の会社なら複数会社の人も）。よその会社は見ない。GMからは今どおり複数会社の人は対象外。タスクリクエストは全社とGMだけ',async()=>{
  assert.deepEqual([...T.ROLES],['社員','GM','全社','経理','業務管理']);
  const [zen,gm,kei,gyo,ichi,jiro]=staff;
  assert.equal(T.canSee(kei,ichi),true);assert.equal(T.canSee(kei,gm),true,'the GM of the charged company');
  assert.equal(T.canSee(kei,jiro),false,'not another company');assert.equal(T.canSee(kei,gyo),false);
  /* 複数の会社に所属する人（専務）は、所属のどれかが担当の会社なら見える。GMからは今どおり対象外 */
  assert.equal(T.canSee(kei,zen),true,'charge CPY sees CP,CPY,AT');assert.equal(T.canSee({...kei,charge:'CP'},zen),true,'charge CP');assert.equal(T.canSee({...kei,charge:'AT'},zen),true,'charge AT only');
  assert.equal(T.canSee({...gyo,charge:'AT'},zen),true,'業務管理 AT only');assert.equal(T.canSee({...gyo,charge:'CP'},zen),true,'業務管理 CP');
  assert.equal(T.canSee(gm,zen),false,'GM: a multi-company person stays out');assert.equal(T.canSee({...gm,gmCo:'AT',company:'AT'},zen),false);
  assert.equal(T.canSee({...kei,charge:'CP'},{...zen,company:'CPY,AT'}),false,'no overlap → not seen');
  for(const s of [ichi,jiro,gm,kei])assert.equal(T.canSee(gyo,s),true,'業務管理 with all three companies → '+s.name);
  assert.equal(T.canSee({...gyo,charge:'AT'},ichi),false);assert.equal(T.canSee({...gyo,charge:'AT'},jiro),true);
  assert.equal(T.canSee(kei,kei),false,'not self');
  assert.equal(T.isViewer({...kei,charge:''}),false,'no charged company → not a viewer');assert.equal(T.isViewer({...kei,removed:true}),false);
  assert.equal(T.canSee(zen,jiro),true);assert.equal(T.canSee(gm,ichi),true);assert.equal(T.canSee(gm,jiro),false,'GM only its own single company');
  for(const s of [ichi,jiro])assert.equal(T.canOrder(kei,s),false),assert.equal(T.canOrder(gyo,s),false);
  assert.equal(T.canOrder(zen,ichi),true);assert.equal(T.canOrder(gm,ichi),true);assert.equal(T.canOrder(gm,jiro),false);
  assert.equal(T.roleLabel(kei),'経理：CPY');assert.equal(T.roleLabel({...kei,charge:'CP,CPY'}),'経理：CP・CPY');assert.equal(T.roleLabel(gyo),'業務管理：3社すべて');assert.equal(T.roleLabel(gm),'GM（CPY）');
  assert.equal(T.chargeNorm('CPY、CP,XX'),'CP,CPY','normalized to the known companies in order');
 });
 await check('共有先：社長・全社・その人を見られるGM・担当の会社の経理と業務管理。本人・共有を外した人・よその会社の人は入らない',async()=>{
  const [zen,gm,kei,gyo,ichi,jiro]=staff,mails=s=>[...T.calShareTargets(s,staff).map(x=>x.email)];
  assert.deepEqual(mails(ichi),['boss@example.com','zensha@example.com','gm-cpy@example.com','keiri@example.com','gyomu@example.com']);
  assert.deepEqual(mails(jiro),['boss@example.com','zensha@example.com','gyomu@example.com'],'the CPY GM and the CPY 経理 do not get an AT employee');
  assert.deepEqual(mails(gm),['boss@example.com','zensha@example.com','keiri@example.com','gyomu@example.com']);
  assert.deepEqual(mails(zen),['boss@example.com','keiri@example.com','gyomu@example.com'],'a multi-company 全社 person: 経理・業務管理 with an overlapping charge, not the GM');
  assert.ok(!mails(ichi).includes('old@example.com'),'removed person is not a target');
  assert.equal(T.calShareTargets({...ichi,removed:true},staff).length,0);
  assert.deepEqual([...T.calShareTargets(ichi,staff).map(x=>x.role)],['社長','全社・CP GM','GM（CPY）','経理：CPY','業務管理：3社すべて']);
 });
 await check('領収書：業務管理は、ほかの人の立替・領収書を見ない。経理は担当の会社の人の分だけ',async()=>{
  const R=require(path.join(root,'shared-receipts.js'));
  const data=staff.filter(s=>!s.removed).map(s=>({s,ok:true,rc:[],receiptRead:{state:'ready'}}));
  const ids=email=>R.authorized({admin:false,viewList:staff,email},data).map(x=>x.s.sheetId);
  assert.deepEqual(ids('gyomu@example.com'),[],'業務管理');
  assert.deepEqual(ids('keiri@example.com'),['s-zen','s-gm','s-kei',OWN],'経理: own + people in CPY (the multi-company person too)');
  assert.deepEqual(ids('zensha@example.com'),staff.filter(s=>!s.removed).map(s=>s.sheetId),'全社 unchanged');
  assert.deepEqual(ids(ME),[],'一般社員 unchanged');
 });

 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});

 /* 社員の端末。Sheets と Calendar ACL はメモリ上。grant は、Googleの許可画面で許可されるスコープを決める */
 async function device({targets=true,acl=[],grant='all',width=400,admin=false,staffRows=null,extraSheets={},viewer=null}={}){
  const sheets={[OWN]:{'案件':[],'情報':[]}};
  if(targets)sheets[OWN]['予定の共有先']=[SHARE_COLS,['社長','boss@example.com','社長'],['見本 全社','zensha@example.com','全社'],['見本 GM','gm-cpy@example.com','GM（CPY）'],['見本 経理','keiri@example.com','経理：CPY']];
  for(const s of staffRows||[])sheets[s.sheetId]={'案件':[],'情報':[]};Object.assign(sheets,structuredClone(extraSheets));const reads=[];
  const calls=[],state={acl:structuredClone(acl)};
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
  await c.route('**/*',async r=>{const u=new URL(r.request().url()),method=r.request().method();const json=b=>r.fulfill({contentType:'application/json',body:JSON.stringify(b)});
   if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:html.replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
   if(u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/calendar/v3/')){
    const body=method==='GET'?null:r.request().postDataJSON();calls.push({method,path:u.pathname,query:u.search,body});
    if(u.pathname!=='/calendar/v3/calendars/primary/acl')return r.fulfill({status:400,body:'{}'});
    if(method==='GET')return json({items:structuredClone(state.acl)});
    if(method==='POST'){if(body.scope.value==='fail@example.com')return r.fulfill({status:403,contentType:'application/json',body:'{}'});const old=state.acl.find(a=>a.scope.value===body.scope.value);if(old)old.role=body.role;else state.acl.push({role:body.role,scope:body.scope});return json({role:body.role,scope:body.scope})}
    return r.fulfill({status:405,body:'{}'});
   }
   if(u.hostname!=='sheets.googleapis.com')return r.fulfill({status:200,contentType:'application/json',body:'{}'});
   const m=u.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),id=m&&m[1],tail=decodeURIComponent(m&&m[2]||''),S=sheets[id];
   if(!S)return r.fulfill({status:404,body:'{}'});
   const body=method==='GET'?null:r.request().postDataJSON();
   if(method==='GET'&&!tail)return json({sheets:Object.keys(S).map((title,sheetId)=>({properties:{title,sheetId}}))});
   if(method==='GET'&&tail==='/values:batchGet'){const ts=u.searchParams.getAll('ranges').map(t=>t.replace(/^'|'$/g,''));reads.push(...ts.map(t=>id+'|'+t));if(ts.some(t=>!S[t]))return r.fulfill({status:400,body:'{}'});return json({valueRanges:ts.map(t=>({values:structuredClone(S[t])}))})}
   if(method==='POST'&&tail===':batchUpdate'){for(const q of body.requests)if(q.addSheet)S[q.addSheet.properties.title]=[];return json({})}
   const v=tail.match(/^\/values\/'([^']+)'(?:!A1)?(:clear)?$/);
   if(v&&S[v[1]]){if(method==='POST'&&v[2]){S[v[1]]=[];return json({})}if(method==='PUT'){S[v[1]]=structuredClone(body.values).filter(r=>r.some(x=>x!==''));return json({})}}
   return r.fulfill({status:400,body:'{}'});
  });
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CS);
  await p.evaluate(({OWN,grant,admin,staffRows,viewer})=>{
   /* Googleの許可画面の代わり。求められたスコープのうち、grant のぶんだけ許可したことにする */
   window.__asked=[];window.google={accounts:{oauth2:{initTokenClient:cfg=>({requestAccessToken(){window.__asked.push(cfg.scope);const sc=grant==='all'?cfg.scope:cfg.scope.split(' ').filter(x=>x!==CS.ACL_SCOPE).join(' ');setTimeout(()=>cfg.callback({access_token:'synthetic',expires_in:3600,scope:sc}),0)}})}}};
   const d=CS.db.settings.data;d.ob={legacy:true};
   if(admin){d.admin=true;d.listId='synthetic-list-0000000000001';d.staff=staffRows}else d.sheetId=viewer?viewer.sheetId:OWN;if(viewer){d.viewListId='synthetic-view-list-000000001';d.viewEmail=viewer.email}
   CS.save();CS.go('stats');document.querySelectorAll('details[data-keep-open=calshare]').forEach(x=>x.open=true)},{OWN,grant,admin,staffRows,viewer});
  return {c,p,errors,calls,sheets,state,reads};
 }
 const aclWrites=calls=>calls.filter(x=>x.method!=='GET');

 await check('押すとまず共有する相手（名前・Gmail・見るだけ）を出し、確かめるまでカレンダーには触らない。「やめる」でも触らない',async()=>{
  const {c,p,errors,calls}=await device();
  await p.click('[data-act=csload]');await p.waitForSelector('[data-act=csrun]');
  const t=await p.textContent('.cs-box');for(const s of ['次の人に、あなたの予定を共有します','社長','boss@example.com','見本 全社','zensha@example.com','見本 GM','見本 経理','経理：CPY','見るだけ'])assert.ok(t.includes(s),s);
  assert.deepEqual(calls,[],'no calendar request before confirming');
  assert.ok(!(await p.evaluate(()=>window.__asked)).some(s=>s.includes('calendar.acls')),'the share permission is not asked yet');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.locator('details[data-keep-open=calshare]').screenshot({path:path.join(root,'docs/preview/calendar-share-confirm-400.png')});
  await p.click('[data-act=cscancel]');assert.deepEqual(calls,[]);assert.equal(await p.locator('[data-act=csrun]').count(),0);
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('「この人たちに共有する」：メインのカレンダーだけに、足りない相手だけ reader で足す。すでに reader 以上なら何もしない。権限は下げない',async()=>{
  const acl=[{role:'owner',scope:{type:'user',value:ME}},{role:'writer',scope:{type:'user',value:'boss@example.com'}},{role:'reader',scope:{type:'user',value:'zensha@example.com'}},{role:'freeBusyReader',scope:{type:'user',value:'gm-cpy@example.com'}},{role:'reader',scope:{type:'user',value:'family@example.com'}}];
  const {c,p,errors,calls,sheets,state}=await device({acl});
  await p.click('[data-act=csload]');await p.waitForSelector('[data-act=csrun]');await p.click('[data-act=csrun]');await p.waitForSelector('.cs-list[role=status]');
  assert.ok((await p.evaluate(()=>window.__asked)).some(s=>s.includes('https://www.googleapis.com/auth/calendar.acls')),'asked for calendar.acls only now');
  const w=aclWrites(calls);
  assert.deepEqual(w.map(x=>x.body.scope.value),['gm-cpy@example.com','keiri@example.com'],'only the missing ones (freeBusyReader is raised to reader)');
  for(const x of w){assert.equal(x.method,'POST');assert.equal(x.path,'/calendar/v3/calendars/primary/acl');assert.match(x.query,/sendNotifications=true/);assert.deepEqual(x.body,{role:'reader',scope:{type:'user',value:x.body.scope.value}})}
  assert.ok(calls.every(x=>x.path==='/calendar/v3/calendars/primary/acl'),'no other calendar');
  const role=e=>state.acl.find(a=>a.scope.value===e).role;
  assert.equal(role('boss@example.com'),'writer','not lowered');assert.equal(role(ME),'owner');assert.equal(role('family@example.com'),'reader','other shares untouched');
  const t=await p.textContent('.cs-box');assert.match(t,/社長：共有済み/);assert.match(t,/見本 全社：共有済み/);assert.match(t,/見本 GM：共有した/);assert.match(t,/見本 経理：共有した/);
  assert.match(t,/共有された人の側でも、Googleカレンダーにあなたのカレンダーを追加し/);
  const rec=sheets[OWN]['予定の共有の記録'];assert.deepEqual(rec[0],REC_COLS);
  assert.deepEqual(rec.slice(1).map(r=>[r[0],r[3]]),[['boss@example.com','共有済み'],['zensha@example.com','共有済み'],['gm-cpy@example.com','共有した'],['keiri@example.com','共有した']]);
  assert.ok(!rec.some(r=>r[0]==='family@example.com'),'shares HUB does not manage are not written to the record sheet');
  const saved=await p.evaluate(()=>CS.db.settings.data.calShare);assert.equal(saved.results.length,4);assert.ok(saved.at);
  /* もう一度押すと、足りない相手がいないので何も書かない */
  calls.length=0;await p.click('[data-act=cscancel]');await p.click('[data-act=csload]');await p.waitForSelector('[data-act=csrun]');await p.click('[data-act=csrun]');await p.waitForSelector('.cs-list[role=status]');
  assert.deepEqual(aclWrites(calls),[],'nothing added the second time');assert.doesNotMatch(await p.textContent('.cs-box'),/共有した/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.locator('details[data-keep-open=calshare]').screenshot({path:path.join(root,'docs/preview/calendar-share-done-400.png')});
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('共有の許可を断ったときは共有せず、理由とブラウザでのやり方を出す',async()=>{
  const {c,p,errors,calls,sheets}=await device({grant:'noacl'});
  await p.click('[data-act=csload]');await p.waitForSelector('[data-act=csrun]');await p.click('[data-act=csrun]');await p.waitForSelector('.cs-box [role=alert]');
  assert.match(await p.textContent('.cs-box'),/Googleカレンダーの共有の許可が出ませんでした。共有していません/);
  assert.deepEqual(calls,[],'no calendar request');assert.equal(sheets[OWN]['予定の共有の記録'],undefined);
  assert.equal(await p.evaluate(()=>!!document.querySelector('details[data-keep-open=calshare] .cs-manual').open),true,'browser steps are opened');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('共有先がまだ書かれていない・1人だけ失敗したときは、そう出す（ほかの人には共有する）',async()=>{
  const a=await device({targets:false});await a.p.click('[data-act=csload]');await a.p.waitForSelector('.cs-box [role=alert]');
  assert.match(await a.p.textContent('.cs-box'),/社長の端末で、あなたの予定の共有先がまだ決まっていません/);assert.deepEqual(a.calls,[]);await a.c.close();
  const b=await device();b.sheets[OWN]['予定の共有先'].push(['見本 失敗','fail@example.com','全社']);
  await b.p.click('[data-act=csload]');await b.p.waitForSelector('[data-act=csrun]');await b.p.click('[data-act=csrun]');await b.p.waitForSelector('.cs-list[role=status]');
  const t=await b.p.textContent('.cs-box');assert.match(t,/見本 失敗：失敗（権限がありません）/);assert.match(t,/見本 経理：共有した/);
  assert.ok(!b.sheets[OWN]['予定の共有の記録'].some(r=>r[0]==='fail@example.com'),'a failed share is not recorded');
  assert.deepEqual(b.errors,[]);await b.c.close();
 });
 await check('社長の端末には共有ボタンを出さない',async()=>{
  const {c,p,errors}=await device({admin:true,staffRows:[]});assert.equal(await p.locator('[data-act=csload]').count(),0);assert.deepEqual(errors,[]);await c.close();
 });
 await check('社長の端末：各社員の記録シートに「予定の共有先」を書く。社員一覧に、済・まだ・要確認（今の共有先ではない人。自動では外さない）を出す',async()=>{
  const rows=staff.map(s=>({...s,addedAt:'2026-11-01',lastSync:''}));
  const {c,p,errors,sheets}=await device({admin:true,staffRows:rows});
  await p.evaluate(()=>CS.signIn());
  const n=await p.evaluate(()=>CS.calShareTargetsWrite(CS.db.settings.data.staff));assert.equal(n,6,'active staff only');
  assert.equal(sheets['s-old']['予定の共有先'],undefined,'not for a removed person');
  const boss=await p.evaluate(()=>CS.ADMIN_ACCOUNT);
  assert.deepEqual(sheets[OWN]['予定の共有先'],[SHARE_COLS,['社長',boss,'社長'],['見本 全社','zensha@example.com','全社・CP GM'],['見本 GM','gm-cpy@example.com','GM（CPY）'],['見本 経理','keiri@example.com','経理：CPY'],['見本 業務','gyomu@example.com','業務管理：3社すべて']]);
  /* 本人の端末の記録：一郎は全員済み＋前のGM（今は共有先ではない）、二郎はまだ */
  await p.evaluate(({OWN,boss})=>{const st=CS.db.settings.data.staff;CS.ui.corp={at:Date.now(),data:[
   {s:st.find(x=>x.sheetId===OWN),ok:true,cases:[],rc:[],todo:[],orders:[],calRec:[boss,'zensha@example.com','gm-cpy@example.com','keiri@example.com','gyomu@example.com','gm-old@example.com']},
   {s:st.find(x=>x.sheetId==='s-jiro'),ok:true,cases:[],rc:[],todo:[],orders:[],calRec:[boss,'zensha@example.com']},
   {s:st.find(x=>x.sheetId==='s-gm'),ok:true,cases:[],rc:[],todo:[],orders:[],calRec:null}]};CS.render();document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)},{OWN,boss});
  const row=name=>p.evaluate(name=>{const li=[...document.querySelectorAll('[data-fold=dataAdmin] li')].find(l=>l.querySelector('b')&&l.querySelector('b').textContent===name);return li?li.textContent:''},name);
  const a=await row('見本 一郎');assert.match(a,/予定の共有 済（5人）/);assert.match(a,/要確認（今の共有先ではない人に共有しています。外すかは確かめてから、本人のGoogleカレンダーの設定で）：gm-old@example.com/);
  assert.match(await row('見本 二郎'),/予定の共有 まだ：見本 業務/);
  assert.match(await row('見本 GM'),/予定の共有 まだHUBで共有していません/);
  assert.match(await row('見本 経理'),/経理：CPY/);
  assert.match(await row('見本 全社'),/予定の共有 未読込/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  /* 会社・役割の画面で「経理」「業務管理」を選べる */
  await p.click('[data-drole="2"]');const opts=await p.evaluate(()=>[...document.querySelectorAll('#dr_role option')].map(o=>o.textContent));assert.deepEqual(opts,['社員','GM','全社','経理','業務管理']);
  for(const co of ['CP','CPY','AT'])assert.ok(await p.locator('#dr_ch_'+co).count(),'担当の会社 '+co);
  assert.equal(await p.isChecked('#dr_ch_CPY'),true,'the saved charge is shown');assert.equal(await p.isChecked('#dr_ch_CP'),false);
  await p.uncheck('#dr_ch_CPY');await p.click('[data-act=droledo]');assert.match(await p.textContent('main'),/担当の会社を選んでください/);
  assert.equal(await p.evaluate(()=>CS.db.settings.data.staff[2].charge),'CPY','nothing saved');
  assert.deepEqual(errors,[]);await c.close();
 });

 await check('業務管理の端末：会社の動き・案件は読むが、ほかの人の立替・領収書は読まず、領収書の画面にも出ない。経理の端末には担当の会社の人の分が出る',async()=>{
  const VIEW=['氏名','Gmail','会社','役割','GMの会社','シートID','指示箱ID','担当の会社'];
  const CASE=['受付ID','受付日','会社','依頼主','物件','部屋','症状','担当'],RC=['受付ID','日付','支払先','内容','区分','金額','会社','現場','仕事番号','状態','精算書番号','写真リンク','支払い方法','提出者'];
  const list=[VIEW,...staff.filter(x=>!x.removed).map(x=>[x.name,x.email,x.company,x.role,x.gmCo,x.sheetId,'',x.charge||''])];
  const rec=(n,co)=>({'案件':[CASE,['R'+n,'2026-11-01',co,'見本の依頼主','見本の物件','101','見本の症状','見本']],'入金':[],'立替':[RC,['L'+n,'2026-11-01','見本の店'+n,'見本の品','材料',1000,co,'','','未提出','','','立替','見本']],'情報':[['項目','値'],['最終同期','2026-11-03 09:00']]});
  const extra={'synthetic-view-list-000000001':{'一覧':list}};for(const x of staff.filter(x=>!x.removed))extra[x.sheetId]=rec(x.sheetId.slice(-3),coOf(x));
  extra['s-zen']['立替'].push(['Lzen2','2026-11-02','見本の店zenCPY','見本の品','材料',2000,'CPY','','','未提出','','','立替','見本'],['Lzen3','2026-11-02','見本の店zenAT','見本の品','材料',3000,'AT','','','未提出','','','立替','見本']);
  function coOf(x){return x.company.split(',')[0]}
  for(const [who,email,sheetId] of [['業務管理','gyomu@example.com','s-gyo'],['経理','keiri@example.com','s-kei']]){
   const d=await device({viewer:{email,sheetId},extraSheets:extra});
   await d.p.evaluate(async()=>{await CS.corpRun();CS.render()});
   const rcReads=d.reads.filter(r=>r.endsWith('|立替')).map(r=>r.split('|')[0]);
   const data=await d.p.evaluate(()=>CS.ui.corp.data.map(x=>({id:x.s.sheetId,cases:x.cases.length,rc:x.rc.length})));
   await d.p.evaluate(()=>CS.go('rcpt'));if(await d.p.locator('main [data-scope-person]').count())await d.p.selectOption('main [data-scope-person]','all');const t=await d.p.textContent('main');
   if(who==='業務管理'){
    assert.deepEqual(rcReads,['s-gyo'],'業務管理 reads only its own 立替 tab');
    assert.ok(data.length>=4&&data.filter(x=>x.id!=='s-gyo').every(x=>x.rc===0),JSON.stringify(data));assert.ok(data.some(x=>x.id==='s-zen'),'the multi-company person is in its range');assert.ok(data.filter(x=>x.id!=='s-gyo').every(x=>x.cases===1),'cases are read');
    for(const n of ['見本の店zen','見本の店-gm','見本の店kei','見本の店001','見本の店iro'])assert.ok(!t.includes(n),n);
    assert.doesNotMatch(t,/見本 一郎さん（見るだけ）|見本 二郎さん（見るだけ）/);
   }else{
    assert.deepEqual(data.map(x=>x.id).sort(),['s-zen','s-gm','s-kei',OWN].sort(),'経理 CPY: own + the CPY people + the multi-company person');
    const zen=await d.p.evaluate(()=>CS.ui.corp.data.find(x=>x.s.sheetId==='s-zen').rc.map(r=>r['会社']));assert.deepEqual(zen,['CPY'],'only the receipts for the charged company');
    assert.match(t,/見本 一郎さん（見るだけ）/);assert.doesNotMatch(t,/見本 二郎さん/);
   }
   assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(d.errors,[]);await d.c.close();
  }
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
