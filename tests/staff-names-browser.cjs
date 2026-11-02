/* 指示箱（v1.47.0）: synthetic accounts and an in-memory Google (Drive files and permissions, Sheets tabs and values).
   Fictional names and example.com addresses only. No live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.RB={get db(){return DB},ui,go,render,roBuild,adminAdd,adminRoleSave,adminRemove,corpRun,boxState,corpKeepSave,permList,adminNameSave,adminSync,namesRead,save,personLabel,tantouLabel,tantouOptsHtml,CASE_DEFAULTS,dataSync,gAuthorize,viewerConnect,namesCopyConfirmed,namesAppend,tantouOptions,personOf,personBadge,CPGNames};';
const ADMIN='toshi.cpg@gmail.com',SA='test-staff-a@example.com',SB='test-staff-b@example.com',GM='test-gm-cpy@example.com',ZEN='test-zensha@example.com';
const TODAY='2026-10-30';
/* ---- in-memory Google ---- */
const G={files:{},n:0,perm:0,calls:[]};
const nid=p=>p+String(++G.n).padStart(24,'0');
const roleOf=(f,a)=>!f?'':f.owner===a?'owner':((f.perms.find(p=>p.email===a)||{}).role||'');
const canRead=(f,a)=>!!roleOf(f,a);
const canWrite=(f,a)=>['owner','writer'].includes(roleOf(f,a));
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
const cellsOf=r=>{const a=(r.split('!')[1]||'A1').match(/^([A-Z])(\d+)/);return {c:a[1].charCodeAt(0)-65,r:Number(a[2])-1}};
function put(t,range,values){const {c,r}=cellsOf(range);values.forEach((row,i)=>{while(t.rows.length<=r+i)t.rows.push([]);row.forEach((v,j)=>{const R=t.rows[r+i];while(R.length<c+j)R.push('');R[c+j]=v})})}
async function google(route){
 const req=route.request(),u=new URL(req.url()),acct=(req.headers()['authorization']||'').replace('Bearer tok:',''),m=req.method(),p=decodeURIComponent(u.pathname);
 const J=(o,st=200)=>route.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 const no=st=>J({error:{code:st}},st);
 if(m==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 G.calls.push([acct,m,p]);
 if(p.startsWith('/calendar/v3/users/me/calendarList'))return J({items:[{id:acct,primary:true,accessRole:'owner',summary:acct}]});
 if(p.startsWith('/calendar/v3/'))return J({items:[]});
 if(p==='/drive/v3/about')return J({user:{emailAddress:acct}});
 if(p==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q')||'',nm=(q.match(/name='([^']*)'/)||[])[1];return J({files:Object.values(G.files).filter(f=>f.owner===acct&&(!nm||f.name===nm)).map(f=>({id:f.id,name:f.name,createdTime:f.created}))})}
 if(p==='/drive/v3/files'&&m==='POST'){const b=req.postDataJSON(),id=nid(b.mimeType.includes('folder')?'fold':'shet');if(b.parents&&!canWrite(G.files[b.parents[0]],acct))return no(403);
  G.files[id]={id,created:new Date(Date.UTC(2026,9,1)+G.n*60000).toISOString(),name:b.name,mime:b.mimeType,parents:b.parents||[],owner:acct,perms:[],tabs:b.mimeType.includes('spreadsheet')?[{title:'シート1',sheetId:0,rows:[]}]:null};return J({id,name:b.name})}
 let mm=p.match(/^\/drive\/v3\/files\/([^/]+)\/permissions\/?([^/]*)$/);
 if(mm){const f=G.files[mm[1]];if(!f||f.owner!==acct)return no(403);
  if(m==='GET'&&!mm[2])return J({permissions:[{id:'owner',emailAddress:f.owner,role:'owner',type:'user'}].concat(f.perms.map(x=>({id:x.id,emailAddress:x.email,role:x.role,type:'user'})))});
  if(m==='POST'){const b=req.postDataJSON(),x={id:'perm'+(++G.perm),email:b.emailAddress,role:b.role};f.perms.push(x);return J({id:x.id})}
  if(m==='PATCH'){const x=f.perms.find(x=>x.id===mm[2]);if(!x)return no(404);x.role=req.postDataJSON().role;return J({id:x.id})}
  if(m==='DELETE'){f.perms=f.perms.filter(x=>x.id!==mm[2]);return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}})}}
 mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
 if(mm){const f=G.files[mm[1]],rest=mm[2];if(!f)return no(404);
  if(m==='GET'&&!rest){if(!canRead(f,acct))return no(403);return J({properties:{title:f.name},sheets:f.tabs.map(t=>({properties:{title:t.title,sheetId:t.sheetId}}))})}
  if(rest==='/values:batchGet'){if(G.failReadFile===f.id&&u.searchParams.getAll('ranges').some(r=>tabName(r)==='社員氏名履歴')){G.failReadFile='';return no(503)}if(!canRead(f,acct))return no(403);const ts=u.searchParams.getAll('ranges').map(r=>f.tabs.find(t=>t.title===tabName(r)));if(ts.some(t=>!t))return no(400);return J({valueRanges:ts.map(t=>({values:t.rows}))})}
  if(!canWrite(f,acct))return no(403);
  if(rest===':batchUpdate'){for(const r of req.postDataJSON().requests){if(r.updateSheetProperties)f.tabs.find(t=>t.sheetId===r.updateSheetProperties.properties.sheetId).title=r.updateSheetProperties.properties.title;if(r.addSheet)f.tabs.push({title:r.addSheet.properties.title,sheetId:f.tabs.length+100,rows:[]})}return J({})}
  if(rest==='/values:batchUpdate'){const b=req.postDataJSON();for(const d of b.data){const t=f.tabs.find(x=>x.title===tabName(d.range));if(!t)return no(400);put(t,d.range,d.values)}G.calls.push([acct,'BATCH',f.id,b.data.map(d=>d.range).join(',')]);return J({})}
  const vm=rest.match(/^\/values\/(.+?)(:clear|:append)?$/);
  if(vm){const range=vm[1],t=f.tabs.find(x=>x.title===tabName(range));if(!t)return no(400);
   if(vm[2]===':clear'){t.rows=[];return J({})}
   if(vm[2]===':append'){t.rows.push(...req.postDataJSON().values);if(G.failReadAfterAppend===f.id&&t.title==='社員氏名履歴'){G.failReadAfterAppend='';G.failReadFile=f.id}if(G.failAfterAppend&&t.title==='社員氏名履歴'){G.failAfterAppend=false;return no(503)}return J({})}
   if(m==='PUT'){put(t,range,req.postDataJSON().values);return J({})}}
 }
 return no(404);
}
const GIS="window.google={accounts:{oauth2:{initTokenClient(cfg){return {requestAccessToken(){setTimeout(()=>cfg.callback({access_token:'tok:'+window.__acct,expires_in:3600,scope:cfg.scope}),5)}}}}}};";
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device(acct,width=400){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  if(u.startsWith('https://accounts.google.com/gsi/client'))return r.fulfill({status:200,contentType:'application/javascript',body:GIS});
  if(/https:\/\/(www|sheets)\.googleapis\.com\//.test(u))return google(r);
  return r.fulfill({status:200,body:''})});
 await c.addInitScript(a=>{window.__acct=a},acct);
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T01:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.RB&&window.google&&google.accounts);
 await p.evaluate(()=>{window.__autoShare=true;setInterval(()=>{if(window.__autoShare)document.querySelector('[data-share-yes]')?.click()},20)});
 return {c,p,errors};
}
const byName=n=>Object.values(G.files).find(f=>f.name===n);
const tab=(f,t)=>(f.tabs.find(x=>x.title===t)||{rows:null}).rows;
const shares=f=>Object.fromEntries(f.perms.map(x=>[x.email,x.role]));
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const A=await device(ADMIN,390);
 await A.p.evaluate(async([SA,GM])=>{RB.db.settings.data.admin=true;await RB.adminAdd('例題 一郎',SA,()=>{},{company:'CP',role:'社員',gmCo:''});await RB.adminAdd('管理 見本',GM,()=>{},{company:'CP',role:'GM',gmCo:'CP'});RB.db.cases=[{...RB.CASE_DEFAULTS(),id:'SYN-NAME',tantou:'例題',type:'taikyo',stage:'new'}];RB.db.todos=[{id:'SYN-TODO',tantou:'例題 一郎',text:'合成確認'}];RB.save()},[SA,GM]);
 const list=byName('CPG HUB_社員一覧'),record=byName('CPG HUB_例題 一郎'),view=byName('CPG HUB_見る人用一覧');
 const start=G.calls.length,originalStaff=JSON.stringify(tab(list,'社員')),originalData=await A.p.evaluate(()=>JSON.stringify([RB.db.cases,RB.db.todos]));
 const launch=async name=>{await A.p.evaluate(({id,name})=>{window.renameResult=RB.adminNameSave(id,name).then(()=> 'saved',e=>'error: '+e.message)}, {id:record.id,name});await A.p.waitForSelector('dialog.name-preview[open]')};
 const result=()=>A.p.evaluate(()=>window.renameResult);
 await check('確認画面の取消・Escapeでは書込みゼロ',async()=>{await launch('例題 正式一郎');assert.match(await A.p.locator('dialog.name-preview').innerText(),/例題 一郎[\s\S]*例題 正式一郎/);await A.p.click('[data-name-no]');assert.match(await result(),/中止/);await launch('例題 正式一郎');await A.p.keyboard.press('Escape');assert.match(await result(),/中止/);assert.equal(G.calls.slice(start).filter(x=>['POST','PUT','DELETE','PATCH'].includes(x[1])).length,0)});
 await check('実ボタン・390pxと360px実フォント150%確認',async()=>{
  await A.p.evaluate(()=>{RB.go('stats');document.querySelector('[data-fold="dataAdmin"]').open=true});await A.p.click('[data-dname="'+record.id+'"]');await A.p.locator('#dn_name').fill('例題 正式一郎');await A.p.click('[data-act="dn-save"]');await A.p.waitForSelector('dialog.name-preview');
  await A.p.setViewportSize({width:390,height:844});await A.p.screenshot({path:path.join(root,'docs/preview/staff-name-confirm-390.png')});
  await A.p.setViewportSize({width:360,height:844});await A.p.evaluate(()=>{const es=[...document.querySelectorAll('dialog.name-preview,dialog.name-preview *')],sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*1.5+'px')});
  const d=await A.p.locator('dialog.name-preview').evaluate(e=>({page:document.documentElement.scrollWidth,w:e.clientWidth,s:e.scrollWidth}));assert.ok(d.page<=360&&d.s<=d.w+1,JSON.stringify(d));await A.p.screenshot({path:path.join(root,'docs/preview/staff-name-confirm-360-font150.png')});await A.p.click('[data-name-yes]');await A.p.waitForFunction(()=>RB.ui.dmsg.some(x=>x.text.includes('正規氏名を保存・読戻し確認')));
 });
 await check('旧キー・社員列・案件/ToDo保持、3保存先の追記と読戻し',async()=>{assert.equal(JSON.stringify(tab(list,'社員')),originalStaff);assert.equal(await A.p.evaluate(()=>JSON.stringify([RB.db.cases,RB.db.todos])),originalData);for(const f of [list,record,view]){assert.deepEqual(tab(f,'社員氏名履歴')[0],['変更ID','段階','記録JSON']);assert.equal(tab(f,'社員氏名履歴').length,3)}assert.equal(await A.p.evaluate(()=>RB.db.settings.data.staff[0].name),'例題 正式一郎');assert.equal(await A.p.evaluate(()=>RB.tantouLabel('例題 一郎')),'例題 正式一郎');assert.equal(G.calls.slice(start).filter(x=>x[2].includes('/permissions')&&x[1]!=='GET').length,0);assert.equal(G.calls.slice(start).filter(x=>x[2].includes(':clear')).length,0)});
 await check('再読込・同期・同じ変更再試行は行を重複しない',async()=>{await A.p.reload();await A.p.waitForFunction(()=>window.RB);await launch('例題 正式一郎');await A.p.click('[data-name-yes]');assert.equal(await result(),'saved');for(const f of [list,record,view])assert.equal(tab(f,'社員氏名履歴').length,3);assert.equal(await A.p.evaluate(()=>RB.tantouLabel('例題 一郎')),'例題 正式一郎')});
 await check('append成功後応答失敗でも成功扱いせず同IDで安全再試行',async()=>{await launch('例題 二度目');G.failAfterAppend=true;await A.p.click('[data-name-yes]');assert.match(await result(),/^error:/);assert.equal(await A.p.evaluate(()=>RB.db.settings.data.staff[0].name),'例題 正式一郎');assert.equal(tab(list,'社員氏名履歴').length,4);await A.p.reload();await A.p.waitForFunction(()=>window.RB);await launch('例題 二度目');G.failReadAfterAppend=record.id;await A.p.click('[data-name-yes]');assert.match(await result(),/^error:/);assert.equal(tab(record,'社員氏名履歴').length,4);await launch('例題 二度目');await A.p.click('[data-name-yes]');assert.equal(await result(),'saved');for(const f of [list,record,view])assert.equal(tab(f,'社員氏名履歴').length,5)});
 await check('確認中の社員一覧変更は書込み前に停止',async()=>{await launch('例題 三度目');const rows=tab(list,'社員');rows[1][8]='CPY';await A.p.click('[data-name-yes]');assert.match(await result(),/変わりました/);assert.equal(tab(list,'社員氏名履歴').length,5);rows[1][8]='CP'});
 await check('社員・GMは編集UIなし、イベント関数経由も拒否',async()=>{for(const acct of [SA,GM]){const u=await device(acct);await u.p.evaluate(()=>RB.go('stats'));assert.equal(await u.p.locator('[data-dname]').count(),0);const before=G.calls.length;const msg=await u.p.evaluate(async id=>{try{await RB.adminNameSave(id,'不許可 名前');return 'bad'}catch(e){return e.message}},record.id);assert.notEqual(msg,'bad');const spoof=await u.p.evaluate(async id=>{RB.db.settings.data.admin=true;RB.save();try{await RB.adminNameSave(id,'不許可 名前');return 'bad'}catch(e){return e.message}},record.id);assert.match(spoof,/管理アカウント/);assert.equal(G.calls.slice(before).filter(x=>['POST','PUT','PATCH','DELETE'].includes(x[1])).length,0);assert.deepEqual(u.errors,[]);await u.c.close()}});
 await check('社員の通常同期で正規名を取得・旧担当保存値保持、GM閲覧一覧も反映',async()=>{
  const E=await device(SA);await E.p.evaluate(async id=>{RB.db.settings.data.sheetId=id;RB.db.settings.rcpt.name='例題 一郎';RB.db.cases=[];RB.db.todos=[{id:'keep-key',title:'合成用事',tantou:'例題 一郎',done:false}];RB.db.receipts=[];RB.save();await RB.gAuthorize(true);await RB.dataSync(()=>{})},record.id);
  assert.equal(await E.p.evaluate(()=>RB.tantouLabel('例題 一郎')),'例題 二度目');assert.equal(await E.p.evaluate(()=>RB.db.todos[0].tantou),'例題 一郎');await E.p.reload();await E.p.waitForFunction(()=>window.RB);assert.equal(await E.p.evaluate(()=>RB.tantouLabel('例題 一郎')),'例題 二度目');assert.deepEqual(E.errors,[]);await E.c.close();
  const V=await device(GM);await V.p.evaluate(async id=>{await RB.viewerConnect(id)},view.id);assert.equal(await V.p.evaluate(()=>RB.tantouLabel('例題 一郎')),'例題 二度目');assert.deepEqual(V.errors,[]);await V.c.close();
 });
 await check('確認中の別変更履歴・ローカル保存失敗は成功にしない',async()=>{
  await launch('例題 三度目');const hist=tab(list,'社員氏名履歴'),before=hist.length,foreign={...JSON.parse(hist[1][2]),id:'parallel-change',before:'例題 二度目',after:'別端末 名前'};hist.push([foreign.id,foreign.state,JSON.stringify(foreign)]);await A.p.click('[data-name-yes]');assert.match(await result(),/履歴が変わりました/);hist.pop();assert.equal(hist.length,before);
  await launch('例題 三度目');await A.p.evaluate(()=>{window.nativeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='workhub_proto_v1')throw Error('synthetic local write failure');return window.nativeSet.call(this,k,v)}});await A.p.click('[data-name-yes]');assert.match(await result(),/^error:/);await A.p.evaluate(()=>{Storage.prototype.setItem=window.nativeSet});await A.p.reload();await A.p.waitForFunction(()=>window.RB);await launch('例題 三度目');await A.p.click('[data-name-yes]');assert.equal(await result(),'saved');assert.equal(tab(list,'社員氏名履歴').length,7);
 });
 await check('新閲覧一覧への途中コピー後、古い確定行が遅れても最新名を維持',async()=>{
  const target='synthetic-late-view';G.files[target]={id:target,name:'合成遅延コピー',owner:ADMIN,perms:[],tabs:[{title:'シート1',sheetId:0,rows:[]}]};G.failAfterAppend=true;
  const failed=await A.p.evaluate(async({source,target})=>{try{await RB.namesCopyConfirmed(source,target);return 'unexpected'}catch(e){return e.message}},{source:list.id,target});assert.notEqual(failed,'unexpected');assert.equal(tab(G.files[target],'社員氏名履歴').length,2);
  const outcome=await A.p.evaluate(async({source,target,sheetId})=>{const rows=await RB.namesRead(source);for(const row of rows.slice(2))await RB.namesAppend(target,row);const old=RB.CPGNames.overlay([{name:'例題 一郎',sheetId}],await RB.namesRead(target))[0].name;await RB.namesCopyConfirmed(source,target);const latest=RB.CPGNames.overlay([{name:'例題 一郎',sheetId}],await RB.namesRead(target))[0].name;await RB.namesCopyConfirmed(source,target);return {old,latest,again:RB.CPGNames.overlay([{name:'例題 一郎',sheetId}],await RB.namesRead(target))[0].name}}, {source:list.id,target,sheetId:record.id});assert.deepEqual(outcome,{old:'例題 一郎',latest:'例題 三度目',again:'例題 三度目'});assert.equal(tab(G.files[target],'社員氏名履歴').length,7);
 });
 await check('現在名/登録名/旧名の衝突は選択不可、ownerでも誤割当しない',async()=>{
 const result=await A.p.evaluate(()=>{const a={name:'例題 二郎',registeredName:'例題 一郎',nameKey:'例題 一郎',sheetId:'A',email:'a@example.com'},b={name:'例題 二郎',sheetId:'B',email:'b@example.com'};RB.db.settings.data.staff=[a,b];RB.db.settings.data.sheetId='A';const out=[];for(const key of ['例題 二郎','例題二郎','例題　 二郎']){b.name=key;out.push({disabled:RB.tantouOptions().find(o=>o.v===key)?.disabled,resolved:RB.personOf(key,'A')});}a.name='別名 一郎';a.nameAliases=['例題　二郎'];b.name='例題 二郎';out.push({disabled:RB.tantouOptions().find(o=>o.v===b.name)?.disabled,resolved:RB.personOf(b.name,'A'),badge:RB.personBadge(b.name)});return out});assert.ok(result.every(x=>x.disabled&&x.resolved===null),JSON.stringify(result));assert.ok(!result.at(-1).badge.includes('@example.com'),'ambiguous raw key must not use display-label fallback');const own=await A.p.evaluate(()=>{RB.db.settings.data.staff=[{name:'黒木 合成甲',sheetId:'A'},{name:'黒木 合成乙',sheetId:'B'}];return RB.tantouOptions()});assert.equal(own.find(o=>o.v==='黒木').disabled,true);assert.ok(own.some(o=>o.v==='黒木 合成甲'&&!o.disabled),'disabled surname must not hide an unambiguous own-name choice');
 });
 await check('社員の名前設定保存失敗時は以後のremote書込みゼロ',async()=>{
 const E=await device(SA);await E.p.evaluate(async id=>{RB.db.settings.data.sheetId=id;RB.db.settings.rcpt.name='例題 一郎';RB.db.cases=[];RB.db.todos=[];RB.db.receipts=[];RB.save();await RB.gAuthorize(true);Storage.prototype.setItem=function(){throw Error('synthetic failure')}},record.id);const start=G.calls.length;const msg=await E.p.evaluate(async()=>{try{await RB.dataSync(()=>{});return 'unexpected'}catch(e){return e.message}});assert.notEqual(msg,'unexpected');assert.equal(G.calls.slice(start).filter(x=>['POST','PUT','PATCH','DELETE','BATCH'].includes(x[1])).length,0);await E.c.close();
 });
 await check('同姓同名の共有ケースは別ID・別担当表示、閲覧のみを維持',async()=>{
  await A.p.evaluate(()=>{const d=RB.db.settings.data;d.staff=[{name:'同名 長い正式氏名',sheetId:'synthetic-one',email:'one@example.com',company:'CP',role:'社員'},{name:'同名 長い正式氏名',sheetId:'synthetic-two',email:'two@example.com',company:'CP',role:'社員'}];RB.ui.corp={data:d.staff.map(s=>({s,ok:true,cases:[{'受付番号':'SYN-001','種類':'緊急対応','段階キー':'new','会社':'CP','受付日':'2026-10-30','物件':'合成確認用','担当':''}],todo:[],rc:[]})),at:Date.now()};RB.roBuild(RB.ui.corp.data);RB.go('cases')});
  await A.p.locator('[data-scope-person]').selectOption('all');
  const cases=await A.p.evaluate(()=>RB.ui.corpRO);assert.equal(new Set(cases.map(c=>c.id)).size,2);assert.equal(new Set(cases.map(c=>c.tantou)).size,2);assert.ok(cases.every(c=>c.ro));assert.match(cases[0].tantou,/one@example.com/);assert.match(cases[1].tantou,/two@example.com/);
  await A.p.setViewportSize({width:390,height:844});await A.p.locator('[data-open="SYN-001・synthetic-one"]').scrollIntoViewIfNeeded();await A.p.screenshot({path:path.join(root,'docs/preview/staff-full-names-390.png')});
  await A.p.setViewportSize({width:360,height:844});await A.p.evaluate(()=>{const es=[...document.querySelectorAll('body,body *')],sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*1.5+'px')});assert.ok(await A.p.evaluate(()=>document.documentElement.scrollWidth<=360));const bounds=await A.p.locator('.pbadge').evaluateAll(es=>es.map(e=>{const r=document.createRange();r.selectNodeContents(e);const b=e.getBoundingClientRect(),style=getComputedStyle(e);if(parseFloat(style.paddingLeft)<parseFloat(style.borderRadius))return false;return [...r.getClientRects()].every(t=>t.top>=b.top-1&&t.bottom<=b.bottom+1&&t.left>=b.left-1&&t.right<=b.right+1)}));assert.ok(bounds.length&&bounds.every(Boolean),'all text lines stay inside badge borders');await A.p.locator('[data-open="SYN-001・synthetic-one"]').scrollIntoViewIfNeeded();await A.p.screenshot({path:path.join(root,'docs/preview/staff-full-names-360-font150.png')});
 });
 assert.deepEqual(A.errors,[]);await A.c.close();console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
