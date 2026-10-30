/* 指示箱（v1.47.0）: synthetic accounts and an in-memory Google (Drive files and permissions, Sheets tabs and values).
   Fictional names and example.com addresses only. No live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.RB={get db(){return DB},ui,go,render,roBuild,adminAdd,adminRoleSave,corpRun,boxState};';
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
  if(m==='GET'&&!mm[2])return J({permissions:[{id:'owner',emailAddress:f.owner,role:'owner'}].concat(f.perms.map(x=>({id:x.id,emailAddress:x.email,role:x.role})))});
  if(m==='POST'){const b=req.postDataJSON(),x={id:'perm'+(++G.perm),email:b.emailAddress,role:b.role};f.perms.push(x);return J({id:x.id})}
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
   await RB.adminAdd('進藤 試験',GM,log,{company:'CPY',role:'GM',gmCo:'CPY'});
   await RB.adminAdd('見本 太郎',ZEN,log,{company:'CP',role:'全社',gmCo:''})},[SA,SB,GM,ZEN]);
  const bA=byName('CPG HUB_指示箱_社員 一郎'),bB=byName('CPG HUB_指示箱_社員 二郎'),bG=byName('CPG HUB_指示箱_進藤 試験');
  assert.ok(bA&&bB&&bG,'boxes for the three people someone can send to');
  assert.ok(!byName('CPG HUB_指示箱_見本 太郎'),'no box when nobody can send to that person');
  assert.equal(bA.owner,ADMIN);
  assert.deepEqual(tab(bB,'指示')[0],['指示ID','内容','期限','指示日','状態','出した人Gmail','出した人の表示','取消日時','取消した人']);
  assert.deepEqual(shares(bB),{[SB]:'reader',[GM]:'writer',[ZEN]:'writer'});
  assert.deepEqual(shares(bA),{[SA]:'reader',[ZEN]:'writer'});
  const sB=byName('CPG HUB_社員 二郎');
  assert.equal(shares(sB)[GM],'reader','GM stays a reader of the record sheet');assert.equal(shares(sB)[SB],'writer');
  assert.deepEqual(tab(sB,'連絡')[0],['指示箱ID','指示箱のリンク','書いた日時']);assert.equal(tab(sB,'連絡')[1][0],bB.id);
  const list=tab(byName('CPG HUB_社員一覧'),'社員');assert.equal(list[0].at(-1),'指示箱ID');
  const vl=tab(byName('CPG HUB_見る人用一覧'),'一覧');assert.equal(vl[0].at(-1),'指示箱ID');assert.ok(vl.some(r=>r[1]===SB&&r.at(-1)===bB.id));
 });
 const vlId=byName('CPG HUB_見る人用一覧').id;
 const viewer=async(acct,width)=>{const d=await device(acct,width);await d.p.evaluate(async([id,me])=>{const x=RB.db.settings.data;x.viewListId=id;x.viewEmail=me;await RB.corpRun();RB.go('home')},[vlId,acct]);return d};
 for(const width of [320,400]){
  const g=await viewer(GM,width);
  await check('GMの端末：自分の会社の社員にだけ出せ、指示箱に1行足して読み戻す '+width+'px',async()=>{
   const forms=await g.p.$$eval('[data-badd]',a=>a.map(x=>x.dataset.badd));
   const ks=await g.p.evaluate(()=>RB.ui.corp.data.map((x,i)=>[i,x.s.name]));
   assert.deepEqual(forms.map(k=>ks.find(x=>String(x[0])===k)[1]),['社員 二郎'],JSON.stringify(ks));
   const k=forms[0];await g.p.fill('#bi_t'+k,'見積を出す（テスト'+width+'）');await g.p.fill('#bi_d'+k,'2026-11-05');await g.p.click('[data-badd="'+k+'"]');
   await g.p.waitForFunction(()=>!RB.ui.bBusy&&RB.ui.bMsg&&!/送っています/.test(RB.ui.bMsg.text));
   assert.ok((await g.p.textContent('main')).includes('v1.47.1 以降の CPG HUB で同期すると届きます'));
   const row=tab(byName('CPG HUB_指示箱_社員 二郎'),'指示').find(r=>r[1]==='見積を出す（テスト'+width+'）');
   assert.ok(/^B-20261030-[a-z0-9]{6}$/.test(row[0]),row[0]);
   assert.deepEqual(row.slice(2),['2026-11-05','2026-10-30','未完了',GM,'GM 進藤','','']);
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
  sB.tabs.push({title:'指示の報告',sheetId:300,rows:[['指示ID','状態','完了日','完了メモ','書いた日時'],[r1[0],'完了','2026-10-30','先方に送付済み（テスト）','2026-10-30T02:00:00.000Z']]});
  const g=await viewer(GM,400);
  let t=await g.p.textContent('main');
  assert.ok(t.includes('あなたが出したタスクリクエスト')&&t.includes('✓ 10/30完了')&&t.includes('メモ：先方に送付済み（テスト）'),t.slice(0,600));
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
  const names=await z.p.evaluate(()=>[...document.querySelectorAll('[data-badd]')].map(b=>RB.ui.corp.data[Number(b.dataset.badd)].s.name).sort());
  assert.deepEqual(names,['社員 一郎','社員 二郎','進藤 試験'].sort());
  assert.ok(!(await z.p.textContent('main')).includes('見積を出す（テスト'),'requests of another issuer are not listed for 全社');
  const k=await z.p.evaluate(()=>String(RB.ui.corp.data.findIndex(x=>x.s.name==='社員 一郎')));
  await z.p.fill('#bi_t'+k,'書類を出す（全社テスト）');await z.p.click('[data-badd="'+k+'"]');
  await z.p.waitForFunction(()=>!RB.ui.bBusy&&RB.ui.bMsg&&!/送っています/.test(RB.ui.bMsg.text));
  const row=tab(byName('CPG HUB_指示箱_社員 一郎'),'指示').find(r=>r[1]==='書類を出す（全社テスト）');
  assert.deepEqual([row[2],row[4],row[5],row[6]],['','未完了',ZEN,'見本']);
  assert.deepEqual(z.errors,[]);await z.c.close();
 });
 await check('社長の端末：全部の指示を出した人の表示付きで見られ、期限なしは指示一覧に「○○から」で残る',async()=>{
  await A.p.evaluate(async()=>{await RB.corpRun();RB.go('home')});
  const t=await A.p.textContent('main');
  assert.ok(t.includes('タスクリクエスト（GM・全社から）')&&t.includes('GM 進藤から')&&t.includes('見本から'));
  assert.ok(t.includes('✓ 10/30完了')&&t.includes('取り消し'));
  assert.ok((await A.p.$$('[data-bcancel]')).length>=1,'the 社長 can cancel open ones');
  await A.p.evaluate(()=>RB.go('todo',{tPeriod:'today',tTantou:'all'}));
  const reqs=await A.p.$$eval('.reqbox .card',a=>a.map(x=>x.textContent));
  assert.ok(!reqs.some(x=>x.includes('書類を出す（全社テスト）')),'no-date request stays out of ToDo');
  await A.p.click('[data-nav=requests]');
  const all=await A.p.$$eval('.request-compact .card',a=>a.map(x=>x.textContent));
  assert.ok(all.some(x=>x.includes('見本から')&&x.includes('書類を出す（全社テスト）')),all.join('|'));
  assert.ok(!reqs.some(x=>x.includes('見積を出す（テスト')),'done / cancelled are not in the ToDo block');
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
  await A.p.evaluate(async([SA])=>{const s=RB.db.settings.data.staff.find(x=>x.email===SA);await RB.adminRoleSave(s.sheetId,{company:'CP,CPY',role:'GM',gmCo:'CPY'},'',()=>{})},[SA]);
  assert.equal(shares(bB)[SA],'writer');
  assert.equal(shares(byName('CPG HUB_社員 二郎'))[SA],'reader','new GM reads the record sheet only');
  assert.deepEqual(A.errors,[]);
 });
 await A.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
