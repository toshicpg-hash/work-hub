/* v1.50.1 予定の札：対応設定で人物に結び付けたカレンダーは、その人の表示名（担当バッジと同じ）と担当バッジの色。
   Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CL={get db(){return DB},get ui(){return ui},G,go,save,render,scopeIdentity,calPersonTags,personBadge};';
const OWN='synthetic-self-sheet-000000001',B='synthetic-b-sheet-0000000002',SELF='self@example.com';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const ev=(calendarId,id,title,calendar)=>({private:false,calendarId,id,calendar,title,allDay:true,start:'2026-11-03',end:'2026-11-04'});
async function device({viewList=true,rows=[],width=400}={}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CL);
 await p.evaluate(({OWN,B,SELF,viewList,rows,ev})=>{const d=CL.db.settings.data;d.ob={legacy:true};d.sheetId=OWN;d.viewListId=viewList?'synthetic-view-list-000000001':'';d.viewEmail=viewList?SELF:'';
  d.nameProfile={name:'見本 一郎',sheetId:OWN};CL.db.settings.rcpt.name='見本 一郎';
  CL.ui.viewList=viewList?[{name:'見本 一郎',email:SELF,sheetId:OWN,company:'CP,CPY,AT',role:'全社',gmCo:'',removed:false},{name:'見本 二郎',email:'b@example.com',sheetId:B,company:'CPY',role:'社員',gmCo:'',removed:false}]:null;
  CL.G.cals=[{id:SELF,name:'自分',primary:true,owner:true,write:true},{id:'jiro.cal@example.com',name:'jiro',primary:false,owner:false,write:false},{id:'shared-work@example.com',name:'見本の共有',primary:false,owner:false,write:true}];
  CL.save();
  if(rows.length)CPGCalendarScope.save(localStorage,CL.scopeIdentity(),rows);
  const mk=new Function('return '+ev)();
  localStorage.setItem('workhub_gcal_last_v1',JSON.stringify({policy:2,at:Date.now(),from:'2026-11-01',to:'2026-11-30',data:{events:[mk(SELF,'s1','見本の自分の予定','見本 一郎の主'),mk('jiro.cal@example.com','j1','見本の二郎の予定','jiro.cal@example.com')],sources:[{id:SELF},{id:'jiro.cal@example.com'}],missing:0}}));
  CL.go('cal',{calDay:'2026-11-03',calMonth:'2026-11',calView:'day'})},{OWN,B,SELF,viewList,rows,ev:ev.toString()});
 if(viewList&&await p.locator('main [data-scope-person]').count()){await p.selectOption('main [data-scope-company]','all').catch(()=>{});await p.selectOption('main [data-scope-person]','all')}
 return {c,p,errors};
}
const chips=p=>p.evaluate(()=>[...document.querySelectorAll('main .gccard .ev')].map(e=>({t:e.textContent,cls:e.className})));
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const rows=[{id:'jiro.cal@example.com',mode:'person',company:'CPY',person:B,work:true}];
 await check('結び付けたカレンダーの予定の札は、Gmailの先頭ではなく、その人の表示名と担当バッジの色。本人の主カレンダーは本人の名前',async()=>{
  const {c,p,errors}=await device({rows});
  const r=await chips(p),badge=await p.evaluate(B=>[CL.personBadge('見本 一郎',true,''),CL.personBadge('見本 二郎',true,B)],B);
  const jiro=r.find(x=>x.t==='見本 二郎'),self=r.find(x=>x.t==='見本 一郎');
  assert.ok(jiro&&self,JSON.stringify(r));assert.ok(!r.some(x=>/^jiro|^self/.test(x.t)),'no Gmail prefix');
  const color=html=>(html.match(/pb\d|pbx/)||[])[0];
  assert.ok(self.cls.split(' ').includes(color(badge[0])),self.cls+' / '+badge[0]);assert.ok(jiro.cls.split(' ').includes(color(badge[1])),jiro.cls+' / '+badge[1]);
  assert.notEqual(color(badge[0]),color(badge[1]),'different people, different colors');
  /* 週・月の画面でも同じ札 */
  await p.evaluate(()=>CL.go('cal',{calDay:'2026-11-03',calMonth:'2026-11',calView:'week'}));
  assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('main .wkev .ev')].map(e=>e.textContent).sort()),['見本 一郎','見本 二郎']);
  await p.evaluate(()=>CL.go('cal',{calDay:'2026-11-03',calMonth:'2026-11',calView:'month'}));
  const mt=await p.textContent('main');assert.match(mt,/見本 二郎 見本の二郎の予定|見本 二郎/);assert.doesNotMatch(mt,/jiro 見本の二郎の予定/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.evaluate(()=>CL.go('cal',{calDay:'2026-11-03',calMonth:'2026-11',calView:'day'}));
  await p.locator('main').screenshot({path:path.join(root,'docs/preview/calendar-label-names-400.png')});
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('見る人用一覧のない本人の端末：自分の主カレンダーの予定は本人の名前（色は今までどおり）',async()=>{
  const {c,p,errors}=await device({viewList:false});
  const r=await chips(p);assert.deepEqual(r.map(x=>x.t),['見本 一郎']);assert.match(r[0].cls,/\bgc\d\b/,'calendar color when the person is not in a list');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('複数の人が使うカレンダー・名前が分からない人は、今までどおりカレンダー名',async()=>{
  const {c,p,errors}=await device({rows});
  const r=await p.evaluate(({B})=>[...CL.calPersonTags([{id:'mixed@example.com',mode:'mixed',work:true},{id:'ghost@example.com',mode:'person',company:'CP',person:'synthetic-unknown-000000009',work:true},{id:'jiro.cal@example.com',mode:'person',company:'CPY',person:B,work:true}]).entries()],{B});
  assert.deepEqual(r.map(x=>x[0]),['jiro.cal@example.com'],'only a known person gets a name tag');
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
