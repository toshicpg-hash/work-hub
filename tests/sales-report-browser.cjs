/* v1.50.40 売上報告（試作・社長の端末だけ）：試作用のシート（架空の数字）を作って読み、月ごと・会社ごと・担当者別に出す。シートを書き換えて読み直すと変わる。社員の端末には出ない。
   Synthetic fixtures only (fictional names, example.com). In-memory Google; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),ADMIN='toshi.cpg@gmail.com',KEY='workhub_proto_v1';
const hook='window.BB={get db(){return DB},get ui(){return ui},go,render,save,salesParse,'+
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
const tabOf=(f,t)=>(f.tabs.find(x=>x.title===t)||{rows:null}).rows;
const openAdmin=async p=>{await p.evaluate(()=>{BB.go('stats');document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});await p.waitForSelector('#boss-backup')};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const open=async p=>{await p.evaluate(()=>{BB.go('stats');document.querySelectorAll('details[data-fold="sales"]').forEach(d=>d.open=true)});await p.waitForSelector('#stats-sales')};
 for(const width of [400,360]){
  G.files={};G.n=0;
  /* 社員一覧（HUBの設定を書く先）とフォルダ */
  G.files.folder0000000000000000001={id:'folder0000000000000000001',name:'CPG HUB データ',owner:ADMIN,created:'2026-10-01T00:00:00Z',perms:[],tabs:[]};
  G.files.list00000000000000000001={id:'list00000000000000000001',name:'CPG HUB_社員一覧',owner:ADMIN,created:'2026-10-01T00:00:00Z',perms:[],tabs:[{title:'社員',sheetId:0,rows:[]}]};
  const A=await device(width);
  await A.p.evaluate(()=>{const d=BB.db.settings.data;d.admin=true;d.ob={legacy:true};d.folder='folder0000000000000000001';d.listId='list00000000000000000001';BB.save();BB.render()});
  await check('社長の端末：「数字」に売上報告（試作・社長だけ）が出て、試作用のシート（架空）を作ると、新しい月から出る '+width+'px',async()=>{
   await open(A.p);assert.match(await A.p.textContent('#stats-sales'),/試作・社長だけ/);
   await A.p.click('[data-act=salesdemo]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   const t=await A.p.textContent('#stats-sales');assert.match(t,/試作用のシートを作りました/,t);
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）');assert.ok(f);assert.deepEqual(f.perms,[],'not shared');
   assert.deepEqual(f.tabs.map(x=>x.title),['2026-09','2026-10']);
   assert.deepEqual(tabOf(G.files.list00000000000000000001,'HUBの設定'),[['項目','値'],['売上報告ID',f.id]]);
   assert.match(t,/2026年9月/);assert.match(t,/2026年10月/);
   assert.match(t,/3社の合計/);assert.match(t,/25,650,000円/,'10月 = half of 9月 total');
   assert.match(t,/達成 35%/);assert.match(t,/本社/);
   await A.p.click('[data-sales-month="2026-09"]');assert.match(await A.p.textContent('#stats-sales'),/51,300,000円/);
   await A.p.click('#stats-sales details:not([data-fold]) summary');assert.match(await A.p.textContent('#stats-sales'),/見本 一郎/);
   assert.ok(await overflow(A.p)<=0,'overflow '+await overflow(A.p));
   if(width===400)await A.p.screenshot({path:path.join(require('node:os').tmpdir(),'sales-400.png'),fullPage:true});
  });
  await check('シートの数字を書き換えて「読み直す」と変わる。読めない数字は「読めなかったところ」に出す '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),t9=f.tabs.find(x=>x.title==='2026-09');
   const row=t9.rows.findIndex(r=>r[0]==='CP'&&Number(r[1])===30000000);assert.ok(row>0);t9.rows[row][3]='22,000,000';t9.rows[row+1][4]='あいうえ';
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);await A.p.click('[data-sales-month="2026-09"]');
   const t=await A.p.textContent('#stats-sales');assert.match(t,/22,000,000円/);assert.match(t,/読めなかったところがあります：.*「実績粗利」/);
  });
  await A.c.close();
  /* 社員の端末には出ない */
  const E=await device(width);
  await check('社員の端末（社長でない）には売上報告が出ない '+width+'px',async()=>{
   await E.p.evaluate(()=>{BB.db.settings.data.ob={legacy:true};BB.save();BB.go('stats')});
   assert.equal(await E.p.$$eval('#stats-sales',a=>a.length),0);assert.deepEqual(E.errors,[]);
  });
  await E.c.close();
 }
 /* 読み取りの単体：見出しの行を探す・行の位置が前後してもよい・会社名の間違い */
 await check('見出しの行を探して読む（前に空行やメモがあってもよい）。知らない会社名は読めなかったところに出す',async()=>{
  const P=await device(400);
  const r=await P.p.evaluate(()=>BB.salesParse([['メモ'],[],['会社','目標売上','目標粗利','実績売上','実績粗利','社長確認日','本部長確認日'],['CP','1,000','500','800','300','10/2',''],['XX','1','1','1','1','',''],[],['会社','担当','完了件数','完了金額','完了粗利','施工中件数','施工中金額'],['AT','見本 九郎','2','100','50','1','30']]));
  assert.deepEqual(r.cos.map(c=>[c.co,c.goal,c.amt,c.boss]),[['CP',1000,800,'10/2']]);assert.deepEqual(r.staff.map(x=>[x.co,x.name,x.wip]),[['AT','見本 九郎',30]]);assert.match(r.bad.join(),/会社「XX」/);
  await P.c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
