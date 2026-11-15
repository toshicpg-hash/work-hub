/* v1.50.79 売上報告の入れられる会社：業務管理・経理は「担当の会社」。Synthetic only. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SC={salesEdCos,ordWriter,get db(){return DB},save,go,render,get ui(){return ui}};';
let server,browser,origin;
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SC);
 const r=await p.evaluate(()=>[
  SC.salesEdCos({role:'業務管理',company:'CP',charge:'CP,CPY'}),
  SC.salesEdCos({role:'業務管理',company:'AT',charge:'AT'}),
  SC.salesEdCos({role:'経理',company:'CP',charge:''}),
  SC.salesEdCos({role:'GM',company:'CPY',gmCo:'CPY'}),
  SC.salesEdCos({role:'全社',company:'CP'}),
  SC.salesEdCos({role:'社員',company:'CP',charge:'CP,CPY,AT'})]);
 assert.deepEqual(r,[['CP','CPY'],['AT'],['CP'],['CPY'],['CP','AT','CPY'],['CP']]);
 console.log('PASS 業務管理・経理は担当の会社、ほかは今までどおり');
 assert.deepEqual(errors,[]);console.log('ALL PASS 1');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
