/* v1.50.82 同期の途中で裏に回って止まったら、戻ったときに自動でやり直す。Synthetic only; Google is stubbed, nothing is sent. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
/* gSyncAllRun を差し替える：plan の順に、complete（true/false）で終わる。hideDuring なら途中で裏に回る */
const hook=`window.SR={get ui(){return ui},get db(){return DB},G,save,go,render,sync:gSyncAll,calls:0,plan:[],
 signIn(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000},
 stub(){gSyncAllRun=async()=>{SR.calls++;const p=SR.plan.shift()||{complete:true};ui.gsync={busy:true,rows:[]};render();
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
 await check('アプリを閉じて開き直したとき、止まったままなら上に出す（印が残っている）',async()=>{
  const d=await device(400,`try{localStorage.setItem('workhub_sync_resume_v1',JSON.stringify({at:Date.now(),sheet:''}))}catch(e){}`);
  await d.p.evaluate(()=>SR.render());assert.equal(await banner(d.p),1);assert.deepEqual(d.errors,[]);await d.c.close();
 });
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
