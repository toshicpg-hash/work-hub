/* v1.50.0 予定の共有ボタンと、役割「経理」「業務管理」。
   Synthetic fixtures only (fictional names, example.com). In-memory Sheets and Calendar ACL; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const OWN='synthetic-calshare-sheet-00001',ME='mihon.ichiro@example.com';
const hook='window.CS={get db(){return DB},get ui(){return ui},get G(){return G},go,render,save,calShareTargets,calShareTargetsWrite,ADMIN_ACCOUNT,ACL_SCOPE,signIn(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const SHARE_COLS=['氏名','Gmail','役割'],REC_COLS=['Gmail','氏名','役割','結果','日時'];

/* ---- 役割と共有先の判定（ページのコードをそのまま読む） ---- */
function roleUnit(){
 const block=html.slice(html.indexOf('const ROLES='),html.indexOf('const gmLine='));
 const share=html.slice(html.indexOf('const mailOK='),html.indexOf('/* 社長の端末：有効な社員それぞれの記録シートに'));
 const ctx={};vm.createContext(ctx);vm.runInContext("const COMPANIES=['CP','CPY','AT'];const ADMIN_ACCOUNT='boss@example.com';const eq=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();"+block+share+';globalThis.T={canSee,canOrder,isViewer,roleLabel,calShareTargets,ROLES};',ctx);
 return ctx.T;
}
const staff=[
 {name:'見本 全社',email:'zensha@example.com',sheetId:'s-zen',company:'CP,CPY,AT',role:'全社',gmCo:'CP'},
 {name:'見本 GM',email:'gm-cpy@example.com',sheetId:'s-gm',company:'CPY',role:'GM',gmCo:'CPY'},
 {name:'見本 経理',email:'keiri@example.com',sheetId:'s-kei',company:'CP',role:'経理',gmCo:''},
 {name:'見本 業務',email:'gyomu@example.com',sheetId:'s-gyo',company:'AT',role:'業務管理',gmCo:''},
 {name:'見本 一郎',email:ME,sheetId:OWN,company:'CPY',role:'社員',gmCo:''},
 {name:'見本 二郎',email:'jiro@example.com',sheetId:'s-jiro',company:'AT',role:'社員',gmCo:''},
 {name:'見本 退職',email:'old@example.com',sheetId:'s-old',company:'CPY',role:'経理',gmCo:'',removed:true}];

