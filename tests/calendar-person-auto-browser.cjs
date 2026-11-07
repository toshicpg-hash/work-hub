/* v1.50.25 ほかの人の予定を見る端末で、対応設定が空（ブラウザのデータが消えた端末と同じ）でも、社員一覧のGmailと同じカレンダーは、
   見てよい人なら「人物を確認した仕事専用・その人」として自動で扱う。見てよくない人・社長のカレンダーには当てない。保存した対応が優先。
   Synthetic fixtures only (fictional names, example.com). Google APIs are mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.HO={get db(){return DB},get ui(){return ui},G,go,save,render,scopeIdentity,gReadOne,calHubOwner,gShowIds,calPersonAutoList,get ADMIN(){return ADMIN_ACCOUNT},authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
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
 const all=[],BCAL='b@example.com',CCAL='c@example.com',OTHER='someone@example.net';
 const cals=[{id:SELF_A,name:'自分',primary:true,owner:true,write:true},{id:HUB,name:'CPG HUB',primary:false,owner:false,write:true},{id:BCAL,name:BCAL,primary:false,owner:false,write:false},{id:CCAL,name:CCAL,primary:false,owner:false,write:false},{id:OTHER,name:'知らない人',primary:false,owner:false,write:false}];
 const P=(id,cal,title)=>E(id,title,{calendarId:cal,calendar:cal});
 const events=[P('b1',BCAL,'見本の休み（二郎）'),P('c1',CCAL,'見本の休み（三郎）'),P('o1',OTHER,'知らない人の予定')];
 const sources=[{id:HUB},{id:SELF_A},{id:BCAL},{id:CCAL},{id:OTHER}];
 const day=async p=>{await p.evaluate(()=>HO.go('cal',{calDay:'2026-11-07',calMonth:'2026-11',calView:'day'}));return p.evaluate(()=>document.querySelector('main').innerText)};
 await check('社長の端末・対応設定が空：社員のGmailと同じカレンダーは、その人の予定として人の欄に出る。表示するカレンダーにも入る。知らない人・自分のカレンダーには当てない',async()=>{
  const d=await device({rows:[],cals,events,sources});all.push(d);
  const auto=await d.p.evaluate(()=>HO.calPersonAutoList());assert.deepEqual(auto.map(x=>[x.id,x.person]).sort(),[[BCAL,B],[CCAL,C]]);
  const shown=await d.p.evaluate(()=>HO.gShowIds());assert.ok(shown.includes(BCAL)&&shown.includes(CCAL));assert.ok(!shown.includes(OTHER));
  await pick(d.p,B);let t=await day(d.p);assert.match(t,/見本の休み（二郎）/);assert.doesNotMatch(t,/見本の休み（三郎）|知らない人の予定/);
  await pick(d.p,C);t=await day(d.p);assert.match(t,/見本の休み（三郎）/);assert.doesNotMatch(t,/見本の休み（二郎）/);
  assert.deepEqual(d.errors,[]);
 });
 await check('対応設定の画面に「→ 見本 二郎（自動。…）」と出る（400px ではみ出さない）',async()=>{
  const d=all[0];await d.p.evaluate(()=>{HO.ui.keepOpen={calmap:true};HO.go('stats')});
  const t=await d.p.evaluate(()=>document.body.textContent);assert.match(t,/→ 見本 二郎（自動。社員一覧のGmailと同じカレンダー/);assert.match(t,/→ 工事主任（自動。|→ 試験 三郎（自動。/);
  assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1);
 });
 await check('GMの端末（見てよいのはCPYの一般社員だけ）：見てよい人（二郎）は自動、見てよくない人（三郎・CP）は自動にしない（表示にも入れない）',async()=>{
  const gm={name:'管理 五郎',email:'gm5@example.com',sheetId:'synthetic-gm-sheet-000000005',company:'CPY',role:'GM',gmCo:'CPY',removed:false};
  roster.push(gm);
  const gcals=[{id:gm.email,name:'自分',primary:true,owner:true,write:true}].concat(cals.slice(1));
  const d=await device({self:gm.sheetId,admin:false,rows:[],cals:gcals,events,sources:[{id:HUB},{id:gm.email},{id:BCAL},{id:CCAL},{id:OTHER}]});all.push(d);
  assert.deepEqual(await d.p.evaluate(()=>HO.calPersonAutoList().map(x=>x.id)),[BCAL]);
  assert.ok(!(await d.p.evaluate(()=>HO.gShowIds())).includes(CCAL),'not read either');
  await pick(d.p,'all');const t=await day(d.p);assert.match(t,/見本の休み（二郎）/);assert.doesNotMatch(t,/見本の休み（三郎）/);
  roster.pop();assert.deepEqual(d.errors,[]);
 });
 await check('この端末で保存した対応が優先：二郎のカレンダーを「複数の人が使う仕事用」で保存していれば、自動にしない（HUBの案件と結び付かない予定は人の欄に出ない）',async()=>{
  const d=await device({rows:[{id:BCAL,work:true,mode:'mixed'}],cals,events,sources});all.push(d);
  assert.deepEqual(await d.p.evaluate(()=>HO.calPersonAutoList().map(x=>x.id)).then(x=>x.sort()),[BCAL,CCAL].sort(),'listed, but the saved row wins in projection');
  await pick(d.p,B);const t=await day(d.p);assert.doesNotMatch(t,/見本の休み（二郎）/);
  await d.p.evaluate(()=>{HO.ui.keepOpen={calmap:true};HO.go('stats')});assert.doesNotMatch(await d.p.evaluate(()=>document.body.textContent),/→ 見本 二郎（自動。/);
 });
 await check('表示するカレンダーで自動の人のチェックを外して保存したら、その人は足さない。全部外したときも足さない',async()=>{
  const d=await device({rows:[],cals,events,sources});all.push(d);
  await d.p.evaluate(BCAL=>{HO.db.settings.gShow=['a@example.com','hub-shared@group.example.com'];HO.db.settings.gAutoOff=[BCAL];HO.save()},BCAL);
  let shown=await d.p.evaluate(()=>HO.gShowIds());assert.ok(!shown.includes(BCAL));assert.ok(shown.includes(CCAL));
  await d.p.evaluate(()=>{HO.db.settings.gShow=[];HO.save()});shown=await d.p.evaluate(()=>HO.gShowIds());assert.deepEqual(shown,[]);
 });
 await check('ほかの人の予定を見ない端末（一般の社員）では自動にしない',async()=>{
  const d=await device({self:B,admin:false,rows:[],cals:[{id:BCAL,name:'自分',primary:true,owner:true,write:true},{id:CCAL,name:CCAL,primary:false,owner:false,write:false}],events,sources:[{id:BCAL},{id:CCAL}]});all.push(d);
  await d.p.evaluate(()=>{HO.db.settings.data.viewListId='';HO.save()});
  assert.deepEqual(await d.p.evaluate(()=>HO.calPersonAutoList()),[]);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
