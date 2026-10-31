/* Synthetic fixtures only (fictional names, example.com). No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.ST={get db(){return DB},ui,go,render,roBuild,save,vStats,CASE_DEFAULTS};';
const TODAY='2026-10-29';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width){
 const c=await browser.newContext({viewport:{width,height:844},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u.startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.ST);return {c,p,errors};
}
const sum=p=>p.$$eval('.sum .k',a=>Object.fromEntries(a.map(k=>[k.textContent,k.nextElementSibling.textContent])));
const unpaidHead=p=>p.$eval('h2:text("未入金")+span',e=>e.textContent);
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.seg,.tbl-wrap')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{try{res.end(fs.readFileSync(path.join(root,req.url.split('?')[0])))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const {c,p,errors}=await page(390,{admin:false});await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>{ST.db.cases=[
 ['SYN-WON','won','2026-10-10','','reno',100000],
 ['SYN-LOST','lost','2026-10-10','2026-10-12','reno',900000],
 ['SYN-UNKNOWN','lost','2026-09-10','','kinkyu',800000],
 ['SYN-PAST','lost','2026-10-10','2026-09-12','reno',700000],
 ['SYN-FUTURE','lost','2026-10-10','2026-11-12','reno',600000],
 ['SYN-BOTH','won','2026-10-10','2026-10-12','kinkyu',200000]
 ].map(([id,stage,orderDate,lossDate,type,estAmount])=>Object.assign(ST.CASE_DEFAULTS(),{id,stage,orderDate,lossDate,type,estAmount,estSentDate:'2026-10-01',lossReason:'価格',property:'合成確認物件',tantou:'試験担当',receivedAt:'2026-10-01T00:00:00Z'}));ST.save();ST.go('stats')});
 const original=await p.evaluate(()=>JSON.stringify(ST.db.cases));
 await check('Lost stage excludes lingering order date and amount; unknown dates explicit, other months excluded',async()=>{
 const s=await sum(p);assert.equal(s['受注'],'2件');assert.equal(s['受注額（見積額）'].replace(/\s/g,''),'300,000円');assert.equal(s['見積提出'],'6件');
 const t=await p.textContent('main');assert.match(t,/受注 2件 ／ 失注 2件/);assert.match(t,/失注日未入力 1件（月不明）/);assert.match(t,/67%/);
 const rows=await p.$$eval('.sec:has(h2:text-matches("月の担当別")) tbody tr',a=>a.map(x=>[...x.cells].map(c=>c.textContent)));
 assert.equal(rows[0][3],'2件');
 });
 await check('Type estimate submissions reconcile to staff; reasons include unknown lost',async()=>{
 const rows=await p.$$eval('.sec:has(h2:text("依頼の種類別")) tbody tr',a=>a.map(x=>[...x.cells].map(c=>c.textContent)));
 assert.equal(rows.reduce((s,r)=>s+parseInt(r[1]),0),6);assert.equal(rows.reduce((s,r)=>s+parseInt(r[2]),0),2);assert.equal(rows.reduce((s,r)=>s+parseInt(r[3]),0),2);
 assert.match(await p.locator('.sec:has(h2:text("失注の理由"))').innerText(),/価格[\s\S]*2件/);
 });
 await check('Warnings local and readonly; save allowed and dates preserved through reload',async()=>{
 for(const id of ['SYN-LOST','SYN-UNKNOWN','SYN-BOTH']){await p.evaluate(id=>ST.go('detail',{caseId:id}),id);assert.equal(await p.locator('.case-date-warning').count(),1)}
 await p.evaluate(()=>ST.go('detail',{caseId:'SYN-WON'}));assert.equal(await p.locator('.case-date-warning').count(),0);
 assert.equal(await p.evaluate(()=>ST.save()),true);assert.equal(await p.evaluate(()=>JSON.stringify(ST.db.cases)),original);
 await p.reload();await p.waitForFunction(()=>!!window.ST);assert.equal(await p.evaluate(()=>JSON.stringify(ST.db.cases)),original);
 await p.evaluate(()=>{ST.db.settings.data.admin=true;ST.ui.corp={data:[],at:Date.now()};ST.ui.corpTodo=[];ST.ui.corpRO=[Object.assign({},ST.db.cases[1],{id:'SYN-RO',ro:true})];ST.go('detail',{caseId:'SYN-RO'})});assert.equal(await p.locator('.case-date-warning').count(),1);
 });
 await check('390px synthetic screenshots, no horizontal overflow and no data changes',async()=>{
 await p.evaluate(()=>{ST.db.settings.data.admin=false;ST.ui.corpRO=null;ST.go('stats')});assert.ok(await overflow(p)<=0);
 await p.locator('.stats-loss-note').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(root,'docs/preview/stats-lost-390.png')});
 await p.locator('.sec:has(h2:text-matches("月の担当別"))').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-100));await p.screenshot({path:path.join(root,'docs/preview/stats-staff-390.png')});
 await p.locator('.sec:has(h2:text("依頼の種類別"))').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(root,'docs/preview/stats-types-390.png')});
 assert.equal(await p.evaluate(()=>JSON.stringify(ST.db.cases)),original);assert.deepEqual(errors,[]);
 });
 await check('Post-order cancellation retains prior won statistics, distinct from ordinary loss',async()=>{
 const before=await p.evaluate(()=>ST.vStats());
 await p.evaluate(()=>{const c=ST.db.cases[0];c.stage='lost';c.cancelledAt='2026-10-29T01:00:00Z';c.cancelReason='合成取消';ST.go('stats')});
 assert.equal(await p.evaluate(()=>ST.vStats()),before);assert.equal((await sum(p))['受注'],'2件');
 });
 await c.close();console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
