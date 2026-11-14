/* v1.49.3 全タブの上の部分を小さくする。Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CT={get db(){return DB},get ui(){return ui},go,render,save,roBuild,CASE_DEFAULTS,RECEIPT_DEFAULTS};';
const VIEWS=['home','cases','todo','cal','gantt','stats','rcpt','requests','company'];
/* 各タブで「本来見たいもの」の1件目 */
const FIRST={home:'#home-summary .tile',cases:'.card[data-open]',todo:'main .reqbox, main .list > *',cal:'[data-day]',gantt:'.gwrap',stats:'#stats-won details.statfold>summary',rcpt:'main .scope-bar ~ .panel, main [data-act=rnew]',requests:'main .list > *',company:'main .sec .panel'};
const DEV=/要求範囲|混在|未識別|所有者|共通選択|閲覧範囲全体/;
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device(role,width=390,height=844){
 const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-03T01:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CT);
 await p.evaluate(role=>{const D=CT.db,d=D.settings.data,C=o=>Object.assign(CT.CASE_DEFAULTS(),o);d.ob={legacy:true};
  D.cases=[C({id:'U-0101',company:'CP',type:'kinkyu',stage:'new',client:'見本管理',property:'見本荘',room:'101',tantou:'見本',receivedAt:'2026-11-02T23:00:00.000Z',symptom:'水漏れ'}),
   C({id:'U-0102',company:'CPY',type:'reno',stage:'quoted',client:'試験不動産',property:'試験ハイツ',room:'202',tantou:'見本',receivedAt:'2026-10-20T01:00:00.000Z',siteDate:'2026-10-21',estAmount:30000,estSentDate:'2026-10-22'}),
   C({id:'U-0103',company:'AT',type:'reno',stage:'won',client:'見本建物',property:'見本コーポ',room:'3',tantou:'見本',receivedAt:'2026-10-10T01:00:00.000Z',orderDate:'2026-10-30',estAmount:5000})];
  D.todos=[{id:'T1',title:'見本の手入力用事',due:'2026-11-02',tantou:'見本',done:false}];
  D.receipts=[Object.assign(CT.RECEIPT_DEFAULTS(),{id:'R-0001',date:'2026-11-01',payee:'見本商店',item:'見本の材料',amount:1200,company:'CP',method:'立替',cat:'材料費',status:'未提出'})];
  if(role==='admin'){d.admin=true;D.settings.rcpt.name='見本 社長';
   d.staff=[{name:'見本 一郎',email:'a@example.com',sheetId:'sheetA000000000000000001',company:'CP',role:'社員',lastSync:'2026-11-03 08:00'},{name:'見本 二郎',email:'b@example.com',sheetId:'sheetB000000000000000002',company:'CPY',role:'GM',gmCo:'CPY',lastSync:'2026-11-02 18:00'}];
   const data=[{s:d.staff[0],ok:true,rc:[],cases:[],todo:[],orders:[{'指示ID':'I-1','内容':'見本のリクエスト','期限':'2026-11-05','状態':'未完了'}]},{s:d.staff[1],ok:true,rc:[],cases:[],todo:[],orders:[]}];
   CT.ui.corp={data,at:Date.parse('2026-11-02T19:48:00Z')};CT.roBuild(data);}
  else{D.settings.rcpt.name='見本 一郎';d.sheetId='synthetic-own-sheet-0000000001';d.lastSync='2026-11-03T00:30:00.000Z';}
  CT.save();CT.go('home');},role);
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('main section,main .panel,.scope-bar,.scope-row,.sec-h,.monthbar,.calnav,.findrow')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const role of ['admin','employee']){
  const {c,p,errors}=await device(role);
  await check(role+'：390×844で、どのタブも1件目が画面の上から3分の1以内に見える',async()=>{
   for(const v of VIEWS){if(v==='company'&&role!=='admin')continue;await p.evaluate(v=>CT.go(v),v);
    /* v1.50.54 社長の端末の数字タブは、グループ各社売上報告がいちばん上（トシさんの指示）。見積決定率は画面の上半分に入ればよい */
    const sel=v==='stats'&&role==='admin'?'details[data-fold="sales"]':FIRST[v];
    const top=await p.evaluate(sel=>{const e=document.querySelector(sel);return e?e.getBoundingClientRect().top:null},sel);
    assert.ok(top!==null&&top<=844/3,v+' first item top '+top);
    if(sel!==FIRST[v]){const t2=await p.evaluate(sel=>{const e=document.querySelector(sel);return e?e.getBoundingClientRect().top:null},FIRST[v]);assert.ok(t2!==null&&t2<=844/2,v+' stats panel top '+t2)}
    assert.ok(await overflow(p)<=0,v+' overflow');}
  });
  await check(role+'：説明の文章は常には出さず、開発者向けの言葉も出さない',async()=>{
   for(const v of VIEWS){if(v==='company'&&role!=='admin')continue;await p.evaluate(v=>CT.go(v),v);
    const t=await p.evaluate(()=>{const m=document.querySelector('main').cloneNode(true);m.querySelectorAll('details:not([open]) > :not(summary)').forEach(e=>e.remove());return m.innerText});
    assert.doesNotMatch(t,DEV,v);
    assert.equal(await p.locator('.infobox').count(),0,v+' info is closed at first');}
  });
  await check(role+'：「ⓘ」を押すと説明が開き、もう一度で閉じる',async()=>{
   for(const v of VIEWS){if(v==='company'&&role!=='admin')continue;await p.evaluate(v=>CT.go(v),v);
    const keys=await p.$$eval('[data-info]',a=>a.map(x=>x.dataset.info));assert.ok(keys.length>=1,v);
    for(const k of keys){const b=p.locator('[data-info="'+k+'"]').first();await b.click();
     assert.equal(await p.locator('[data-info="'+k+'"]').first().getAttribute('aria-expanded'),'true');
     const t=await p.locator('[data-info-box="'+k+'"]').innerText();assert.ok(t.length>10,v+'/'+k);assert.doesNotMatch(t,DEV,v+'/'+k);
     assert.ok(await overflow(p)<=0,v+'/'+k+' overflow');
     await p.locator('[data-info="'+k+'"]').first().click();assert.equal(await p.locator('[data-info-box="'+k+'"]').count(),0);}}
  });
  await check(role+'：会社・人は細い1行（高さ44px）で、押すと選べる。大きな同期ボタンはホームだけ',async()=>{
   for(const v of VIEWS){if(v==='company'&&role!=='admin')continue;await p.evaluate(v=>CT.go(v),v);
    const r=await p.evaluate(()=>{const row=document.querySelector('.scope-row').getBoundingClientRect(),co=document.querySelector('[data-scope-company]').getBoundingClientRect(),pe=document.querySelector('[data-scope-person]').getBoundingClientRect();return {h:row.height,same:Math.abs(co.top-pe.top)<2,coh:co.height}});
    assert.ok(r.h<=48&&r.same&&r.coh>=44,v+' '+JSON.stringify(r));
    assert.equal(await p.locator('.gsyncbtn').count(),v==='home'?1:0,v);
    if(v!=='home')assert.ok(await p.isVisible('.syncmini'),v);}
   await p.evaluate(()=>CT.go('cases'));const opts=await p.$$eval('[data-scope-company] option',a=>a.map(o=>o.value));assert.ok(opts.includes('CP'));
  });
  await check(role+'：注意は隠れない（赤い札・この端末の同期の注意）',async()=>{
   await p.evaluate(()=>CT.go('cases'));
   assert.match(await p.locator('.alerttag').innerText(),/期限切れToDo \d+件/);
   if(role==='employee'){
    /* 前の日に同期したきりの端末 */
    await p.evaluate(()=>{CT.db.settings.data.lastSync='2026-11-02T09:00:00.000Z';CT.save();CT.go('cases')});
    assert.match(await p.locator('.syncmini').innerText(),/⚠/);assert.match(await p.locator('.syncmini').getAttribute('aria-label'),/今日未同期/);
    await p.evaluate(()=>CT.go('home'));assert.match(await p.locator('#home-sync').innerText(),/今日未同期/);}
   await p.evaluate(()=>CT.go('cases'));await p.click('.alerttag');assert.equal(await p.evaluate(()=>CT.ui.view),'todo');
   if(role==='employee')await p.evaluate(()=>{CT.db.settings.data.lastSync='2026-11-03T00:30:00.000Z';CT.save()});
  });
  await check(role+'：数字の月選択は「‹ 前月｜年月｜翌月 ›」の1行、高さ48px以上、真ん中で月を選べる',async()=>{
   await p.evaluate(()=>{CT.ui.statsPeriod='month';CT.ui.statsMonth='2026-11';CT.go('stats')});
   const r=await p.evaluate(()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),bar=q('.monthbar'),a=q('[data-stats-step="-1"]'),m=q('.monthpick'),b=q('[data-stats-step="1"]'),main=document.querySelector('#stats-won').getBoundingClientRect();
    return {row:Math.max(a.top,m.top,b.top)-Math.min(a.top,m.top,b.top),h:[a.height,m.height,b.height],full:Math.abs(bar.width-main.width)<2,font:parseFloat(getComputedStyle(document.querySelector('.mlabel')).fontSize),text:document.querySelector('.monthbar').innerText}});
   assert.ok(r.row<2&&r.h.every(x=>x>=48)&&r.full&&r.font>=18,JSON.stringify(r));assert.match(r.text,/前月[\s\S]*2026年11月[\s\S]*翌月/);
   await p.click('[data-stats-step="-1"]');assert.match(await p.locator('.mlabel').innerText(),/2026年10月/);
   const box=await p.locator('.monthpick').boundingBox(),inp=await p.locator('#stats-month').boundingBox();assert.ok(Math.abs(box.width-inp.width)<=3&&Math.abs(box.height-inp.height)<=3,'the whole middle opens the month picker');
   await p.locator('#stats-month').fill('2026-08');await p.locator('#stats-month').dispatchEvent('change');assert.match(await p.locator('.mlabel').innerText(),/2026年8月/);
   await p.click('[data-stats-step="1"]');assert.match(await p.locator('.mlabel').innerText(),/2026年9月/);
   await p.click('[data-stats-mode=all]');assert.equal(await p.locator('.monthbar').count(),0);await p.click('[data-stats-mode=month]');assert.equal(await p.locator('.monthbar').count(),1);
  });
  await check(role+'：予定は月・週・日が1行（44px）、読み込みの説明はⓘの中、カレンダーの対応設定は数字の下へ',async()=>{
   await p.evaluate(()=>{CT.ui.info={};CT.go('cal',{calView:'month'})});
   const r=await p.evaluate(()=>{const nav=document.querySelector('.calnav').getBoundingClientRect(),b=[...document.querySelectorAll('[data-cv]')].map(x=>x.getBoundingClientRect());return {h:b.map(x=>x.height),row:b.every(x=>x.top>=nav.top-1&&x.bottom<=nav.bottom+1)}});
   assert.ok(r.row&&r.h.every(x=>x>=44),JSON.stringify(r));
   assert.equal(await p.locator('.gsyncbtn').count(),0);assert.equal(await p.locator('.calendar-scope-status').count(),0);assert.equal(await p.locator('details[data-keep-open=calmap]').count(),0);
   await p.click('[data-info=scope]');assert.match(await p.locator('.calendar-scope-status').innerText(),/未取得|読み込めています/);await p.click('[data-info=scope]');
   await p.evaluate(()=>CT.go('stats'));assert.equal(await p.locator('details[data-keep-open=calmap]').count(),1);
  });
  await check(role+'：案件の種類はプルダウン、Access書出しは小さく端に',async()=>{
   await p.evaluate(()=>{CT.ui.type='all';CT.go('cases')});
   assert.equal(await p.locator('[data-type]').count(),0);assert.ok(await p.locator('#c_type option').count()>=10);
   await p.selectOption('#c_type','kinkyu');assert.equal(await p.locator('.card[data-open]').count(),1);
   await p.selectOption('#c_type','all');assert.equal(await p.locator('.card[data-open]').count(),3);
   const b=await p.locator('[data-act=csv]').boundingBox();assert.ok(b.height<=40&&b.x+b.width>=390-16-2,JSON.stringify(b));
  });
  assert.deepEqual(errors,[]);await c.close();
 }
 await check('360px・820×900でも横にはみ出さない',async()=>{
  for(const [w,h] of [[360,800],[820,900]]){const {c,p,errors}=await device('admin',w,h);
   for(const v of VIEWS){await p.evaluate(v=>CT.go(v),v);assert.ok(await overflow(p)<=0,w+' '+v)}
   /* v1.50.54 社長の端末の数字タブはグループ各社売上報告がいちばん上。見積決定率は上半分に入ればよい */
   if(w===820)for(const v of VIEWS){await p.evaluate(v=>CT.go(v),v);const sel=v==='stats'?'details[data-fold="sales"]':FIRST[v];const top=await p.evaluate(sel=>document.querySelector(sel)?.getBoundingClientRect().top,sel);assert.ok(top<=900/3,w+' '+v+' '+top);
    if(v==='stats'){const t2=await p.evaluate(sel=>document.querySelector(sel)?.getBoundingClientRect().top,FIRST[v]);assert.ok(t2<=900/2,w+' stats panel '+t2)}}
   assert.deepEqual(errors,[]);await c.close()}
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
