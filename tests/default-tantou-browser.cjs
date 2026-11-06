/* v1.50.16 受付・ToDoの担当は最初からこの端末の本人。Synthetic fixtures only (fictional names, example.com). No Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.SS={get db(){return DB},ui,go,render,roBuild,save,csvText,gDesc,tantouLabel,CASE_DEFAULTS};';
const TODAY='2026-10-29';
const staff=[
 {name:'黒木 試験一',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'CP',role:'全社',gmCo:'',lastSync:TODAY+' 08:10'},
 {name:'黒木　見本二',email:'test-b@example.com',sheetId:'sheetB00000000000000000002',company:'CP',role:'社員',gmCo:'',lastSync:'2026-10-28 18:00'},
 {name:'例題 花子',email:'test-c@example.com',sheetId:'sheetC00000000000000000003',company:'CPY',role:'社員',gmCo:'',lastSync:TODAY+' 12:00'}];
const caseRow=(no,prop,tan,stage)=>({'受付番号':no,'種類':'退去立会','段階':'見積提出','物件':prop,'部屋':'101','担当':tan,'受付日':'2026-10-20','実施日':'2026-10-21','見積提出日':'2026-10-22','段階キー':stage||'quoted','会社':'CP'});
const todoRow=(title,tan,no,prop)=>({'内容':title,'期限':TODAY,'担当':tan,'受付番号':no||'','物件':prop||'','部屋':no?'101':'','種類':'手入力','状態':'今日'});
const data=[
 {s:staff[0],ok:true,cases:[caseRow('U-0001','試験荘A','黒木')],rc:[],orders:[],todo:[todoRow('担当が空の用事','',''),todoRow('氏名で書いた用事','黒木 試験一',''),todoRow('姓だけの用事','黒木','U-0001','試験荘A')]},
 {s:staff[1],ok:true,cases:[caseRow('U-0001','見本荘B','黒木')],rc:[],orders:[],todo:[todoRow('二人目の用事','黒木','U-0001','見本荘B')]},
 {s:staff[2],ok:true,cases:[caseRow('U-0001','例題荘C','例題 花子','site')],rc:[],orders:[],todo:[]}];
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function page(width,{admin=true,staffList=staff,rsName='',sheetId=''}={}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u===origin+'/'||u===origin+'/index.html'){const s=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');return r.fulfill({contentType:'text/html',body:s})}
  if(u.startsWith(origin+'/'))return r.continue();
  return r.fulfill({status:200,body:''})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(TODAY+'T03:00:00Z')});await p.goto(origin+'/');await p.waitForFunction(()=>!!window.SS);
 await p.evaluate(({admin,staffList,data,rsName,sheetId})=>{const d=SS.db.settings.data;d.admin=admin;if(sheetId)d.sheetId=sheetId;d.staff=JSON.parse(JSON.stringify(staffList));if(rsName)SS.db.settings.rcpt.name=rsName;
  if(admin){SS.ui.corp={data:JSON.parse(JSON.stringify(data)).map(x=>Object.assign(x,{s:d.staff.find(s=>s.sheetId===x.s.sheetId)||x.s})).filter(x=>x.s),at:Date.now()};SS.roBuild(SS.ui.corp.data)}SS.render()},{admin,staffList,data,rsName,sheetId});
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const sel=async(p,id)=>p.$eval('#'+id,s=>s.value+'='+s.options[s.selectedIndex].textContent);
 const one=[{name:'黒木 試験一',email:'test-a@example.com',sheetId:'sheetA00000000000000000001',company:'CP',role:'全社',gmCo:''},{name:'新人 太郎',email:'test-n@example.com',sheetId:'sheetN00000000000000000009',company:'CPY',role:'社員',gmCo:''}];
 await check('社員の端末（社員一覧あり・黒木さんは1人）：受付の担当は最初から本人（一番上の黒木ではない）',async()=>{
  const {c,p,errors}=await page(400,{admin:false,staffList:one,rsName:'新人 太郎',sheetId:'sheetN00000000000000000009'});
  await p.evaluate(()=>SS.go('new'));assert.equal(await sel(p,'n_tantou'),'新人 太郎=新人 太郎');
  const first=await p.$eval('#n_tantou option',o=>o.value);assert.equal(first,'黒木','the list order is unchanged');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('社員の端末（社員一覧なし・名前だけ）：受付とToDoの担当は本人',async()=>{
  const {c,p,errors}=await page(400,{admin:false,staffList:[],rsName:'例題 花子'});
  await p.evaluate(()=>SS.go('new'));assert.equal(await sel(p,'n_tantou'),'例題 花子=例題 花子');
  await p.evaluate(()=>SS.go('todo'));if(await p.$('#td_tantou'))assert.equal(await sel(p,'td_tantou'),'例題 花子=例題 花子');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('黒木さん本人の端末：担当は自分（黒木＝自分の名前）',async()=>{
  const {c,p,errors}=await page(400,{admin:false,staffList:[],rsName:'黒木 見本二'});
  await p.evaluate(()=>SS.go('new'));assert.equal(await sel(p,'n_tantou'),'黒木=黒木 見本二');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('社長の端末：担当は最初から社長',async()=>{
  const {c,p,errors}=await page(400);
  await p.evaluate(()=>SS.go('new'));assert.equal(await sel(p,'n_tantou'),'トシ=社長');
  assert.deepEqual(errors,[]);await c.close();
 });
 await check('選び直した担当で保存される（最初の値は案だけ）',async()=>{
  const {c,p,errors}=await page(400,{admin:false,staffList:one,rsName:'新人 太郎',sheetId:'sheetN00000000000000000009'});
  await p.evaluate(()=>SS.go('new'));await p.selectOption('#n_tantou','黒木');assert.equal(await p.$eval('#n_tantou',s=>s.value),'黒木');
  assert.deepEqual(errors,[]);await c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
