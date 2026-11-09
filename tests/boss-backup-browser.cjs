/* v1.50.35 社長の端末の控え：端末ごとの控えシートに同期のたびに控え、端末の記録が消えたら控えから戻せること。
   Synthetic fixtures only (fictional names, example.com). In-memory Google; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),ADMIN='toshi.cpg@gmail.com',KEY='workhub_proto_v1';
const hook='window.BB={get db(){return DB},get ui(){return ui},go,render,save,CASE_DEFAULTS,bbWrite,bbPack,bbUnpack,'+
 'mock(){gLoadCalendarsRun=async()=>{G.cals=[];return G.cals};gReadRange=async()=>({events:[],calendars:[],missing:0});gKeepSave=()=>{};corpRun=async()=>[]}};';
const GIS="window.google={accounts:{oauth2:{initTokenClient(cfg){return {requestAccessToken(){setTimeout(()=>cfg.callback({access_token:'tok:'+window.__acct,expires_in:3600,scope:cfg.scope}),5)}}}}}};";
const G={files:{},n:0,calls:[]};
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
async function google(r){
 const req=r.request(),u=new URL(req.url()),acct=(req.headers()['authorization']||'').replace('Bearer tok:',''),m=req.method(),p=decodeURIComponent(u.pathname);
 const J=(o,st=200)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)});G.calls.push([acct,m,p]);
 if(p==='/drive/v3/about')return J({user:{emailAddress:acct}});
 if(p==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q')||'',eqn=(q.match(/name='([^']*)'/)||[])[1],cn=(q.match(/name contains '([^']*)'/)||[])[1];
  return J({files:Object.values(G.files).filter(f=>f.owner===acct&&(!eqn||f.name===eqn)&&(!cn||f.name.includes(cn))).map(f=>({id:f.id,name:f.name,createdTime:f.created}))})}
 if(p==='/drive/v3/files'&&m==='POST'){const b=req.postDataJSON(),id='bbsheet'+String(++G.n).padStart(20,'0');G.files[id]={id,name:b.name,owner:acct,created:new Date(Date.UTC(2026,10,1)+G.n*1000).toISOString(),perms:[],tabs:[{title:'シート1',sheetId:0,rows:[]}]};return J({id,name:b.name})}
 let mm=p.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/);
 if(mm){const f=G.files[mm[1]];if(!f||f.owner!==acct)return J({},403);return J({permissions:[{id:'owner',emailAddress:f.owner,role:'owner',type:'user'}].concat(f.perms)})}
 mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
 if(mm){const f=G.files[mm[1]],rest=mm[2];if(!f||f.owner!==acct)return J({},403);
  if(m==='GET'&&!rest)return J({sheets:f.tabs.map(t=>({properties:{title:t.title,sheetId:t.sheetId,gridProperties:{rowCount:1000,columnCount:26}}}))});
  if(rest==='/values:batchGet'){const ts=u.searchParams.getAll('ranges').map(x=>f.tabs.find(t=>t.title===tabName(x)));if(ts.some(t=>!t))return J({},400);return J({valueRanges:ts.map(t=>({values:structuredClone(t.rows)}))})}
  if(rest===':batchUpdate'){for(const q of req.postDataJSON().requests){if(q.addSheet)f.tabs.push({title:q.addSheet.properties.title,sheetId:f.tabs.length+1,rows:[]});if(q.updateSheetProperties){const t=f.tabs.find(x=>x.sheetId===q.updateSheetProperties.properties.sheetId);t.title=q.updateSheetProperties.properties.title}}return J({})}
  const vm=rest.match(/^\/values\/(.+?)(:clear)?$/);
  if(vm){const t=f.tabs.find(x=>x.title===tabName(vm[1]));if(!t)return J({},400);if(vm[2]){t.rows=[];return J({})}if(m==='PUT'){t.rows=structuredClone(req.postDataJSON().values).map(r=>{while(r.length&&r[r.length-1]==='')r.pop();return r}).filter((r,i,a)=>r.length||a.slice(i).some(x=>x.length));while(t.rows.length&&!t.rows[t.rows.length-1].length)t.rows.pop();return J({})}}
 }
 return J({},404);
}
async function device(width,init){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u.startsWith(origin+'/')){const pn=new URL(u).pathname;if(pn==='/'||pn==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.startsWith('https://accounts.google.com/gsi/client'))return r.fulfill({contentType:'application/javascript',body:GIS});
  if(/https:\/\/(www|sheets)\.googleapis\.com\//.test(u))return google(r);
  return r.fulfill({status:200,body:''})});
 await c.addInitScript(a=>{window.__acct=a},ADMIN);
 if(init)await c.addInitScript(init);
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-09T03:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.BB&&window.google&&google.accounts);await p.evaluate(()=>BB.mock());
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,details,.banner')].map(x=>x.scrollWidth-x.clientWidth))});
const sync=async p=>{await p.evaluate(()=>{BB.ui.gsync=null;BB.go('home')});await p.click('[data-act=gsync]');await p.waitForFunction(()=>BB.ui.gsync&&!BB.ui.gsync.busy&&BB.ui.gsync.rows.some(x=>x.name==='この端末の控え'));return p.evaluate(()=>BB.ui.gsync.rows)};
const openAdmin=async p=>{await p.evaluate(()=>{BB.go('stats');document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});await p.waitForSelector('#boss-backup')};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [400,360]){
  G.files={};G.n=0;
  const A=await device(width);let fileId;
  await A.p.evaluate(()=>{const d=BB.db.settings.data;d.admin=true;d.ob={legacy:true};
   for(let i=1;i<=5;i++)BB.db.cases.push({...BB.CASE_DEFAULTS(),id:'SYN-'+i,type:'reno',stage:'new',property:'見本ハイツ'+i,room:'10'+i,tantou:'見本',client:'見本管理（架空）',clientKind:'管理会社',receivedAt:'2026-11-0'+i,createdAt:'2026-11-0'+i+'T00:00:00Z'});BB.save();BB.render()});
  await check('社長の端末で控えがないと、同期の結果に「この端末の控え：まだ作っていません」と出る。数字→管理に作る欄がある '+width+'px',async()=>{
   const rows=await sync(A.p);const s=rows.find(x=>x.name==='この端末の控え');assert.ok(s&&!s.ok);assert.match(s.msg,/まだ作っていません。.*数字 → 管理（社長用）の「この端末の控え」/);
   assert.match(await A.p.textContent('#home-sync'),/この端末の控え：まだ作っていません/);assert.equal(await A.p.locator('main').evaluate(e=>e.firstElementChild.id),'home-sync');
   await openAdmin(A.p);assert.match(await A.p.textContent('#boss-backup'),/この端末の控えがまだありません/);
   assert.ok(await overflow(A.p)<=0,'overflow '+await overflow(A.p));
  });
  await check('名前を入れて「控えを作る」：マイドライブに「CPG HUB_社長の控え_名前」ができ、この端末の記録がそのまま入る（読み戻しで同じ） '+width+'px',async()=>{
   await openAdmin(A.p);await A.p.click('[data-act=bbcreate]');await A.p.waitForFunction(()=>!BB.ui.bbBusy);assert.match(await A.p.textContent('#boss-backup'),/この端末の名前を入れてください/);
   await A.p.fill('#bb_name','Fold8');await A.p.click('[data-act=bbcreate]');await A.p.waitForFunction(()=>!BB.ui.bbBusy);
   assert.match(await A.p.textContent('#boss-backup'),/控えを作りました（案件5件/);
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_社長の控え_Fold8');assert.ok(f);fileId=f.id;
   const local=await A.p.evaluate(K=>localStorage.getItem(K),KEY);const back=await A.p.evaluate(rows=>JSON.stringify(BB.bbUnpack(rows)),f.tabs.find(t=>t.title==='控え').rows);
   assert.deepEqual(JSON.parse(back).cases,JSON.parse(local).cases,'the backup holds this device\'s cases as they are');assert.deepEqual(JSON.parse(back).settings.data.staff,JSON.parse(local).settings.data.staff);assert.equal(JSON.parse(back).cases.length,5);
   assert.deepEqual(f.tabs.find(t=>t.title==='情報').rows.slice(1).map(r=>r[0]),['端末','保存日時','版','案件','立替','ToDo']);
   await A.p.click('[data-act=bbcreate]').catch(()=>{});/* already set: the create button is gone */
   assert.equal(await A.p.$$eval('[data-act=bbcreate]',a=>a.length),0);
  });
  await check('同期のたびに控える：案件を足して同期すると控えも増える。大きな記録は分けて入れても元どおり '+width+'px',async()=>{
   await A.p.evaluate(()=>{BB.db.cases.push({...BB.CASE_DEFAULTS(),id:'SYN-6',type:'reno',stage:'new',property:'見本ハイツ6',room:'106',tantou:'見本',client:'見本管理（架空）',clientKind:'管理会社',note:'メモ'.repeat(30000)});BB.save()});
   const rows=await sync(A.p);const s=rows.find(x=>x.name==='この端末の控え');assert.ok(s&&s.ok,JSON.stringify(rows));assert.match(s.msg,/案件6件/);
   const f=G.files[fileId],t=f.tabs.find(x=>x.title==='控え');assert.ok(t.rows.length>=3,'split into chunks: '+t.rows.length);
   assert.equal(await A.p.evaluate(rows=>BB.bbUnpack(rows).cases.length,t.rows),6);
  });
  await check('控えのファイルがだれかと共有されていたら、控えを書かずに止める '+width+'px',async()=>{
   G.files[fileId].perms.push({id:'p9',emailAddress:'someone@example.com',role:'reader',type:'user'});
   const rows=await sync(A.p);const s=rows.find(x=>x.name==='この端末の控え');assert.ok(s&&!s.ok);assert.match(s.msg,/共有されています（someone@example\.com）/);
   G.files[fileId].perms=[];
  });
  await A.c.close();
  /* 端末のデータが消えた：同じ社長のアカウントで、新しい（空の）端末 */
  const B=await device(width);
  await check('データが消えた端末：管理をはじめたあと「前の控えから戻す」で一覧から選び、確認して置き換えると記録が戻る。戻す前の記録は残す '+width+'px',async()=>{
   await B.p.evaluate(()=>{const d=BB.db.settings.data;d.admin=true;d.ob={legacy:true};BB.db.cases.push({...BB.CASE_DEFAULTS(),id:'NEW-1',type:'reno',stage:'new',property:'新しい見本',room:'1',tantou:'見本',client:'見本（架空）',clientKind:'管理会社'});BB.save()});
   await openAdmin(B.p);await B.p.click('[data-act=bblist]');await B.p.waitForFunction(()=>!BB.ui.bbBusy);
   const t=await B.p.textContent('#boss-backup');assert.match(t,/Fold8/);assert.match(t,/案件6件/);
   await B.p.click('[data-bbrestore="'+fileId+'"]');assert.match(await B.p.textContent('#boss-backup'),/置き換えます。今の記録（案件1件/);
   await B.p.click('[data-act=bbrestorecancel]');assert.equal(await B.p.evaluate(()=>BB.db.cases.length),1,'cancel changes nothing');
   await B.p.click('[data-bbrestore="'+fileId+'"]');await B.p.click('[data-act=bbrestoredo]');await B.p.waitForFunction(()=>!BB.ui.bbBusy);
   assert.match(await B.p.textContent('#boss-backup'),/「Fold8」の控えから戻しました（案件6件/);
   assert.equal(await B.p.evaluate(()=>BB.db.cases.length),6);assert.equal(await B.p.evaluate(()=>BB.db.settings.data.bossBackup.id),fileId);
   const kept=await B.p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('workhub_proto_v1_before_restore:')).map(k=>JSON.parse(localStorage.getItem(k)).cases.length));assert.deepEqual(kept,[1]);
   await B.p.reload();await B.p.waitForFunction(()=>!!window.BB);assert.equal(await B.p.evaluate(()=>BB.db.cases.length),6,'kept after reload');
   assert.ok(await overflow(B.p)<=0);
  });
  await check('記録がずっと少ない端末（消えた直後など）からは、控えを上書きしない '+width+'px',async()=>{
   await B.p.evaluate(()=>BB.mock());await B.p.evaluate(()=>{BB.db.cases.splice(0,5);BB.save()});
   const before=JSON.stringify(G.files[fileId].tabs);const rows=await sync(B.p);const s=rows.find(x=>x.name==='この端末の控え');
   assert.ok(s&&!s.ok);assert.match(s.msg,/ずっと少ないため、控えを上書きしませんでした/);assert.equal(JSON.stringify(G.files[fileId].tabs),before);
   assert.deepEqual(A.errors.concat(B.errors),[]);
  });
  await B.c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
