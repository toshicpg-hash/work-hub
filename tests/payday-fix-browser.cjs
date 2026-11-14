/* Synthetic fixtures only. No Google requests; nothing is written to real data.
   v1.50.59 精算日の初期値を CP 木曜・CPY 火曜に直す。初期値のまま（CP 火曜・CPY 木曜）の端末だけ入れ替える */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PD={get db(){return DB},save,go,render};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{let f=req.url.split('?')[0];if(f==='/')f='/index.html';try{let d=fs.readFileSync(path.join(root,f));if(f==='/index.html')d=d.toString().replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');res.end(d)}catch{res.writeHead(404).end()}}).listen(0);
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route(u=>!u.href.startsWith(origin),r=>r.fulfill({status:200,body:''}));
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const load=async()=>{await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PD)};
 const pd=()=>p.evaluate(()=>({...PD.db.settings.rcpt.payDays,fix:localStorage.getItem('workhub_pdfix_v1')==='1'?1:0,inDb:'pdFix' in PD.db.settings.rcpt}));
 /* 前の版の端末を作る：pdFix なしで値を入れて保存 */
 const old=async(CP,CPY)=>{await p.evaluate(([CP,CPY])=>{const R=PD.db.settings.rcpt;R.payDays.CP=CP;R.payDays.CPY=CPY;localStorage.removeItem('workhub_pdfix_v1');PD.save()},[CP,CPY]);await load()};
 await load();
 await check('新しい端末は CP 木曜・CPY 火曜',async()=>{const x=await pd();assert.equal(x.CP,4);assert.equal(x.CPY,2);assert.equal(x.AT,-1)});
 await check('前の初期値のまま（CP 火曜・CPY 木曜）の端末は入れ替える',async()=>{await old(2,4);const x=await pd();assert.deepEqual([x.CP,x.CPY,x.fix,x.inDb],[4,2,1,false],'the done mark is not in the app data')});
 await check('自分で変えた端末はそのまま',async()=>{await old(1,4);let x=await pd();assert.deepEqual([x.CP,x.CPY,x.fix],[1,4,1]);await old(2,5);x=await pd();assert.deepEqual([x.CP,x.CPY],[2,5])});
 await check('入れ替えは1回だけ（あとで CP 火曜・CPY 木曜に自分で戻しても、もう入れ替えない）',async()=>{
  await p.evaluate(()=>{const R=PD.db.settings.rcpt;R.payDays.CP=2;R.payDays.CPY=4;PD.save()});await load();const x=await pd();assert.deepEqual([x.CP,x.CPY],[2,4]);
  assert.ok(!(await p.evaluate(()=>localStorage.getItem('workhub_proto_v1')||'')).includes('undefined'));assert.deepEqual(errors,[]);
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
