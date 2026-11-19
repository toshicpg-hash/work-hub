/* v1.50.82 同期の途中で裏に回って止まったら、戻ったときに自動でやり直す。Synthetic only; Google is stubbed, nothing is sent. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
/* gSyncAllRun を差し替える：plan の順に、complete（true/false）で終わる。hideDuring なら途中で裏に回る */
const hook=`window.SR={get ui(){return ui},detailText:t=>syncDetailText(t),get db(){return DB},G,save,go,render,sync:gSyncAll,calls:0,plan:[],
 signIn(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000},
 stub(){gSyncAllRun=async()=>{SR.calls++;const p=SR.plan.shift()||{complete:true};
   if(p.timed){const rows=[];ui.gsync={busy:true,rows};render();syncDiagSet('salesTabs',16);syncReqCount(SHEETS+'/a/values:batchGet','GET');syncReqCount(SHEETS+'/a/values:batchGet');syncReqCount(SHEETS+'/a:batchUpdate','POST');syncReqCount('https://www.googleapis.com/calendar/v3/x','GET');await syncDiagTime('sales',()=>new Promise(r=>setTimeout(r,60)));await new Promise(r=>setTimeout(r,120));rows.push({name:"Googleにログイン",ok:true,msg:""});await new Promise(r=>setTimeout(r,300));rows.push({name:"記録シート「案件」",ok:true,msg:"1行"});ui.gsync={busy:false,at:Date.now(),rows,complete:true};render();return}
   ui.gsync={busy:true,rows:[]};render();
   if(p.hideDuring){SR.setVis('hidden')}await new Promise(r=>setTimeout(r,50));
   ui.gsync={busy:false,at:Date.now(),complete:p.complete,rows:[{name:"Googleにログイン",ok:true,msg:""},{name:"記録シート「案件」",ok:p.complete,msg:p.complete?"1行":"通信できませんでした"}]};render()}},
 vis:'visible',setVis(v){SR.vis=v;document.dispatchEvent(new Event('visibilitychange'))}};
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>SR.vis});`;
let server,browser,origin;const results=[];
const check=async(n,fn)=>{await fn();results.push(n);console.log('PASS',n)};
async function device(width,pre){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 if(pre)await c.addInitScript(pre);
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SR);
 await p.evaluate(()=>{SR.db.settings.data.ob={legacy:true};SR.save();SR.stub();SR.go('home')});
 return {c,p,errors};
}
const banner=p=>p.locator('main .banner.syncres').count();
const mark=p=>p.evaluate(()=>localStorage.getItem('workhub_sync_resume_v1'));
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,400]){
  const d=await device(width);
  await check('同期の途中で裏に回って失敗 → 戻ったら自動でやり直す（ログイン中） '+width+'px',async()=>{
   await d.p.evaluate(()=>{SR.signIn();SR.plan=[{complete:false,hideDuring:true},{complete:true}]});
   await d.p.evaluate(()=>SR.sync());assert.equal(await d.p.evaluate(()=>SR.calls),1);assert.ok(await mark(d.p),'marked while not finished');
   await d.p.evaluate(()=>SR.setVis('visible'));await d.p.waitForFunction(()=>SR.calls===2&&!SR.ui.gsync.busy,null,{timeout:8000});
   await d.p.waitForTimeout(200);assert.equal(await mark(d.p),null,'cleared after success');assert.equal(await banner(d.p),0);
  });
  await check('裏に回らずに失敗したときは自動でやり直さない '+width+'px',async()=>{
   await d.p.evaluate(()=>{SR.calls=0;SR.plan=[{complete:false}]});await d.p.evaluate(()=>SR.sync());
   await d.p.evaluate(()=>{SR.setVis('hidden');SR.setVis('visible')});await d.p.waitForTimeout(2500);assert.equal(await d.p.evaluate(()=>SR.calls),1);
  });
  await check('ログインが切れていれば自動ではやらず、上に「もう一度同期」を出す '+width+'px',async()=>{
   await d.p.evaluate(()=>{SR.calls=0;SR.plan=[{complete:false,hideDuring:true}];});await d.p.evaluate(()=>SR.sync());
   await d.p.evaluate(()=>{SR.G.token=null;SR.setVis('visible')});await d.p.waitForTimeout(2500);
   assert.equal(await d.p.evaluate(()=>SR.calls),1);assert.equal(await banner(d.p),1);
   assert.match(await d.p.textContent('main .banner.syncres'),/同期が途中で止まりました/);assert.equal(await d.p.locator('main .banner.syncres [data-act=gsync]').count(),1);
   assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'overflow');
  });
  await check('自動のやり直しは10分に2回まで '+width+'px',async()=>{
   await d.p.evaluate(()=>{SR.signIn();SR.calls=0;SR.plan=[{complete:false,hideDuring:true},{complete:false,hideDuring:true},{complete:false,hideDuring:true},{complete:false,hideDuring:true}]});
   await d.p.evaluate(()=>SR.sync());
   for(let i=0;i<3;i++){await d.p.evaluate(()=>SR.setVis('visible'));await d.p.waitForTimeout(2300)}
   const n=await d.p.evaluate(()=>SR.calls);assert.ok(n<=3,'calls '+n);assert.equal(await banner(d.p),1);
  });
  assert.deepEqual(d.errors,[]);await d.c.close();
 }
 await check('v1.50.85 同期にかかった時間：合計と長かったものを出し、端末に残す（行の形は変えない）',async()=>{
  const d=await device(400);
  await d.p.evaluate(()=>{SR.signIn();SR.plan=[{timed:true}]});
  await d.p.evaluate(()=>SR.sync());
  const t=await d.p.evaluate(()=>SR.ui.gsync.timing);assert.ok(t.total>=400,JSON.stringify(t));assert.ok(Number.isFinite(t.button)&&!t.partial,'button time kept, final');
  assert.deepEqual(t.steps.map(x=>x.name),['Googleにログイン','記録シート「案件」']);assert.ok(t.steps[1].ms>=250,JSON.stringify(t.steps));
  assert.ok(await d.p.evaluate(()=>SR.ui.gsync.rows.every(x=>Object.keys(x).every(k=>['name','ok','msg'].includes(k)))),'rows unchanged');
  assert.equal(await d.p.evaluate(()=>!!localStorage.getItem('workhub_sync_timing_v1')&&!SR.db.settings.data.syncTiming),true,'kept on the device, not in the records');
  await d.p.evaluate(()=>{SR.go('home')});await d.p.evaluate(()=>{const x=document.querySelector('details.sync-result');if(x)x.open=true});const note=await d.p.textContent('.sync-time');
  assert.match(note,/かかった時間：合計 0\.\d秒・ボタンが戻るまで 0\.\d秒（長かったもの：記録シート「案件」/);
  /* v1.50.116 同期の内訳（記録シート「情報」の「前回の同期の内訳」に書く。画面の表示は変えない） */
  assert.equal(t.detail.salesTabs,16);assert.ok(t.detail.ord.sales>=50,JSON.stringify(t.detail));
  assert.match(await d.p.evaluate(t=>SR.detailText(t),t),/^Googleへの問い合わせ：4回（表計算の読み 2・書き 1・ドライブ 0・カレンダー 1）／今月の受注：売上報告の読み込み 0\.\d秒（売上報告のタブ 16）$/);
  assert.equal(await d.p.evaluate(t=>SR.detailText({...t,detail:{corp:{n:18,prevN:18,reused:12,probed:10,full:6,slow:8200,prep:21000,ms:30000,shared:null,keep:{ok:false,kb:5200}},req:{sr:40,sw:5,dr:2,cal:20,r429:3}}}),t),
    '社員の記録：18人・前回の控え 18人・読み直さず 12人（うち「情報」で確認 10人）・全部読んだ 6人・いちばん遅い人 8.2秒・読む前の準備 21.0秒・読み込み全体 30.0秒・社長の更新日時 なし/古い・控えの保存 できなかった 5200KB／Googleへの問い合わせ：67回（表計算の読み 40・書き 5・ドライブ 2・カレンダー 20）・回数制限（429） 3回');
  assert.doesNotMatch(note,/内訳|売上報告のタブ/,'screen text unchanged (not the boss device)');
  /* v1.50.118 社長の端末（記録シートがない）は、画面に内訳を出す */
  await d.p.evaluate(()=>{SR.db.settings.data.admin=true;SR.render()});await d.p.evaluate(()=>{const x=document.querySelector('details.sync-result');if(x)x.open=true});
  assert.match(await d.p.textContent('.sync-detail'),/^内訳：Googleへの問い合わせ：4回/);
  assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'overflow');
  await d.p.evaluate(()=>{SR.db.settings.data.admin=false;SR.render()});
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('アプリを閉じて開き直したとき、止まったままなら上に出す（印が残っている）',async()=>{
  const d=await device(400,`try{localStorage.setItem('workhub_sync_resume_v1',JSON.stringify({at:Date.now(),sheet:''}))}catch(e){}`);
  await d.p.evaluate(()=>SR.render());assert.equal(await banner(d.p),1);assert.deepEqual(d.errors,[]);await d.c.close();
 });
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
