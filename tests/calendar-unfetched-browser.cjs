/* v1.50.14 「CPG HUB」から人に割り当てた予定があっても、その人の未取得は、その人のカレンダーが読めたかで決める。両方読めた日は未取得を出さない。
   未取得のときは ⓘ に理由（対応設定がない／読めていないカレンダー）を出す。
   Synthetic fixtures only (fictional names, example.com). Google APIs are mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.HO={get db(){return DB},get ui(){return ui},G,go,save,render,scopeIdentity,gReadOne,calHubOwner,gShowIds,get ADMIN(){return ADMIN_ACCOUNT},authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
const A='synthetic-a-sheet-0000000001',B='synthetic-b-sheet-0000000002',C='synthetic-c-sheet-0000000003',D2='synthetic-d-sheet-0000000004';
const HUB='hub-shared@group.example.com',SELF_A='a@example.com',SELF_B='b@example.com';
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const roster=[
 {name:'見本 一郎',email:SELF_A,sheetId:A,company:'CP,CPY,AT',role:'全社',gmCo:'',removed:false},
 {name:'見本 二郎',email:SELF_B,sheetId:B,company:'CPY',role:'社員',gmCo:'',removed:false},
 {name:'試験 三郎',email:'c@example.com',sheetId:C,company:'CP',role:'社員',gmCo:'',removed:false,displayName:'工事主任'},
 {name:'仮名 四郎',email:'d@example.com',sheetId:D2,company:'AT',role:'社員',gmCo:'',removed:false}];
const E=(id,title,extra)=>Object.assign({private:false,calendarId:HUB,calendar:'CPG HUB',id,hub:'',title,allDay:false,start:'2026-11-07T10:00:00+09:00',end:'2026-11-07T11:00:00+09:00'},extra);
const EVENTS=[
 E('e1','【退去立会】見本荘 103',{hub:'U-0101',owner:'見本 二郎',creator:'b@example.com'}),
 E('e2','【リフォーム】見本ハイツ 201',{hub:'U-0102',owner:'試験',creator:'b@example.com'}),           // 名字だけ（1人に決まる）
 E('e3','【修繕】見本コート 301',{hub:'U-0103',owner:'見本',creator:'zz@example.com'}),               // 名字だけ（2人いて決まらない）・作成者も社員一覧にいない
 E('e4','見本の月例会議',{}),                                                                           // HUB外（担当の行なし）
 E('e5','【清掃】見本ビル 401',{hub:'U-0104',owner:'',creator:'d@example.com'}),                      // 担当の行がない → 作成者で補助
 E('e6','【退去立会】見本荘 104',{hub:'U-0105',owner:'工事主任',creator:'b@example.com'}),             // 表示名
 E('e7','予定あり',{private:true,hub:'U-0106',owner:'見本 二郎'}),                                        // 非公開は今までどおり出さない
 E('e8','【修繕】見本ビル 501',{hub:'U-0107',owner:'不明 太郎',creator:'zz@example.com'}),             // 一致しない
 E('e9','見本の打合せ',{creator:'c@example.com'}),                                                   // v1.50.13 HUB外から直接入れた予定（担当の行なし）→ 作成者
 E('e10','【修繕】見本タワー 601',{hub:'U-0108',owner:'見本',creator:'d@example.com'}),            // v1.50.13 担当「見本」が2人・作成者は候補にいない → 割り当てない（U-0004 の例）
 E('e11','【修繕】見本タワー 602',{hub:'U-0109',owner:'見本',creator:'b@example.com'})];            // v1.50.13 担当「見本」が2人・作成者が候補の1人 → その人（専務の古い分の例）
async function device({self=A,rows,admin=true,width=400,sources=null,cals=null,events=null}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.HO);
 const me=roster.find(x=>x.sheetId===self);
 await p.evaluate(({me,roster,rows,admin,EVENTS,HUB,sources,cals})=>{const d=HO.db.settings.data;d.ob={legacy:true};d.sheetId=me.sheetId;d.viewListId='synthetic-view-list-000000001';d.viewEmail=me.email;d.admin=admin;
  d.nameProfile={name:me.name,sheetId:me.sheetId};HO.db.settings.rcpt.name=me.name;
  HO.ui.viewList=roster;d.staff=admin?roster.map(x=>({...x,registeredName:x.name})):[];
  HO.G.cals=cals||[{id:me.email,name:'自分',primary:true,owner:true,write:true},{id:HUB,name:'CPG HUB',primary:false,owner:false,write:true}];
  HO.save();CPGCalendarScope.save(localStorage,HO.scopeIdentity(),rows);
  localStorage.setItem('workhub_gcal_last_v1',JSON.stringify({policy:2,at:Date.now(),from:'2026-10-01',to:'2026-12-31',data:{events:EVENTS,sources:sources||[{id:HUB},{id:me.email}],missing:0}}));
  HO.go('cal',{calDay:'2026-11-07',calMonth:'2026-11',calView:'day'})},{me,roster,rows,admin,EVENTS:events||EVENTS,HUB,sources,cals});
 return {c,p,errors};
}
const pick=async(p,person,company='all')=>{await p.selectOption('main [data-scope-company]',company).catch(()=>{});await p.selectOption('main [data-scope-person]',person)};
const cards=p=>p.evaluate(()=>[...document.querySelectorAll('main .gccard')].map(e=>({tag:e.querySelector('.ev')?.textContent||'',text:e.textContent})));
const titles=async p=>(await cards(p)).map(x=>x.text).join('\n');
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const all=[],BCAL='b@example.com';
 const cals=[{id:SELF_A,name:'自分',primary:true,owner:true,write:true},{id:HUB,name:'CPG HUB',primary:false,owner:false,write:true},{id:BCAL,name:BCAL,primary:false,owner:false,write:false}];
 const events=[EVENTS[0],E('e20','【退去立会】見本荘 201',{hub:'U-0201',owner:'見本 二郎',creator:BCAL,start:'2026-11-06T10:00:00+09:00',end:'2026-11-06T11:00:00+09:00'})];
 const rows=[{id:HUB,work:true,mode:'mixed'},{id:BCAL,work:true,mode:'person',company:'CPY',person:B}];
 const info=async p=>p.evaluate(()=>HO.ui.calInfo||'');
 const month=async p=>{await p.evaluate(()=>HO.go('cal',{calDay:'2026-11-07',calMonth:'2026-11',calView:'month'}));return p.evaluate(()=>document.querySelector('main').innerText)};
 await check('本人のカレンダーと「CPG HUB」の両方が読めていれば、「CPG HUB」から割り当てた予定があっても、月の日に「未取得」を出さない',async()=>{
  const d=await device({rows,cals,events,sources:[{id:HUB},{id:SELF_A},{id:BCAL}]});all.push(d);
  await pick(d.p,B);const t=await month(d.p);
  assert.match(t,/見本荘 103|見本荘 201/);assert.doesNotMatch(t,/未取得/);assert.doesNotMatch(await info(d.p),/未取得/);
 });
 await check('本人のカレンダーが読めていない（予定画面に入れていない・Googleに追加していない）ときは未取得。ⓘ にそのカレンダーの名前と直し方を出す',async()=>{
  const d=await device({rows,cals,events,sources:[{id:HUB},{id:SELF_A}]});all.push(d);
  await pick(d.p,B);const t=await month(d.p);assert.match(t,/未取得/);
  const i=await info(d.p);assert.match(i,/未取得 1人：見本 二郎（読めていないカレンダー：見本 二郎（b）/);assert.match(i,/予定画面に表示するカレンダー/);
 });
 await check('v1.50.15 本人のカレンダーを結び付けていない人は、「CPG HUB」が読めていれば未取得を出さず、ⓘ に「CPG HUB の予定だけ」と出す',async()=>{
  const d=await device({rows:[{id:HUB,work:true,mode:'mixed'}],cals,events,sources:[{id:HUB},{id:SELF_A},{id:BCAL}]});all.push(d);
  await pick(d.p,B);const t=await month(d.p);assert.match(t,/見本荘 201/);assert.doesNotMatch(t,/未取得/);
  assert.match(await info(d.p),/見本 二郎：本人のカレンダーを結び付けていないので、共有カレンダー（CPG HUB）の予定だけを出しています/);
 });
 await check('v1.50.15 本人のカレンダーを結び付けておらず、「CPG HUB」も読めていないときは未取得（理由は「結び付いていない」）',async()=>{
  const d=await device({rows:[{id:HUB,work:true,mode:'mixed'}],cals,events,sources:[{id:SELF_A},{id:BCAL}]});all.push(d);
  await pick(d.p,B);const t=await month(d.p);assert.match(t,/未取得/);
  assert.match(await info(d.p),/見本 二郎（この端末の「仕事用カレンダーの対応設定」で、この人のカレンダーがまだ結び付いていません）/);
 });
 await check('対応設定で人に結び付けたカレンダーは、「予定画面に表示するカレンダー」で選んでいなくても読む対象に入る（表示を全部外したときは入れない）',async()=>{
  const d=all[0];assert.ok((await d.p.evaluate(()=>HO.gShowIds())).includes(BCAL));
  assert.deepEqual(await d.p.evaluate(()=>{HO.db.settings.gShow=[];return HO.gShowIds()}),[]);await d.p.evaluate(()=>{HO.db.settings.gShow=null});
 });
 await check('版の表示は「v版・月/日更新」の形',async()=>{const d=all[0];assert.match(await d.p.evaluate(()=>document.querySelector('.ver').textContent),/^v\d+\.\d+\.\d+・\d{1,2}\/\d{1,2}更新$/)});
 await check('スクリプトのエラーなし・400pxで横にはみ出さない',async()=>{for(const d of all){assert.deepEqual(d.errors,[]);assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}});
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
