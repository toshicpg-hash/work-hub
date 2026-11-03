/* v1.49.5 仕事用カレンダーの対応設定：全社・複数会社・見る人用一覧につないだ（管理でない）端末で、自分の主カレンダーを保存できる。
   Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CM={get db(){return DB},get ui(){return ui},G,go,save,render,scopeContext,scopeIdentity};';
const OWN='synthetic-self-sheet-000000001',OTHER='synthetic-self-sheet-OTHER0009',SELF='self@example.com';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device({ownInList=OWN,viewList=true,width=390}={}){
 const c=await browser.newContext({viewport:{width,height:844},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const dialogs=[];p.on('dialog',d=>{dialogs.push(d.message());d.accept()});
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CM);
 await p.evaluate(({OWN,ownInList,viewList,SELF})=>{const d=CM.db.settings.data;d.ob={legacy:true};d.sheetId=OWN;d.viewListId='synthetic-view-list-000000001';d.viewEmail=SELF;
  d.nameProfile={name:'見本 一郎',sheetId:OWN};CM.db.settings.rcpt.name='見本 一郎';
  CM.ui.viewList=viewList?[{name:'見本 一郎',email:SELF,sheetId:ownInList,company:'CP,CPY,AT',role:'全社',gmCo:'CP',removed:false},{name:'見本 二郎',email:'b@example.com',sheetId:'synthetic-b-sheet-0000000002',company:'CPY',role:'社員',gmCo:'',removed:false}]:null;
  CM.G.cals=[{id:SELF,name:'自分',primary:true,owner:true,write:true},{id:'shared-work@example.com',name:'見本の共有',primary:false,owner:false,write:true}];
  CM.save();CM.go('stats')},{OWN,ownInList,viewList,SELF});
 await p.click('details[data-keep-open=calmap] > summary');
 return {c,p,errors,dialogs};
}
const fill=async(p,{cal=SELF,mode='person',company='CP',person=OWN,work=true}={})=>{await p.selectOption('#cs_cal',cal);await p.selectOption('#cs_mode',mode);await p.selectOption('#cs_company',company);if(person!=null)await p.selectOption('#cs_person',person);if(work)await p.check('#cs_work');else await p.uncheck('#cs_work')};
const saved=p=>p.evaluate(()=>{try{return JSON.parse(JSON.stringify(window.CPGCalendarScope.load(localStorage,CM.scopeIdentity()).rows))}catch(e){return null}});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 await check('全社・複数会社の見る人の端末で、自分の主カレンダーを自分（CP）に結び付けて保存できる',async()=>{
  const {c,p,errors,dialogs}=await device();await fill(p);await p.click('#calendarScopeForm button[type=submit]');
  assert.equal(dialogs.length,1);assert.match(await p.textContent('#toast'),/保存しました/);
  assert.deepEqual(await saved(p),[{id:SELF,work:true,mode:'person',company:'CP',person:OWN}]);
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('不具合の再現：見る人用一覧の自分の行のシートIDが端末の記録シートと違っても、自分の会社（一覧のGmailの行）で保存できる',async()=>{
  const {c,p,errors}=await device({ownInList:OTHER});
  const opts=await p.$$eval('#cs_person option',a=>a.map(o=>o.value));assert.ok(opts.includes(OWN));
  await fill(p);await p.click('#calendarScopeForm button[type=submit]');
  assert.match(await p.textContent('#toast'),/保存しました/);assert.equal((await saved(p)).length,1);
  /* 保存した対応で、予定にも出せる（自分の会社が分かっている） */
  const ok=await p.evaluate(OWN=>{const ctx=CM.scopeContext(),me=window.CPGViewScope.catalog(ctx).people.find(x=>x.sheetId===OWN);return me&&me.companies.includes('CP')},OWN);assert.ok(ok);
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('見る人用一覧がまだ読めていないときは、理由を出して保存しない',async()=>{
  const {c,p,errors,dialogs}=await device({viewList:false});
  await p.evaluate(()=>{CM.db.cases=[{id:'U-0001',company:'CP',type:'reno',stage:'new',client:'見本管理',property:'見本荘',room:'1',items:[],payments:[],payLog:[]}];CM.save();CM.render()});
  await p.click('details[data-keep-open=calmap] > summary').catch(()=>{});
  if(!(await p.evaluate(()=>document.querySelector('details[data-keep-open=calmap]').open)))await p.click('details[data-keep-open=calmap] > summary');
  await fill(p);await p.click('#calendarScopeForm button[type=submit]');
  assert.equal(dialogs.length,0);assert.match(await p.textContent('#toast'),/会社をまだ確かめられません。「Googleとまとめて同期」で見る人用一覧を読み直して/);
  assert.match(await p.textContent('details[data-keep-open=calmap]'),/会社をまだ確かめられません/);
  assert.deepEqual(await saved(p),[]);
  assert.equal(await p.$eval('#cs_cal',e=>e.value),SELF,'the typed values stay');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('保存できないときは、どの条件で止まったかを出す',async()=>{
  const {c,p,errors}=await device();
  const submit=()=>p.evaluate(()=>document.getElementById('calendarScopeForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await fill(p,{work:false});await submit();assert.match(await p.textContent('#toast'),/チェックを入れてください/);
  await fill(p,{company:'',person:OWN});await submit();assert.match(await p.textContent('#toast'),/会社を選んでください/);
  await fill(p,{person:''});await submit();assert.match(await p.textContent('#toast'),/人物を選んでください/);
  await fill(p,{company:'CP',person:'synthetic-b-sheet-0000000002'});await submit();assert.match(await p.textContent('#toast'),/見本 二郎さんの会社に「CP」がありません/);
  await p.evaluate(()=>{CM.G.cals=CM.G.cals.filter(x=>x.primary!==true)});await fill(p,{cal:'shared-work@example.com'});await p.evaluate(()=>{document.getElementById('cs_cal').innerHTML+='<option value="gone@example.com">gone</option>';document.getElementById('cs_cal').value='gone@example.com'});await submit();assert.match(await p.textContent('#toast'),/カレンダーを選んでください/);
  assert.deepEqual(await saved(p),[]);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('初期設定の役割ボタンに「選んでも権限は変わらない」の説明がある',async()=>{
  const c=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'});await c.route(/googleapis|accounts\.google|fonts\./,r=>r.fulfill({status:200,body:''}));
  const p=await c.newPage();await p.goto(origin+'/index.html');
  assert.match(await p.textContent('#onboarding'),/「GM・全社」は、社長から役割を「GM」か「全社」にしてもらった人が選びます。ここで選んでも、見られる範囲や権限は変わりません/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
