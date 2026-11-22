/* Synthetic fixtures only. No Google requests leave the page (sheetPace is called directly).
   v1.50.129 長いときの同期の解決策：1 表計算への問い合わせのペースを配る（1分55回）・2 1日1回の作業を最初の同期にまとめない */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),results=[];
const hook='window.SP={get ui(){return ui},sheetPace,sheetPaceFull,sheetRate,dailySyncStart,dailyGate,dailyDone,dailyGet,syncDetailText,setDiag(v){syncDiag=v}};';
let server,browser,origin;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});const errors=[];
 await c.route('**/*',r=>{const u=r.request().url();if(u===origin+'/'||u===origin+'/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});if(u.startsWith(origin+'/'))return r.continue();return r.fulfill({status:200,body:''})});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-11-23T00:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SP);
 await check('1 自動の試験では数えない（まねのGoogle）。数える設定のときは、1分55回を超える分は1分の区切りまで待つ',async()=>{
  assert.equal(await p.evaluate(async()=>{for(let i=0;i<80;i++)await SP.sheetPace('read');return SP.sheetRate.read.length}),0,'off under automation');
  await p.evaluate(()=>{window.__WH_PACE_ON=true;SP.setDiag({})});
  assert.equal(await p.evaluate(async()=>{for(let i=0;i<55;i++)await SP.sheetPace('read');return SP.sheetRate.read.length}),55,'55 go at once');
  await p.evaluate(()=>{window.__done=false;SP.sheetPace('read').then(()=>{window.__done=true})});
  await p.clock.runFor(30000);assert.equal(await p.evaluate(()=>window.__done),false,'56th waits');
  await p.clock.runFor(31000);await p.waitForFunction(()=>window.__done===true);
  /* 書きは読みと別に数える */
  assert.equal(await p.evaluate(async()=>{await SP.sheetPace('write');return SP.sheetRate.write.length}),1,'writes counted separately');
  assert.match(await p.evaluate(()=>SP.syncDetailText({detail:{req:{sr:56,sw:1,paceMs:60050}}})),/回数の上限に合わせて待った 60\.1秒/);
 });
 await check('1 回数制限（429）が来たら、その1分はもう出さない（次は1分の区切りまで待つ）',async()=>{
  await p.clock.runFor(61000);await p.evaluate(()=>{SP.sheetRate.write.length=0;SP.sheetPaceFull('write')});
  await p.evaluate(()=>{window.__w=false;SP.sheetPace('write').then(()=>{window.__w=true})});
  await p.clock.runFor(20000);assert.equal(await p.evaluate(()=>window.__w),false);
  await p.clock.runFor(41000);await p.waitForFunction(()=>window.__w===true);
 });
 await check('2 1日1回の作業：その日の最初の同期ではしない（2日以内）。2回目以降の同期で1回に1つずつ。2日以上たっていれば最初でもする',async()=>{
  const r=await p.evaluate(()=>{const now=Date.now(),out={};
   localStorage.setItem('workhub_daily_v1',JSON.stringify({day:'2026-11-22',n:4,last:{photo:now-20*3600e3,guard:now-20*3600e3,ordfix:now-50*3600e3}}));
   SP.dailySyncStart();out.n1=SP.dailyGet().n;out.first=[SP.dailyGate('photo'),SP.dailyGate('guard'),SP.dailyGate('ordfix')];
   SP.dailyDone('ordfix');out.afterOne=SP.dailyGate('ordfix')||SP.dailyGate('photo');
   SP.dailySyncStart();out.n2=SP.dailyGet().n;out.second=SP.dailyGate('photo');SP.dailyDone('photo');out.second2=SP.dailyGate('guard');
   SP.dailySyncStart();out.third=SP.dailyGate('guard');return out});
  assert.equal(r.n1,1,'first sync of the day');assert.deepEqual(r.first,[false,false,true],'only the one over 2 days runs in the first sync');
  assert.equal(r.afterOne,false,'one daily job per sync');assert.equal(r.n2,2);assert.equal(r.second,true);assert.equal(r.second2,false,'one per sync');assert.equal(r.third,true);
 });
 assert.deepEqual(errors,[]);await browser.close();server.close();console.log(JSON.stringify({passed:results.length,results},null,1));
}
main().catch(async e=>{console.error(e);try{await browser?.close();server?.close()}catch{}process.exit(1)});
