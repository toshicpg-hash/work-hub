/* v1.50.82 同期の途中で裏に回って止まったら、戻ったときに自動でやり直す。Synthetic only; Google is stubbed, nothing is sent. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
/* gSyncAllRun を差し替える：plan の順に、complete（true/false）で終わる。hideDuring なら途中で裏に回る */
const hook=`window.SR={get ui(){return ui},detailText:t=>syncDetailText(t),hideStart:()=>syncHideStart(),setAuthing:v=>{syncHide.authing=v},auth:(w,x,pk)=>gAuthorize(w,x,pk),acctKeep:m=>gAcctKeep(m),acctHint:()=>gAcctHint(),hideEnd:()=>syncHideEnd(),timingText:t=>syncTimingText(t),get db(){return DB},G,save,go,render,sync:gSyncAll,calls:0,plan:[],
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
 await check('v1.50.146 同期の間にアプリが画面の裏にあった時間を測り、かかった時間に出す（1秒未満は出さない）',async()=>{
  const d=await device(400);
  const r=await d.p.evaluate(async()=>{SR.hideStart();SR.setVis('hidden');await new Promise(r=>setTimeout(r,1100));SR.setVis('visible');await new Promise(r=>setTimeout(r,100));SR.setVis('hidden');await new Promise(r=>setTimeout(r,50));SR.setVis('visible');const h=SR.hideEnd();
   SR.setVis('hidden');await new Promise(r=>setTimeout(r,30));SR.setVis('visible');/* 同期のあとは数えない */
   return {h,txt:SR.timingText({total:20000,button:5000,hidden:h.ms,hiddenN:h.n,steps:[{name:'売上報告',ms:9000}],after:[]}),part:SR.timingText({partial:true,button:5000,hidden:h.ms,hiddenN:h.n}),none:SR.timingText({total:20000,button:5000,hidden:400,hiddenN:1,steps:[],after:[]})}});
  assert.ok(r.h.ms>=1100&&r.h.ms<2500,JSON.stringify(r.h));assert.equal(r.h.n,2);
  assert.match(r.txt,/^合計 20\.0秒・ボタンが戻るまで 5\.0秒・うちアプリが画面の裏にあった時間 1\.\d秒（2回）（長かったもの：売上報告 9\.0秒）$/);
  assert.match(r.part,/^ボタンが戻るまで 5\.0秒・うちアプリが画面の裏にあった時間 1\.\d秒（2回）（続きの処理をしています/);
  assert.equal(r.none,'合計 20.0秒・ボタンが戻るまで 5.0秒','under 1 second: not shown');
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('v1.50.147 Googleのログインの画面が出ている間は「裏にあった時間」に数えず、別に出す',async()=>{
  const d=await device(400);
  const r=await d.p.evaluate(async()=>{SR.hideStart();SR.setAuthing(true);SR.setVis('hidden');await new Promise(r=>setTimeout(r,1100));SR.setVis('visible');SR.setAuthing(false);const h=SR.hideEnd();
   return {h,txt:SR.timingText({total:20000,button:5000,authShown:h.auth,steps:[],after:[]})}});
  assert.equal(r.h.ms,0,'not counted as hidden');assert.ok(r.h.auth>=1100&&r.h.auth<2500,JSON.stringify(r.h));
  assert.match(r.txt,/^合計 20\.0秒・ボタンが戻るまで 5\.0秒・Googleのログインの画面 1\.\d秒$/);
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('v1.50.147 ログインを取り直すとき、前にログインしたアカウントを Google に伝える（選ぶ画面を出さない）。「別のアカウントで」のときは伝えない',async()=>{
  const d=await device(400);
  const r=await d.p.evaluate(async()=>{const seen=[];window.google={accounts:{oauth2:{initTokenClient:cfg=>({requestAccessToken:o=>{seen.push({cfg:cfg.login_hint||'',req:o.login_hint||'',prompt:o.prompt});cfg.callback({access_token:'x',expires_in:3600,scope:'a'})}})}}};
   SR.G.token='';SR.G.exp=0;const a=SR.acctHint();await SR.auth(false).catch(()=>{});SR.acctKeep('sample.person@example.com');SR.G.token='';SR.G.exp=0;await SR.auth(false).catch(()=>{});SR.G.token='';SR.G.exp=0;await SR.auth(false,'',true).catch(()=>{});
   return {a,seen,keep:localStorage.getItem('workhub_gaccount_v1')}});
  assert.equal(r.keep,'sample.person@example.com');
  assert.deepEqual(r.seen.map(x=>[x.cfg,x.req,x.prompt]),[[r.a,r.a,''],['sample.person@example.com','sample.person@example.com',''],['','','select_account']]);
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('v1.50.150 同期を押したとき、ログインが要るなら押したその場でログインの窓を開く。開けなければ「Googleにログインする」を出し、押すとログインして同期する（400px）',async()=>{
  const d=await device(400);
  const r=await d.p.evaluate(async()=>{const log=[];let fail=true;
   window.google={accounts:{oauth2:{initTokenClient:cfg=>({requestAccessToken:o=>{log.push('open');if(fail){fail=false;setTimeout(()=>cfg.error_callback({type:'popup_failed_to_open'}),10)}else setTimeout(()=>cfg.callback({access_token:'x',expires_in:3600,scope:SR.G.scope||'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar'}),10)}})}}};
   SR.G.token='';SR.G.exp=0;SR.plan=[{complete:true}];const before=SR.calls;
   document.querySelector('[data-act="gsync"]').click();const openedInClick=log.length;
   await new Promise(r=>setTimeout(r,200));SR.render();
   const banner=document.querySelector('main .banner.syncres');const btn=banner&&banner.querySelector('[data-act="glogin"]');
   const text=banner?banner.textContent:'';const c1=SR.calls;
   btn&&btn.click();const openedInClick2=log.length;
   await new Promise(r=>setTimeout(r,300));
   return {openedInClick,text,openedInClick2,callsAfterLogin:SR.calls-c1,signed:!!SR.G.token,bannerAfter:!!document.querySelector('main .banner.syncres [data-act="glogin"]')}});
  assert.equal(r.openedInClick,1,'login window requested inside the click');
  assert.match(r.text,/Googleにログインできていません（ログインの画面がブラウザに止められました）/);
  assert.equal(r.openedInClick2,2,'the banner button opens the login inside its click');
  assert.equal(r.signed,true);assert.ok(r.callsAfterLogin>=1,'sync runs after login');assert.equal(r.bannerAfter,false);
  assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
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
  /* v1.50.121 社員の記録の前後の秒数。社長の端末（shared がない）は「社長の更新日時」を出さない */
  assert.equal(await d.p.evaluate(t=>SR.detailText({...t,detail:{corp:{n:18,prevN:18,reused:11,probed:0,full:7,slow:4100,prep:700,ms:7000,keep:{ok:true,kb:151}},corpList:1200,corpSave:300,corpNum:14800}}),t),
    '社員の記録：18人・前回の控え 18人・読み直さず 11人（うち「情報」で確認 0人）・全部読んだ 7人・いちばん遅い人 4.1秒・読む前の準備 0.7秒・読み込み全体 7.0秒・控えの保存 できた 151KB／社員の記録の前後：一覧の読み込み 1.2秒・画面の作り直しと保存 0.3秒・会社の数字の書き出し 14.8秒');
  /* v1.50.137 いちばん遅い人の名前と、やり直した回数・理由 */
  assert.match(await d.p.evaluate(t=>SR.detailText({...t,detail:{corp:{n:18,prevN:17,reused:12,probed:12,full:6,slow:238000,slowWho:'見本 太郎',slowTries:3,slowWhy:'timeout,rate',ms:242400}}}),t),/いちばん遅い人 238\.0秒（見本 太郎・3回試した：時間切れ・回数制限）/);
  assert.match(await d.p.evaluate(t=>SR.detailText({...t,detail:{corp:{n:18,full:6,slow:9000,slowWho:'見本 次郎',slowTries:1,slowWhy:''}}}),t),/いちばん遅い人 9\.0秒（見本 次郎）/);
  /* v1.50.137 一覧の読み込みの内訳（見る人の端末） */
  assert.match(await d.p.evaluate(t=>SR.detailText({...t,detail:{corpList:56300,corpListParts:{follow:1200,list:50100,names:5000}}}),t),/一覧の読み込み 56\.3秒（移転の確認 1\.2秒・一覧 50\.1秒・氏名の履歴 5\.0秒）/);
  /* v1.50.118 社長の端末（記録シートがない）は、画面に内訳を出す */
  await d.p.evaluate(()=>{SR.db.settings.data.admin=true;SR.render()});await d.p.evaluate(()=>{const x=document.querySelector('details.sync-result');if(x)x.open=true});
  assert.match(await d.p.textContent('.sync-detail'),/^内訳：Googleへの問い合わせ：4回/);
  /* v1.50.155 かかった時間・内訳はたたんで、「かかった時間：合計 ○秒」の1行だけ出す。押すと開き、描き直しても開いたまま */
  const fold=await d.p.evaluate(()=>{const f=document.querySelector('details.sync-time-fold');return f&&{open:f.open,sum:f.querySelector('summary').textContent,hasTime:!!f.querySelector('.sync-time'),hasDetail:!!f.querySelector('.sync-detail'),timeShown:f.querySelector('.sync-time').checkVisibility()}});
  assert.ok(fold,'folded');assert.equal(fold.open,false);assert.match(fold.sum,/^かかった時間：合計 0\.\d秒（押すと詳しい内容）$/);assert.equal(fold.hasTime&&fold.hasDetail,true);assert.equal(fold.timeShown,false,'hidden until opened');
  await d.p.click('details.sync-time-fold summary');await d.p.evaluate(()=>SR.render());
  assert.equal(await d.p.evaluate(()=>document.querySelector('details.sync-time-fold').open&&document.querySelector('.sync-detail').checkVisibility()),true,'opens and stays open');
  assert.equal(await d.p.evaluate(()=>document.querySelector('.sync-time-fold .fold-hint').checkVisibility()),false,'v1.50.156 hint hidden once opened');
  assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'overflow');
  await d.p.evaluate(()=>{SR.db.settings.data.admin=false;SR.render()});
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('v1.50.123 ボタンが戻ったあと、裏の同期が続いている間は赤い字で「閉じないで」、終わったら「すべて終わりました」',async()=>{
  const d=await device(400);
  await d.p.evaluate(()=>{SR.ui.gsync={busy:false,at:Date.now(),complete:true,rows:[{name:'Googleにログイン',ok:true,msg:''}]};SR.ui.syncAfterBusy=true;SR.go('home')});
  assert.match(await d.p.textContent('.sync-after'),/裏で同期を続けています。終わるまでアプリを閉じないでください/);
  assert.equal(await d.p.$eval('[data-act=gsync]',b=>b.disabled),true);assert.match(await d.p.textContent('[data-act=gsync]'),/裏で同期を続けています/);
  assert.equal(await d.p.$eval('.sync-after',e=>getComputedStyle(e).color),await d.p.evaluate(()=>{const x=document.createElement('span');x.style.color='var(--red)';document.body.append(x);const c=getComputedStyle(x).color;x.remove();return c}),'red');
  await d.p.evaluate(()=>{SR.ui.syncAfterBusy=false;SR.ui.syncAfterDoneAt=Date.now();SR.render()});
  assert.match(await d.p.textContent('.sync-after'),/同期がすべて終わりました。アプリを閉じても大丈夫です/);assert.equal(await d.p.$eval('[data-act=gsync]',b=>b.disabled),false);
  assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'overflow');
  /* 実際の同期の流れでも、終わると「すべて終わりました」になる */
  await d.p.evaluate(()=>{SR.ui.syncAfterDoneAt=0;SR.signIn();SR.plan=[{complete:true}]});await d.p.evaluate(()=>SR.sync());
  await d.p.waitForFunction(()=>!SR.ui.syncAfterBusy&&SR.ui.syncAfterDoneAt>0);await d.p.evaluate(()=>{SR.go('home')});assert.match(await d.p.textContent('.sync-after'),/すべて終わりました/);
  assert.deepEqual(d.errors,[]);await d.c.close();
 });
 await check('アプリを閉じて開き直したとき、止まったままなら上に出す（印が残っている）',async()=>{
  const d=await device(400,`try{localStorage.setItem('workhub_sync_resume_v1',JSON.stringify({at:Date.now(),sheet:''}))}catch(e){}`);
  await d.p.evaluate(()=>SR.render());assert.equal(await banner(d.p),1);assert.deepEqual(d.errors,[]);await d.c.close();
 });
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
