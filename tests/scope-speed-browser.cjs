/* Synthetic fixtures only (fictional names and IDs). No network writes.
   v1.50.151 画面を1回作る間は、絞り込みの計算（人の照らし合わせ・全員の案件の一覧）を使い回す。
   前は ToDo 1件ごとに作り直していて、見本の18人でホーム約10秒・ToDoなど約3.3秒かかった */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.SP={get db(){return DB},get ui(){return ui},render,go,save,CASE_COLS,scopeTodos,scopeCases,scopeState,scopeSourceCases,setSel(sel){return CPGViewScope.save(localStorage,scopeSelId(),sel)},withMemo(fn){scopeMemo=new Map();try{return fn()}finally{scopeMemo=null}}};';
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=r.request().url();if(u===origin+'/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u.startsWith(origin))return r.continue();return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-26T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SP);
 await p.evaluate(()=>{const d=SP.db.settings.data;d.admin=true;d.ob={legacy:true};const cos=['CP','CPY','AT'];d.staff=[];const data=[];
  for(let i=0;i<18;i++){const sid='sheetfixture'+String(i).padStart(12,'0'),co=cos[i%3];const s={name:'見本 '+i,email:'s'+i+'@example.com',company:co,role:'社員',sheetId:sid,removed:false};d.staff.push(s);
   const cases=[];for(let k=0;k<20;k++){const o={};for(const h of SP.CASE_COLS)o[h]='';Object.assign(o,{'受付番号':'X'+i+'-'+k,'種類':'原状回復','段階':'施工中','物件':'見本'+k,'部屋':'101','担当':'見本 '+i,'受付日':'2026-11-02','予定日':'2026-11-20','見積額':'1000','段階キー':'working','受付日時':'2026-11-02T00:00:00Z','会社':co});cases.push(o)}
   const todo=[];for(let k=0;k<10;k++)todo.push({'内容':'見本のやること'+k,'期限':'2026-11-20','担当':'見本 '+i,'受付番号':'X'+i+'-'+k,'物件':'見本'+k,'部屋':'101','種類':'手入力','状態':'期限切れ'});
   data.push({s,ok:true,cases,rc:[],todo,orders:[],box:[],reports:[],receiptRead:{state:'ready'},readAt:Date.now()})}
  SP.ui.corp={at:Date.now(),data};SP.save();SP.setSel({company:'all',person:'all'})});
 await check('画面を1回作る間、人の照らし合わせの準備（scopeContext）は数回だけ。ToDo の件数に比例して増えない',async()=>{
  const r=await p.evaluate(()=>{const orig=window.scopeContextCalc;let n=0;window.scopeContextCalc=function(){n++;return orig.apply(this,arguments)};
   const out={};for(const v of ['home','todo','cal','gantt','rcpt','cases','stats']){n=0;SP.go(v);out[v]=n}window.scopeContextCalc=orig;return out});
  for(const [v,n] of Object.entries(r))assert.ok(n<=4,v+': '+n+' '+JSON.stringify(r));
 });
 await check('絞り込みの結果は、使い回したときと毎回計算したときで同じ（ToDo・案件）。会社を切り替えると、次の画面ですぐ新しい結果になる',async()=>{
  const r=await p.evaluate(()=>{const key=a=>a.map(x=>x.id||x.text||JSON.stringify(x)).join('|');
   const plain={t:key(SP.scopeTodos()),c:key(SP.scopeCases())},memo=SP.withMemo(()=>({t:key(SP.scopeTodos()),c:key(SP.scopeCases())}));
   const n0=SP.scopeCases().length;SP.setSel({company:'CP',person:'all'});const nCP=SP.withMemo(()=>SP.scopeCases().length);SP.setSel({company:'all',person:'all'});
   return {same:plain.t===memo.t&&plain.c===memo.c,nT:SP.scopeTodos().length,n0,nCP}});
  assert.equal(r.same,true);assert.equal(r.n0,360,JSON.stringify(r));assert.ok(r.nT>=180,JSON.stringify(r));assert.equal(r.nCP,120,'company switch takes effect at once');
 });
 await check('ホーム・ToDo・予定・ガント・領収書の切り替えが速い（見本の18人で各1秒未満）・400pxではみ出しなし',async()=>{
  const r=await p.evaluate(()=>{const out={};for(const v of ['home','todo','cal','gantt','rcpt']){const s=performance.now();SP.go(v);out[v]=performance.now()-s}return out});
  for(const [v,ms] of Object.entries(r))assert.ok(ms<1000,v+' '+Math.round(ms)+'ms');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(ov<=0,'overflow '+ov);
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
