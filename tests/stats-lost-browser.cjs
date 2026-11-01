/* Synthetic fixtures only (fictional names, example.com). No Google requests; nothing is written to real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.ST={get db(){return DB},ui,go,render,roBuild,save,vStats,caseDateOpen,caseDateSave,dataRows,CASE_DEFAULTS};';
const TODAY='2026-10-29';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width){
 const c=await browser.newContext({viewport:{width,height:844},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u.startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.ST);return {c,p,errors};
}
const sum=p=>p.$$eval('.sum .k',a=>Object.fromEntries(a.map(k=>[k.textContent,k.nextElementSibling.textContent])));
const unpaidHead=p=>p.$eval('h2:text("未入金")+span',e=>e.textContent);
// Wide tables may scroll inside .tbl-wrap; outer panels and the page must not overflow.
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
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
 const t=await p.textContent('main');assert.match(t,/受注 2件 ／ 失注 1件/);assert.match(t,/失注日が未入力の案件 1件/);assert.match(t,/67%/);
 const rows=await p.$$eval('.sec:has(h2:text-matches("月の担当別")) tbody tr',a=>a.map(x=>[...x.cells].map(c=>c.textContent)));
 assert.equal(rows[0][3],'1件');
 });
 await check('Type estimate submissions reconcile to staff; reasons exclude unknown lost',async()=>{
 const rows=await p.$$eval('.sec:has(h2:text("依頼の種類別")) tbody tr',a=>a.map(x=>[...x.cells].map(c=>c.textContent)));
 assert.equal(rows.reduce((s,r)=>s+parseInt(r[1]),0),6);assert.equal(rows.reduce((s,r)=>s+parseInt(r[2]),0),2);assert.equal(rows.reduce((s,r)=>s+parseInt(r[3]),0),1);
 assert.match(await p.locator('.sec:has(h2:text("失注の理由"))').innerText(),/価格[\s\S]*1件/);
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

 const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('workhub_proto_v1')));
 const open=id=>p.evaluate(id=>ST.go('detail',{caseId:id}),id);
 const beforeCorrection=await read();
 await check('Date editor opens locally; dismiss confirmation/back leaves all data unchanged',async()=>{
 await open('SYN-LOST');await p.click('[data-cddate="SYN-LOST"]');await p.fill('#cd_order','');await p.fill('#cd_loss','2026-10-20');await p.selectOption('#cd_reason','他社に決定');
 p.once('dialog',d=>d.dismiss());await p.click('[data-act=cddatesave]');assert.deepEqual(await read(),beforeCorrection);
 await p.click('[data-act=cddateclose]');await p.click('[data-nav=cases]');await p.reload();assert.deepEqual(await read(),beforeCorrection);
 });
 await check('Explicit date correction saves before/after history, confirms subject, reload and JSON restore retain it',async()=>{
 await open('SYN-LOST');await p.click('[data-cddate="SYN-LOST"]');await p.fill('#cd_order','');await p.fill('#cd_loss','2026-10-20');await p.selectOption('#cd_reason','他社に決定');
 await p.screenshot({path:path.join(root,'docs/preview/stats-date-editor-390.png')});
 let message='';p.once('dialog',d=>{message=d.message();d.accept()});await p.click('[data-act=cddatesave]');assert.match(message,/SYN-LOST/);assert.match(message,/2026-10-10/);assert.match(message,/2026-10-20/);
 const db=await read(),x=db.cases.find(c=>c.id==='SYN-LOST'),old=beforeCorrection.cases.find(c=>c.id==='SYN-LOST');
 assert.equal(x.orderDate,'');assert.equal(x.lossDate,'2026-10-20');assert.equal(x.lossReason,'他社に決定');assert.equal(x.dateCorrections.length,1);assert.equal(x.dateCorrections[0].before.orderDate,old.orderDate);assert.equal(x.dateCorrections[0].before.lossDate,old.lossDate);assert.equal(x.dateCorrections[0].before.lossReason,old.lossReason);assert.equal(x.estAmount,old.estAmount);
 assert.deepEqual(db.cases.filter(c=>c.id!=='SYN-LOST'),beforeCorrection.cases.filter(c=>c.id!=='SYN-LOST'));
 await p.evaluate(db=>localStorage.setItem('workhub_proto_v1',JSON.stringify(db)),db);await p.reload();assert.deepEqual(await read(),db);await open('SYN-LOST');assert.match(await p.locator('main').innerText(),/訂正履歴/);
 await p.click('[data-cddate="SYN-LOST"]');await p.click('[data-act=cddatesave]');assert.match(await p.locator('#cd_status').innerText(),/変更はありません/);assert.deepEqual(await read(),db);await p.click('[data-act=cddateclose]');
 });
 await check('Post-order cancellation remains intact during date edit; conversion requires date/reason and confirmation',async()=>{
 await p.evaluate(()=>{const c=ST.db.cases[0];c.stage='lost';c.cancelledAt='2026-10-29T01:00:00Z';c.cancelReason='合成の取消記録';c.lossReason='';ST.save()});
 await open('SYN-WON');await p.click('[data-cddate="SYN-WON"]');await p.fill('#cd_order','2026-10-11');p.once('dialog',d=>d.accept());await p.click('[data-act=cddatesave]');
 const baseline=await read(),x=baseline.cases[0];assert.equal(x.cancelledAt,'2026-10-29T01:00:00Z');assert.match(await p.locator('main').innerText(),/受注後取消済み/);
 await p.click('[data-cdconvert="SYN-WON"]');await p.click('[data-act=cddatesave]');assert.match(await p.locator('#cd_status').innerText(),/必.*要/);assert.deepEqual(await read(),baseline);
 await p.click('[data-act=cddateclose]');await p.click('[data-cdconvert="SYN-WON"]');await p.clock.runFor(7000);await p.fill('#cd_loss','2026-10-21');await p.selectOption('#cd_reason','価格');await p.screenshot({path:path.join(root,'docs/preview/stats-cancel-correction-390.png')});
 p.once('dialog',d=>d.dismiss());await p.click('[data-act=cddatesave]');assert.deepEqual(await read(),baseline);
 p.once('dialog',d=>d.accept());await p.click('[data-act=cddatesave]');const after=await read(),r=after.cases[0];assert.equal(r.cancelledAt,'');assert.equal(r.cancelReason,'');assert.equal(r.orderDate,'');assert.equal(r.stage,'lost');assert.equal(r.lossDate,'2026-10-21');assert.equal(r.dateCorrections.length,2);assert.equal(r.dateCorrections[1].before.cancelledAt,x.cancelledAt);assert.equal(r.dateCorrections[1].before.cancelReason,x.cancelReason);assert.equal(r.dateCorrections[1].before.orderDate,x.orderDate);assert.equal(r.estAmount,x.estAmount);
 assert.equal(await p.locator('[data-cdconvert]').count(),0);await p.evaluate(()=>ST.caseDateSave());assert.deepEqual(await read(),after);
 await p.reload();await open('SYN-WON');assert.doesNotMatch(await p.locator('main').innerText(),/受注後取消済み/);await p.evaluate(()=>ST.go('stats'));assert.equal((await sum(p))['受注'],'1件');
 const rows=await p.evaluate(()=>ST.dataRows().cases);assert.equal(rows[0].length,33);const row=rows.find(r=>r[0]==='SYN-WON');assert.equal(row[rows[0].indexOf('受注後取消日時')],'');assert.equal(row[rows[0].indexOf('失注日')],'2026-10-21');
 });
 await check('Shared readonly, post-handover, duplicate IDs and busy states reject editor even direct calls',async()=>{
 const before=await read();await p.evaluate(()=>{ST.db.settings.data.admin=true;ST.ui.corp={data:[],at:Date.now()};ST.ui.corpTodo=[];ST.ui.corpRO=[{...ST.db.cases[1],id:'SYN-RO',ro:true}];ST.go('detail',{caseId:'SYN-RO'});ST.caseDateOpen('SYN-RO',false)});assert.equal(await p.locator('[data-cddate],[data-cdconvert]').count(),0);await p.evaluate(()=>{const b=document.createElement('button');b.dataset.cddate='SYN-RO';document.body.append(b);b.click();b.remove()});assert.equal(await p.locator('#caseDateEditor[open]').count(),0);
 await p.evaluate(()=>{ST.db.settings.data.admin=false;ST.ui.corpRO=null;ST.ui.gsync={busy:true};ST.caseDateOpen('SYN-LOST',false)});assert.equal(await p.locator('#caseDateEditor[open]').count(),0);await p.evaluate(()=>ST.ui.gsync={busy:false});
 for(const stage of ['handed','working','built','billed','paid']){await p.evaluate(stage=>{const c=ST.db.cases[1],old=c.stage;c.stage=stage;ST.caseDateOpen(c.id,false);c.stage=old},stage);assert.equal(await p.locator('#caseDateEditor[open]').count(),0)}
 await p.evaluate(()=>{ST.db.cases.push({...ST.db.cases[1]});ST.caseDateOpen('SYN-LOST',false);ST.db.cases.pop()});assert.equal(await p.locator('#caseDateEditor[open]').count(),0);assert.deepEqual(await read(),before);
 });
 await check('Busy or changed record after editor opens blocks save, with no success or history write',async()=>{
 await open('SYN-LOST');await p.click('[data-cddate="SYN-LOST"]');await p.fill('#cd_loss','2026-10-22');const before=await read();await p.evaluate(()=>ST.ui.gsync={busy:true});await p.click('[data-act=cddatesave]');assert.match(await p.locator('#cd_status').innerText(),/処理中/);assert.deepEqual(await read(),before);await p.evaluate(()=>{ST.ui.gsync={busy:false};ST.db.cases[1].note='別の変更'});await p.click('[data-act=cddatesave]');assert.match(await p.locator('#cd_status').innerText(),/記録が変わりました/);assert.deepEqual(await read(),before);await p.reload();
 });
 for(const fault of ['write','readback','mismatch','other-tab'])await check('Correction save '+fault+' failure: no false success, retry blocked, reload authoritative',async()=>{
 await open('SYN-LOST');await p.click('[data-cddate="SYN-LOST"]');await p.fill('#cd_loss','2026-10-23');const before=await read();
 await p.evaluate(fault=>{const proto=Storage.prototype,get=proto.getItem,set=proto.setItem;let written=false;window.restoreStorage=()=>{proto.getItem=get;proto.setItem=set};if(fault==='other-tab'){const d=JSON.parse(get.call(localStorage,'workhub_proto_v1'));d.cases[1].note='別タブの合成変更';set.call(localStorage,'workhub_proto_v1',JSON.stringify(d));return}
 proto.setItem=function(k,v){if(k==='workhub_proto_v1'){if(fault==='write')throw Error('synthetic write');set.call(this,k,v);written=true;return}return set.call(this,k,v)};proto.getItem=function(k){if(k==='workhub_proto_v1'&&written){if(fault==='readback')throw Error('synthetic readback');if(fault==='mismatch')return 'synthetic mismatch'}return get.call(this,k)}},fault);
 p.once('dialog',d=>d.accept());await p.click('[data-act=cddatesave]');assert.match(await p.locator('#cd_status').innerText(),/保存結果を確認できません/);assert.doesNotMatch(await p.locator('#toast').innerText(),/訂正と変更前の履歴を保存/);
 await p.evaluate(()=>window.restoreStorage());const stored=await read();if(fault==='write')assert.deepEqual(stored,before);else if(fault==='other-tab')assert.equal(stored.cases[1].note,'別タブの合成変更');else {assert.equal(stored.cases[1].lossDate,'2026-10-23');assert.equal(stored.cases[1].dateCorrections.length,before.cases[1].dateCorrections.length+1)}
 await p.evaluate(()=>ST.caseDateSave());assert.deepEqual(await read(),stored);await p.reload();assert.deepEqual(await p.evaluate(()=>ST.db.cases),stored.cases);
 // Restore only the synthetic fixture so each failure branch tests a real change.
 await p.evaluate(before=>localStorage.setItem('workhub_proto_v1',JSON.stringify(before)),before);await p.reload();
 });
 assert.deepEqual(errors,[]);
 await c.close();console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
