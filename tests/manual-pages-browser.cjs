/* Static pages only. No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const f=path.resolve(root,'.'+(u==='/'?'/index.html':u));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const appVer=(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/>v([0-9.]+)・/)||[])[1];
 for(const page of ['manual.html','manual-admin.html'])for(const width of [320,400]){
  await check(page+' のもくじ・章の移動・版 '+width+'px',async()=>{
   const c=await browser.newContext({viewport:{width,height:800}});await c.route(/fonts\./,r=>r.fulfill({status:200,body:''}));
   const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(origin+'/'+page);
   const r=await p.evaluate(()=>{const ids=new Set([...document.querySelectorAll('[id]')].map(e=>e.id));
    const bad=[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href').slice(1)).filter(h=>!ids.has(h));
    const d=document.documentElement;return {bad,toc:document.querySelectorAll('.toc a').length,ver:(document.querySelector('.ver')||{}).textContent||'',
     ovf:Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('section,.card,table,pre')].map(x=>x.scrollWidth-x.clientWidth))}});
   assert.deepEqual(r.bad,[]);assert.ok(r.toc>=2);assert.ok(r.ver.includes('v'+appVer),r.ver);assert.ok(r.ovf<=0,'overflow '+r.ovf);
   for(const h of await p.$$eval('.toc a',a=>a.map(x=>x.getAttribute('href')))){await p.click('.toc a[href="'+h+'"]');
    const top=await p.evaluate(id=>document.getElementById(id).getBoundingClientRect().top,h.slice(1));assert.ok(top>=40&&top<200,h+' top '+top)}
   assert.deepEqual(errors,[]);await c.close();
  });
 }
 await check('社員向けの並び（毎日使う内容が前・改訂履歴が最後）と、管理者向けへの行き来',async()=>{
  const emp=fs.readFileSync(path.join(root,'manual.html'),'utf8'),adm=fs.readFileSync(path.join(root,'manual-admin.html'),'utf8');
  const order=['intro','setup','daily','cases','calendar','gantt','payment','receipts','sheet','trouble','admin','history'].map(i=>emp.indexOf('<section id="'+i+'">'));
  assert.ok(order.every(x=>x>0)&&order.every((x,i)=>!i||x>order[i-1]),JSON.stringify(order));
  assert.ok(!emp.includes('<section id="boss">')&&!emp.includes('<section id="viewer">'));
  assert.ok(adm.includes('<section id="boss">')&&adm.includes('<section id="viewer">'));
  assert.ok(emp.includes('href="./manual-admin.html"')&&adm.includes('href="./manual.html"')&&adm.includes('href="./manual.html#history"'));
  assert.ok(emp.includes('id="ask"')&&emp.includes('1日3回'));
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
