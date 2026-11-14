/* 指示箱（v1.47.0）: synthetic accounts and an in-memory Google (Drive files and permissions, Sheets tabs and values).
   Fictional names and example.com addresses only. No live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.RB={get db(){return DB},ui,go,render,roBuild,adminAdd,adminRoleSave,adminRemove,corpRun,boxState,corpKeepSave,permList,adminLightSave,adminCodesSave,noWait(){corpWait=async()=>{}}};';
const ADMIN='toshi.cpg@gmail.com',SA='test-staff-a@example.com',SB='test-staff-b@example.com',GM='test-gm-cpy@example.com',ZEN='test-zensha@example.com';
const TODAY='2026-10-30';
/* ---- in-memory Google ---- */
const G={files:{},n:0,perm:0,calls:[]};
/* v1.50.31 Googleドライブの更新日時（modifiedTime）：シートに書くたびに進む */
let mtN=0;const touch=f=>{f.mt=new Date(Date.UTC(2026,9,30,3)+(++mtN)*1000).toISOString()};
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
 if(p==='/drive/v3/files'&&m==='GET'&&G.failList)return no(500);
 if(p==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q')||'',nm=(q.match(/name='([^']*)'/)||[])[1];return J({files:Object.values(G.files).filter(f=>f.owner===acct&&(!nm||f.name===nm)).map(f=>({id:f.id,name:f.name,createdTime:f.created,modifiedTime:f.mime&&f.mime.includes('spreadsheet')?(f.mt||f.created):undefined}))})}
 if(p==='/drive/v3/files'&&m==='POST'){const b=req.postDataJSON(),id=nid(b.mimeType.includes('folder')?'fold':'shet');if(b.parents&&!canWrite(G.files[b.parents[0]],acct))return no(403);
  G.files[id]={id,created:new Date(Date.UTC(2026,9,1)+G.n*60000).toISOString(),name:b.name,mime:b.mimeType,parents:b.parents||[],owner:acct,perms:[],tabs:b.mimeType.includes('spreadsheet')?[{title:'シート1',sheetId:0,rows:[]}]:null};return J({id,name:b.name})}
 let mm=p.match(/^\/drive\/v3\/files\/([^/]+)\/permissions\/?([^/]*)$/);
 if(mm){const f=G.files[mm[1]];if(!f||f.owner!==acct)return no(403);
  if(m==='GET'&&!mm[2])return J({permissions:[{id:'owner',emailAddress:f.owner,role:'owner',type:'user'}].concat(f.perms.map(x=>({id:x.id,emailAddress:x.email,role:x.role,type:'user'})))});
  if(m==='POST'){const b=req.postDataJSON(),x={id:'perm'+(++G.perm),email:b.emailAddress,role:b.role};f.perms.push(x);return J({id:x.id})}
  if(m==='PATCH'){const x=f.perms.find(x=>x.id===mm[2]);if(!x)return no(404);x.role=req.postDataJSON().role;return J({id:x.id})}
  if(m==='DELETE'){f.perms=f.perms.filter(x=>x.id!==mm[2]);return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}})}}
 mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
 if(mm){const f=G.files[mm[1]],rest=mm[2];if(!f)return no(404);if(m!=='GET')touch(f);
  if(m==='GET'&&!rest){if(!canRead(f,acct))return no(403);return J({properties:{title:f.name},sheets:f.tabs.map(t=>({properties:{title:t.title,sheetId:t.sheetId}}))})}
  if(rest==='/values:batchGet'){if(!canRead(f,acct))return no(403);const ts=u.searchParams.getAll('ranges').map(r=>f.tabs.find(t=>t.title===tabName(r)));if(ts.some(t=>!t))return no(400);return J({valueRanges:ts.map(t=>({values:t.rows}))})}
  if(!canWrite(f,acct))return no(403);
  if(rest===':batchUpdate'){for(const r of req.postDataJSON().requests){if(r.updateSheetProperties)f.tabs.find(t=>t.sheetId===r.updateSheetProperties.properties.sheetId).title=r.updateSheetProperties.properties.title;if(r.addSheet)f.tabs.push({title:r.addSheet.properties.title,sheetId:f.tabs.length+100,rows:[]})}return J({})}
  if(rest==='/values:batchUpdate'){const b=req.postDataJSON();for(const d of b.data){const t=f.tabs.find(x=>x.title===tabName(d.range));if(!t)return no(400);put(t,d.range,d.values)}G.calls.push([acct,'BATCH',f.id,b.data.map(d=>d.range).join(',')]);return J({})}
  const vm=rest.match(/^\/values\/(.+?)(:clear|:append)?$/);
  if(vm){const range=vm[1],t=f.tabs.find(x=>x.title===tabName(range));if(!t)return no(400);
   if(vm[2]===':clear'){t.rows=[];return J({})}
   if(vm[2]===':append'){t.rows.push(...req.postDataJSON().values);return J({})}
   if(m==='PUT'){if(G.failTab&&t.title===G.failTab&&(!G.failFile||G.failFile===f.id)&&(G.failLeft===undefined||G.failLeft>0&&G.failLeft--))return no(500);put(t,range,req.postDataJSON().values);return J({})}}
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
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const A=await device(ADMIN);
 await check('社長の端末：GM・全社が出せる社員に指示箱を作り、共有と「連絡」タブ・一覧の列を合わせる',async()=>{
  await A.p.evaluate(async([SA,SB,GM,ZEN])=>{RB.db.settings.data.admin=true;const log=()=>{};
   await RB.adminAdd('社員 一郎',SA,log,{company:'CP',role:'社員',gmCo:''});
   await RB.adminAdd('社員 二郎',SB,log,{company:'CPY',role:'社員',gmCo:''});
   await RB.adminAdd('管理 見本',GM,log,{company:'CPY',role:'GM',gmCo:'CPY'});
   await RB.adminAdd('見本 太郎',ZEN,log,{company:'CP,CPY,AT',role:'全社',gmCo:'CP'})},[SA,SB,GM,ZEN]);
  const bA=byName('CPG HUB_指示箱_社員 一郎'),bB=byName('CPG HUB_指示箱_社員 二郎'),bG=byName('CPG HUB_指示箱_管理 見本');
  assert.ok(bA&&bB&&bG,'boxes for the three people someone can send to');
  assert.ok(!byName('CPG HUB_指示箱_見本 太郎'),'no box when nobody can send to that person');
  assert.equal(bA.owner,ADMIN);
  assert.deepEqual(tab(bB,'指示')[0],['指示ID','内容','期限','指示日','状態','出した人Gmail','出した人の表示','取消日時','取消した人']);
  assert.deepEqual(shares(bB),{[SB]:'reader',[GM]:'writer',[ZEN]:'writer'});
  assert.deepEqual(shares(bA),{[SA]:'reader',[ZEN]:'writer'});
  const sB=byName('CPG HUB_社員 二郎');
  assert.equal(shares(sB)[GM],'reader','GM stays a reader of the record sheet');assert.equal(shares(sB)[SB],'writer');
  assert.deepEqual(tab(sB,'連絡')[0],['指示箱ID','指示箱のリンク','書いた日時']);assert.equal(tab(sB,'連絡')[1][0],bB.id);
  const list=tab(byName('CPG HUB_社員一覧'),'社員');assert.deepEqual(list[0].slice(-5),['指示箱ID','担当の会社','表示名','受付番号の記号','GM統括']);
  /* v1.50.17 共有を合わせると、受付番号の記号（2文字・重ならない）が社員一覧と各社員の記録シートに入る */
  {const ci=list[0].indexOf('受付番号の記号'),si=list[0].indexOf('シートID'),codes=list.slice(1).map(r=>r[ci]);assert.ok(codes.every(c=>/^[A-HJ-NP-Z]{3}$/.test(c)),codes.join());assert.equal(new Set(codes).size,codes.length);
   assert.deepEqual(tab(sB,'受付番号の記号'),[['受付番号の記号'],[list.find(r=>r[si]===sB.id)[ci]]]);
   /* 社長が名前から決めた記号（例：OH）を役割の保存で入れると、社員一覧と記録シートの両方が変わる。ほかの人の記号とは重ねられない */
   const other=list.slice(1).find(r=>r[si]!==sB.id)[ci];
   const dup=await A.p.evaluate(async([id,c])=>{try{await RB.adminRoleSave(id,{company:'CPY',role:'社員',gmCo:'',caseCode:c},'',()=>{});return 'saved'}catch(e){return e.message}},[sB.id,other]);
   assert.match(dup,new RegExp('「'+other+'」は、.*さんが使っています'));assert.notEqual(tab(sB,'受付番号の記号')[1][0],other);
   assert.equal(await A.p.evaluate(async id=>{await RB.adminRoleSave(id,{company:'CPY',role:'社員',gmCo:'',caseCode:'OHI'},'',()=>{});return 'saved'},sB.id),'saved');
   const list2=tab(byName('CPG HUB_社員一覧'),'社員');assert.equal(list2.find(r=>r[si]===sB.id)[ci],'OHI');assert.deepEqual(tab(sB,'受付番号の記号'),[['受付番号の記号'],['OHI']]);}
  const vl=tab(byName('CPG HUB_見る人用一覧'),'一覧'),bi=vl[0].indexOf('指示箱ID');assert.deepEqual(vl[0].slice(-4),['指示箱ID','担当の会社','表示名','GM統括']);assert.ok(vl.some(r=>r[1]===SB&&r[bi]===bB.id));
 });
 await check('共有プレビュー：中止・Escape・再読込、390px/360px文字150%、旧共有保持',async()=>{
  const before=G.calls.filter(x=>['POST','PATCH','DELETE','PUT'].includes(x[1])).length;
  await A.p.evaluate(()=>{window.__autoShare=false;const s=RB.db.settings.data.staff.find(x=>x.role==='GM');window.__sharePending=RB.adminRoleSave(s.sheetId,{company:s.company,role:'社員',gmCo:''},'',()=>{}).then(()=> 'saved',e=>e.message)});
  await A.p.waitForSelector('dialog.share-preview[open]');
  assert.match(await A.p.evaluate(async()=>{const s=RB.db.settings.data.staff.find(x=>x.role==='GM');try{await RB.adminRoleSave(s.sheetId,{role:'社員'},'',()=>{});return 'unexpected'}catch(e){return e.message}}),/処理中/);
  const text=await A.p.locator('dialog.share-preview').innerText();assert.match(text,/解除/);assert.match(text,/test-gm-cpy@example.com/);assert.match(text,/記録シート/);assert.match(text,/指示箱/);
  fs.mkdirSync(path.join(root,'docs/preview'),{recursive:true});
  await A.p.setViewportSize({width:390,height:844});await A.p.screenshot({path:path.join(root,'docs/preview/gm-sharing-preview-390.png')});
  await A.p.setViewportSize({width:360,height:844});
  await A.p.evaluate(()=>{for(const e of document.querySelectorAll('dialog.share-preview,dialog.share-preview *')){e.dataset.originalSize=getComputedStyle(e).fontSize;}for(const e of document.querySelectorAll('dialog.share-preview,dialog.share-preview *'))e.style.fontSize=parseFloat(e.dataset.originalSize)*1.5+'px'});
  const dims=await A.p.locator('dialog.share-preview').evaluate(e=>({w:e.clientWidth,s:e.scrollWidth,page:document.documentElement.scrollWidth}));assert.ok(dims.s<=dims.w+1,JSON.stringify(dims));assert.ok(dims.page<=360);
  await A.p.screenshot({path:path.join(root,'docs/preview/gm-sharing-preview-360-font150.png')});
  await A.p.locator('[data-share-no]').click();assert.match(await A.p.evaluate(()=>window.__sharePending),/中止/);
  assert.equal(G.calls.filter(x=>['POST','PATCH','DELETE','PUT'].includes(x[1])).length,before,'no remote mutation on cancel');
  assert.equal(await A.p.evaluate(()=>RB.db.settings.data.staff.find(x=>x.email==='test-gm-cpy@example.com').role),'GM');
  await A.p.evaluate(()=>{const s=RB.db.settings.data.staff.find(x=>x.role==='GM');window.__sharePending=RB.adminRoleSave(s.sheetId,{company:s.company,role:'社員',gmCo:''},'',()=>{}).catch(e=>e.message)});
  await A.p.waitForSelector('dialog[open]');await A.p.keyboard.press('Escape');assert.match(await A.p.evaluate(()=>window.__sharePending),/中止/);
  await A.p.reload();await A.p.waitForFunction(()=>!!window.RB);assert.equal(await A.p.evaluate(()=>RB.db.settings.data.staff.find(x=>x.email==='test-gm-cpy@example.com').role),'GM');
  await A.p.evaluate(()=>{const s=RB.db.settings.data.staff.find(x=>x.role==='GM');window.__sharePending=RB.adminRoleSave(s.sheetId,{company:s.company,role:s.role,gmCo:s.gmCo},'',()=>{}).then(()=> 'saved',e=>e.message)});await A.p.waitForSelector('dialog.share-preview[open]');await A.p.locator('[data-share-yes]').click();assert.equal(await A.p.evaluate(()=>window.__sharePending),'saved');
  await A.p.evaluate(()=>{window.__autoShare=true;setInterval(()=>{if(window.__autoShare)document.querySelector('[data-share-yes]')?.click()},20)});
  // Legacy, externally granted access must survive a role removal later.
  const f=byName('CPG HUB_社員 一郎');f.perms.push({id:'legacy-gm-reader',email:GM,role:'reader'});
 });
 await check('共有管理履歴の固定見出し・追記と読戻し、単社GMは全社兼務者を対象外',async()=>{
  const journal=tab(byName('CPG HUB_社員一覧'),'共有管理履歴');assert.deepEqual(journal[0],['操作ID','段階','記録JSON']);assert.equal(journal.filter(r=>r[0]==='操作ID').length,1);
  const events=journal.slice(1).map(r=>JSON.parse(r[2]));assert.ok(events.length>0);assert.ok(events.every(x=>x.list===byName('CPG HUB_社員一覧').id));
  const own=byName('CPG HUB_見本 太郎');assert.equal(shares(own)[GM],undefined,'multi-company all-company manager excluded');
  assert.ok(!G.calls.some(x=>x[1]==='DELETE'&&x[2].includes('legacy-gm-reader')));
  assert.ok(!G.calls.some(x=>x[1]==='POST'&&x[2].includes('共有管理履歴')&&x[2].endsWith(':clear')),'journal never cleared');
 });
 const vlId=byName('CPG HUB_見る人用一覧').id;
 const viewer=async(acct,width)=>{const d=await device(acct,width);await d.p.evaluate(async([id,me])=>{const x=RB.db.settings.data;x.viewListId=id;x.viewEmail=me;await RB.corpRun();RB.go('company')},[vlId,acct]);await require('./scope-selection-helper').allPeople(d.p);return d};
 for(const width of [320,400]){
  const g=await viewer(GM,width);
  await check('GMの端末：自分の会社の社員にだけ出せ、指示箱に1行足して読み戻す '+width+'px',async()=>{
   /* v1.50.30 会社の動きのいちばん上の「タスクリクエストを出す」：宛先はプルダウンを開いてチェック */
   await g.p.$eval('#req-compose details.corp-p',d=>d.open=true);/* v1.50.59 欄は最初は畳む */
   await g.p.click('#req-compose .req-sum');
   const names=await g.p.evaluate(()=>[...document.querySelectorAll('[data-req-to]')].map(b=>RB.ui.corp.data.find(x=>x.s.sheetId===b.dataset.reqTo).s.name));
   assert.deepEqual(names,['社員 二郎']);
   await g.p.check('[data-req-to]');assert.match(await g.p.textContent('#req-compose .req-sum'),/宛先：社員 二郎/);
   await g.p.fill('#rq_title','見積を出す（テスト'+width+'）');await g.p.fill('#rq_due','2026-11-05');await g.p.click('[data-act="reqsend"]');
   await g.p.waitForFunction(()=>!RB.ui.reqBusy&&RB.ui.reqMsg&&RB.ui.reqMsg.length);
   assert.ok((await g.p.textContent('#req-compose')).includes('社員 二郎さん：出しました'));
   const row=tab(byName('CPG HUB_指示箱_社員 二郎'),'指示').find(r=>r[1]==='見積を出す（テスト'+width+'）');
   assert.ok(/^B-20261030-[a-z0-9]{6}$/.test(row[0]),row[0]);
   assert.deepEqual(row.slice(2),['2026-11-05','2026-10-30','未完了',GM,'GM 管理 見本','','']);
   const o=await g.p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.form,details')].map(x=>x.scrollWidth-x.clientWidth))});assert.ok(o<=0,'overflow '+o);
  });
  await check('GMは社員の記録シートとほかの会社の指示箱に書けない '+width+'px',async()=>{
   const st=await g.p.evaluate(async([sB,bA])=>{const w=id=>fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+"/values/'%E6%8C%87%E7%A4%BA'!A1:append?valueInputOption=RAW",{method:'POST',headers:{Authorization:'Bearer tok:'+window.__acct,'Content-Type':'application/json'},body:'{"values":[["x"]]}'}).then(r=>r.status);
    return [await w(sB),await w(bA)]},[byName('CPG HUB_社員 二郎').id,byName('CPG HUB_指示箱_社員 一郎').id]);
   assert.deepEqual(st,[403,403]);
  });
  assert.deepEqual(g.errors,[]);await g.c.close();
 }
 await check('社員の報告（PR-B の形）で完了になり、GMの画面に完了日とメモが出る。取り消しは出した人だけ・完了扱いにしない',async()=>{
  const bB=byName('CPG HUB_指示箱_社員 二郎'),sB=byName('CPG HUB_社員 二郎');
  const [r1,r2]=tab(bB,'指示').slice(1);
  /* 社員の端末（v1.47.1）が書く「指示の報告」を、形のとおりに置く */
  touch(sB);sB.tabs.push({title:'指示の報告',sheetId:300,rows:[['指示ID','状態','完了日','完了メモ','書いた日時'],[r1[0],'完了','2026-10-30','先方に送付済み（テスト）','2026-10-30T02:00:00.000Z']]});
  const g=await viewer(GM,400);
  let t=await g.p.textContent('main');
  assert.ok(t.includes('あなたが出したタスクリクエスト')&&t.includes('✓ 10/30完了')&&t.includes('メモ：先方に送付済み（テスト）'),t.slice(0,600));
  /* v1.50.57 人ごとの行は最初は畳むので、開いてから押す */
  await g.p.$$eval('details.corp-p',a=>a.forEach(d=>d.open=true));
  const cancels=await g.p.$$eval('[data-bcancel]',a=>a.map(x=>x.dataset.bcancel));
  assert.equal(cancels.length,1,'only the open request can be cancelled');assert.ok(cancels[0].endsWith(r2[0]));
  await g.p.click('[data-bcancel="'+cancels[0]+'"]');await g.p.click('[data-act=bcanceldo]');
  await g.p.waitForFunction(()=>RB.ui.bMsg&&/取り消しました|取り消せません/.test(RB.ui.bMsg.text));
  const row=tab(bB,'指示').find(r=>r[0]===r2[0]);
  assert.equal(row[4],'取り消し');assert.ok(row[7].startsWith('2026-10-30T'));assert.equal(row[8],GM);
  assert.equal(tab(bB,'指示').length,3,'no rows added or removed');
  assert.ok(G.calls.some(c=>c[1]==='BATCH'&&c[3]==="'指示'!E3,'指示'!H3:I3"),'only E and H:I of that row');
  assert.equal(await g.p.evaluate(([o,r])=>RB.boxState(o,r).st,[{'指示ID':r2[0],'状態':'取り消し'},[{'指示ID':r2[0],'状態':'完了','書いた日時':'z'}]]),'取り消し','a cancelled request is never counted as done');
  assert.deepEqual(g.errors,[]);await g.c.close();
 });
 await check('全社の人は全員に出せ、GMの出したものは見えない（自分の分だけ）',async()=>{
  const z=await viewer(ZEN,400);
  await z.p.$eval('#req-compose details.corp-p',d=>d.open=true);/* v1.50.59 欄は最初は畳む */
  await z.p.click('#req-compose .req-sum');
  const names=await z.p.evaluate(()=>[...document.querySelectorAll('[data-req-to]')].map(b=>RB.ui.corp.data.find(x=>x.s.sheetId===b.dataset.reqTo).s.name).sort());
  assert.deepEqual(names,['社員 一郎','社員 二郎','管理 見本'].sort());
  assert.ok(!(await z.p.textContent('main')).includes('見積を出す（テスト'),'requests of another issuer are not listed for 全社');
  const id=await z.p.evaluate(()=>RB.ui.corp.data.find(x=>x.s.name==='社員 一郎').s.sheetId);
  await z.p.check('[data-req-to="'+id+'"]');await z.p.fill('#rq_title','書類を出す（全社テスト）');await z.p.click('[data-act="reqsend"]');
  await z.p.waitForFunction(()=>!RB.ui.reqBusy&&RB.ui.reqMsg&&RB.ui.reqMsg.length);
  const row=tab(byName('CPG HUB_指示箱_社員 一郎'),'指示').find(r=>r[1]==='書類を出す（全社テスト）');
  assert.deepEqual([row[2],row[4],row[5],row[6]],['','未完了',ZEN,'見本 太郎']);
  assert.deepEqual(z.errors,[]);await z.c.close();
 });
 await check('v1.50.30 タスクリクエストの入力欄：社員ごとの欄はなく、宛先は複数チェックで一人ずつに出る。下書きは描き直しで消えない。今日／明日／今週中。360px・400pxではみ出さない',async()=>{
  for(const width of [360,400]){
   const z=await viewer(ZEN,width);
   assert.equal(await z.p.$$eval('#req-compose',a=>a.length),1,'one compose box');
   assert.equal(await z.p.$$eval('[data-badd],[data-oadd],[id^="bi_t"],[id^="oi_t"]',a=>a.length),0,'per-person forms are gone');
   /* v1.50.59 タスクリクエストを出す欄は最初は畳む。見出しは見える */
   assert.equal(await z.p.$eval('#req-compose details.corp-p',d=>d.open),false,'compose starts closed');assert.ok(await z.p.isVisible('#req-compose summary h3'));
   await z.p.click('#req-compose details.corp-p>summary');assert.equal(await z.p.$eval('#req-compose details.corp-p',d=>d.open),true);
   assert.equal(await z.p.$$eval('#req-compose details.req-to[open]',a=>a.length),0,'recipient list starts closed');
   await z.p.click('#req-compose .req-sum');assert.equal(await z.p.$$eval('#req-compose details.req-to[open]',a=>a.length),1);
   await z.p.click('[data-act="reqall"]');
   assert.equal(await z.p.$$eval('[data-req-to]:checked',a=>a.length),3);
   assert.equal(await z.p.$$eval('#req-compose details.req-to[open]',a=>a.length),1,'stays open after 全員を選ぶ');
   await z.p.click('[data-act="reqnone"]');assert.equal(await z.p.$$eval('[data-req-to]:checked',a=>a.length),0);
   const ids=await z.p.evaluate(()=>['社員 一郎','管理 見本'].map(n=>RB.ui.corp.data.find(x=>x.s.name===n).s.sheetId));
   for(const id of ids)await z.p.check('[data-req-to="'+id+'"]');
   assert.match(await z.p.textContent('#req-compose .req-sum'),/宛先：社員 一郎・管理 見本/);
   /* 宛先を選ばずに送ると止める（ここでは内容なし） */
   await z.p.fill('#rq_title','');await z.p.click('[data-act="reqsend"]');
   assert.ok((await z.p.textContent('#req-compose')).includes('内容を入れてください'));
   await z.p.fill('#rq_title','まとめて頼む（'+width+'）');
   await z.p.click('[data-req-due="1"]');assert.equal(await z.p.inputValue('#rq_due'),'2026-10-31');
   await z.p.click('[data-req-due="0"]');assert.equal(await z.p.inputValue('#rq_due'),'2026-10-30');
   await z.p.click('[data-req-due="week"]');assert.equal(await z.p.inputValue('#rq_due'),'2026-10-31','2026-10-30 is a Friday; 今週中 = Saturday');
   await z.p.evaluate(()=>RB.render());
   assert.equal(await z.p.inputValue('#rq_title'),'まとめて頼む（'+width+'）','draft kept across re-render');
   assert.equal(await z.p.inputValue('#rq_due'),'2026-10-31');
   assert.equal(await z.p.$$eval('[data-req-to]:checked',a=>a.length),2,'recipients kept across re-render');
   const o=await z.p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('#req-compose,#req-compose *')].map(x=>x.scrollWidth-x.clientWidth))});assert.ok(o<=0,'overflow '+o+' at '+width);
   await z.p.click('[data-act="reqsend"]');
   await z.p.waitForFunction(()=>!RB.ui.reqBusy&&RB.ui.reqMsg&&RB.ui.reqMsg.length);
   const t=await z.p.textContent('#req-compose');assert.ok(t.includes('社員 一郎さん：出しました')&&t.includes('管理 見本さん：出しました'),t);
   for(const n of ['社員 一郎','管理 見本']){const rows=tab(byName('CPG HUB_指示箱_'+n),'指示').filter(r=>r[1]==='まとめて頼む（'+width+'）');assert.equal(rows.length,1,n);assert.deepEqual([rows[0][2],rows[0][4],rows[0][5]],['2026-10-31','未完了',ZEN])}
   assert.equal(await z.p.inputValue('#rq_title'),'','draft cleared after all sent');assert.equal(await z.p.$$eval('[data-req-to]:checked',a=>a.length),0);
   /* ホームの「会社の動き」から入力欄へ飛べる */
   await z.p.evaluate(()=>RB.go('home'));await z.p.click('[data-act="reqgo"]');
   await z.p.waitForFunction(()=>RB.ui.view==='company'||!!document.querySelector('#req-compose'));assert.equal(await z.p.$$eval('#req-compose',a=>a.length),1);
   if(width===400)await z.p.screenshot({path:path.join(require('node:os').tmpdir(),'req-compose-400.png'),fullPage:false});
   assert.deepEqual(z.errors,[]);await z.c.close();
  }
 });
 await check('社長の端末：全部の指示を出した人の表示付きで見られ、期限なしは指示一覧に「○○から」で残る',async()=>{
  await A.p.evaluate(async()=>{await RB.corpRun();RB.go('company')});await require('./scope-selection-helper').allPeople(A.p);
  const t=await A.p.textContent('main');
  assert.ok(t.includes('タスクリクエスト（GM・全社・経理・業務管理から）')&&t.includes('GM 管理 見本から')&&t.includes('見本 太郎から'));
  assert.ok(t.includes('✓ 10/30完了')&&t.includes('取り消し'));
  assert.ok((await A.p.$$('[data-bcancel]')).length>=1,'the 社長 can cancel open ones');
  await A.p.evaluate(()=>RB.go('todo',{tPeriod:'today',tTantou:'all'}));
  const reqs=await A.p.$$eval('.reqbox .card',a=>a.map(x=>x.textContent));
  assert.ok(!reqs.some(x=>x.includes('書類を出す（全社テスト）')),'no-date request stays out of ToDo');
  await A.p.click('[data-nav=requests]');
  const all=await A.p.$$eval('.request-compact .card',a=>a.map(x=>x.textContent));
  assert.ok(all.some(x=>x.includes('見本 太郎から')&&x.includes('書類を出す（全社テスト）')),all.join('|'));
  assert.ok(!reqs.some(x=>x.includes('見積を出す（テスト')),'done / cancelled are not in the ToDo block');
 });
 await check('v1.50.30 社長の入力欄：宛先は社員全員、出すと各社員の記録シートの「指示」に入る',async()=>{
  await A.p.evaluate(()=>RB.go('company'));
  await A.p.$eval('#req-compose details.corp-p',d=>d.open=true);/* v1.50.59 欄は最初は畳む */
  await A.p.click('#req-compose .req-sum');
  const names=await A.p.evaluate(()=>[...document.querySelectorAll('[data-req-to]')].map(b=>RB.ui.corp.data.find(x=>x.s.sheetId===b.dataset.reqTo).s.name).sort());
  assert.deepEqual(names,['社員 一郎','社員 二郎','管理 見本','見本 太郎'].sort());
  const id=await A.p.evaluate(()=>RB.ui.corp.data.find(x=>x.s.name==='社員 二郎').s.sheetId);
  await A.p.check('[data-req-to="'+id+'"]');await A.p.fill('#rq_title','社長からの依頼（テスト）');await A.p.fill('#rq_due','2026-11-02');await A.p.click('[data-act="reqsend"]');
  await A.p.waitForFunction(()=>!RB.ui.reqBusy&&RB.ui.reqMsg&&RB.ui.reqMsg.length);
  assert.ok((await A.p.textContent('#req-compose')).includes('社員 二郎さん：出しました'));
  const row=tab(byName('CPG HUB_社員 二郎'),'指示').find(r=>r[1]==='社長からの依頼（テスト）');
  assert.ok(/^I-20261030-/.test(row[0]),row[0]);assert.deepEqual(row.slice(2,5),['2026-11-02','2026-10-30','未完了']);
  assert.ok(!tab(byName('CPG HUB_指示箱_社員 二郎'),'指示').some(r=>r[1]==='社長からの依頼（テスト）'),'the 社長 does not use the box');
  assert.deepEqual(A.errors,[]);
 });
 await check('社員は自分あての指示箱だけ読め、ほかの人の指示箱は読めない',async()=>{
  const b=await device(SB,400);
  const st=await b.p.evaluate(async([own,other])=>{const r=id=>fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+"/values:batchGet?ranges=%27%E6%8C%87%E7%A4%BA%27",{headers:{Authorization:'Bearer tok:'+window.__acct}}).then(r=>r.status);return [await r(own),await r(other)]},[byName('CPG HUB_指示箱_社員 二郎').id,byName('CPG HUB_指示箱_社員 一郎').id]);
  assert.deepEqual(st,[200,403]);await b.c.close();
 });
 await check('GMを外すと指示箱の編集者が外れ、出した指示は残る。入れ替えで新しいGMに付く',async()=>{
  const bB=byName('CPG HUB_指示箱_社員 二郎'),before=tab(bB,'指示').length;
  await A.p.evaluate(async([GM])=>{const s=RB.db.settings.data.staff.find(x=>x.email===GM);await RB.adminRoleSave(s.sheetId,{company:'CPY',role:'社員',gmCo:''},'',()=>{})},[GM]);
  assert.ok(!(GM in shares(bB)),JSON.stringify(shares(bB)));assert.equal(tab(bB,'指示').length,before,'requests stay');
  assert.equal(shares(bB)[ZEN],'writer');
  assert.equal(shares(byName('CPG HUB_社員 一郎'))[GM],'reader','legacy share remains for explicit review');
  await A.p.evaluate(async([SA])=>{const s=RB.db.settings.data.staff.find(x=>x.email===SA);await RB.adminRoleSave(s.sheetId,{company:'CP,CPY',role:'GM',gmCo:'CPY'},'',()=>{})},[SA]);
  assert.equal(shares(bB)[SA],'writer');
  assert.equal(shares(byName('CPG HUB_社員 二郎'))[SA],'reader','new GM reads the record sheet only');
  assert.deepEqual(A.errors,[]);
 });
 const cached=await viewer(SA,390);
 await check('v1.50.3 役割の保存：「反映中 i／n：…」と進み具合を出し、社員一覧への保存は共有と見る人用一覧のすぐあと（予定の共有先より前）。最後に「完了しました」',async()=>{
  const list=byName('CPG HUB_社員一覧'),mark=G.calls.length;
  await A.p.evaluate(()=>{window.__prog=[];const seen=()=>{const el=document.getElementById('shareProgress');if(el){const t=el.firstChild?el.firstChild.textContent:el.textContent;if(window.__prog.at(-1)!==t)window.__prog.push(t)}};new MutationObserver(seen).observe(document.body,{subtree:true,childList:true,characterData:true});window.__autoShare=true});
  await A.p.evaluate(async([SB])=>{const s=RB.db.settings.data.staff.find(x=>x.email===SB&&!x.removed);await RB.adminRoleSave(s.sheetId,{company:'CPY',role:'業務管理',gmCo:'',charge:'CPY'},'',()=>{})},[SB]);
  const prog=await A.p.evaluate(()=>window.__prog);
  assert.ok(prog.some(t=>/^共有の一覧を読んでいます \d+／\d+$/.test(t)),prog.join(' | '));
  const steps=prog.filter(t=>/^反映中 \d+／\d+：/.test(t));assert.ok(steps.length>=1,prog.join(' | '));
  assert.ok(steps.some(t=>/さんの(記録シート|指示箱)に社員 二郎さんを見るだけで共有$|見る人用一覧に社員 二郎さんを見るだけで共有$/.test(t)),steps.join(' | '));
  const iSave=prog.indexOf('社員一覧に保存しています'),iCal=prog.findIndex(t=>/^予定の共有先を書いています/.test(t)),iLast=prog.lastIndexOf('完了しました');
  assert.ok(iSave>0&&iCal>iSave&&iLast>iCal,prog.join(' | '));
  /* Drive上の順番：社員一覧の「社員」タブへの書き込みが、予定の共有先の書き込みより先 */
  const after=G.calls.slice(mark),w=x=>['PUT','POST','BATCH'].includes(x[1]);
  const iList=after.findIndex(x=>w(x)&&String(x[2]).includes(list.id)&&/社員'?!?|社員$/.test(String(x[2])+String(x[3]||''))),iTarget=after.findIndex(x=>w(x)&&String(x[2]).includes('予定の共有先'));
  assert.ok(iList>=0&&iTarget>iList,'list '+iList+' / targets '+iTarget);
  const row=tab(list,'社員').find(r=>r[1]===SB),h=tab(list,'社員')[0];assert.equal(row[h.indexOf('役割')],'業務管理');assert.equal(row[h.indexOf('担当の会社')],'CPY');
  assert.ok(await A.p.evaluate(()=>{const el=document.getElementById('shareProgress');return !el||el.getBoundingClientRect().right<=innerWidth}));
  /* 確認の一覧で「やめる」と、反映中の表示は消える（何も変えていない） */
  await A.p.evaluate(()=>{window.__autoShare=false;const s=RB.db.settings.data.staff.find(x=>x.role==='業務管理');window.__p2=RB.adminRoleSave(s.sheetId,{company:'CPY',role:'社員',gmCo:'',charge:''},'',()=>{}).catch(e=>e.message)});
  await A.p.waitForSelector('dialog.share-preview[open]');await A.p.locator('[data-share-no]').click();
  assert.match(await A.p.evaluate(()=>window.__p2),/中止しました/);
  await A.p.waitForTimeout(50);assert.equal(await A.p.evaluate(()=>!!document.getElementById('shareProgress')&&!/完了/.test(document.getElementById('shareProgress').textContent)),false);
  await A.p.evaluate(()=>{window.__autoShare=true});
 });
 await check('v1.50.4「予定の共有先を書く」：進み具合・人ごとの変化・変更なし・止まった所を画面下に出し、押している間はボタンを止める',async()=>{
  const open=async()=>{await A.p.evaluate(()=>{RB.go('stats');document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)})};
  await A.p.evaluate(()=>{window.__prog=[];const seen=()=>{const el=document.getElementById('shareProgress');if(el){const t=el.firstChild?el.firstChild.textContent:el.textContent;if(window.__prog.at(-1)!==t)window.__prog.push(t)}};new MutationObserver(seen).observe(document.body,{subtree:true,childList:true,characterData:true})});
  const run=async()=>{await A.p.evaluate(()=>{window.__prog=[]});await open();await A.p.click('[data-act=dcaltargets]');
   assert.equal(await A.p.evaluate(()=>RB.ui.dbusy),true);assert.equal(await A.p.locator('[data-act=dcaltargets]').isDisabled(),true,'disabled while running');
   await A.p.waitForFunction(()=>!RB.ui.dbusy);return A.p.evaluate(()=>window.__prog)};
  /* 1回目：役割の保存で書いてあるので変更なし */
  let prog=await run();
  assert.ok(prog.some(t=>/^予定の共有先を書いています \d+／\d+：.+さん$/.test(t)),prog.join(' | '));
  assert.match(prog.at(-1),/^完了しました（\d+人分を書きました。変更はありませんでした）$/);
  /* 一郎さんの記録シートの共有先から1人消しておくと、2回目は「＋その人」と出る */
  const sA=byName('CPG HUB_社員 一郎'),tabA=sA.tabs.find(t=>t.title==='予定の共有先'),removed=tabA.rows.splice(tabA.rows.length-1,1)[0];
  prog=await run();
  assert.match(prog.at(-1),new RegExp('変わった人：社員 一郎さん（＋'+removed[0]+'）／変わらなかった人 \\d+人'),prog.at(-1));
  assert.ok(tabA.rows.some(r=>r[1]===removed[1]),'written back');
  assert.match(await A.p.textContent('main'),/社員 一郎：予定の共有先 \d+人（＋/);
  /* 途中で失敗：二郎さんの記録シートへの書き込みを止める */
  /* v1.50.12 変わらない人は書かないので、二郎さんの共有先を1人消して書く必要がある状態にしてから止める */
  {const tB=byName('CPG HUB_社員 二郎').tabs.find(t=>t.title==='予定の共有先');const k=tB.rows.map((r,i)=>i>0&&r[1]?i:-1).filter(i=>i>0).pop();assert.ok(k>0,'a target row to remove');tB.rows.splice(k,1);}
  G.failTab='予定の共有先';G.failFile=byName('CPG HUB_社員 二郎').id;
  prog=await run();G.failTab='';G.failFile='';
  const err=await A.p.textContent('#shareProgress');assert.match(err,/ここで止まりました：社員 二郎さん/);assert.match(err,/それまでの分は書けています。もう一度押すと、続きから書き直します/);
  assert.equal(await A.p.locator('#shareProgress button').textContent(),'閉じる');await A.p.click('#shareProgress button');assert.equal(await A.p.locator('#shareProgress').count(),0);
  prog=await run();assert.match(prog.at(-1),/^完了しました/);
  assert.ok(await A.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 });
 await check('旧キャッシュの複数会社・管理者は再読込でGM表示から除外、保存キャッシュ原本は不変',async()=>{
  await cached.p.evaluate(()=>{const bad={s:{name:'合成全社',email:'cache-only@example.com',sheetId:'cached-multi',company:'CP,CPY,AT',role:'全社',gmCo:'CP'},ok:true,cases:[],rc:[],todo:[],orders:[]};RB.ui.corp.data.push(bad);RB.corpKeepSave()});
  const raw=await cached.p.evaluate(()=>localStorage.getItem('workhub_corp_last_v1'));await cached.p.reload();await cached.p.waitForFunction(()=>!!window.RB);
  assert.equal(await cached.p.evaluate(()=>RB.ui.corp.data.some(x=>x.s.sheetId==='cached-multi')),false);assert.equal(await cached.p.evaluate(()=>localStorage.getItem('workhub_corp_last_v1')),raw);
 });await cached.c.close();
 await check('削除済み同Gmailの再登録・旧一覧再読込：履歴とファイル帰属を保持し役割操作を継続できる',async()=>{
  const old=byName('CPG HUB_社員 二郎'),oldBox=byName('CPG HUB_指示箱_社員 二郎'),beforeRows=JSON.stringify(old.tabs);
  await A.p.evaluate(async email=>{const s=RB.db.settings.data.staff.find(x=>x.email===email&&!x.removed);await RB.adminRemove(s)},SB);
  const oldPerms=JSON.stringify(old.perms),boxPerms=JSON.stringify(oldBox.perms);
  await A.p.evaluate(async email=>{await RB.adminAdd('再登録 見本',email,()=>{},{company:'CPY',role:'社員',gmCo:''})},SB);
  const fresh=byName('CPG HUB_再登録 見本');assert.ok(fresh&&fresh.id!==old.id);assert.equal(shares(fresh)[SB],'writer');
  assert.equal(JSON.stringify(old.perms),oldPerms,'old file is not re-shared to the re-registered account');assert.equal(JSON.stringify(oldBox.perms),boxPerms);assert.equal(JSON.stringify(old.tabs),beforeRows,'removed record history unchanged');
  const rows=tab(byName('CPG HUB_社員一覧'),'社員').slice(1).filter(r=>r[1]===SB);assert.equal(rows.length,2);assert.equal(rows.filter(r=>r[4]==='共有を外した').length,1);assert.equal(rows.filter(r=>r[4]==='共有中').length,1);
  await A.p.reload();await A.p.waitForFunction(()=>!!window.RB);await A.p.evaluate(()=>{setInterval(()=>document.querySelector('[data-share-yes]')?.click(),20)});
  await A.p.evaluate(async email=>{const s=RB.db.settings.data.staff.find(x=>x.email===email&&!x.removed);await RB.adminRoleSave(s.sheetId,{company:'CPY',role:'社員',gmCo:''},'',()=>{})},SB);
  const records=tab(byName('CPG HUB_社員一覧'),'共有管理履歴').slice(1).map(r=>JSON.parse(r[2]));assert.ok(records.some(x=>x.file===old.id&&x.email===SB&&x.action==='revoke'&&x.state==='verified'));assert.ok(records.some(x=>x.file===fresh.id&&x.email===SB&&x.action==='grant'&&x.state==='verified'));
 });
 await check('v1.50.28 経理・業務管理もタスクリクエストを出せる：担当の会社の社員の指示箱の編集者になる（担当でない会社の社員にはならない）',async()=>{
  const cur=await A.p.evaluate(([SA,SB])=>{const f=e=>RB.db.settings.data.staff.find(x=>x.email===e&&!x.removed);return {a:f(SA),b:f(SB)}},[SA,SB]);
  await A.p.evaluate(async id=>{await RB.adminRoleSave(id,{company:'CP',role:'経理',gmCo:'',charge:'CPY'},'',()=>{})},cur.a.sheetId);
  const after=await A.p.evaluate(SB=>{const b=RB.db.settings.data.staff.find(x=>x.email===SB&&!x.removed);return b.boxId},SB);
  assert.ok(after,'the CPY employee has a request box');
  assert.equal(shares(G.files[after])[SA],'writer','経理 (charge CPY) can write requests to the CPY employee');
  assert.equal(shares(G.files[cur.b.sheetId])[SA],'reader','and reads the record sheet as before');
  await A.p.evaluate(async id=>{await RB.adminRoleSave(id,{company:'CP',role:'業務管理',gmCo:'',charge:'AT'},'',()=>{})},cur.a.sheetId);
  assert.ok(!(SA in shares(G.files[after])),'業務管理 for AT only: not an editor of the CPY employee box');
  await A.p.evaluate(async id=>{await RB.adminRoleSave(id,{company:'CP,CPY',role:'GM',gmCo:'CPY'},'',()=>{})},cur.a.sheetId);
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.19 同じ会社のGMを2人に（追加）：記録シート・指示箱・見る人用一覧・予定の共有先が2人とも同じ。片方を外しても、もう片方は残る',async()=>{
  const GM2='test-gm2-cpy@example.com';
  const first=await A.p.evaluate(()=>{const g=RB.db.settings.data.staff.filter(x=>!x.removed&&x.gmCo==='CPY');return g.map(x=>x.email)});
  assert.equal(first.length,1,'one CPY GM before: '+first.join());const G1=first[0];
  await A.p.evaluate(async GM2=>{await RB.adminAdd('見本 室長',GM2,()=>{},{company:'CPY',role:'GM',gmCo:'CPY'},'')},GM2);
  const gms=await A.p.evaluate(()=>RB.db.settings.data.staff.filter(x=>!x.removed&&x.gmCo==='CPY').map(x=>x.email).sort());
  assert.deepEqual(gms,[G1,GM2].sort(),'both stay GM');
  const cur=await A.p.evaluate(SB=>{const s=RB.db.settings.data.staff.find(x=>x.email===SB&&!x.removed);return {sheet:s.sheetId,box:s.boxId,view:RB.db.settings.data.viewListId}},SB);
  const sB=G.files[cur.sheet],bB=G.files[cur.box],vl=G.files[cur.view];assert.ok(sB&&bB&&vl,'current files');
  for(const g of [G1,GM2]){assert.equal(shares(sB)[g],'reader',g+' reads the record sheet');assert.equal(shares(bB)[g],'writer',g+' can send requests');assert.equal(shares(vl)[g],'reader',g+' reads the viewer list');
   assert.ok(tab(sB,'予定の共有先').some(r=>r[1]===g),g+' is a calendar share target');}
  const list=tab(vl,'一覧'),ri=list[0].indexOf('役割'),gi=list[0].indexOf('GMの会社');
  assert.deepEqual(list.slice(1).filter(r=>r[ri]==='GM'&&r[gi]==='CPY').map(r=>r[1]).sort(),[G1,GM2].sort());
  /* 片方（最初のGM）を外す */
  await A.p.evaluate(async G1=>{const s=RB.db.settings.data.staff.find(x=>x.email===G1&&!x.removed);await RB.adminRoleSave(s.sheetId,{company:s.company,role:'社員',gmCo:''},'',()=>{})},G1);
  assert.ok(!(G1 in shares(bB)),'removed GM loses the request box');
  assert.equal(shares(sB)[GM2],'reader');assert.equal(shares(bB)[GM2],'writer');assert.equal(shares(vl)[GM2],'reader');
  assert.ok(tab(sB,'予定の共有先').some(r=>r[1]===GM2));assert.ok(!tab(sB,'予定の共有先').some(r=>r[1]===G1),'removed GM is no longer a target');
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.19 統括GM：同じ会社のほかのGMの記録シートも見る（一方向）。統括は会社ごとに1人。印を外すと共有が外れる',async()=>{
  const GM2='test-gm2-cpy@example.com';
  const ids=await A.p.evaluate(([SA,GM2])=>{const f=e=>RB.db.settings.data.staff.find(x=>x.email===e&&!x.removed);return {sa:f(SA).sheetId,saCo:f(SA).company,lead:f(GM2).sheetId,view:RB.db.settings.data.viewListId}},[SA,GM2]);
  /* 2人目のGM（GM2）に統括の印、SA をもう一度 CPY のGMに（印なし） */
  await A.p.evaluate(async([id])=>{await RB.adminRoleSave(id,{company:'CPY',role:'GM',gmCo:'CPY',gmLead:true},'',()=>{})},[ids.lead]);
  await A.p.evaluate(async([id,co])=>{await RB.adminRoleSave(id,{company:co,role:'GM',gmCo:'CPY'},'',()=>{})},[ids.sa,ids.saCo]);
  const sa=G.files[ids.sa],lead=G.files[ids.lead],vl=G.files[ids.view];
  assert.equal(shares(sa)[GM2],'reader','lead reads the other GM');
  assert.ok(!(SA in shares(lead)),'the other GM never reads the lead');
  assert.ok(tab(sa,'予定の共有先').some(r=>r[1]===GM2),'lead is a calendar target of the other GM');
  assert.ok(!tab(lead,'予定の共有先').some(r=>r[1]===SA),'not the reverse');
  const list=tab(vl,'一覧'),li=list[0].indexOf('GM統括');assert.ok(li>=0,'viewer list has the mark column');
  assert.equal(list.find(r=>r[1]===GM2)[li],'統括');assert.equal(list.find(r=>r[1]===SA)[li]||'','');
  const sl=tab(byName('CPG HUB_社員一覧'),'社員'),si=sl[0].indexOf('GM統括');assert.equal(sl.find(r=>r[1]===GM2&&r[4]==='共有中')[si],'統括');
  /* 統括は会社ごとに1人：SA にも付けようとすると止まる（共有は変わらない） */
  const err=await A.p.evaluate(async([id,co])=>{try{await RB.adminRoleSave(id,{company:co,role:'GM',gmCo:'CPY',gmLead:true},'',()=>{});return 'saved'}catch(e){return e.message}},[ids.sa,ids.saCo]);
  assert.match(err,/CPYの統括GMはすでに見本 室長さんです/);assert.ok(!(SA in shares(lead)));
  /* 印を外すと、統括GMが付けた共有（ほかのGMの記録シート）は外れる。社員の記録はGMとして見たまま */
  await A.p.evaluate(async([id])=>{await RB.adminRoleSave(id,{company:'CPY',role:'GM',gmCo:'CPY',gmLead:false},'',()=>{})},[ids.lead]);
  assert.ok(!(GM2 in shares(sa)),'mark removed: the share is removed '+JSON.stringify(shares(sa)));
  assert.ok(!tab(sa,'予定の共有先').some(r=>r[1]===GM2));
  const cur=await A.p.evaluate(SB=>RB.db.settings.data.staff.find(x=>x.email===SB&&!x.removed).sheetId,SB);
  assert.equal(shares(G.files[cur])[GM2],'reader','still sees the employees as a GM');
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.24 記号・表示名だけの保存は共有を付け替えない：社員一覧と記録シートの「受付番号の記号」だけを書く。会社が変わっていれば止める',async()=>{
  const cur=await A.p.evaluate(SB=>{const s=RB.db.settings.data.staff.find(x=>x.email===SB&&!x.removed);return {id:s.sheetId,company:s.company,role:s.role,gmCo:s.gmCo||'',charge:s.charge||''}},SB);
  const before=G.calls.length,perm=()=>G.calls.slice(before).filter(x=>/permissions/.test(String(x[2]))&&x[1]!=='GET').length;
  const log=await A.p.evaluate(async c=>{const out=[];await RB.adminLightSave(c.id,{company:c.company,role:c.role,gmCo:c.gmCo,charge:c.charge,displayName:'見本の表示',caseCode:'KOI'},(t,ok)=>out.push(t));return out},cur);
  assert.equal(perm(),0,'no permission writes');assert.ok(!G.calls.slice(before).some(x=>/permissions/.test(String(x[2]))),'no permission reads either');
  assert.match(log.join('/'),/表示名を「見本の表示」に、受付番号の記号を KOI にしました（共有は変えていません）/);
  const sl=tab(byName('CPG HUB_社員一覧'),'社員'),si=sl[0].indexOf('シートID'),ci=sl[0].indexOf('受付番号の記号'),di=sl[0].indexOf('表示名');
  const row=sl.find(r=>r[si]===cur.id);assert.equal(row[ci],'KOI');assert.equal(row[di],'見本の表示');
  assert.deepEqual(tab(G.files[cur.id],'受付番号の記号'),[['受付番号の記号'],['KOI']]);
  const vl=tab(G.files[await A.p.evaluate(()=>RB.db.settings.data.viewListId)],'一覧');assert.equal(vl.find(r=>r[5]===cur.id)[vl[0].indexOf('表示名')],'見本の表示');
  const err=await A.p.evaluate(async c=>{try{await RB.adminLightSave(c.id,{company:'CP',role:c.role,gmCo:c.gmCo,charge:c.charge,displayName:'',caseCode:'KOJ'},()=>{});return 'saved'}catch(e){return e.message}},cur);
  assert.match(err,/会社・役割が変わっています/);assert.equal(tab(G.files[cur.id],'受付番号の記号')[1][0],'KOI','nothing written');
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.24 記号をまとめて保存：共有を付け替えず、社員一覧と各人の記録シートに書く。重なりは止める。通信の失敗は待ってやり直す',async()=>{
  await A.p.evaluate(()=>RB.noWait());
  const ids=await A.p.evaluate(()=>RB.db.settings.data.staff.filter(x=>!x.removed).map(x=>({id:x.sheetId,name:x.name,code:x.caseCode})));
  const [a,b]=ids;const before=G.calls.length;
  const bad=await A.p.evaluate(async([a,b])=>{try{await RB.adminCodesSave([{sheetId:a.id,name:a.name,code:'XYZ'},{sheetId:b.id,name:b.name,code:'XYZ'}],()=>{});return 'saved'}catch(e){return e.message}},[a,b]);
  assert.match(bad,/XYZ」は.*さんと重なります/);assert.notEqual(tab(G.files[a.id],'受付番号の記号')[1][0],'XYZ');
  G.failTab='受付番号の記号';G.failFile=b.id;G.failLeft=1;
  const log=await A.p.evaluate(async([a,b])=>{const out=[];await RB.adminCodesSave([{sheetId:a.id,name:a.name,code:'AAX'},{sheetId:b.id,name:b.name,code:'BBX'}],t=>out.push(t));return out},[a,b]);
  assert.equal(G.failLeft,0,'the injected failure was hit');G.failTab='';G.failFile='';delete G.failLeft;
  assert.equal(G.calls.slice(before).filter(x=>/permissions/.test(String(x[2]))).length,0,'no sharing calls');
  assert.match(log.join('/'),/2人分の受付番号の記号を保存しました/);assert.match(log.join('/'),/2人の記録シートに受付番号の記号を書きました/);
  assert.deepEqual(tab(G.files[a.id],'受付番号の記号')[1],['AAX']);assert.deepEqual(tab(G.files[b.id],'受付番号の記号')[1],['BBX'],'retried after one failure');
  const sl=tab(byName('CPG HUB_社員一覧'),'社員'),si=sl[0].indexOf('シートID'),ci=sl[0].indexOf('受付番号の記号');assert.equal(sl.find(r=>r[si]===a.id)[ci],'AAX');assert.equal(sl.find(r=>r[si]===b.id)[ci],'BBX');
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.31 同期：変わっていない人の記録シート・指示箱は読み直さず前の内容を使う。書いた人・指示箱が変わった人だけ読む。12時間たつと全部読む',async()=>{
  const sheetReads=(from,ids)=>G.calls.slice(from).filter(c=>c[1]==='GET'&&ids.some(id=>c[2].startsWith('/v4/spreadsheets/'+id))).map(c=>c[2].split('/')[3]);
  await A.p.evaluate(()=>RB.corpRun());
  const info=await A.p.evaluate(()=>RB.ui.corp.data.filter(x=>x.ok).map(x=>({id:x.s.sheetId,box:x.s.boxId||'',name:x.s.name,cases:JSON.stringify(x.cases),box2:JSON.stringify(x.box)})));
  const ids=info.flatMap(x=>[x.id,x.box]).filter(Boolean);assert.ok(info.length>=3,JSON.stringify(info));
  /* 何も変わっていない：読まない（更新日時の一覧は読む） */
  let mark=G.calls.length;await A.p.evaluate(()=>RB.corpRun());
  assert.deepEqual(sheetReads(mark,ids),[],'no record sheet / box read when nothing changed');
  assert.ok(G.calls.slice(mark).some(c=>c[1]==='GET'&&c[2]==='/drive/v3/files'),'modified times are listed');
  let now=await A.p.evaluate(()=>({t:RB.ui.corp.timing,d:RB.ui.corp.data.filter(x=>x.ok).map(x=>({id:x.s.sheetId,cases:JSON.stringify(x.cases),box2:JSON.stringify(x.box),reused:!!x.reused}))}));
  assert.equal(now.t.reused,info.length);assert.ok(now.d.every(x=>x.reused));
  for(const x of info){const y=now.d.find(z=>z.id===x.id);assert.equal(y.cases,x.cases);assert.equal(y.box2,x.box2)}
  /* 管理 見本の記録シートが変わった：その人だけ読み直して、新しい行が出る */
  const sB=G.files[info.find(x=>x.name==='管理 見本').id],caseTab=sB.tabs.find(t=>t.title==='案件');
  if(!caseTab.rows.length)caseTab.rows.push(['受付番号','物件']);const hdr=caseTab.rows[0];touch(sB);caseTab.rows.push(hdr.map(k=>k==='受付番号'?'TEST-0001':k==='物件'||k==='物件名'?'見本ハイツ（テスト）':''));
  mark=G.calls.length;await A.p.evaluate(()=>RB.corpRun());
  {const m=info.find(x=>x.id===sB.id);assert.deepEqual([...new Set(sheetReads(mark,ids))].sort(),[m.id,m.box].filter(Boolean).sort(),'only that person (sheet and box)')}
  assert.ok(await A.p.evaluate(id=>RB.ui.corp.data.find(x=>x.s.sheetId===id).cases.some(r=>r['受付番号']==='TEST-0001'),sB.id));
  /* 社員 一郎の指示箱だけ変わった：その人（記録シートと指示箱）を読み直す */
  const a=info.find(x=>x.name==='社員 一郎'),bA=G.files[a.box];touch(bA);tab(bA,'指示').push(['B-TEST-0001','箱だけ変わった（テスト）','','2026-10-30','未完了',ZEN,'見本 太郎','','']);
  mark=G.calls.length;await A.p.evaluate(()=>RB.corpRun());
  assert.deepEqual([...new Set(sheetReads(mark,ids))].sort(),[a.id,a.box].sort());
  assert.ok(await A.p.evaluate(id=>RB.ui.corp.data.find(x=>x.s.sheetId===id).box.some(o=>o['指示ID']==='B-TEST-0001'),a.id));
  /* 更新日時が取れないファイルは読む（一覧の取得に失敗したとき） */
  G.failList=true;mark=G.calls.length;await A.p.evaluate(()=>RB.corpRun());G.failList=false;
  assert.equal(new Set(sheetReads(mark,ids)).size,ids.length,'all read when modified times are unknown');
  /* 12時間たつと、変わっていなくても全部読む */
  await A.p.evaluate(()=>RB.corpRun());
  await A.p.clock.setSystemTime(new Date('2026-10-30T14:30:00Z'));
  mark=G.calls.length;await A.p.evaluate(()=>RB.corpRun());
  assert.equal(new Set(sheetReads(mark,ids)).size,ids.length,'all read after 12 hours');
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.32 ふつうの社員の追加は、その人の分（記録シート・指示箱・その人の会社の数字）だけ確かめて合わせ、ほかの人のファイルには触らない。GMの追加は今までどおり全員',async()=>{
  const others=await A.p.evaluate(()=>RB.db.settings.data.staff.filter(s=>!s.removed).flatMap(s=>[s.sheetId,s.boxId]).filter(Boolean));
  const touched=from=>[...new Set(G.calls.slice(from).map(c=>(String(c[2]).match(/(?:spreadsheets|files)\/([^/:?]+)/)||[])[1]).filter(Boolean))];
  let mark=G.calls.length;
  await A.p.evaluate(async()=>{await RB.adminAdd('追加 見本','test-add-plain@example.com',()=>{},{company:'CP',role:'社員',gmCo:''})});
  const t1=touched(mark),hit=others.filter(id=>t1.includes(id));
  assert.deepEqual(hit,[],'other people\'s files untouched: '+hit.join());
  const nw=await A.p.evaluate(()=>RB.db.settings.data.staff.find(s=>s.email==='test-add-plain@example.com'));
  assert.ok(nw&&nw.sheetId&&nw.boxId,JSON.stringify(nw));
  const sh=shares(G.files[nw.sheetId]);assert.equal(sh['test-add-plain@example.com'],'writer');assert.equal(sh[ZEN],'reader','全社 reads the new record sheet');
  assert.equal(shares(G.files[nw.boxId])[ZEN],'writer','全社 can send to the new person');
  const list=tab(G.files[await A.p.evaluate(()=>RB.db.settings.data.listId)],'社員');assert.ok(list.some(r=>r[1]==='test-add-plain@example.com'));
  const vl=tab(byName('CPG HUB_見る人用一覧'),'一覧');assert.ok(vl.some(r=>r[1]==='test-add-plain@example.com'),'the viewer list still gets the new person');
  /* 全社・GMなど見る人の追加は、ほかの人の記録シートにも共有が増えるので全員を確かめる */
  mark=G.calls.length;
  await A.p.evaluate(async()=>{await RB.adminAdd('追加 統括','test-add-gm@example.com',()=>{},{company:'CP',role:'GM',gmCo:'CP'})});
  assert.ok(others.some(id=>touched(mark).includes(id)),'a viewer add checks everyone');
  assert.deepEqual(A.errors,[]);
 });
 await check('v1.50.36 見る人用一覧は社長のどの端末でも同じもの：古い一覧を覚えた端末も、空の端末も、いちばん新しい一覧に、共有を合わせたあとは社員一覧の「HUBの設定」に残した一覧にそろう。古い一覧には移転先を書き、見る人の端末は移る',async()=>{
  const cur=byName('CPG HUB_見る人用一覧').id,list=await A.p.evaluate(()=>({listId:RB.db.settings.data.listId,folder:RB.db.settings.data.folder}));
  assert.equal(await A.p.evaluate(()=>RB.db.settings.data.viewListId),cur);
  /* 前に別の端末が作った古い一覧（見る人には共有済み） */
  const old='shetOLDVIEW00000000000001';G.files[old]={id:old,name:'CPG HUB_見る人用一覧',owner:ADMIN,created:'2026-10-01T00:00:00.000Z',mt:'2026-10-01T00:00:00.000Z',mime:'application/vnd.google-apps.spreadsheet',parents:[list.folder],perms:[{id:'pv1',email:ZEN,role:'reader'}],tabs:[{title:'一覧',sheetId:0,rows:structuredClone(tab(G.files[cur],'一覧'))}]};
  const listF=G.files[list.listId],before=JSON.stringify(listF.tabs);
  /* 古い一覧を覚えた社長の端末：読み込むと、いちばん新しい一覧にそろう（このときは何も書かない） */
  const B=await device(ADMIN,400);
  await B.p.evaluate(async([l,old])=>{const d=RB.db.settings.data;d.admin=true;d.ob={legacy:true};d.folder=l.folder;d.listId=l.listId;d.viewListId=old;RB.noWait();await RB.corpRun()},[list,old]);
  assert.equal(await B.p.evaluate(()=>RB.db.settings.data.viewListId),cur,'switched to the newest list');
  assert.equal(JSON.stringify(listF.tabs),before,'reading does not write the staff list');
  /* 共有を合わせると、使う一覧を社員一覧に残し、古い一覧に移転先を書く */
  await A.p.evaluate(async()=>{const s=RB.db.settings.data.staff.find(x=>!x.removed&&x.role==='社員');await RB.adminRoleSave(s.sheetId,{company:s.company,role:s.role,gmCo:s.gmCo||'',displayName:'見本表示'},'',()=>{})});
  assert.deepEqual(tab(listF,'HUBの設定'),[['項目','値'],['見る人用一覧ID',cur]]);
  assert.deepEqual(tab(G.files[old],'移転先'),[['新しい見る人用一覧ID'],[cur]]);
  /* 空の社長の端末：古い一覧のほうが新しく更新されていても、社員一覧に残した一覧を使う */
  G.files[old].mt='2026-12-01T00:00:00.000Z';
  const C=await device(ADMIN,400);
  await C.p.evaluate(async l=>{const d=RB.db.settings.data;d.admin=true;d.ob={legacy:true};d.folder=l.folder;d.listId=l.listId;d.viewListId='';RB.noWait();await RB.corpRun()},list);
  assert.equal(await C.p.evaluate(()=>RB.db.settings.data.viewListId),cur,'the shared setting wins');
  /* 古い一覧につないでいる見る人の端末：次の読み込みで新しい一覧に移る */
  const Z=await device(ZEN,400);
  await Z.p.evaluate(async([old,me])=>{const x=RB.db.settings.data;x.viewListId=old;x.viewEmail=me;await RB.corpRun()},[old,ZEN]);
  assert.equal(await Z.p.evaluate(()=>RB.db.settings.data.viewListId),cur,'viewer follows the move');
  assert.deepEqual(B.errors.concat(C.errors,Z.errors),[]);await B.c.close();await C.c.close();await Z.c.close();
 });
 await check('複数有効同Gmailの異常は社員追加/役割変更/削除の前に停止、新ファイルも作らない',async()=>{
  const table=tab(byName('CPG HUB_社員一覧'),'社員'),saved=structuredClone(table),duplicate=structuredClone(table.find((r,i)=>i&&r[1]===SB&&r[4]==='共有中'));duplicate[2]='synthetic-conflict-record';duplicate[11]='';table.push(duplicate);
  const before=G.calls.filter(x=>['POST','PUT','PATCH','DELETE'].includes(x[1])).length,files=Object.keys(G.files).length;
  for(const action of ['add','role','remove']){const error=await A.p.evaluate(async({action,email})=>{try{const s=RB.db.settings.data.staff.find(x=>x.email===email&&!x.removed);if(action==='add')await RB.adminAdd('別の 見本','fresh-other@example.com',()=>{},{company:'CP',role:'社員',gmCo:''});else if(action==='role')await RB.adminRoleSave(s.sheetId,{company:'CPY',role:'社員',gmCo:''},'',()=>{});else await RB.adminRemove(s);return 'unexpected'}catch(e){return e.message}},{action,email:SB});assert.match(error,/有効な社員.*重複/)}
  assert.equal(Object.keys(G.files).length,files);assert.equal(G.calls.filter(x=>['POST','PUT','PATCH','DELETE'].includes(x[1])).length,before,'zero remote writes before rejecting invalid active accounts');
  table.splice(0,table.length,...saved);
 });
 await A.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
