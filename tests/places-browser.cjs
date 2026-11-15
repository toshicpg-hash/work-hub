/* v1.50.84 Googleの場所の候補（Places API (New)）。Synthetic only; Google is mocked, the key is fake. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PL={get db(){return DB},get ui(){return ui},G,go,save,render};';
let server,browser,origin;const results=[];
const check=async(n,fn)=>{await fn();results.push(n);console.log('PASS',n)};
async function device(width,key){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const calls=[];
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname==='places.googleapis.com'){const q=r.request();const hd=q.headers();calls.push({path:u.pathname,search:u.search,key:hd['x-goog-api-key'],mask:hd['x-goog-fieldmask']||'',body:q.method()==='POST'?q.postDataJSON():null});
   if(u.pathname==='/v1/places:autocomplete')return r.fulfill({contentType:'application/json',body:JSON.stringify({suggestions:[{placePrediction:{placeId:'pid1',text:{text:'見本ビル 見本市見本町1-2'},structuredFormat:{mainText:{text:'見本ビル'},secondaryText:{text:'見本県見本市見本町1-2'}}}}]})});
   if(u.pathname==='/v1/places/pid1')return r.fulfill({contentType:'application/json',body:JSON.stringify({formattedAddress:'日本、〒000-0000 見本県見本市見本町1-2'})});}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PL);
 await p.evaluate(k=>{const D=PL.db.settings.data;D.ob={legacy:true};D.placesKey=k;D.officeAddrs=[{name:'本社',addr:'見本県見本市本町1-1'}];PL.save();PL.go('cal');PL.ui.planOpen=true;PL.ui.plan={kind:'会議',date:'2026-11-20'};PL.render()},key);
 return {c,p,errors,calls};
}
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,400]){
  const d=await device(width,'FAKE-KEY-FOR-TEST');
  await check('端末の候補にあるとき・2文字まではGoogleに聞かない '+width+'px',async()=>{
   await d.p.fill('#pl_place','本社');await d.p.waitForTimeout(500);await d.p.fill('#pl_place','見本');await d.p.waitForTimeout(500);
   assert.equal(d.calls.length,0);
  });
  await check('3文字以上で端末の候補に無ければGoogleの候補を出し、選ぶと住所が入る（住所だけ取る・同じセッション） '+width+'px',async()=>{
   await d.p.fill('#pl_place','見本ビ');await d.p.fill('#pl_place','見本ビル');await d.p.waitForSelector('#pl_gsug:not([hidden]) [data-gp-id=pid1]');
   const ac=d.calls.filter(x=>x.path==='/v1/places:autocomplete');assert.equal(ac.length,1,'debounced');assert.equal(ac[0].key,'FAKE-KEY-FOR-TEST');
   assert.equal(ac[0].body.input,'見本ビル');assert.deepEqual(ac[0].body.includedRegionCodes,['jp']);assert.ok(ac[0].body.sessionToken);
   assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,'overflow');
   await d.p.click('[data-gp-id=pid1]');await d.p.waitForFunction(()=>document.getElementById('pl_place').value.includes('見本町'));
   assert.equal(await d.p.inputValue('#pl_place'),'見本ビル　見本県見本市見本町1-2');
   const det=d.calls.find(x=>x.path==='/v1/places/pid1');assert.equal(det.mask,'formattedAddress');assert.match(det.search,new RegExp('sessionToken='+ac[0].body.sessionToken));
   assert.equal(await d.p.$eval('#pl_gsug',b=>b.hidden),true);
  });
  assert.deepEqual(d.errors,[]);await d.c.close();
 }
 await check('キーが無ければGoogleには聞かない（端末の候補だけ）',async()=>{
  const d=await device(400,'');await d.p.fill('#pl_place','見本ビル');await d.p.waitForTimeout(600);assert.equal(d.calls.length,0);assert.equal(await d.p.$$eval('#pl_gsug',a=>a.length),0);assert.deepEqual(d.errors,[]);await d.c.close();
 });
 console.log('ALL PASS',results.length);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
