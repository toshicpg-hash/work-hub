/* Synthetic page only. No Google requests; nothing is written to real data. */
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
 const ver=(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<a class="ver" href="\.\/manual\.html\?v=([0-9.]+)"/)||[])[1];
 assert.ok(ver,'version in header link');
 for(const proto of [false,true])for(const width of [320,360,400]){
  await check('ヘッダーの「使い方」ボタン '+width+'px'+(proto?'（試作の印あり）':''),async()=>{
   const c=await browser.newContext({viewport:{width,height:700},serviceWorkers:'block'});
   await c.route(/googleapis|accounts\.google|fonts\./,r=>r.fulfill({status:200,body:''}));
   const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(origin+'/');
   if(proto)await p.evaluate(()=>{document.querySelector('.proto').hidden=false});
   const r=await p.evaluate(()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),m=q('.mbtn'),n=q('[data-act=new]'),v=q('.ver'),d=document.documentElement,t=document.querySelector('.top-in');
    return {h:m.height,text:document.querySelector('.mbtn').textContent,href:document.querySelector('.mbtn').getAttribute('href'),
     clearOfNew:m.right<=n.left,clearOfVer:v.right<=m.left&&v.width>0,sameRow:Math.abs((m.top+m.bottom)/2-(n.top+n.bottom)/2)<4,
     overflow:Math.max(d.scrollWidth-d.clientWidth,t.scrollWidth-t.clientWidth)}});
   assert.ok(r.h>=44,JSON.stringify(r));assert.ok(r.text.includes('使い方'));
   assert.equal(r.href,'./manual.html?v='+ver);
   assert.ok(r.clearOfNew&&r.clearOfVer&&r.sameRow,JSON.stringify(r));
   assert.ok(r.overflow<=0,JSON.stringify(r));
   assert.ok(await p.isVisible('.ver'));
   if(!proto&&width===400){await p.click('.mbtn');await p.waitForURL(/manual\.html\?v=/);assert.ok((await p.textContent('h1')).includes('マニュアル'))}
   assert.deepEqual(errors,[]);await c.close();
  });
 }
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
