/* v1.50.97 仕事番号の進み具合・同じ仕事番号の注意。Synthetic only (fictional names, U-9xxx / J-TEST numbers); no Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.JP={get db(){return DB},get ui(){return ui},go,save,render,CASE_DEFAULTS};';
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
 await p.clock.install({time:new Date('2026-11-16T03:00:00Z')});
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.JP);
 const billAfter=await p.evaluate(()=>{const d=JP.db.settings.data;d.ob={legacy:true};
  const mk=(id,stage,o)=>Object.assign(JP.CASE_DEFAULTS(),{id,type:'reno',stage,company:'CP',client:'見本管理',property:'見本ハイツ',room:id.slice(-3),tantou:'見本',receivedAt:'2026-09-01T00:00:00.000Z',orderDate:'2026-09-05',payments:[],payLog:[]},o);
  JP.db.cases.push(
   mk('U-9101','handed',{jobNo:'J-TEST-01',handedDate:'2026-10-17'}),
   mk('U-9102','built',{jobNo:'J-TEST-02',handedDate:'2026-10-01',builtDate:'2026-11-14'}),
   mk('U-9103','built',{jobNo:'J-TEST-03',handedDate:'2026-09-10',builtDate:'2026-09-30'}),
   mk('U-9104','billed',{jobNo:'J-TEST-04',handedDate:'2026-09-10',builtDate:'2026-09-30',billDate:'2026-10-16',billAmount:100000,payDue:'2026-11-30'}),
   mk('U-9105','billed',{jobNo:'J-TEST-05',handedDate:'2026-09-10',builtDate:'2026-09-30',billDate:'2026-10-15',billAmount:100000,payDue:'2026-11-30'}),
   mk('U-9106','paid',{jobNo:'J-TEST-06',handedDate:'2026-09-10',builtDate:'2026-09-30',billDate:'2026-10-15',billAmount:100000,payDue:'2026-11-30',payments:[{date:'2026-11-05',amount:100000}],paidDate:'2026-11-05'}),
   mk('U-9107','won',{}),
   mk('U-9108','lost',{jobNo:'J-TEST-08',lossDate:'2026-10-01'}));
  JP.save();return JP.db.settings.billAfter});
 await check('数字の「仕事番号の進み具合」：施工中は日数だけ（赤なし）、完工・未請求は請求までの日数を過ぎたら赤、入金待ちは請求日から32日目から赤。仕事番号なし・失注は出さない',async()=>{
  await p.evaluate(()=>{JP.go('stats');const d=document.querySelector('details[data-fold="st_jobno"]');d.open=true});
  const sec=await p.locator('#stats-jobno').innerText();
  assert.match(sec,/施工中 1件・未請求 2件・入金待ち 2件/);
  const li=async id=>p.evaluate(id=>{const b=document.querySelector('#stats-jobno [data-open="'+id+'"]');if(!b)return null;const li=b.closest('li'),n=li.querySelector('span.num:last-child');return {t:li.textContent,red:n.style.color.includes('red')}},id);
  let x=await li('U-9101');assert.match(x.t,/引渡から 30日/);assert.equal(x.red,false,'work in progress is never red');
  x=await li('U-9102');assert.match(x.t,/完工から 2日/);assert.equal(x.red,2>billAfter);
  x=await li('U-9103');assert.match(x.t,/完工から 47日/);assert.equal(x.red,47>billAfter);
  x=await li('U-9104');assert.match(x.t,/請求から 31日/);assert.equal(x.red,false,'31 days: not yet red');
  x=await li('U-9105');assert.match(x.t,/請求から 32日/);assert.equal(x.red,true,'32 days: red');
  x=await li('U-9106');assert.match(x.t,/入金から/);
  assert.equal(await li('U-9107'),null,'no job number: not listed (it is in Access引渡待ち)');assert.equal(await li('U-9108'),null,'lost: not listed');
  assert.match(sec,/CP/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at 400px');
  await p.click('#stats-jobno [data-open="U-9105"]');assert.equal(await p.evaluate(()=>JP.ui.view+':'+JP.ui.caseId),'detail:U-9105');
  assert.match(await p.textContent('main'),/仕事番号 J-TEST-05：同じ仕事番号のまま金額が変わったときだけ使います/);
 });
 await check('仕事番号を入れるとき、同じ番号の案件があれば一度知らせる（全角・空白の違いも同じとみる）。もう一度押せば記録する。別の番号ならそのまま記録する',async()=>{
  await p.evaluate(()=>JP.go('detail',{caseId:'U-9107'}));
  await p.fill('#d_job','Ｊ－TEST－01 ');await p.click('[data-act="hand"]');
  assert.equal((await p.evaluate(()=>JP.db.cases.find(c=>c.id==='U-9107').stage)),'won','not recorded on the first press');
  assert.match(await p.textContent('main'),/同じ仕事番号の案件があります：U-9101（見本ハイツ 101）/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.click('[data-act="hand"]');
  assert.deepEqual(await p.evaluate(()=>{const c=JP.db.cases.find(c=>c.id==='U-9107');return [c.stage,c.jobNo]}),['handed','Ｊ－TEST－01'],'recorded on the second press');
  const n=await p.evaluate(()=>{const c=JP.CASE_DEFAULTS();Object.assign(c,{id:'U-9109',type:'reno',stage:'won',company:'CP',client:'見本管理',property:'見本荘',room:'201',tantou:'見本',receivedAt:'2026-09-01T00:00:00.000Z',orderDate:'2026-09-05',payments:[],payLog:[]});JP.db.cases.push(c);JP.save();JP.go('detail',{caseId:'U-9109'});return 1});
  await p.fill('#d_job','J-TEST-99');await p.click('[data-act="hand"]');
  assert.equal(await p.evaluate(()=>JP.db.cases.find(c=>c.id==='U-9109').stage),'handed','a new number is recorded at once');
 });
 assert.deepEqual(errors,[]);await c.close();
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
