/* v1.49.8 社長の社員一覧：名前＋Gmailの行と、ボタン3つの行を分け、Gmailの長さによらず全員同じ並びにする。
   Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SR={get db(){return DB},go,save,render};';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const LONG='mihon.saburou.very.long.address.for.layout.check@example.com';
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,390,400]){
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
  await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SR);
  await p.evaluate(LONG=>{const d=SR.db.settings.data;d.admin=true;d.ob={legacy:true};d.listId='synthetic-list-0000000000001';
   d.staff=[{name:'見本 一郎',email:'a@example.com',sheetId:'synthetic-a-sheet-00000000001',company:'CP',role:'全社',gmCo:'',removed:false},{name:'見本 三郎',email:LONG,sheetId:'synthetic-c-sheet-00000000003',company:'CPY',role:'社員',gmCo:'',removed:false},{name:'見本 二郎',email:'b@example.com',sheetId:'synthetic-b-sheet-00000000002',company:'AT',role:'社員',gmCo:'',removed:false}];
   SR.save();SR.go('stats');document.querySelectorAll('details[data-fold]').forEach(x=>x.open=true)},LONG);
  await check(width+'px：どの人も、ボタン3つは名前の下の1行に並び、名前の行にボタンはない。横にはみ出さない',async()=>{
   const r=await p.evaluate(()=>[...document.querySelectorAll('[data-fold=dataAdmin] li')].filter(li=>li.querySelector('[data-dunshare]')).map(li=>{
    const id=li.querySelector('.staff-id'),acts=li.querySelector('.staff-acts'),b=[...acts.querySelectorAll('button')].map(x=>x.getBoundingClientRect());
    return {name:id.querySelector('b').textContent,idBtns:id.querySelectorAll('button').length,labels:[...acts.querySelectorAll('button')].map(x=>x.textContent),
     below:b.every(x=>x.top>=id.getBoundingClientRect().bottom-1),oneLine:b.every(x=>Math.abs(x.top-b[0].top)<2),left:Math.round(b[0].left-li.getBoundingClientRect().left),
     over:Math.max(li.scrollWidth-li.clientWidth,id.scrollWidth-id.clientWidth,acts.scrollWidth-acts.clientWidth)}}));
   assert.equal(r.length,3);
   for(const x of r){assert.equal(x.idBtns,0,x.name);assert.deepEqual(x.labels,['正規氏名','会社・役割','共有を外す'],x.name);assert.ok(x.below,x.name+' below');assert.ok(x.oneLine,x.name+' one line');assert.ok(x.over<=0,x.name+' overflow '+x.over)}
   assert.ok(r.every(x=>x.left===r[0].left),'same start for everyone '+r.map(x=>x.left));
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  });
  if(width===390)await p.locator('[data-fold=dataAdmin] ul.dl').first().screenshot({path:path.join(root,'docs/preview/staff-row-layout-390.png')});
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
