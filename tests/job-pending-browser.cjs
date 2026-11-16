/* v1.50.104 「現場管理表がまだです」：受注済みで仕事番号がない案件（営繕を除く）に予定を入れようとしたら知らせる。止めない。
   Synthetic only (fictional names, U-92xx numbers); no Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.JPN={get db(){return DB},get ui(){return ui},go,save,render,CASE_DEFAULTS,jobPending,hasPlan,planHubIds,keepEvents(ev){gcalCache.test={state:"ok",at:Date.now(),ids:"",from:"2026-11-01",to:"2026-12-31",data:{events:ev}}}};';
let server,browser,origin;const results=[];
const check=async(n,fn)=>{await fn();results.push(n);console.log('PASS',n)};
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-17T00:00:00Z')});
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.JPN);
 await p.evaluate(()=>{const d=JPN.db.settings.data;d.ob={legacy:true};
  const mk=(id,type,stage,o)=>Object.assign(JPN.CASE_DEFAULTS(),{id,type,stage,company:'CP',client:'見本管理',property:'見本ハイツ',room:id.slice(-3),tantou:'見本',receivedAt:'2026-11-01T00:00:00.000Z',orderDate:'2026-11-05',payments:[],payLog:[]},o);
  JPN.db.cases.push(
   mk('U-9201','reno','won',{planDate:'2026-11-20'}),       /* 予定日あり・仕事番号なし */
   mk('U-9202','reno','won',{}),                             /* 「予定を入れる」の作業で予定あり（下で予定を足す） */
   mk('U-9203','reno','won',{}),                             /* 予定なし */
   mk('U-9204','eizen','won',{planDate:'2026-11-21'}),       /* 営繕：除く */
   mk('U-9205','reno','handed',{jobNo:'J-TEST-05',planDate:'2026-11-22'}));
  JPN.save();JPN.keepEvents([{hub:'U-9202',calendarId:'hub@group.calendar.google.com',title:'作業　見本ハイツ 202',start:'2026-11-19T09:00:00+09:00',end:'2026-11-19T12:00:00+09:00'}]);JPN.go('home')});
 await check('ホームの「Access引渡待ち」：予定がもう入っている案件の件数を「うち予定あり」で出す（営繕・予定なしは数えない）',async()=>{
  assert.deepEqual(await p.evaluate(()=>['U-9201','U-9202','U-9203','U-9204','U-9205'].map(id=>JPN.jobPending(JPN.db.cases.find(c=>c.id===id)))),[true,true,true,false,false]);
  const t=await p.locator('#home-access').innerText();assert.match(t,/うち予定あり 2件（現場管理表がまだ）/,t);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at 400px');
 });
 await check('予定を入れる：作業で仕事番号のない案件を選ぶと知らせる。仕事番号のある案件・案件なしでは出ない',async()=>{
  await p.evaluate(()=>{JPN.go('cal');JPN.ui.planOpen=true;JPN.ui.plan={kind:'作業'};JPN.render()});
  if(!(await p.locator('#pl_case').count())){await p.click('[data-plan-kind="作業"]')}
  await p.selectOption('#pl_case','U-9203');await p.waitForFunction(()=>!!document.querySelector('#plan-add .job-pending'));
  assert.match(await p.locator('#plan-add .job-pending').innerText(),/現場管理表がまだです（仕事番号が入っていません）/);
  await p.selectOption('#pl_case','U-9205');await p.waitForFunction(()=>!document.querySelector('#plan-add .job-pending'));
  await p.selectOption('#pl_case','');assert.equal(await p.locator('#plan-add .job-pending').count(),0);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 });
 await check('案件の画面：予定がもう入っているのに仕事番号がない受注済みの案件は「Accessへ引渡」の欄で知らせる。予定なし・営繕・仕事番号ありは出ない',async()=>{
  await p.evaluate(()=>JPN.go('detail',{caseId:'U-9201'}));assert.match(await p.locator('main').innerText(),/この案件は予定がもう入っています。現場管理表がまだです/);
  await p.evaluate(()=>JPN.go('detail',{caseId:'U-9202'}));assert.match(await p.locator('main').innerText(),/この案件は予定がもう入っています/,'a plan entered with 予定を入れる counts');
  await p.evaluate(()=>JPN.go('detail',{caseId:'U-9203'}));assert.equal(await p.locator('main .job-pending').count(),0,'no plan yet: the usual Access panel only');
  await p.evaluate(()=>JPN.go('detail',{caseId:'U-9204'}));assert.equal(await p.locator('main .job-pending').count(),0);
  await p.evaluate(()=>JPN.go('detail',{caseId:'U-9205'}));assert.equal(await p.locator('main .job-pending').count(),0);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
