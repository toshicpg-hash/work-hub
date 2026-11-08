/* v1.50.29 実際の流れ（ログイン → カレンダー一覧 → 同期 → 週の予定）で、社員本人のカレンダーのうち読めないもの（予定の有無だけの共有・追加していない）があっても、
   「全員」も人ごとも毎日「未取得」にならず、同期の「予定の読み込み」も注意にならないこと。Synthetic fixtures only (fictional names, example.com). Google APIs are mocked. */
'use strict';
const assert=require('node:assert/strict');let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const {chromium}=playwright;const http=require('http'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');
const hook='window.S={get db(){return DB},get ui(){return ui},G,go,save,render,gSyncAllRun,gShowIds,calPersonAutoList:typeof calPersonAutoList==="function"?calPersonAutoList:null,stub(){gAuthorize=async()=>{G.token="t";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000}},get ADMIN(){return ADMIN_ACCOUNT}};';
const s=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);try{let b=fs.readFileSync(path.join(root,u==='/'?'index.html':u),'utf8');if(u==='/')b=b.replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();');r.setHeader('content-type',u.endsWith('.js')?'text/javascript':'text/html');r.end(b)}catch{r.writeHead(404).end()}}).listen(0,async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{const c=await b.newContext({viewport:{width:400,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 let ADMIN='';
 await c.route('**/*',async r=>{const u=new URL(r.request().url());const J=(o,st=200)=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(u.hostname.startsWith('127.0.0.1'))return r.continue();
  if(u.pathname==='/calendar/v3/users/me/calendarList')return J({items:[{id:ADMIN,summary:ADMIN,primary:true,accessRole:'owner'},{id:'hub@group.calendar.google.com',summary:'CPG HUB',accessRole:'writer'},{id:'b@example.com',summary:'b@example.com',accessRole:'reader'},{id:'c@example.com',summary:'c@example.com',accessRole:'freeBusyReader'},{id:'d@example.com',summary:'d@example.com',accessRole:'reader'}]});
  const m=u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/);
  if(m){const id=decodeURIComponent(m[1]);
   if(id==='c@example.com')return J({error:{code:403}},403);
   if(id==='d@example.com')return J({error:{code:404}},404);
   const ev=id.startsWith('hub')?[{id:'h1',status:'confirmed',summary:'【退去立会】見本荘 101',description:'受付番号：U-0001\n担当：見本 二郎\n（CPG HUBから登録）',creator:{email:'b@example.com'},start:{dateTime:'2026-11-09T10:00:00+09:00'},end:{dateTime:'2026-11-09T11:00:00+09:00'},visibility:'default'}]:id==='b@example.com'?[{id:'b1',status:'confirmed',summary:'見本の休み',start:{date:'2026-11-10'},end:{date:'2026-11-11'},visibility:'default'}]:[];
   return J({items:ev})}
  return J({});
 });
 const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-08T10:00:00Z')});
 await p.goto('http://127.0.0.1:'+s.address().port+'/');await p.waitForFunction(()=>!!window.S);ADMIN=await p.evaluate(()=>S.ADMIN);
 await p.evaluate(()=>{S.stub();const d=S.db.settings.data;d.admin=true;d.ob={legacy:true};d.staff=[{name:'見本 二郎',email:'b@example.com',sheetId:'sheetB00000000000000000002',company:'CPY',role:'GM',gmCo:'CPY'},{name:'試験 三郎',email:'c@example.com',sheetId:'sheetC00000000000000000003',company:'CP',role:'社員'},{name:'仮名 四郎',email:'d@example.com',sheetId:'sheetD00000000000000000004',company:'AT',role:'社員'}];d.listId='';S.save()});
 await p.evaluate(async()=>{await S.gSyncAllRun()});
 const rows=await p.evaluate(()=>S.ui.gsync.rows.map(x=>x.name+':'+x.ok+':'+x.msg).join(' | '));
 await p.evaluate(()=>S.go('cal',{calDay:'2026-11-08',calView:'week'}));await p.waitForTimeout(800);
 const res={};
 for(const who of ['all','sheetB00000000000000000002','sheetC00000000000000000003']){await p.selectOption('[data-scope-person]',who);await p.waitForTimeout(400);
  const t=await p.evaluate(()=>document.querySelector('main').innerText);res[who]={un:(t.match(/未取得/g)||[]).length,hub:/見本荘 101/.test(t),own:/見本の休み/.test(t),info:(await p.evaluate(()=>S.ui.calInfo||'')).replace(/<[^>]+>/g,' ')};}
 assert.equal(res.all.un,0,'全員: no unfetched day');assert.ok(res.all.hub&&res.all.own,'全員: CPG HUB and the readable own calendar are shown');
 assert.match(res.all.info,/試験 三郎、仮名 四郎：本人のカレンダーを結び付けていないので、共有カレンダー（CPG HUB）の予定だけ/);
 assert.equal(res.sheetB00000000000000000002.un,0);assert.ok(res.sheetB00000000000000000002.own,'readable own calendar is linked automatically');
 assert.equal(res.sheetC00000000000000000003.un,0,'free/busy-only person: shown via CPG HUB, not unfetched');
 assert.match(rows,/予定の読み込み:true/,'an unreadable automatic calendar does not turn the sync into a warning');
 assert.ok(!(await p.evaluate(()=>S.gShowIds())).includes('c@example.com'),'free/busy-only calendar is not read');
 assert.deepEqual(errs,[]);console.log('PASS 実際の流れで、読めない社員本人のカレンダーがあっても「未取得」にならず、同期も注意にならない');console.log('ALL PASS 1');
}catch(e){console.error(e);process.exitCode=1}
 await b.close();s.close();});
