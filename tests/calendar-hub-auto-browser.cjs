/* v1.50.9 ほかの人の予定を見る端末では「CPG HUB」を自動で「複数の人が使う」として扱い、表示も既定でチェック。対応設定のカレンダーの選択肢は名前で、CPG HUB→社員→そのほか、祝日なし。
   Synthetic fixtures only (fictional names, example.com). Google APIs are mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.HO={get db(){return DB},get ui(){return ui},G,go,save,render,scopeIdentity,gReadOne,calHubOwner,gShowIds,gSettings,calendarScopeSettings,calMapEntries,authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
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
 E('e3','【修繕】見本コート 301',{hub:'U-0103',owner:'見本',creator:'b@example.com'}),                // 名字だけ（2人いて決まらない）
 E('e4','見本の月例会議',{}),                                                                           // HUB外（担当の行なし）
 E('e5','【清掃】見本ビル 401',{hub:'U-0104',owner:'',creator:'d@example.com'}),                      // 担当の行がない → 作成者で補助
 E('e6','【退去立会】見本荘 104',{hub:'U-0105',owner:'工事主任',creator:'b@example.com'}),             // 表示名
 E('e7','予定あり',{private:true,hub:'U-0106',owner:'見本 二郎'}),                                        // 非公開は今までどおり出さない
 E('e8','【修繕】見本ビル 501',{hub:'U-0107',owner:'不明 太郎',creator:'zz@example.com'})];             // 一致しない
async function device({self=A,rows=[],admin=true,viewList=true,gShow=null,gHubOff=false,cals=null,width=400}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.HO);
 const me=roster.find(x=>x.sheetId===self);
 await p.evaluate(({me,roster,rows,admin,EVENTS,HUB,viewList,gShow,gHubOff,cals})=>{const d=HO.db.settings.data;d.ob={legacy:true};d.sheetId=me.sheetId;d.viewListId=viewList?'synthetic-view-list-000000001':'';HO.db.settings.gShow=gShow;if(gHubOff)HO.db.settings.gHubOff=true;d.viewEmail=me.email;d.admin=admin;
  d.nameProfile={name:me.name,sheetId:me.sheetId};HO.db.settings.rcpt.name=me.name;
  HO.ui.viewList=roster;d.staff=admin?roster.map(x=>({...x,registeredName:x.name})):[];
  HO.G.cals=cals||[{id:me.email,name:'自分',primary:true,owner:true,write:true},{id:HUB,name:'CPG HUB',primary:false,owner:false,write:true}];
  HO.save();if(rows.length)CPGCalendarScope.save(localStorage,HO.scopeIdentity(),rows);
  localStorage.setItem('workhub_gcal_last_v1',JSON.stringify({policy:2,at:Date.now(),from:'2026-11-01',to:'2026-11-30',data:{events:EVENTS,sources:[{id:HUB},{id:me.email}],missing:0}}));
  HO.go('cal',{calDay:'2026-11-07',calMonth:'2026-11',calView:'day'})},{me,roster,rows,admin,EVENTS,HUB,viewList,gShow,gHubOff,cals});
 return {c,p,errors};
}
const pick=async(p,person,company='all')=>{await p.selectOption('main [data-scope-company]',company).catch(()=>{});await p.selectOption('main [data-scope-person]',person)};
const cards=p=>p.evaluate(()=>[...document.querySelectorAll('main .gccard')].map(e=>({tag:e.querySelector('.ev')?.textContent||'',text:e.textContent})));
const titles=async p=>(await cards(p)).map(x=>x.text).join('\n');
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const all=[];
 await check('社長の端末：対応設定が空でも「CPG HUB」は自動で「複数の人が使う」。人で絞ると担当の人の案件が出る（手作業の設定なし）',async()=>{
  const d=await device({});all.push(d);
  await pick(d.p,B);const t=await titles(d.p);assert.match(t,/見本荘 103/);assert.doesNotMatch(t,/月例会議/);
  assert.equal(await d.p.evaluate(()=>localStorage.getItem('workhub_calendar_scope_v1:'+JSON.stringify(['','','']))),null);
  const html=await d.p.evaluate(()=>HO.calendarScopeSettings());assert.match(html,/CPG HUB（会社の共有カレンダー） → 複数の人が使う仕事用（自動/);
 });
 await check('見る人用一覧につないだ人（全社・GMなど）も同じ。前に保存した表示の選択に「CPG HUB」が無くても足す',async()=>{
  const d=await device({admin:false,gShow:[SELF_A]});all.push(d);
  assert.ok((await d.p.evaluate(()=>HO.gShowIds())).includes(HUB));
  await pick(d.p,B);assert.match(await titles(d.p),/見本荘 103/);
 });
 await check('この版から設定で「CPG HUB」のチェックを外した人・全部外した人には足さない（自動の対応も出さない）',async()=>{
  let d=await device({gShow:[SELF_A],gHubOff:true});all.push(d);
  assert.ok(!(await d.p.evaluate(()=>HO.gShowIds())).includes(HUB));await pick(d.p,B);assert.doesNotMatch(await titles(d.p),/見本荘 103/);
  d=await device({gShow:[]});all.push(d);assert.deepEqual(await d.p.evaluate(()=>HO.gShowIds()),[]);
 });
 await check('設定で「CPG HUB」のチェックを外して保存すると覚え、入れて保存すると戻す',async()=>{
  const d=await device({});all.push(d);
  await d.p.evaluate(()=>{const box=document.createElement('div');box.innerHTML=HO.gSettings();document.querySelector('main').appendChild(box)});
  const save=async on=>{await d.p.evaluate(on=>{const f=document.getElementById('gsetForm');const hub=[...f.querySelectorAll('input[name="gshow"]')].find(x=>HO.G.cals[Number(x.value)].name==='CPG HUB');hub.checked=on;f.requestSubmit()},on);await d.p.evaluate(()=>{const box=document.createElement('div');box.innerHTML=HO.gSettings();document.querySelector('main').appendChild(box)})};
  await save(false);assert.equal(await d.p.evaluate(()=>HO.db.settings.gHubOff),true);
  await save(true);assert.equal(await d.p.evaluate(()=>HO.db.settings.gHubOff),false);
 });
 await check('この端末で保存した対応があれば、それが優先（自動にしない）',async()=>{
  const d=await device({rows:[{id:HUB,work:true,mode:'person',company:'CP',person:A}]});all.push(d);
  const html=await d.p.evaluate(()=>HO.calendarScopeSettings());assert.doesNotMatch(html,/（自動/);assert.match(html,/CPG HUB（会社の共有カレンダー） → CP/);
 });
 await check('社員の端末（ほかの人を見ない）では自動にしない',async()=>{
  const d=await device({self:B,admin:false,viewList:false});all.push(d);
  assert.doesNotMatch(await d.p.evaluate(()=>HO.calendarScopeSettings()),/（自動/);
 });
 await check('対応設定のカレンダー：IDを出さず名前で、CPG HUB→社員（人の名前）→そのほか。祝日は出さない。同じ名前は短い見分けを付ける',async()=>{
  const cals=[{id:'trip-0001@group.calendar.example.com',name:'Trip',primary:false,owner:true,write:true},{id:SELF_A,name:'自分',primary:true,owner:true,write:true},
   {id:'ja.japanese#holiday@group.v.calendar.google.com',name:'日本の祝日',primary:false,owner:false,write:false},{id:SELF_B,name:SELF_B,primary:false,owner:false,write:false},
   {id:HUB,name:'CPG HUB',primary:false,owner:false,write:true},{id:'memo-a1@group.calendar.example.com',name:'メモ',primary:false,owner:true,write:true},{id:'memo-b2@group.calendar.example.com',name:'メモ',primary:false,owner:true,write:true}];
  const d=await device({cals});all.push(d);
  const es=await d.p.evaluate(()=>HO.calMapEntries(HO.G.cals));
  assert.deepEqual(es.map(e=>e.label),['CPG HUB（会社の共有カレンダー）','自分（見本 一郎）','見本 二郎（b）','Trip','メモ・memo-a','メモ・memo-b']);
  const html=await d.p.evaluate(()=>HO.calendarScopeSettings());
  {const m=html.match(/.{80}(@group|@example\.com).{40}/g);assert.ok(!m||m.every(x=>/value="/.test(x)),JSON.stringify(m));}assert.doesNotMatch(html,/祝日/);
  assert.match(html,/<optgroup label="会社の共有">.*CPG HUB.*<optgroup label="社員のカレンダー">.*見本 二郎（b）.*<optgroup label="そのほか（私用の予定が入るものは選ばない）">.*Trip/s);
  const shown=await d.p.evaluate(h=>{const x=document.createElement('div');x.innerHTML=h;return [...x.querySelectorAll('option')].map(o=>o.textContent).join('\n')+'\n'+[...x.querySelectorAll('p')].map(o=>o.textContent).join('\n')},html);
  assert.doesNotMatch(shown,/@|synthetic-[a-d]-sheet/,'no calendar or sheet ids are shown');
 });
 await check('400px・360pxで横にはみ出さない・スクリプトのエラーなし',async()=>{
  for(const width of [400,360]){const d=await device({width});all.push(d);await d.p.evaluate(()=>HO.go('cal',{calDay:'2026-11-07',calMonth:'2026-11',calView:'day'}));
   await d.p.evaluate(()=>{document.querySelectorAll('details').forEach(x=>x.open=true)});
   assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width);
   if(width===400)await d.p.locator('main').screenshot({path:path.join(root,'docs/preview/calendar-hub-auto-400.png')});}
  for(const d of all)assert.deepEqual(d.errors,[]);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
