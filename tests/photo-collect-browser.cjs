/* v1.50.93 社員の領収書の写真を社長のドライブの会社用フォルダに集める。Synthetic only; Google Drive is mocked, nothing real is touched. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.PC={get db(){return DB},get ui(){return ui},G,go,save,render,collect:photoCollect,text:photoText,todayS,dailySyncStart,after:photoAfterSync,SCOPE:PHOTO_SCOPE,authorize(extra){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE+(extra?" "+extra:"");G.exp=Date.now()+3600000}};';
let server,browser,origin;const results=[];
const check=async(n,fn)=>{await fn();results.push(n);console.log('PASS',n)};
const link=id=>'https://drive.google.com/file/d/'+id+'/view?usp=drivesdk';
(async()=>{
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const files={},copies=[];let seq=0,driveCalls=0;
 await c.route('**/*',async r=>{const u=new URL(r.request().url()),m=r.request().method();
  if(u.origin===origin){if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/drive/v3/files')){driveCalls++;
   const cp=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/copy$/);
   if(cp&&m==='POST'){const src=decodeURIComponent(cp[1]);if(src.startsWith('gone'))return r.fulfill({status:404,contentType:'application/json',body:'{"error":{"code":404}}'});
    const b=r.request().postDataJSON(),id='copy'+(++seq);files[id]={id,name:b.name,parents:b.parents,appProperties:b.appProperties};copies.push({src,...b});return r.fulfill({contentType:'application/json',body:JSON.stringify({id})})}
   if(u.pathname==='/drive/v3/files'&&m==='POST'){const b=r.request().postDataJSON(),id='folder'+(++seq);files[id]={id,...b};return r.fulfill({contentType:'application/json',body:JSON.stringify({id,name:b.name})})}
   if(u.pathname==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q')||'';let list=Object.values(files);
    const pm=q.match(/'([^']+)' in parents/);if(pm)list=list.filter(f=>(f.parents||[]).includes(pm[1]));else list=list.filter(f=>!(f.parents||[]).length);
    const nm=q.match(/name='([^']+)'/);if(nm)list=list.filter(f=>f.name===nm[1]);if(/mimeType='application\/vnd.google-apps.folder'/.test(q))list=list.filter(f=>f.mimeType==='application/vnd.google-apps.folder');
    return r.fulfill({contentType:'application/json',body:JSON.stringify({files:list.map(f=>({id:f.id,name:f.name,appProperties:f.appProperties,createdTime:'2026-11-16T00:00:00Z'}))})})}}
  return r.fulfill({status:200,contentType:'application/json',body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.PC);
 await p.evaluate(([l1,l2,l3])=>{const d=PC.db.settings.data;d.ob={legacy:true};d.admin=true;PC.save();PC.authorize(PC.SCOPE);
  PC.ui.corp={at:Date.now(),data:[
   {ok:true,s:{name:'見本 一郎',sheetId:'sA'},cases:[],todo:[],rc:[{"受付ID":"R-1","日付":"2026-11-10","会社":"CP","支払先":"見本商店","金額":1000,"写真リンク":l1+' '+l2},{"受付ID":"R-2","日付":"2026-11-11","会社":"CP","支払先":"見本駐車場","金額":500,"写真リンク":""}]},
   {ok:true,s:{name:'見本 二郎',sheetId:'sB'},cases:[],todo:[],rc:[{"受付ID":"R-3","日付":"2026-11-12","会社":"AT","支払先":"見本資材","金額":3000,"写真リンク":l3}]}]}},[link('photoA1xxxxxx'),link('photoA2xxxxxx'),link('gonePhotoxxxx')]);
 await check('社員ごとのフォルダにコピーし、元が消えた分は数える（コピーは会社用フォルダの中）',async()=>{
  const res=await p.evaluate(()=>PC.collect());assert.deepEqual({add:res.add,had:res.had,miss:res.miss,bad:res.bad},{add:2,had:0,miss:1,bad:0});
  const root=Object.values(files).find(f=>f.name==='CPG HUB 領収書（会社）');assert.ok(root,'root folder');const sub=Object.values(files).find(f=>f.name==='見本 一郎');assert.deepEqual(sub.parents,[root.id]);
  assert.deepEqual(copies.map(x=>x.src),['photoA1xxxxxx','photoA2xxxxxx']);assert.ok(copies.every(x=>x.parents[0]===sub.id&&x.appProperties.cpgRc==='R-1'));
  assert.match(copies[0].name,/^2026-11-10_CP_見本商店_1000_R-1_1$/);
 });
 await check('2回目は、集め済みはコピーしない（コピーに付けた印で見る）',async()=>{
  const res=await p.evaluate(()=>PC.collect());assert.deepEqual({add:res.add,had:res.had,miss:res.miss},{add:0,had:2,miss:1});assert.equal(copies.length,2);
 });
 await check('v1.50.121 新しい写真がなければ、ドライブに問い合わせない（1日1回と「今すぐ集める」は全員を確かめる）',async()=>{
  await p.evaluate(()=>{PC.ui.corp.data[1].rc=[]});
  driveCalls=0;let res=await p.evaluate(()=>PC.collect());assert.equal(res.quick,true);assert.equal(res.had,2);assert.equal(driveCalls,0,'no drive call');
  assert.match(await p.evaluate(r=>PC.text(r),res),/新しい写真はありません（集め済み 2件）/);
  /* 新しい写真が1枚増えた人だけ確かめて集める */
  await p.evaluate(l=>{PC.ui.corp.data[1].rc=[{"受付ID":"R-4","日付":"2026-11-13","会社":"AT","支払先":"見本資材","金額":2000,"写真リンク":l}]},link('photoB1xxxxxx'));
  driveCalls=0;res=await p.evaluate(()=>PC.collect());assert.deepEqual({add:res.add,had:res.had},{add:1,had:2});assert.ok(driveCalls>=2&&driveCalls<=4,'only the person with a new photo: '+driveCalls);
  /* 「今すぐ集める」（force）は全員を確かめる（コピーはしない） */
  driveCalls=0;res=await p.evaluate(()=>PC.collect(200,true));assert.deepEqual({add:res.add,had:res.had},{add:0,had:3});assert.ok(driveCalls>=4,'all people checked: '+driveCalls);
  /* 1日たったら全員を確かめる */
  await p.evaluate(()=>{const k=JSON.parse(localStorage.getItem('workhub_photo_seen_v1'));k.full-=25*3600e3;localStorage.setItem('workhub_photo_seen_v1',JSON.stringify(k))});
  /* v1.50.129 その日の最初の同期では全員確認をしない（2日以上たっていなければ）。2回目の同期でする */
  await p.evaluate(()=>{localStorage.setItem('workhub_daily_v1',JSON.stringify({day:'2000-01-01',n:5,last:{photo:Date.now()-25*3600e3}}));PC.dailySyncStart()});
  driveCalls=0;res=await p.evaluate(()=>PC.collect());assert.ok(res.quick&&driveCalls===0,'first sync of the day: deferred '+driveCalls);
  await p.evaluate(()=>PC.dailySyncStart());
  driveCalls=0;res=await p.evaluate(()=>PC.collect());assert.ok(!res.quick&&driveCalls>=4,'full check after a day (2nd sync): '+driveCalls);
  /* 前に全員確認してから2日以上たっていれば、最初の同期でもする */
  await p.evaluate(()=>{const k=JSON.parse(localStorage.getItem('workhub_photo_seen_v1'));k.full-=25*3600e3;localStorage.setItem('workhub_photo_seen_v1',JSON.stringify(k));localStorage.setItem('workhub_daily_v1',JSON.stringify({day:'2000-01-01',n:5,last:{photo:Date.now()-49*3600e3}}));PC.dailySyncStart()});
  driveCalls=0;res=await p.evaluate(()=>PC.collect());assert.ok(!res.quick&&driveCalls>=4,'over 2 days: first sync too '+driveCalls);
 });
 await check('同期のあと：許可がなければ何もしない。あれば「領収書の写真（会社）」の行を出す',async()=>{
  await p.evaluate(()=>{PC.authorize();PC.db.settings.data.photoOn=true;PC.ui.gsync={busy:false,rows:[],complete:true}});await p.evaluate(()=>PC.after());assert.equal(await p.evaluate(()=>PC.ui.gsync.rows.length),0);
  await p.evaluate(()=>{PC.authorize(PC.SCOPE)});await p.evaluate(()=>PC.after());const row=await p.evaluate(()=>PC.ui.gsync.rows[0]);assert.equal(row.name,'領収書の写真（会社）');assert.match(row.msg,/集め済み \d+件/);
 });
 await check('数字の管理に説明とボタン。400pxではみ出さない',async()=>{
  await p.evaluate(()=>PC.go('stats'));const t=await p.textContent('#photo-collect');assert.match(t,/CPG HUB 領収書（会社）/);assert.equal(await p.locator('[data-act=photocollect]').count(),1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0);assert.deepEqual(errors,[]);
 });
 console.log('ALL PASS',results.length);await browser.close();server.close();
})().catch(async e=>{console.error(e);process.exitCode=1;if(browser)await browser.close();if(server)server.close()});
