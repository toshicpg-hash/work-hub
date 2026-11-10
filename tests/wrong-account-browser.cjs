/* v1.50.34 別のGoogleアカウント（記録シートを見るだけの人）でログインしたまま同期したとき：
   ログイン中のアカウントを出し、「別のGoogleアカウントでログインし直す」でアカウントを選ぶ画面を出して直せること。
   Synthetic fixtures only (fictional names, example.com). In-memory Google; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),OWN='synthetic-wrong-account-sheet-01',WRITER='test-staff-own@example.com',READER='test-helper-reader@example.com';
const hook='window.WA={get db(){return DB},get ui(){return ui},get G(){return G},go,render,save,obSteps,'+
 'mock(){gLoadCalendarsRun=async()=>{G.cals=[];return G.cals};gReadRange=async()=>({events:[],calendars:[],missing:0});gKeepSave=()=>{};corpRun=async()=>[]}};';
const GIS="window.__prompts=[];window.google={accounts:{oauth2:{initTokenClient(cfg){return {requestAccessToken(o){window.__prompts.push(o&&o.prompt);setTimeout(()=>cfg.callback({access_token:'tok:'+window.__acct,expires_in:3600,scope:cfg.scope}),5)}}}}}};";
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const S={'案件':[],'入金':[],'立替':[],'情報':[]};let writes=0;
async function device(width){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const req=r.request(),u=new URL(req.url()),acct=(req.headers()['authorization']||'').replace('Bearer tok:','');
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.href.startsWith('https://accounts.google.com/gsi/client'))return r.fulfill({contentType:'application/javascript',body:GIS});
  const json=(b,st=200)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
  if(u.hostname==='www.googleapis.com'&&u.pathname==='/drive/v3/about')return json({user:{emailAddress:acct}});
  if(u.hostname!=='sheets.googleapis.com')return json({});
  const m=u.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),tail=decodeURIComponent(m&&m[2]||''),method=req.method();
  if(!m||m[1]!==OWN||![WRITER,READER].includes(acct))return json({error:{code:403}},403);
  if(method==='GET'&&!tail)return json({properties:{title:'CPG HUB_見本 一郎'},sheets:Object.keys(S).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:1000,columnCount:40}}}))});
  if(method==='GET'&&tail==='/values:batchGet'){const ts=u.searchParams.getAll('ranges').map(t=>t.replace(/^'|'$/g,''));if(ts.some(t=>!S[t]))return json({},400);return json({valueRanges:ts.map(t=>({values:structuredClone(S[t])}))})}
  if(acct!==WRITER)return json({error:{code:403}},403);/* 見るだけの人は書けない */
  writes++;const body=req.postDataJSON();
  if(method==='POST'&&tail===':batchUpdate'){for(const q of body.requests)if(q.addSheet)S[q.addSheet.properties.title]=[];return json({})}
  const v=tail.match(/^\/values\/'([^']+)'(?:!A1)?(:clear)?$/);
  if(v&&S[v[1]]){if(method==='POST'&&v[2]){S[v[1]]=[];return json({})}if(method==='PUT'){S[v[1]]=structuredClone(body.values);return json({})}}
  return json({},400);
 });
 await c.addInitScript(a=>{window.__acct=a},READER);
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-09T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.WA&&window.google&&google.accounts);await p.evaluate(()=>WA.mock());
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.ob,form,details,.gsync')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [400,360]){
  for(const k of Object.keys(S))S[k]=[];writes=0;
  const A=await device(width);
  await check('見るだけの人のアカウントでログイン：ログインの結果と記録シートの欄にアカウントが出る '+width+'px',async()=>{
   await A.p.click('[data-act=oblogin]');await A.p.waitForFunction(()=>!WA.ui.obBusy);
   assert.match(await A.p.textContent('#onboarding'),new RegExp('ログインしました：'+READER.replace('.','\\.')));
   assert.match(await A.p.textContent('#onboarding'),/ログイン中のGoogleアカウント：test-helper-reader@example\.com/);
   assert.deepEqual(await A.p.evaluate(()=>window.__prompts),[''],'normal login keeps the previous account (no chooser)');
   /* v1.50.38 見るだけのシートはつながない（書けるかを、何も変えない確かめで見る） */
   await A.p.fill('#ob_sheet','https://docs.google.com/spreadsheets/d/'+OWN+'/edit');await A.p.click('[data-act=obsheet]');await A.p.waitForFunction(()=>!WA.ui.obBusy);
   assert.match(await A.p.textContent('#onboarding'),/このシート（CPG HUB_見本 一郎）は、あなたには見るだけで共有されています（ほかの人の記録シートです）。つなぎませんでした/);
   assert.equal(await A.p.evaluate(()=>WA.db.settings.data.sheetId),'');assert.equal(writes,0);
   /* 前の版でつないだ端末と同じ状態にして、同期のときの案内を確かめる */
   await A.p.evaluate(id=>{const d=WA.db.settings.data;d.sheetId=id;d.sheetName='CPG HUB_見本 一郎';WA.save();WA.render()},OWN);
   await A.p.fill('#ob_name','見本 一郎');await A.p.selectOption('#ob_co','CP');await A.p.click('[data-act=obname]');
  });
  await check('同期：記録シートに書けないと、ログイン中のアカウントと直し方が出て、ログインし直すボタンが出る '+width+'px',async()=>{
   await A.p.click('[data-act=obsync]');await A.p.waitForFunction(()=>WA.ui.gsync&&!WA.ui.gsync.busy);
   const rows=await A.p.evaluate(()=>WA.ui.gsync.rows);
   const w=rows.find(x=>x.name==='ログイン中のGoogleアカウント');assert.ok(w&&!w.ok,JSON.stringify(rows));
   assert.match(w.msg,/test-helper-reader@example\.com：このアカウントでは記録シートに書き込めません。社長が共有した本人のGmailでログインし直してください/);
   assert.match(w.msg,/つないでいるシート「CPG HUB_見本 一郎」が自分の名前のシートか確かめてください/);
   assert.deepEqual(rows.find(x=>x.name==='つないでいる記録シート'),{name:'つないでいる記録シート',ok:true,msg:'CPG HUB_見本 一郎'});
   assert.ok(rows.some(x=>x.name==='記録シート「案件」'&&!x.ok&&/権限がありません/.test(x.msg)));
   assert.equal(writes,0);assert.ok(await A.p.isVisible('.gsync [data-act=grelogin]'));
   assert.ok(await overflow(A.p)<=0,'overflow '+await overflow(A.p));
   if(width===400)await A.p.screenshot({path:path.join(require('node:os').tmpdir(),'wrong-account-400.png'),fullPage:true});
  });
  await check('「別のGoogleアカウントでログインし直す」：アカウントを選ぶ画面を出し、本人のアカウントで同期すると直る '+width+'px',async()=>{
   await A.p.evaluate(a=>{window.__acct=a},WRITER);
   await A.p.click('.gsync [data-act=grelogin]');await A.p.waitForFunction(()=>!WA.ui.gReBusy);
   assert.equal(await A.p.evaluate(()=>window.__prompts.at(-1)),'select_account');
   assert.equal(await A.p.evaluate(()=>WA.G.email),WRITER);
   assert.match(await A.p.textContent('main'),/ログインし直しました：test-staff-own@example\.com/);
   await A.p.click('[data-act=obsync]');await A.p.waitForFunction(()=>WA.ui.gsync&&!WA.ui.gsync.busy&&WA.ui.gsync.rows.some(x=>/^記録シート/.test(x.name)));
   const rows=await A.p.evaluate(()=>WA.ui.gsync.rows);
   assert.ok(!rows.some(x=>x.name==='ログイン中のGoogleアカウント'),JSON.stringify(rows));
   assert.ok(rows.some(x=>x.name==='記録シート「案件」'&&x.ok),JSON.stringify(rows));assert.ok(writes>0);
   assert.equal(await A.p.$$eval('.gsync [data-act=grelogin]',a=>a.length),0,'button goes away once writes work');
   await A.p.evaluate(()=>{WA.go('stats');document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});
   assert.match(await A.p.textContent('main'),/ログイン中のGoogleアカウント：test-staff-own@example\.com/);
   assert.ok(await overflow(A.p)<=0);
   assert.deepEqual(A.errors,[]);
  });
  await A.c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
