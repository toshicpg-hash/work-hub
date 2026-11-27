/* Synthetic fixtures only (fictional names). No network.
   v1.50.154 案件の検索の欄：日本語の変換の途中は画面を描き直さない（入力欄が作り直されて変換が切れていた）。確定したときに絞り込む */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.SI={get db(){return DB},get ui(){return ui},render,go,save};';
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u.startsWith(origin))return r.continue();return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SI);
 await p.evaluate(()=>{SI.db.settings.data.ob={legacy:true};SI.save();SI.go('cases')});
 await check('変換の途中は入力欄を作り直さず、変換を確定したときに絞り込む（400px）',async()=>{
  const r=await p.evaluate(()=>{const q0=document.getElementById('q');q0.focus();
   q0.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
   q0.value='m';q0.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'m'}));
   q0.value='み';q0.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'み'}));
   const same=document.getElementById('q')===q0,mid=document.getElementById('q').value;
   q0.value='見本';q0.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'見本'}));
   const after=document.getElementById('q');
   return {same,mid,uiq:SI.ui.q,afterVal:after.value,focused:document.activeElement===after,rebuilt:after!==q0}});
  assert.equal(r.same,true,'the box is not rebuilt while composing');assert.equal(r.mid,'み');
  assert.equal(r.uiq,'見本');assert.equal(r.afterVal,'見本');assert.equal(r.focused,true);assert.equal(r.rebuilt,true,'filtered (redrawn) on commit');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 });
 await check('英字・数字（変換なし）は、今までどおり1文字ごとに絞り込む',async()=>{
  const r=await p.evaluate(()=>{const q0=document.getElementById('q');q0.value='ITA';q0.dispatchEvent(new InputEvent('input',{bubbles:true,data:'A'}));const q1=document.getElementById('q');return {uiq:SI.ui.q,rebuilt:q1!==q0,val:q1.value}});
  assert.deepEqual(r,{uiq:'ITA',rebuilt:true,val:'ITA'});
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
