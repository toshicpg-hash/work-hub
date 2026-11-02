/* v1.49.4 マニュアルの形。Static pages only. No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const DEV=/要求範囲|混在|未識別|所有者|読込対象|共通選択|閲覧範囲|非公開区分|安全属性|キャッシュ|ACL|merge|PR #|JST/;
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const verNum=v=>v.replace(/^v/,'').split('.').map(Number).reduce((a,x,i)=>a+x*[1e6,1e3,1][i],0);
async function main(){
 server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const f=path.resolve(root,'.'+(u==='/'?'/index.html':u));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const appVer=(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/>v([0-9.]+)・/)||[])[1];
 for(const page of ['manual.html','manual-admin.html']){
  const c=await browser.newContext({viewport:{width:360,height:800}});await c.route(/fonts\./,r=>r.fulfill({status:200,body:''}));
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/'+page);
  await check(page+'：本文はすべて main の中、版ごとのお知らせの節は本文にない',async()=>{
   const r=await p.evaluate(()=>({outside:[...document.body.children].filter(e=>!['HEADER','MAIN','SCRIPT'].includes(e.tagName)).length,
    verSections:[...document.querySelectorAll('main section > h2')].filter(h=>/^v1\.\d/.test(h.textContent.trim())).map(h=>h.textContent),
    notes:[...document.querySelectorAll('main > section:first-child .note')].map(x=>x.textContent)}));
   assert.equal(r.outside,0);assert.deepEqual(r.verSections,[]);assert.deepEqual(r.notes,[],'no old notices at the top');
  });
  await check(page+'：先頭の版はアプリと同じで、本文に古い版の例や版確認のリンクがない',async()=>{
   assert.ok((await p.textContent('.ver')).includes('v'+appVer));
   const body=await p.evaluate(()=>{const m=document.querySelector('main').cloneNode(true);m.querySelectorAll('#history,.ver').forEach(e=>e.remove());return {text:m.innerText,links:[...m.querySelectorAll('a')].map(a=>a.getAttribute('href'))}});
   assert.doesNotMatch(body.text,/v1\.\d+(\.\d+)?/,'no version numbers in the body');assert.ok(!body.links.some(h=>/\?v=/.test(h)));
  });
  await check(page+'：開発者向けの言葉がない',async()=>{assert.doesNotMatch(await p.textContent('main'),DEV)});
  await check(page+'：文字150%・360pxで横にはみ出さない',async()=>{
   await p.addStyleTag({content:'body{font-size:23.25px}'});/* 15.5px の150% */
   const o=await p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('main section,main .card,main table,main pre,main ol,main ul')].map(x=>x.scrollWidth-x.clientWidth))});
   assert.ok(o<=0,'overflow '+o);
  });
  assert.deepEqual(errors,[]);await c.close();
 }
 await check('manual.html：初めて使うときが「最初の設定」の先頭、改訂履歴は新しい順、記録シートの章は参照リンク',async()=>{
  const c=await browser.newContext({viewport:{width:400,height:800}});const p=await c.newPage();await p.goto(origin+'/manual.html');
  const r=await p.evaluate(()=>({first:document.querySelector('#setup h3').id,vers:[...document.querySelectorAll('#history tr td:first-child')].map(td=>td.firstChild.textContent.trim()),
   sheetLink:!!document.querySelector('#sheet a[href="#firstuse"]'),sheetSteps:/①Googleにログイン/.test(document.querySelector('#sheet').textContent)}));
  assert.equal(r.first,'firstuse');assert.ok(r.sheetLink&&!r.sheetSteps);
  const n=r.vers.map(v=>v.replace(/^v/,'').split('.').map(Number)).map(([a,b,c=0])=>a*1e6+b*1e3+c);
  assert.ok(n.every((x,i)=>i===0||n[i-1]>x),r.vers.join(','));assert.equal(r.vers[0],'v'+(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/>v([0-9.]+)・/)||[])[1]);
  for(const k of ['firstuse','newdevice','stats','topbar'])assert.ok(await p.locator('#'+k).count(),k);
  assert.match(await p.textContent('#newdevice ~ ol'),/Googleカレンダーとのつながり/);
  await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