async function main(){
 const T=roleUnit();
 await check('役割：経理・業務管理は全社と同じく3社すべての社員を見られる（見るだけ）。タスクリクエスト（指示箱）は全社とGMだけ',async()=>{
  assert.deepEqual([...T.ROLES],['社員','GM','全社','経理','業務管理']);
  const [zen,gm,kei,gyo,ichi,jiro]=staff;
  for(const v of [zen,kei,gyo])for(const s of [ichi,jiro,gm])assert.equal(T.canSee(v,s),true,v.role+'→'+s.name);
  assert.equal(T.canSee(kei,zen),true);assert.equal(T.canSee(kei,kei),false,'not self');
  assert.equal(T.canSee(gm,ichi),true);assert.equal(T.canSee(gm,jiro),false,'GM only its own single company');
  for(const s of [ichi,jiro])assert.equal(T.canOrder(kei,s),false),assert.equal(T.canOrder(gyo,s),false);
  assert.equal(T.canOrder(zen,ichi),true);assert.equal(T.canOrder(gm,ichi),true);assert.equal(T.canOrder(gm,jiro),false);
  assert.equal(T.isViewer({...kei,removed:true}),false);
  assert.equal(T.roleLabel(kei),'経理：3社すべて');assert.equal(T.roleLabel(gyo),'業務管理：3社すべて');assert.equal(T.roleLabel(gm),'GM（CPY）');
 });
 await check('共有先：社長・全社・経理・業務管理・その人を見られるGM。本人・共有を外した人・見られないGMは入らない',async()=>{
  const [zen,gm,kei,gyo,ichi,jiro]=staff,mails=s=>[...T.calShareTargets(s,staff).map(x=>x.email)];
  assert.deepEqual(mails(ichi),['boss@example.com','zensha@example.com','gm-cpy@example.com','keiri@example.com','gyomu@example.com']);
  assert.deepEqual(mails(jiro),['boss@example.com','zensha@example.com','keiri@example.com','gyomu@example.com'],'CPY GM does not get an AT employee');
  assert.deepEqual(mails(zen),['boss@example.com','keiri@example.com','gyomu@example.com'],'a 全社 person: GM cannot see them');
  assert.deepEqual(mails(kei),['boss@example.com','zensha@example.com','gyomu@example.com'],'not self');
  assert.ok(!mails(ichi).includes('old@example.com'),'removed person is not a target');
  assert.equal(T.calShareTargets({...ichi,removed:true},staff).length,0);
  assert.deepEqual([...T.calShareTargets(ichi,staff).map(x=>x.role)],['社長','全社・CP GM','GM（CPY）','経理：3社すべて','業務管理：3社すべて']);
 });

 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});

 /* 社員の端末。Sheets と Calendar ACL はメモリ上。grant は、Googleの許可画面で許可されるスコープを決める */
 async function device({targets=true,acl=[],grant='all',width=400,admin=false,staffRows=null}={}){
  const sheets={[OWN]:{'案件':[],'情報':[]}};
  if(targets)sheets[OWN]['予定の共有先']=[SHARE_COLS,['社長','boss@example.com','社長'],['見本 全社','zensha@example.com','全社'],['見本 GM','gm-cpy@example.com','GM（CPY）'],['見本 経理','keiri@example.com','経理：3社すべて']];
  for(const s of staffRows||[])sheets[s.sheetId]={'案件':[],'情報':[]};
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
   if(method==='GET'&&tail==='/values:batchGet'){const ts=u.searchParams.getAll('ranges').map(t=>t.replace(/^'|'$/g,''));if(ts.some(t=>!S[t]))return r.fulfill({status:400,body:'{}'});return json({valueRanges:ts.map(t=>({values:structuredClone(S[t])}))})}
   if(method==='POST'&&tail===':batchUpdate'){for(const q of body.requests)if(q.addSheet)S[q.addSheet.properties.title]=[];return json({})}
   const v=tail.match(/^\/values\/'([^']+)'(?:!A1)?(:clear)?$/);
   if(v&&S[v[1]]){if(method==='POST'&&v[2]){S[v[1]]=[];return json({})}if(method==='PUT'){S[v[1]]=structuredClone(body.values).filter(r=>r.some(x=>x!==''));return json({})}}
   return r.fulfill({status:400,body:'{}'});
  });
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CS);
  await p.evaluate(({OWN,grant,admin,staffRows})=>{
   /* Googleの許可画面の代わり。求められたスコープのうち、grant のぶんだけ許可したことにする */
   window.__asked=[];window.google={accounts:{oauth2:{initTokenClient:cfg=>({requestAccessToken(){window.__asked.push(cfg.scope);const sc=grant==='all'?cfg.scope:cfg.scope.split(' ').filter(x=>x!==CS.ACL_SCOPE).join(' ');setTimeout(()=>cfg.callback({access_token:'synthetic',expires_in:3600,scope:sc}),0)}})}}};
   const d=CS.db.settings.data;d.ob={legacy:true};
   if(admin){d.admin=true;d.listId='synthetic-list-0000000000001';d.staff=staffRows}else d.sheetId=OWN;
   CS.save();CS.go('stats');document.querySelectorAll('details[data-keep-open=calshare]').forEach(x=>x.open=true)},{OWN,grant,admin,staffRows});
  return {c,p,errors,calls,sheets,state};
 }
 const aclWrites=calls=>calls.filter(x=>x.method!=='GET');

 await check('押すとまず共有する相手（名前・Gmail・見るだけ）を出し、確かめるまでカレンダーには触らない。「やめる」でも触らない',async()=>{
  const {c,p,errors,calls}=await device();
  await p.click('[data-act=csload]');await p.waitForSelector('[data-act=csrun]');
  const t=await p.textContent('.cs-box');for(const s of ['次の人に、あなたの予定を共有します','社長','boss@example.com','見本 全社','zensha@example.com','見本 GM','見本 経理','経理：3社すべて','見るだけ'])assert.ok(t.includes(s),s);
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
  assert.deepEqual(sheets[OWN]['予定の共有先'],[SHARE_COLS,['社長',boss,'社長'],['見本 全社','zensha@example.com','全社・CP GM'],['見本 GM','gm-cpy@example.com','GM（CPY）'],['見本 経理','keiri@example.com','経理：3社すべて'],['見本 業務','gyomu@example.com','業務管理：3社すべて']]);
  /* 本人の端末の記録：一郎は全員済み＋前のGM（今は共有先ではない）、二郎はまだ */
  await p.evaluate(({OWN,boss})=>{const st=CS.db.settings.data.staff;CS.ui.corp={at:Date.now(),data:[
   {s:st.find(x=>x.sheetId===OWN),ok:true,cases:[],rc:[],todo:[],orders:[],calRec:[boss,'zensha@example.com','gm-cpy@example.com','keiri@example.com','gyomu@example.com','gm-old@example.com']},
   {s:st.find(x=>x.sheetId==='s-jiro'),ok:true,cases:[],rc:[],todo:[],orders:[],calRec:[boss,'zensha@example.com']},
   {s:st.find(x=>x.sheetId==='s-gm'),ok:true,cases:[],rc:[],todo:[],orders:[],calRec:null}]};CS.render();document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)},{OWN,boss});
  const row=name=>p.evaluate(name=>{const li=[...document.querySelectorAll('[data-fold=dataAdmin] li')].find(l=>l.querySelector('b')&&l.querySelector('b').textContent===name);return li?li.textContent:''},name);
  const a=await row('見本 一郎');assert.match(a,/予定の共有 済（5人）/);assert.match(a,/要確認（今の共有先ではない人に共有しています。外すかは確かめてから、本人のGoogleカレンダーの設定で）：gm-old@example.com/);
  assert.match(await row('見本 二郎'),/予定の共有 まだ：見本 経理・見本 業務/);
  assert.match(await row('見本 GM'),/予定の共有 まだHUBで共有していません/);
  assert.match(await row('見本 経理'),/経理：3社すべて/);
  assert.match(await row('見本 全社'),/予定の共有 未読込/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  /* 会社・役割の画面で「経理」「業務管理」を選べる */
  await p.click('[data-drole="2"]');const opts=await p.evaluate(()=>[...document.querySelectorAll('#dr_role option')].map(o=>o.textContent));assert.deepEqual(opts,['社員','GM','全社','経理','業務管理']);
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
