/* v1.50.8 共有カレンダー「CPG HUB」の、HUBから登録した予定（説明に「担当：○○」）を、その担当者の予定として出す。
   人で絞ったとき・札もその人。決まらない予定・HUB外の予定・非公開の予定は今までどおり。見られない人の予定は出さない。
   Synthetic fixtures only (fictional names, example.com). Google APIs are mocked; no live accounts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.HO={get db(){return DB},get ui(){return ui},G,go,save,render,scopeIdentity,gReadOne,calHubOwner,get ADMIN(){return ADMIN_ACCOUNT},authorize(){G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}};';
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
async function device({self=A,rows,admin=true,width=400}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}return r.fulfill({status:200,body:'{}'})});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/');await p.waitForFunction(()=>!!window.HO);
 const me=roster.find(x=>x.sheetId===self);
 await p.evaluate(({me,roster,rows,admin,EVENTS,HUB})=>{const d=HO.db.settings.data;d.ob={legacy:true};d.sheetId=me.sheetId;d.viewListId='synthetic-view-list-000000001';d.viewEmail=me.email;d.admin=admin;
  d.nameProfile={name:me.name,sheetId:me.sheetId};HO.db.settings.rcpt.name=me.name;
  HO.ui.viewList=roster;d.staff=admin?roster.map(x=>({...x,registeredName:x.name})):[];
  HO.G.cals=[{id:me.email,name:'自分',primary:true,owner:true,write:true},{id:HUB,name:'CPG HUB',primary:false,owner:false,write:true}];
  HO.save();CPGCalendarScope.save(localStorage,HO.scopeIdentity(),rows);
  localStorage.setItem('workhub_gcal_last_v1',JSON.stringify({policy:2,at:Date.now(),from:'2026-11-01',to:'2026-11-30',data:{events:EVENTS,sources:[{id:HUB},{id:me.email}],missing:0}}));
  HO.go('cal',{calDay:'2026-11-07',calMonth:'2026-11',calView:'day'})},{me,roster,rows,admin,EVENTS,HUB});
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
 for(const [label,rows] of [['複数の人が使う（mixed）',[{id:HUB,work:true,mode:'mixed'}]],['人物に結び付け（社長役の本人）',[{id:HUB,work:true,mode:'person',company:'CP',person:A}]]]){
  await check('対応設定が「'+label+'」でも：人で「見本 二郎」に絞ると、担当が見本 二郎の「CPG HUB」の予定が出て、札も見本 二郎',async()=>{
   const d=await device({rows});all.push(d);
   await pick(d.p,B);const t=await titles(d.p);
   assert.match(t,/見本荘 103/);assert.doesNotMatch(t,/見本ハイツ 201|見本コート 301|月例会議|見本ビル 401|見本荘 104|見本ビル 501|見本の打合せ|見本タワー 601/);assert.match(t,/見本タワー 602/,'creator among the owner candidates');
   const card=(await cards(d.p)).find(x=>/見本荘 103/.test(x.text));assert.equal(card.tag,'見本 二郎');
   assert.doesNotMatch(t,/見本荘 104（非公開）|e7/);
  });
  await check('「'+label+'」：名字だけ（1人に決まる）・表示名・担当の行がないときの作成者Gmail でも、その人の予定になる',async()=>{
   const d=all[all.length-1];
   await pick(d.p,C);let t=await titles(d.p);assert.match(t,/見本ハイツ 201/);assert.match(t,/見本荘 104/);assert.doesNotMatch(t,/見本荘 103/);
   assert.ok((await cards(d.p)).filter(x=>/見本ハイツ 201|見本荘 104/.test(x.text)).every(x=>x.tag==='工事主任'),'tag is the display name');
   await pick(d.p,D2);t=await titles(d.p);assert.match(t,/見本ビル 401/);
   /* v1.50.13 HUB外から直接入れた予定・担当が1人に決まらない予定は、作成者の人 */
   assert.doesNotMatch(t,/見本タワー 601/,'creator outside the owner candidates is not used');
   await pick(d.p,C);t=await titles(d.p);assert.match(t,/見本の打合せ/,'a direct event goes to its creator');assert.ok((await cards(d.p)).filter(x=>/見本の打合せ/.test(x.text)).every(x=>x.tag==='工事主任'));
  });
  await check('「'+label+'」：決まらない担当（名字が2人・一致なし）とHUB外の予定は、今までどおり（人に割り当てない）',async()=>{
   const d=all[all.length-1];
   for(const who of [B,C,D2]){await pick(d.p,who);const t=await titles(d.p);assert.doesNotMatch(t,/見本コート 301|月例会議|見本ビル 501|見本タワー 601/,who);}
   await pick(d.p,'all');const t=await titles(d.p);
   if(rows[0].mode==='person'){/* 人物に結び付けた設定では、決まらない予定は今までどおりその人（本人）の予定 */
    assert.match(t,/見本コート 301/);assert.match(t,/月例会議/);assert.match(t,/見本ビル 501/);assert.match(t,/見本タワー 601/,'unassigned: stays with the mapped person as before');
    await pick(d.p,A);const ta=await titles(d.p);assert.match(ta,/月例会議/);assert.doesNotMatch(ta,/見本荘 103|見本ハイツ 201/);
   }else{assert.doesNotMatch(t,/見本コート 301|月例会議|見本ビル 501/);assert.match(await d.p.textContent('main'),/持ち主不明の予定 4件/);assert.doesNotMatch(t,/見本タワー 601/);}
   assert.match(t,/見本荘 103/);assert.match(t,/見本ハイツ 201/);
   assert.doesNotMatch(await d.p.textContent('main'),/e7/);
  });
 }
 await check('社員の端末：自分が担当の予定は出る。見られない人（ほかの社員）の予定は出さない',async()=>{
  const d=await device({self:B,admin:false,rows:[{id:HUB,work:true,mode:'person',company:'CPY',person:B}]});all.push(d);
  if(await d.p.locator('main [data-scope-person]').count())await pick(d.p,'all');
  const t=await titles(d.p);assert.match(t,/見本荘 103/);assert.doesNotMatch(t,/見本ハイツ 201|見本荘 104|見本ビル 401/,'other people are not shown');
  const card=(await cards(d.p)).find(x=>/見本荘 103/.test(x.text));assert.equal(card.tag,'見本 二郎');
 });
 await check('読み込み：「CPG HUB」でHUBから登録した予定は説明の「担当」と作成者、HUB外は作成者だけを控える（説明は残さない）。ほかのカレンダー・非公開には付けない。社長が作った予定・非公開は割り当てない',async()=>{
  const d=all[0];
  const items=[
   {id:'g1',status:'confirmed',summary:'【退去立会】見本荘 103',visibility:'default',start:{dateTime:'2026-11-07T10:00:00+09:00'},end:{dateTime:'2026-11-07T11:00:00+09:00'},extendedProperties:{private:{cpgHubCase:'U-0101'}},description:'受付番号：U-0101\n依頼の種類：退去立会\n担当：見本 二郎\n（CPG HUBから登録）',creator:{email:'b@example.com'}},
   {id:'g2',status:'confirmed',summary:'見本の月例会議',visibility:'default',start:{date:'2026-11-08'},end:{date:'2026-11-09'},description:'議題：見本',creator:{email:'x@example.com'}},
   {id:'g3',status:'confirmed',summary:'見本の私用',visibility:'private',start:{date:'2026-11-08'},end:{date:'2026-11-09'},description:'担当：見本 二郎\n（CPG HUBから登録）',creator:{email:'b@example.com'}},
   {id:'g4',status:'confirmed',summary:'【修繕】見本ビル',visibility:'default',start:{date:'2026-11-08'},end:{date:'2026-11-09'},description:'担当：試験 三郎\n（CPG HUBから登録）'}];
  const fields=[];
  await d.c.route('https://www.googleapis.com/calendar/v3/**',r=>{fields.push(new URL(r.request().url()).searchParams.get('fields'));r.fulfill({contentType:'application/json',body:JSON.stringify({items})})});
  const out=await d.p.evaluate(async HUB=>{HO.authorize();const hub=await HO.gReadOne({id:HUB,name:'CPG HUB',primary:false,owner:false},'2026-11-01','2026-11-30');const other=await HO.gReadOne({id:'other@example.com',name:'見本の仕事',primary:false,owner:false},'2026-11-01','2026-11-30');return {hub,other}},HUB);
  assert.match(fields[0],/description,creator\(email\)/);assert.doesNotMatch(fields[1],/description/,'only the shared calendar asks for descriptions');
  const [g1,g2,g3,g4]=out.hub;
  assert.equal(g1.owner,'見本 二郎');assert.equal(g1.creator,'b@example.com');assert.ok(!('description' in g1));
  assert.ok(!('owner' in g2),'not from HUB');assert.equal(g2.creator,'x@example.com','v1.50.13 the creator is kept for direct events');assert.ok(!('owner' in g3)&&!('creator' in g3),'hidden private event');assert.equal(g4.owner,'試験 三郎');
  /* v1.50.13 社長が作った予定・非公開の予定は、作成者がいても割り当てない */
  const r=await d.p.evaluate(()=>{const ctx={people:[{sheetId:'boss-sheet',email:HO.ADMIN,name:'社長役'},{sheetId:'s',email:'s@example.com',name:'見本 社員'}]},m={people:[]};
   return [HO.calHubOwner({private:false,creator:HO.ADMIN},ctx,m,[]),HO.calHubOwner({private:true,creator:'s@example.com'},ctx,m,[]),HO.calHubOwner({private:false,creator:'s@example.com'},ctx,m,[])?.person,HO.calHubOwner({private:false,owner:'見本 社員',creator:HO.ADMIN},ctx,m,[])?.person]});
  assert.deepEqual(r,[null,null,'s','s']);
  assert.ok(out.other.every(e=>!('owner' in e)),'other calendars unchanged');
 });
 await check('400px・360pxで横にはみ出さない・スクリプトのエラーなし',async()=>{
  for(const width of [400,360]){const d=await device({rows:[{id:HUB,work:true,mode:'mixed'}],width});all.push(d);await pick(d.p,B);
   assert.ok(await d.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width);
   if(width===400)await d.p.locator('main').screenshot({path:path.join(root,'docs/preview/calendar-hub-owner-400.png')});}
  for(const d of all)assert.deepEqual(d.errors,[]);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
