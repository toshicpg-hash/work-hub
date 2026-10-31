/* Synthetic fixtures only; all external requests are blocked. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const sheetReply=require('./helpers/case-sheet-mock.cjs');
const root=path.resolve(__dirname,'..'),KEY='workhub_proto_v1';
const hook='window.testHub={get db(){return DB},ui,go,emptyDB,CASE_DEFAULTS,save,render,genTodos,dataRows,roCase,roDetail,upgrade,ended,gSyncAll,sheetWrite,sheetRead,vStats,roBuild,objRows,get uncertain(){return caseSaveUncertain},authorize(){G.token="synthetic-token";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000;}};';
let server,browser,origin;const results=[];
async function setup(db,tz='Asia/Tokyo',width=390,network=null,baseline=false,touch=false){
 const ctx=await browser.newContext({timezoneId:tz,locale:'ja-JP',viewport:{width,height:844},hasTouch:touch,isMobile:touch,...(touch?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})}),requests=[],errors=[];
 await ctx.route('**/*',r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:(baseline?require('node:child_process').execFileSync('git',['show','f6d89e6d112647bbc66d1b0f83ca2387699b27bf:index.html'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'index.html'),'utf8')).replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u===origin+'/seed')return r.fulfill({contentType:'text/html',body:'<!doctype html>'});if(u.startsWith(origin+'/'))return r.continue();requests.push({url:u,method:r.request().method()});
 if(network&&u.includes('/calendar/v3/users/me/calendarList'))return r.fulfill({contentType:'application/json',body:'{"items":[]}'});
 if(network&&u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic-own')){
  const answer=sheetReply(network,r.request());return r.fulfill({status:answer.status||200,contentType:'application/json',body:JSON.stringify(answer.body)});
 }
 return r.fulfill({status:200,body:''});});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-29T15:05:00Z'));await p.goto(origin+'/seed');if(db)await p.evaluate(({KEY,db})=>localStorage.setItem(KEY,JSON.stringify(db)),{KEY,db});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.testHub);return {ctx,p,requests,errors};
}
const setTime=async(p,time)=>{const [hour='',minute='']=time.split(':');await p.locator('#d_plan_hour').selectOption(hour);await p.locator('#d_plan_minute').selectOption(minute);};
const readTime=async p=>{const h=await p.locator('#d_plan_hour').inputValue(),m=await p.locator('#d_plan_minute').inputValue();return h!==''&&m!==''?h+':'+m:'';};
const read=p=>p.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)),KEY);
const open=(p,id)=>p.evaluate(id=>testHub.go('detail',{caseId:id}),id);
const click=(p,a)=>p.locator('[data-act="'+a+'"]').click();
const stale=(p,a)=>p.evaluate(a=>{const b=document.createElement('button');b.dataset.act=a;document.getElementById('main').append(b);b.click();b.remove();},a);
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

 try{
 const n={grid:{sheetId:17,columnCount:32,rowCount:20},exports:{'案件':[['old header'],['old synthetic value']]}},init=await setup(),db=await init.p.evaluate(()=>testHub.emptyDB());await init.ctx.close();
 const reasons=['価格','他社に決定','時期が合わない','連絡なし','その他','','<未知の合成理由>'];
 db.cases=reasons.map((lossReason,i)=>({id:'SYN-REASON-'+i,type:'reno',stage:'lost',lossDate:'2026-10-20',lossReason,estSentDate:'2026-10-01',property:'合成共有確認棟',room:String(i),tantou:'合成担当',client:'合成依頼元',receivedAt:'2026-10-01T00:00:00Z'}));
 db.cases.push({...db.cases[0],id:'SYN-UNDATED',lossDate:''},{...db.cases[4],id:'SYN-CANCELLED',orderDate:'2026-10-15',cancelledAt:'2026-10-20T00:00:00Z',cancelReason:'合成取消'});
 const a=await setup(db,'Asia/Tokyo',390,n),old=await setup(db,'Asia/Tokyo',390,n,true),admin=await setup(undefined,'Asia/Tokyo',390,n),oldAdmin=await setup(undefined,'Asia/Tokyo',390,n,true);
 const before=await read(a.p),rows=await a.p.evaluate(()=>testHub.dataRows().cases),oldRows=await old.p.evaluate(()=>testHub.dataRows().cases);
 assert.equal(rows[0].length,33);assert.equal(rows[0][32],'失注理由');assert.deepEqual(rows.map(r=>r.slice(0,32)),oldRows);assert.deepEqual(rows.slice(1,8).map(r=>r[32]),reasons);results.push('All five reasons, empty and unknown export verbatim; original 32 columns byte-for-byte equivalent');
 const write=p=>p.evaluate(async()=>{testHub.authorize();await testHub.sheetWrite('synthetic-own','案件',testHub.dataRows().cases)});
 const load=async p=>p.evaluate(async()=>{testHub.authorize();const v=await testHub.sheetRead('synthetic-own',['案件']),s={name:'合成社員',email:'sample@example.com',company:'CP',sheetId:'synthetic-own'},data=[{s,ok:true,cases:testHub.objRows(v['案件']),todo:[],rc:[],orders:[]}];testHub.db.cases=[];testHub.db.settings.data.admin=true;testHub.ui.corp={data,at:Date.now()};testHub.roBuild(data);testHub.go('stats');return {cases:testHub.ui.corpRO,reasons:[...document.querySelectorAll('.brk')].map(e=>e.textContent),text:document.querySelector('main').textContent};});
 await write(a.p);assert.equal(n.grid.columnCount,33);assert.equal(n.caseClear,undefined);let out=await load(admin.p);assert.deepEqual(out.cases.slice(0,7).map(c=>c.lossReason),reasons);for(const reason of reasons.slice(0,5))assert(out.reasons.includes(reason+'1件'));assert(out.reasons.includes('理由が届いていない（社員の記録）2件'));assert.match(out.text,/受注 1件 ／ 失注 7件/);assert.match(out.text,/失注日が未入力の案件 1件/);results.push('Employee wire -> grid GET -> objRows -> president roBuild -> all five categories; undated/cancellation exclusions preserved');
 await admin.p.evaluate(()=>{testHub.db.settings.data.admin=false;testHub.db.settings.data.viewListId='synthetic-view';testHub.db.settings.data.viewEmail='viewer@example.com';testHub.ui.viewList=[{email:'viewer@example.com',role:'全社'}];testHub.go('stats')});for(const reason of reasons.slice(0,5))assert((await admin.p.locator('.sec:has(h2:text("失注の理由"))').innerText()).includes(reason));assert.equal(await admin.p.locator('[data-cddate],[data-cdconvert]').count(),0);results.push('Company-wide readonly viewer receives the same reason categories');
 await admin.p.evaluate(()=>{testHub.db.settings.data.admin=true;testHub.go('stats')});
 await admin.p.locator('.sec:has(h2:text("失注の理由"))').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-100));await admin.p.screenshot({path:path.join(root,'docs/preview/loss-reason-admin-390.png')});
 await open(a.p,'SYN-REASON-4');await a.p.click('[data-cddate="SYN-REASON-4"]');assert.equal(await a.p.inputValue('#cd_reason'),'その他');await a.p.screenshot({path:path.join(root,'docs/preview/loss-reason-employee-390.png')});await a.p.click('[data-act=cddateclose]');assert.deepEqual(await read(a.p),before);results.push('Employee existing Other input visible; screenshots use synthetic data; local record unchanged');
 out=await load(oldAdmin.p);assert(out.cases.every(c=>c.lossReason===''));results.push('Actual v1.47.5 reader tolerates 33 columns but cannot display loss reason');
 await write(old.p);assert.equal(n.exports['案件'][0].length,32);assert.equal(n.grid.columnCount,33);out=await load(admin.p);assert(out.cases.every(c=>c.lossReason===''));assert(out.reasons.includes('理由が届いていない（社員の記録）7件'));assert.deepEqual(await read(a.p),before);results.push('Actual old writer full-grid replacement erases column 33; new reader handles missing column without inventing reasons; local source intact');
 await write(a.p);out=await load(admin.p);assert.deepEqual(out.cases.slice(0,7).map(c=>c.lossReason),reasons);results.push('New employee resync restores lost mirror reasons from unchanged local source');
 await a.p.evaluate(()=>{testHub.db.cases[4].lossReason='';testHub.save()});await write(a.p);out=await load(admin.p);assert.equal(out.cases[4].lossReason,'');assert(out.reasons.includes('その他0件'));assert(out.reasons.includes('理由が届いていない（社員の記録）3件'));results.push('Explicit empty reason clears stale mirror value; no fallback to Other');
 const saved=structuredClone(n.exports['案件']);for(const fault of ['metadata','batch','values']){n.fault=fault;await assert.rejects(()=>write(a.p));assert.deepEqual(n.exports['案件'],saved)}delete n.fault;results.push('Metadata/batch/value failure never pre-clears existing reasons');
 assert(n.calls.filter(c=>c.method!=='GET').every(c=>c.path==='/v4/spreadsheets/synthetic-own:batchUpdate'));assert.equal(n.caseClear,undefined);for(const x of [a,old,admin,oldAdmin]){assert.deepEqual(x.errors,[]);await x.ctx.close()}
 for(const fault of [null,'expand','values']){const net={grid:{sheetId:17,columnCount:32,rowCount:20},exports:{'案件':oldRows},fault},x=await setup(db,'Asia/Tokyo',390,net);if(fault){await assert.rejects(()=>write(x.p));assert.deepEqual(net.exports['案件'],oldRows);assert.equal(net.grid.columnCount,32)}else {await write(x.p);assert.equal(net.grid.columnCount,33);assert.equal(net.exports['案件'][0][32],'失注理由')}assert.equal(net.caseClear,undefined);await x.ctx.close();results.push('32->33 atomic grid expansion '+(fault||'success'));}
 console.log(results.map(x=>'PASS '+x).join('\n'));console.log('ALL PASS',results.length);
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
