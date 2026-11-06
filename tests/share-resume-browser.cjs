/* v1.50.12 共有の付け替え：途中で止まっても何も壊れず、2回目で続きが正しく進む（重複しない）。変わらない人の記録シートには書かない。
   Synthetic accounts and an in-memory Google (Drive files and permissions, Sheets tabs and values).
   Fictional names and example.com addresses only. No live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.RB={get db(){return DB},ui,go,render,roBuild,adminAdd,adminRoleSave,adminRemove,corpRun,boxState,corpKeepSave,permList,adminShareOperation,adminShareSync,stub(){myEmail=async()=>ADMIN_ACCOUNT}};';
const ADMIN='synthetic-boss@example.com',SA='test-staff-a@example.com',SB='test-staff-b@example.com',GM='test-gm-cpy@example.com',ZEN='test-zensha@example.com';
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
  if(m==='POST'){if(G.failPermName&&f.name===G.failPermName)return no(503);const b=req.postDataJSON(),x={id:'perm'+(++G.perm),email:b.emailAddress,role:b.role};f.perms.push(x);return J({id:x.id})}
  if(m==='PATCH'){const x=f.perms.find(x=>x.id===mm[2]);if(!x)return no(404);x.role=req.postDataJSON().role;return J({id:x.id})}
  if(m==='DELETE'){f.perms=f.perms.filter(x=>x.id!==mm[2]);return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}})}}
 mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
 if(mm){const f=G.files[mm[1]],rest=mm[2];if(!f)return no(404);
  if(m==='GET'&&!rest){if(!canRead(f,acct))return no(403);return J({properties:{title:f.name},sheets:f.tabs.map(t=>({properties:{title:t.title,sheetId:t.sheetId}}))})}
  if(rest==='/values:batchGet'){if(!canRead(f,acct))return no(403);const ts=u.searchParams.getAll('ranges').map(r=>f.tabs.find(t=>t.title===tabName(r)));if(ts.some(t=>!t))return no(400);return J({valueRanges:ts.map(t=>({values:t.rows}))})}
  if(!canWrite(f,acct))return no(403);
  if(rest===':batchUpdate'){for(const r of req.postDataJSON().requests){if(r.updateSheetProperties)f.tabs.find(t=>t.sheetId===r.updateSheetProperties.properties.sheetId).title=r.updateSheetProperties.properties.title;if(r.addSheet)f.tabs.push({title:r.addSheet.properties.title,sheetId:f.tabs.length+100,rows:[]})}return J({})}
  if(rest==='/values:batchUpdate'){const b=req.postDataJSON();for(const d of b.data){const t=f.tabs.find(x=>x.title===tabName(d.range));if(!t)return no(400);put(t,d.range,d.values)}G.calls.push([acct,'BATCH',f.id,b.data.map(d=>d.range).join(',')]);return J({})}
  const vm=rest.match(/^\/values\/(.+?)(:clear|:append)?$/);
  if(vm){const range=vm[1],t=f.tabs.find(x=>x.title===tabName(range));if(!t)return no(400);
   if(vm[2]===':clear'){t.rows=[];return J({})}
   if(vm[2]===':append'){t.rows.push(...req.postDataJSON().values);return J({})}
   if(m==='PUT'){if(G.failTab&&t.title===G.failTab&&(!G.failFile||G.failFile===f.id))return no(500);put(t,range,req.postDataJSON().values);return J({})}}
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
 const S1='synthetic-s1@example.com',S2='synthetic-s2@example.com',S3='synthetic-s3@example.com';
 const prog=async()=>A.p.evaluate(()=>{const el=document.getElementById('shareProgress');return el?el.textContent:''});
 const numFiles=co=>Object.values(G.files).filter(f=>f.name==='CPG HUB_会社の数字_'+co);
 const emails=f=>f.perms.map(x=>x.email+':'+x.role).sort();
 await check('準備：3人を追加すると、会社ごとの「会社の数字」を1つずつ作り、その会社の人にだけ閲覧共有する',async()=>{
  await A.p.evaluate(async([S1,S2,S3])=>{RB.stub();RB.db.settings.data.admin=true;const log=()=>{};
   await RB.adminAdd('見本 一郎',S1,log,{company:'CP',role:'社員',gmCo:''});
   await RB.adminAdd('見本 二郎',S2,log,{company:'CP,CPY',role:'社員',gmCo:''});
   await RB.adminAdd('見本 三郎',S3,log,{company:'AT',role:'社員',gmCo:''})},[S1,S2,S3]);
  for(const co of ['CP','CPY','AT'])assert.equal(numFiles(co).length,1,co);
  assert.deepEqual(emails(numFiles('CP')[0]),[S1+':reader',S2+':reader']);assert.deepEqual(emails(numFiles('CPY')[0]),[S2+':reader']);assert.deepEqual(emails(numFiles('AT')[0]),[S3+':reader']);
  const s3=byName('CPG HUB_見本 三郎');assert.deepEqual(tab(s3,'会社の数字の場所'),[['会社','ファイルID'],['AT',numFiles('AT')[0].id]]);
 });
 await check('1回目：三郎さんを AT→CPY にする途中、「会社の数字（CPY）」への共有で Google が 503 → 止まり、理由と「反映した分は残っている」を日本語で出す',async()=>{
  G.failPermName='CPG HUB_会社の数字_CPY';
  const msg=await A.p.evaluate(async S3=>{const s=RB.db.settings.data.staff.find(x=>x.email===S3);try{await RB.adminRoleSave(s.sheetId,{company:'CPY',role:'社員',gmCo:''},'',()=>{});return 'saved'}catch(e){return e.message}},S3);
  G.failPermName='';
  assert.notEqual(msg,'saved');const t=await prog();
  assert.match(t,/ここで止まりました/);assert.match(t,/理由：Google側の一時的な不具合（503）|理由：.*503/);assert.doesNotMatch(t,/signal is aborted|続きから/);
  assert.equal(await A.p.evaluate(S3=>RB.db.settings.data.staff.find(x=>x.email===S3).company,S3),'AT','role is not saved when sharing stopped');
  for(const co of ['CP','CPY','AT'])assert.equal(numFiles(co).length,1,'no new files '+co);
  await A.p.evaluate(()=>document.querySelector('#shareProgress button')?.click());
 });
 await check('2回目：同じ操作で最後まで進む。ファイルも共有も重複しない（三郎さんは CPY に1つ、AT から外れる）',async()=>{
  const msg=await A.p.evaluate(async S3=>{const s=RB.db.settings.data.staff.find(x=>x.email===S3);try{await RB.adminRoleSave(s.sheetId,{company:'CPY',role:'社員',gmCo:''},'',()=>{});return 'saved'}catch(e){return e.message}},S3);
  assert.equal(msg,'saved');
  for(const co of ['CP','CPY','AT'])assert.equal(numFiles(co).length,1,co);
  assert.deepEqual(emails(numFiles('CPY')[0]),[S2+':reader',S3+':reader']);assert.deepEqual(emails(numFiles('AT')[0]),[]);assert.deepEqual(emails(numFiles('CP')[0]),[S1+':reader',S2+':reader']);
  const s3=byName('CPG HUB_見本 三郎');assert.deepEqual(tab(s3,'会社の数字の場所'),[['会社','ファイルID'],['CPY',numFiles('CPY')[0].id]]);
  await A.p.evaluate(()=>document.querySelector('#shareProgress button')?.click());
 });
 await check('3回目（変更なし）：記録シートの「会社の数字の場所」「予定の共有先」には書かない。進み具合は「○／○」で出す',async()=>{
  await A.p.evaluate(()=>{window.__prog=[];new MutationObserver(()=>{const el=document.getElementById('shareProgress');if(el){const t=el.firstChild?el.firstChild.textContent:el.textContent;if(window.__prog.at(-1)!==t)window.__prog.push(t)}}).observe(document.body,{subtree:true,childList:true,characterData:true})});
  const before=G.calls.length,log=[];
  const lines=await A.p.evaluate(async()=>{const out=[];await RB.adminShareOperation(()=>RB.adminShareSync(t=>out.push(t)));return out});
  assert.ok(!lines.some(t=>/要確認/.test(t)),'the earlier failed grant does not remain as 要確認: '+lines.join(' | '));
  const writes=G.calls.slice(before).filter(x=>x[1]==='PUT'&&/会社の数字の場所|予定の共有先/.test(x[2]));
  assert.deepEqual(writes,[],'unchanged tabs are not rewritten');
  const p=await A.p.evaluate(()=>window.__prog);
  for(const re of [/^記録シートと指示箱を確かめています \d+／3$/,/^共有の一覧を読んでいます \d+／\d+$/,/^変える前にもう一度確かめています \d+／\d+$/,/^会社の数字の場所を確かめています \d+／3$/])assert.ok(p.some(t=>re.test(t)),re+' / '+p.join(' | '));
  assert.match(p.at(-1),/完了しました/);
 });
 await check('スクリプトのエラーなし',async()=>{assert.deepEqual(A.errors,[])});
 await A.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
