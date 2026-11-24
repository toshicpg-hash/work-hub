/* Synthetic fixtures only (fictional IDs and addresses). Google requests are answered by an in-memory fake; no live accounts or network writes.
   v1.50.144 見る人用一覧を社長の同期で配る：見る人（全社・GM・経理・業務管理）の記録シートの「HUBの設定」にだけIDを書き、本人の端末は同期で自動でつなぐ */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.VA={get db(){return DB},get ui(){return ui},G,save,render,namesAfterSync,viewAutoConnect,viewAutoOn,DSCOPE,GSCOPE};';
const REC={emp:'recfixture0000000000000e',gyo:'recfixture0000000000000g',gm:'recfixture0000000000000m'},VIEW='viewfixture000000000000001';
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
const LIST=[['氏名','Gmail','会社','役割','GMの会社','シートID','指示箱ID','担当の会社','表示名','GM統括'],
 ['見本 社員','emp@example.com','CP','社員','',REC.emp,'','','',''],['見本 業務','gyo@example.com','CP','業務管理','',REC.gyo,'','CP,CPY','',''],['見本 GM','gm@example.com','CPY','GM','CPY',REC.gm,'','','','']];
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const F={[REC.emp]:{'情報':[['項目','値']]},[REC.gyo]:{'情報':[['項目','値']]},[REC.gm]:{'情報':[['項目','値']]},[VIEW]:{'一覧':LIST}};let me='gyo@example.com';
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{
  const u=r.request().url(),m=r.request().method();
  if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  if(u.startsWith(origin+'/'))return r.continue();
  const J=(o,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
  const U=new URL(u),p=decodeURIComponent(U.pathname);
  if(/\/drive\/v3\/about$/.test(p))return J({user:{emailAddress:me}});
  const mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);if(!mm)return J({});const id=mm[1],rest=mm[2],f=F[id];if(!f)return J({},404);
  if(m==='GET'&&!rest)return J({sheets:Object.keys(f).map((t,i)=>({properties:{title:t,sheetId:i}}))});
  if(rest==='/values:batchGet')return J({valueRanges:U.searchParams.getAll('ranges').map(x=>({values:structuredClone(f[tabName(x)]||[])}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests)if(q.addSheet)f[q.addSheet.properties.title]=[];return J({replies:[{}]})}
  const vp=rest.match(/^\/values\/(.+?)(:clear)?$/);if(vp&&m==='PUT'){f[tabName(vp[1])]=structuredClone(r.request().postDataJSON().values).map(row=>{while(row.length&&row[row.length-1]==='')row.pop();return row}).filter(row=>row.length);return J({})}
  if(vp&&m==='GET')return J({values:structuredClone(f[tabName(vp[1])]||[])});
  return J({});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-24T05:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.VA);
 const auth=()=>p.evaluate(()=>{VA.G.token='t';VA.G.exp=Date.now()+3600e3;VA.G.scope=VA.DSCOPE+' '+VA.GSCOPE});
 const staff=[{name:'見本 社員',email:'emp@example.com',company:'CP',role:'社員',sheetId:REC.emp,removed:false},{name:'見本 業務',email:'gyo@example.com',company:'CP',role:'業務管理',charge:'CP,CPY',sheetId:REC.gyo,removed:false},{name:'見本 GM',email:'gm@example.com',company:'CPY',role:'GM',gmCo:'CPY',sheetId:REC.gm,removed:false}];
 await check('社長の同期：見る人（業務管理・GM）の「HUBの設定」にだけ見る人用一覧のIDを書く。社員には書かない',async()=>{
  await p.evaluate(({staff,VIEW})=>{const d=VA.db.settings.data;d.admin=true;d.staff=staff;d.viewListId=VIEW;VA.save()},{staff,VIEW});await auth();
  await p.evaluate(()=>VA.namesAfterSync());
  assert.deepEqual(F[REC.gyo]['HUBの設定'],[['項目','値'],['見る人用一覧ID',VIEW]]);
  assert.deepEqual(F[REC.gm]['HUBの設定'],[['項目','値'],['見る人用一覧ID',VIEW]]);
  assert.deepEqual(F[REC.emp]['HUBの設定'],[['項目','値']],'an ordinary employee does not get the ID');
 });
 await check('役割が外れた人のIDは、次の社長の同期で消す',async()=>{
  await p.evaluate(()=>{const d=VA.db.settings.data;d.staff=d.staff.map(s=>s.role==='GM'?{...s,role:'社員',gmCo:''}:s);VA.save()});
  await p.evaluate(()=>VA.namesAfterSync());
  assert.deepEqual(F[REC.gm]['HUBの設定'],[['項目','値']]);assert.deepEqual(F[REC.gyo]['HUBの設定'],[['項目','値'],['見る人用一覧ID',VIEW]]);
 });
 await check('見る人の端末：IDが届いていれば、同期で自動でつなぐ（本人が一覧で見る人か確かめる）',async()=>{
  await p.evaluate(({REC,VIEW})=>{const d=VA.db.settings.data;d.admin=false;d.ob={done:true};d.staff=[];d.viewListId='';d.sheetId=REC.gyo;d.viewOffer=VIEW;delete d.viewOptOut;VA.save()},{REC,VIEW});
  const r=await p.evaluate(async()=>{const rows=[];const ok=await VA.viewAutoConnect((name,ok,msg)=>rows.push({name,ok,msg}));return {ok,rows,id:VA.db.settings.data.viewListId,mail:VA.db.settings.data.viewEmail}});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.id,VIEW);assert.equal(r.mail,'gyo@example.com');assert.match(r.rows[0].msg,/社長の設定で、会社の動き（見るだけ）につなぎました（業務管理：CP・CPY）/);
 });
 await check('「つなぐのをやめる」を押した端末は、自動でつなぎ直さない',async()=>{
  await p.evaluate(()=>{const d=VA.db.settings.data;d.viewOptOut=d.viewListId;d.viewListId='';VA.save()});
  assert.equal(await p.evaluate(()=>VA.viewAutoOn()),false);
 });
 await check('一覧で見る人でない人は、何もしない（札も出さない）',async()=>{
  me='emp@example.com';
  const r=await p.evaluate(async({REC,VIEW})=>{const d=VA.db.settings.data;d.sheetId=REC.emp;d.viewOffer=VIEW;delete d.viewOptOut;d.viewListId='';VA.save();const rows=[];const ok=await VA.viewAutoConnect((name,ok,msg)=>rows.push({name,ok,msg}));return {ok,rows,id:VA.db.settings.data.viewListId}},{REC,VIEW});
  assert.deepEqual(r,{ok:false,rows:[],id:''});
 });
 await check('400px：はみ出しなし',async()=>{
  const ov=await p.evaluate(()=>{VA.render();const d=document.documentElement;return d.scrollWidth-d.clientWidth});assert.ok(ov<=0,'overflow '+ov);
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
