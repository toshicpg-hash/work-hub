/* v1.50.6 社員（社長以外）の案件の日程は、全員「自分」のカレンダーに登録する。社長の端末は今までどおり。
   あわせて、社長の共有の付け替えで止まったときの文言と、共有の一覧の読み直し。
   Synthetic fixtures only (fictional names, example.com). Google APIs are mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PT={get db(){return DB},get ui(){return ui},G,go,save,render,gWriteCal,gSettings,shareRead,shareProgress,shareProgressEnd,adminShareOperation,'+
 'authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000},'+
 'stubAdmin(){const w=[];gAuthorize=async()=>{};myEmail=async()=>ADMIN_ACCOUNT;corpWait=async ms=>{w.push(ms)};return w},'+
 'setChanging(v){shareChanging=v},get progText(){const el=document.getElementById("shareProgress");return el?el.textContent:""}};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const OWN='staff-own@example.com',SHARED='shared-hub@group.example.com',OTHER='team-cal@group.example.com';
async function device({cals,admin=false,gWrite='',gcal=null,width=390}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 const calls=[];
 await c.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/calendar/v3/calendars/')){const m=r.request().method(),p=decodeURIComponent(u.pathname);calls.push({method:m,path:p,body:m==='GET'?null:r.request().postDataJSON()});
   if(p.includes(SHARED)&&!cals.find(x=>x.id===SHARED&&x.write))return r.fulfill({status:403,contentType:'application/json',body:'{}'});
   return r.fulfill({contentType:'application/json',body:JSON.stringify({id:'x',htmlLink:'https://www.google.com/calendar/event?eid=synthetic'})})}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-06T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PT);
 await p.evaluate(({cals,admin,gWrite,gcal})=>{const D=PT.db;
  D.settings.data.ob={legacy:true};D.settings.rcpt.name='見本 一郎';D.settings.gWrite=gWrite;if(admin)D.settings.data.admin=true;
  D.cases=[Object.assign({},{company:'CP',addr:'見本県見本市1-2-3',items:[],note:'',symptom:'',planDate:'2026-11-10',planTime:'',cancelledAt:'',cancelReason:'',estAmount:null,estSentDate:'',siteDate:'',lossReason:'',lossDate:'',holdDate:'',orderDate:'',jobNo:'',billingTenant:'入居者に直接',handedDate:'',gcal,builtDate:'',billDate:'',billAmount:null,billTo:'',payDue:'',payments:[],paidDate:'',payLog:[]},
   {id:'U-0301',type:'taikyo',stage:'new',client:'見本管理',clientKind:'管理会社',property:'見本荘',room:'201',tantou:'見本',receivedAt:'2026-11-05T01:00:00.000Z'})];
  PT.G.cals=cals;PT.authorize();PT.save();PT.go('detail',{caseId:'U-0301'})},{cals,admin,gWrite,gcal});
 return {c,p,errors,calls};
}
const one=p=>p.evaluate(()=>JSON.parse(JSON.stringify(PT.db.cases.find(c=>c.id==='U-0301'))));
const reg=async p=>{await p.click('[data-act=greg]');await p.waitForFunction(()=>!PT.ui.gbusy)};
const staffCals=(sharedWrite)=>[{id:OWN,name:'自分',primary:true,owner:true,write:true},{id:SHARED,name:'CPG HUB',primary:false,owner:false,write:sharedWrite},{id:OTHER,name:'見本の仕事',primary:false,owner:true,write:true}];
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const all=[];
 await check('社員：設定で何も選んでいない・「CPG HUB」に書けない人も、自分のカレンダーに登録する',async()=>{
  const d=await device({cals:staffCals(false)});all.push(d);
  assert.match(await d.p.textContent('#case-google-calendar'),/登録先：自分/);
  await reg(d.p);const post=d.calls.find(x=>x.method==='POST');assert.ok(post,'created');assert.equal(post.path,'/calendar/v3/calendars/'+OWN+'/events');
  assert.ok(!d.calls.some(x=>x.path.includes(SHARED)),'never touches the shared calendar');assert.equal((await one(d.p)).gcal.cal,OWN);
  assert.match(await d.p.textContent('#case-google-calendar'),/登録済み：自分/);
 });
 await check('社員：前に「CPG HUB」やほかのカレンダーを選んでいても、書ける人でも、新しい登録は自分に（設定の操作は不要）',async()=>{
  for(const gWrite of [SHARED,OTHER]){const d=await device({cals:staffCals(true),gWrite});all.push(d);
   await reg(d.p);const post=d.calls.find(x=>x.method==='POST');assert.equal(post.path,'/calendar/v3/calendars/'+OWN+'/events',gWrite);}
 });
 await check('社員の設定画面：登録先は「自分（自分のカレンダー）」の表示だけで、選ぶ欄は出さない。保存しても登録先の設定は変えない',async()=>{
  const d=await device({cals:staffCals(true),gWrite:SHARED});all.push(d);
  const html=await d.p.evaluate(()=>PT.gSettings());assert.ok(!html.includes('id="g_write"'));assert.match(html,/自分（自分のカレンダー）/);assert.match(html,/社員は全員、自分のカレンダーに登録します/);
 });
 await check('社員：前に「CPG HUB」へ送ろうとして登録できなかった案件（日付なし）は、自分のカレンダーに作り直す',async()=>{
  const d=await device({cals:staffCals(false),gcal:{cal:SHARED,calName:'CPG HUB',id:'cpghubsynthetic0001',date:'',link:''}});all.push(d);
  await reg(d.p);assert.ok(!d.calls.some(x=>x.path.includes(SHARED)));const post=d.calls.find(x=>x.method==='POST');assert.equal(post.path,'/calendar/v3/calendars/'+OWN+'/events');
  const k=await one(d.p);assert.equal(k.gcal.cal,OWN);assert.notEqual(k.gcal.id,'cpghubsynthetic0001');
 });
 await check('社員：「CPG HUB」に登録済みで今は書けない予定は、消さず・作り直さず、社長に直してもらうよう伝える',async()=>{
  const g={cal:SHARED,calName:'CPG HUB',id:'cpghubsynthetic0002',date:'2026-11-09',when:'2026-11-09',link:''};
  const d=await device({cals:staffCals(false),gcal:g});all.push(d);
  await reg(d.p);assert.equal(d.calls.length,0,'no calendar call at all');assert.deepEqual((await one(d.p)).gcal,g);
  assert.match(await d.p.textContent('body'),/前に共有カレンダー「CPG HUB」に登録したもので、この端末からは直せません/);
 });
 await check('社員：「CPG HUB」に登録済みで今も書ける人（専務など）は、今までどおりその予定を直す',async()=>{
  const d=await device({cals:staffCals(true),gcal:{cal:SHARED,calName:'CPG HUB',id:'cpghubsynthetic0003',date:'2026-11-09',when:'2026-11-09',link:''}});all.push(d);
  await reg(d.p);const patch=d.calls.find(x=>x.method==='PATCH');assert.equal(patch.path,'/calendar/v3/calendars/'+SHARED+'/events/cpghubsynthetic0003');
 });
 await check('社長の端末は今までどおり：設定がなければ「CPG HUB」、設定があればそのカレンダー。選ぶ欄も出る',async()=>{
  const cals=[{id:'boss-own@example.com',name:'自分',primary:true,owner:true,write:true},{id:SHARED,name:'CPG HUB',primary:false,owner:true,write:true},{id:OTHER,name:'見本の仕事',primary:false,owner:true,write:true}];
  let d=await device({cals,admin:true});all.push(d);
  await reg(d.p);assert.equal(d.calls.find(x=>x.method==='POST').path,'/calendar/v3/calendars/'+SHARED+'/events');
  assert.ok((await d.p.evaluate(()=>PT.gSettings())).includes('id="g_write"'));
  d=await device({cals,admin:true,gWrite:OTHER});all.push(d);
  await reg(d.p);assert.equal(d.calls.find(x=>x.method==='POST').path,'/calendar/v3/calendars/'+OTHER+'/events');
 });
 await check('共有の付け替え：読むだけの呼び出しは、回数制限・時間切れのあと最大2回読み直す。権限なしは読み直さない',async()=>{
  const d=all[0];const waits=await d.p.evaluate(()=>PT.stubAdmin());
  const r=await d.p.evaluate(async()=>{let n=0;const ok=await PT.shareRead(async()=>{n++;if(n===1){const e=new Error('http');e.status=429;throw e}if(n===2){const e=new Error('x');e.name='AbortError';throw e}return 'read'});
   let m=0,err='';try{await PT.shareRead(async()=>{m++;const e=new Error('http');e.status=403;throw e})}catch(e){err=String(e.status)}
   let k=0,last='';try{await PT.shareRead(async()=>{k++;const e=new Error('http');e.status=503;throw e})}catch(e){last=String(e.status)}
   return {ok,n,m,err,k,last}});
  assert.deepEqual(r,{ok:'read',n:3,m:1,err:'403',k:3,last:'503'});
 });
 await check('共有の付け替えが変える前に止まったら「まだ何も変えていません」「続ける場合だけ、はじめから」と出し、「続きから」とは出さない',async()=>{
  const d=all[0];
  const t=await d.p.evaluate(async()=>{PT.db.settings.data.admin=true;PT.save();PT.stubAdmin();try{await PT.adminShareOperation(async()=>{PT.shareProgress('共有の一覧を読んでいます 1／17');const e=new Error('signal is aborted without reason');e.name='AbortError';throw e})}catch(e){}return PT.progText});
  assert.match(t,/ここで止まりました：共有の一覧を読んでいます 1／17/);assert.match(t,/理由：時間切れ（45秒）/);
  assert.match(t,/共有はまだ何も変えていません（外していません）/);assert.match(t,/続ける場合だけ/);assert.doesNotMatch(t,/続きから|もう一度保存すると/);
  await d.p.evaluate(()=>PT.shareProgressEnd());
  const t2=await d.p.evaluate(async()=>{let msg='';try{await PT.adminShareOperation(async()=>{PT.shareProgress('反映中 3／8');PT.setChanging(true);const e=new Error('http');e.status=503;throw e})}catch(e){msg=e.message}return PT.progText||msg});
  assert.match(t2,/理由：Google側の一時的な不具合（503）/);assert.match(t2,/止まる前に反映した共有は、そのまま残っています/);assert.doesNotMatch(t2,/まだ何も変えていません|続きから/);
 });
 await check('400px・360pxで横にはみ出さない・スクリプトのエラーなし',async()=>{
  for(const width of [400,360]){const d=await device({cals:staffCals(false),width});all.push(d);
   await d.p.evaluate(()=>PT.go('settings'));await d.p.waitForTimeout(100);
   const o=await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(o<=0,width+' overflow '+o);
   if(width===400)await d.p.screenshot({path:path.join(root,'docs/preview/cal-own-write-400.png'),fullPage:false});}
  for(const d of all)assert.deepEqual(d.errors,[]);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
