/* v1.50.27 社長の端末：社員一覧の Gmail と同じカレンダーを、社長の Google カレンダーの中だけ社員の名前で表示する（summaryOverride）。
   この操作のときだけ追加の許可をもらい、同期の許可は変えない。Synthetic fixtures only (fictional names, example.com). Google APIs are mocked. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CA={get db(){return DB},get ui(){return ui},G,go,render,save,get GSCOPE(){return GSCOPE},get ADMIN(){return ADMIN_ACCOUNT},stub(){window.__auth=[];gAuthorize=async(w,extra)=>{window.__auth.push(extra||"");G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE+(extra?" "+extra:"");G.exp=Date.now()+3600000}}};';
const staff=[{name:'見本 二郎',email:'b@example.com',sheetId:'sheetB00000000000000000002',company:'CPY',role:'社員'},{name:'試験 三郎',email:'c@example.com',sheetId:'sheetC00000000000000000003',company:'CP',role:'社員'},{name:'外れ 四郎',email:'d@example.com',sheetId:'sheetD00000000000000000004',company:'AT',role:'社員',removed:true},{name:'黒木 見本',email:'k@example.com',sheetId:'sheetK00000000000000000005',company:'CP',role:'社員'}];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device(admin=true){
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const state={patches:[],items:null};
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  const J=(o,st=200)=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(u.hostname==='www.googleapis.com'&&u.pathname==='/calendar/v3/users/me/calendarList')return J({items:state.items});
  const m=u.pathname.match(/^\/calendar\/v3\/users\/me\/calendarList\/(.+)$/);
  if(m&&r.request().method()==='PATCH'){const id=decodeURIComponent(m[1]),b=r.request().postDataJSON(),it=state.items.find(x=>x.id===id);state.patches.push([id,b.summaryOverride]);it.summaryOverride=b.summaryOverride;return J(it)}
  return r.fulfill({status:200,body:''});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{state.dialog=d.message();d.accept()});
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CA);
 const ADMIN=await p.evaluate(()=>CA.ADMIN);
 state.items=[{id:ADMIN,summary:ADMIN,primary:true,accessRole:'owner'},{id:'hub@group.example.com',summary:'CPG HUB',accessRole:'writer'},{id:'b@example.com',summary:'b@example.com',accessRole:'reader'},{id:'c@example.com',summary:'c@example.com',accessRole:'reader'},{id:'d@example.com',summary:'d@example.com',accessRole:'reader'},{id:'k@example.com',summary:'黒木 見本',accessRole:'reader'},{id:'private@example.net',summary:'private@example.net',accessRole:'reader'}];
 await p.evaluate(({staff,admin})=>{CA.stub();const d=CA.db.settings.data;d.admin=admin;d.ob={legacy:true};d.staff=staff;CA.G.cals=[{id:'x',name:'自分',primary:true}];CA.save();CA.go('stats')},{staff,admin});
 return {c,p,errors,state};
}
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 await check('社長の端末：社員一覧の Gmail と同じカレンダーだけを社員の名前で表示する（共有を外した人・社長・CPG HUB・知らない人・もう名前のものは変えない）。押したときだけ追加の許可',async()=>{
  const d=await device(true);
  assert.equal(await d.p.evaluate(()=>CA.GSCOPE),'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events','the sync permission is unchanged');
  assert.equal(await d.p.locator('[data-act="calnames"]').count(),1);assert.deepEqual(await d.p.evaluate(()=>window.__auth),[],'no extra permission before pressing');
  assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1);
  await d.p.evaluate(()=>document.querySelector('[data-act="calnames"]').click());await d.p.waitForFunction(()=>!CA.ui.calNamesBusy);
  assert.deepEqual(await d.p.evaluate(()=>window.__auth),['https://www.googleapis.com/auth/calendar.calendarlist']);
  assert.deepEqual(d.state.patches,[['b@example.com','見本 二郎'],['c@example.com','試験 三郎']]);
  assert.match(d.state.dialog,/社長の画面だけ/);assert.match(d.state.dialog,/b@example.com → 見本 二郎/);
  assert.match(await d.p.textContent('#cal-names'),/2件のカレンダーを名前で表示するようにしました/);
  assert.deepEqual(await d.p.evaluate(()=>CA.G.cals.filter(c=>!c.primary).map(c=>c.name)),['CPG HUB','見本 二郎','試験 三郎','d@example.com','黒木 見本','private@example.net'],'CPG HUB keeps its name; the list is reloaded');
  await d.p.evaluate(()=>document.querySelector('[data-act="calnames"]').click());await d.p.waitForFunction(()=>!CA.ui.calNamesBusy);
  assert.equal(d.state.patches.length,2,'nothing more to change');assert.match(await d.p.textContent('#cal-names'),/名前にするカレンダーはありません/);
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('社長でない端末には出さない',async()=>{const d=await device(false);assert.equal(await d.p.locator('[data-act="calnames"]').count(),0);await d.c.close()});
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
