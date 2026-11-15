/* v1.50.78 Googleの画面がポップアップで止められたときの案内（Chromeの「常に表示」）。Synthetic only; Google is stubbed, nothing is sent. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PH={get ui(){return ui},get db(){return DB},save,go,render,sync:gSyncAll};';
const stub='<script>window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken(){setTimeout(()=>o.error_callback({type:"popup_failed_to_open"}),0)}})}}};</script>';
let server,browser,origin;
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,400]){
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
  await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head>'+stub).replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:''})});
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PH);
  await p.evaluate(()=>{PH.db.settings.data.ob={legacy:true};PH.save();PH.go('home')});
  await p.evaluate(()=>PH.sync());
  const rows=await p.evaluate(()=>PH.ui.gsync.rows);
  const login=rows.find(r=>r.name==='Googleにログイン');assert.ok(login&&!login.ok,JSON.stringify(rows));
  assert.match(login.msg,/「常に表示」を押してから、もう一度押してください（同期なら「Googleとまとめて同期」）/);assert.match(login.msg,/ポップアップブロック/);
  await p.evaluate(()=>PH.render());
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'overflow '+width);
  assert.deepEqual(errors,[]);console.log('PASS ポップアップの案内 '+width+'px');await c.close();
 }
 console.log('ALL PASS 2');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
