/* v1.50.40 売上報告（試作・社長の端末だけ）：試作用のシート（架空の数字）を作って読み、月ごと・会社ごと・担当者別に出す。シートを書き換えて読み直すと変わる。社員の端末には出ない。
   Synthetic fixtures only (fictional names, example.com). In-memory Google; no live accounts or network writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),ADMIN='toshi.cpg@gmail.com',STAFF='staff.sample@example.com',KEY='workhub_proto_v1';
const hook='window.BB={get db(){return DB},get ui(){return ui},go,render,save,salesParse,homeSyncLabels,ordLoad,gAuthorize,'+
 'mock(){gLoadCalendarsRun=async()=>{G.cals=[];return G.cals};gReadRange=async()=>({events:[],calendars:[],missing:0});gKeepSave=()=>{};corpRun=async()=>[]}};';
const GIS="window.google={accounts:{oauth2:{initTokenClient(cfg){return {requestAccessToken(){setTimeout(()=>cfg.callback({access_token:'tok:'+window.__acct,expires_in:3600,scope:cfg.scope}),5)}}}}}};";
const G={files:{},n:0,calls:[]};
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const tabName=r=>{const m=r.match(/^'((?:[^']|'')+)'/);return m?m[1].replace(/''/g,"'"):r.split('!')[0]};
async function google(r){
 const req=r.request(),u=new URL(req.url()),acct=(req.headers()['authorization']||'').replace('Bearer tok:',''),m=req.method(),p=decodeURIComponent(u.pathname);
 const J=(o,st=200)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)});G.calls.push([acct,m,p]);
 if(p==='/drive/v3/about')return J({user:{emailAddress:acct}});
 if(p==='/drive/v3/files'&&m==='GET'){const q=u.searchParams.get('q')||'',eqn=(q.match(/name='([^']*)'/)||[])[1],cn=(q.match(/name contains '([^']*)'/)||[])[1];
  return J({files:Object.values(G.files).filter(f=>f.owner===acct&&(!eqn||f.name===eqn)&&(!cn||f.name.includes(cn))).map(f=>({id:f.id,name:f.name,createdTime:f.created}))})}
 if(p==='/drive/v3/files'&&m==='POST'){const b=req.postDataJSON(),id='bbsheet'+String(++G.n).padStart(20,'0');G.files[id]={id,name:b.name,owner:acct,created:new Date(Date.UTC(2026,10,1)+G.n*1000).toISOString(),perms:[],tabs:[{title:'シート1',sheetId:0,rows:[]}]};return J({id,name:b.name})}
 let mm=p.match(/^\/drive\/v3\/files\/([^/]+)$/);
 if(mm&&m==='GET'){const f=G.files[mm[1]];if(!f||f.owner!==acct||G.driveHidden)return J({},404);return J({modifiedTime:f.modified||f.created,name:f.name})}
 mm=p.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/);
 if(mm){const f=G.files[mm[1]];if(!f||f.owner!==acct)return J({},403);return J({permissions:[{id:'owner',emailAddress:f.owner,role:'owner',type:'user'}].concat(f.perms)})}
 mm=p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
 if(mm){const f=G.files[mm[1]],rest=mm[2];if(!f||(f.owner!==acct&&!(m==='GET'&&(f.readers||[]).includes(acct))))return J({},403);
  if(m==='GET'&&!rest&&(f.owner===acct||(f.readers||[]).includes(acct)))return J({properties:{title:f.name},sheets:f.tabs.map(t=>({properties:{title:t.title,sheetId:t.sheetId,gridProperties:{rowCount:1000,columnCount:26}}}))});
  if(rest==='/values:batchGet'&&(f.owner===acct||(f.readers||[]).includes(acct))){const ts=u.searchParams.getAll('ranges').map(x=>f.tabs.find(t=>t.title===tabName(x)));if(ts.some(t=>!t))return J({},400);const fm=u.searchParams.get('valueRenderOption')==='FORMULA';
   return J({valueRanges:ts.map(t=>{const v=structuredClone(t.rows);if(fm&&t.formulas)for(const [k,x] of Object.entries(t.formulas)){const [r,c]=k.split(',').map(Number);v[r][c]=x}return {values:v}})})}
  if(rest==='/values:batchUpdate'&&m==='POST'){const b=req.postDataJSON();G.batch=(G.batch||[]).concat([b]);f.modified=G.mod;
   for(const d of b.data){const mm2=d.range.match(/^'(.+)'!([A-Z])(\d+)$/),t=f.tabs.find(x=>x.title===mm2[1].replace(/''/g,"'"));const r=Number(mm2[3])-1,c=mm2[2].charCodeAt(0)-65;while(t.rows.length<=r)t.rows.push([]);t.rows[r][c]=d.values[0][0]}return J({})}
  {const ap=rest.match(/^\/values\/(.+):append$/);if(ap&&m==='POST'){const t=f.tabs.find(x=>x.title===tabName(ap[1]));if(!t)return J({},400);G.appends=(G.appends||[]).concat([[t.title,req.postDataJSON().values[0]]]);t.rows.push(...structuredClone(req.postDataJSON().values));f.modified=G.mod;return J({})}}
  if(rest===':batchUpdate'){for(const q of req.postDataJSON().requests){if(q.addSheet)f.tabs.push({title:q.addSheet.properties.title,sheetId:f.tabs.length+1,rows:[]});if(q.updateSheetProperties){const t=f.tabs.find(x=>x.sheetId===q.updateSheetProperties.properties.sheetId);if(q.updateSheetProperties.properties.title)t.title=q.updateSheetProperties.properties.title;if(q.updateSheetProperties.properties.gridProperties)t.grid=q.updateSheetProperties.properties.gridProperties}if(q.repeatCell||q.updateDimensionProperties||q.setDataValidation){const r=(q.repeatCell||q.updateDimensionProperties||q.setDataValidation).range,t=f.tabs.find(x=>x.sheetId===r.sheetId);(t.fmt=t.fmt||[]).push(q)}}return J({})}
  const vm=rest.match(/^\/values\/(.+?)(:clear)?$/);
  if(vm){const t=f.tabs.find(x=>x.title===tabName(vm[1]));if(!t)return J({},400);if(vm[2]){t.rows=[];return J({})}const one=vm[1].match(/!([A-Z])(\d+)$/);if(m==='PUT'&&one&&req.postDataJSON().values.length===1&&req.postDataJSON().values[0].length===1&&typeof req.postDataJSON().values[0][0]==='boolean'){f.modified=G.mod;const r=Number(one[2])-1,c=one[1].charCodeAt(0)-65;while(t.rows.length<=r)t.rows.push([]);t.rows[r][c]=req.postDataJSON().values[0][0]===true?'TRUE':String(req.postDataJSON().values[0][0]);G.cellPuts=(G.cellPuts||[]).concat([vm[1]]);return J({})}
   if(m==='PUT'){f.modified=G.mod;t.rows=structuredClone(req.postDataJSON().values).map(r=>{while(r.length&&r[r.length-1]==='')r.pop();return r}).filter((r,i,a)=>r.length||a.slice(i).some(x=>x.length));while(t.rows.length&&!t.rows[t.rows.length-1].length)t.rows.pop();return J({})}}
 }
 return J({},404);
}
async function device(width,init,arg){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u.startsWith(origin+'/')){const pn=new URL(u).pathname;if(pn==='/'||pn==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.startsWith('https://accounts.google.com/gsi/client'))return r.fulfill({contentType:'application/javascript',body:GIS});
  if(/https:\/\/(www|sheets)\.googleapis\.com\//.test(u))return google(r);
  return r.fulfill({status:200,body:''})});
 await c.addInitScript(a=>{window.__acct=a},ADMIN);
 if(init)await c.addInitScript(init,arg);
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-09T03:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.BB&&window.google&&google.accounts);await p.evaluate(()=>BB.mock());
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,details,.banner')].map(x=>x.scrollWidth-x.clientWidth))});
const sync=async p=>{await p.evaluate(()=>{BB.ui.gsync=null;BB.go('home')});await p.click('[data-act=gsync]');await p.waitForFunction(()=>BB.ui.gsync&&!BB.ui.gsync.busy&&BB.ui.gsync.rows.some(x=>x.name==='この端末の控え'));return p.evaluate(()=>BB.ui.gsync.rows)};
const tabOf=(f,t)=>(f.tabs.find(x=>x.title===t)||{rows:null}).rows;
const openAdmin=async p=>{await p.evaluate(()=>{BB.go('stats');document.querySelectorAll('details[data-fold]').forEach(d=>d.open=true)});await p.waitForSelector('#boss-backup')};
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 /* v1.50.54 会社のカードは最初は畳んである。試験では開いて中を見る */
 const open=async p=>{await p.evaluate(()=>{BB.ui.salesCoOpen={CP:true,AT:true,CPY:true};BB.go('stats');document.querySelectorAll('details[data-fold="sales"]').forEach(d=>d.open=true)});await p.waitForSelector('#stats-sales')};
 for(const width of [400,360]){
  G.files={};G.n=0;G.mod='2026-11-09T01:30:00Z';
  /* 社員一覧（HUBの設定を書く先）とフォルダ */
  G.files.folder0000000000000000001={id:'folder0000000000000000001',name:'CPG HUB データ',owner:ADMIN,created:'2026-10-01T00:00:00Z',perms:[],tabs:[]};
  G.files.list00000000000000000001={id:'list00000000000000000001',name:'CPG HUB_社員一覧',owner:ADMIN,created:'2026-10-01T00:00:00Z',perms:[],tabs:[{title:'社員',sheetId:0,rows:[]}]};
  const A=await device(width);
  await A.p.evaluate(()=>{const d=BB.db.settings.data;d.admin=true;d.ob={legacy:true};d.folder='folder0000000000000000001';d.listId='list00000000000000000001';BB.save();BB.render()});
  await check('社長の端末：「数字」に売上報告（試作・社長だけ）が出て、試作用のシート（架空）を作ると、新しい月から出る '+width+'px',async()=>{
   await open(A.p);assert.match(await A.p.textContent('#stats-sales'),/試作・社長だけ/);
   /* v1.50.54 数字タブのいちばん上がグループ各社売上報告、自動ToDoの期限設定は下のほう。見出しに「押して開く」 */
   const order=await A.p.evaluate(()=>[...document.querySelectorAll('main details[data-fold], main section')].map(e=>e.dataset.fold||e.id||''));
   assert.equal(order.filter(Boolean)[0],'sales','sales is the first item '+order.join(','));assert.ok(order.indexOf('todoDays')>order.indexOf('stats-won'),'todo days below the stats');
   assert.equal(await A.p.$eval('details[data-fold="sales"]>summary',x=>getComputedStyle(x,'::after').content),'"閉じる ▲"');
   await A.p.evaluate(()=>document.querySelector('details[data-fold="sales"]').open=false);assert.equal(await A.p.$eval('details[data-fold="sales"]>summary',x=>getComputedStyle(x,'::after').content),'"タップして開く ▼"');await open(A.p);
   await A.p.click('[data-act=salesdemo]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   const t=await A.p.textContent('#stats-sales');assert.match(t,/試作用のシートを作りました/,t);
   /* 最初は会社のカードを畳み、見出しに売上と粗利。押すと開き、描き直しても開いたまま */
   await A.p.evaluate(()=>{BB.ui.salesCoOpen={};BB.render()});
   assert.deepEqual(await A.p.$$eval('#stats-sales details.sales-card',a=>a.map(d=>[d.dataset.salesCo,d.open])),[['CP',false],['AT',false],['CPY',false]]);
   assert.match(await A.p.textContent('#stats-sales details.sales-card[data-sales-co="CP"]>summary'),/CP本社.*売上 [\d,]+円・粗利 [\d,]+円（\d+%）/);
   await A.p.click('#stats-sales details.sales-card[data-sales-co="AT"]>summary');await A.p.waitForFunction(()=>BB.ui.salesCoOpen&&BB.ui.salesCoOpen.AT===true);await A.p.evaluate(()=>BB.render());
   assert.deepEqual(await A.p.$$eval('#stats-sales details.sales-card',a=>a.map(d=>d.open)),[false,true,false],'remembers the opened card');
   await open(A.p);
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）');assert.ok(f);assert.deepEqual(f.perms,[],'not shared');
   assert.deepEqual(f.tabs.map(x=>x.title),['2026-09','2026-10','2026-11'].flatMap(m=>['会社','担当','受注','確認'].map(p=>m+' '+p)));
   for(const t of f.tabs){assert.deepEqual(t.grid,{frozenRowCount:1,frozenColumnCount:1},t.title+' frozen');if(t.title.endsWith('確認'))assert.ok(t.fmt.some(q=>q.setDataValidation&&q.setDataValidation.rule.condition.type==='BOOLEAN'),t.title+' checkboxes');else assert.ok(t.fmt.some(q=>q.repeatCell&&q.repeatCell.cell.userEnteredFormat.numberFormat&&q.repeatCell.cell.userEnteredFormat.numberFormat.pattern==='#,##0'),t.title+' #,##0');assert.ok(t.fmt.some(q=>q.repeatCell&&q.repeatCell.cell.userEnteredFormat.textFormat),t.title+' header');assert.ok(t.fmt.some(q=>q.updateDimensionProperties),t.title+' widths');assert.equal(t.rows[0][0],'会社',t.title+' header on row 1')}
   assert.deepEqual(f.tabs.map(t=>t.rows[0].length),[15,8,4,5,15,8,4,5,15,8,4,5]);
   assert.ok(f.tabs.flatMap(t=>t.rows).every(r=>!r.some(v=>/株式会社|黒木|大平/.test(String(v)))),'only fictional names');
   assert.deepEqual(tabOf(G.files.list00000000000000000001,'HUBの設定'),[['項目','値'],['売上報告ID',f.id]]);
   assert.match(t,/2026年9月/);assert.match(t,/2026年10月/);assert.match(t,/2026年11月/);assert.match(t,/毎日の確認（今日 9日）/,'the current month opens first');
   await A.p.click('[data-sales-month="2026-10"]');const t1=await A.p.textContent('#stats-sales');
   assert.match(t1,/3社の合計/);assert.match(t1,/25,650,000円/,'10月 = half of 9月 total');
   assert.match(t1,/達成 35%/);assert.match(t,/本社/);
   await A.p.click('[data-sales-month="2026-09"]');assert.match(await A.p.textContent('#stats-sales'),/51,300,000円/);
   for(const sm of await A.p.$$('#stats-sales details:not([data-fold]):not([hidden]):not(.sales-card) > summary'))await sm.click();
   const t2=await A.p.textContent('#stats-sales');
   for(const k of ['前月の金額','最終粗利予想','目標粗利率','確認日　社長','見本 一郎','第1事業部','第2事業部','完了物件','施工中','合計','1件単価','営業外売上','毎日の受注受注Total','更新日'])assert.ok(t2.includes(k),k);
   assert.equal(await A.p.$$eval('#stats-sales .sales-col[data-sales-day^="CP|"]',a=>a.length),30);
   /* v1.50.51 並びは 毎日の受注 → 確認日 → 担当者別。開け閉めの見出しは色の帯 */
   const cpText=await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).textContent();
   assert.ok(cpText.indexOf('毎日の受注')<cpText.indexOf('確認日')&&cpText.indexOf('確認日')<cpText.indexOf('担当者別'),'order');assert.ok(cpText.indexOf('毎日の受注')<cpText.indexOf('売上（実績）'),'v1.50.56 開いたら先頭は毎日の受注（売上の上）');
   assert.ok(await A.p.$$eval('#stats-sales details.sales-open>summary',a=>a.length>0&&a.every(x=>getComputedStyle(x).backgroundColor!=='rgba(0, 0, 0, 0)')),'summaries are colored bands');
   /* v1.50.51 毎日の受注は表が先：曜日・件数・金額・その日までの累計。最後の累計 ＝ 合計 ＝ 受注Total */
   const dt=await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-days').evaluate(t=>[...t.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.replace(/\n/g,' '))));
   assert.match(dt[0][0],/^1日 (火)$/,'2026-09-01 is a Tuesday');const cum=dt.slice(0,-1).at(-1)[3],tot=dt.at(-1);
   assert.equal(cum.split(' ')[0],tot[2],'last cumulative = total');assert.match(tot[0],/合計/);
   const sum=dt.slice(0,-1).reduce((a,r)=>a+Number(r[2].replace(/,/g,'')),0);assert.equal(Number(tot[2].replace(/,/g,'')),sum);
   assert.match(await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).textContent(),new RegExp('受注Total '+dt.slice(0,-1).reduce((a,r)=>a+Number(r[1].replace(/件/,'')),0)+'件・'+tot[2]+'円'));
   /* v1.50.47 人件費・Notes未入力は出さない。担当の名前は1行（縦に割れない） */
   assert.doesNotMatch(t2,/人件費|Notes未入力/);
   /* v1.50.49 名前は1人1回（2行目は状態だけ）。会社のカードは粗利が先で、粗利率を目立たせる */
   const cpNames=await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-st tbody td:first-child').allTextContents();
   assert.equal(cpNames.filter(x=>x.startsWith('見本 一郎')).length,1,'one name per person '+cpNames);assert.ok(cpNames.includes('施工中'),'second row shows only the state');
   /* v1.50.50 並びは 売上 → 粗利（粗利は枠で目立たせる） */
   const mains=await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-main > div').allTextContents();
   assert.match(mains[0],/^売上（実績）/);assert.match(mains[1],/^粗利（実績）.*粗利率 \d+%/);
   assert.match((await A.p.locator('#stats-sales .panel').filter({hasText:'3社の合計'}).locator('.sales-main > div').allTextContents())[0],/^売上/);
   /* 選べるものは色付きのボタン・選んでいるものは ✓ */
   assert.equal(await A.p.$eval('#stats-sales [data-sales-month][aria-pressed="true"]',b=>getComputedStyle(b,'::before').content),'"✓ "');
   assert.notEqual(await A.p.$eval('#stats-sales [data-sales-month][aria-pressed="false"]',b=>getComputedStyle(b).backgroundColor),'rgba(0, 0, 0, 0)');
   assert.match(await A.p.locator('#stats-sales .panel').filter({hasText:'3社の合計'}).locator('.sales-profbox').textContent(),/粗利.*粗利率 \d+%/);
   /* v1.50.50 粗利の枠は横いっぱい */
   assert.ok(await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-profbox').evaluate(b=>b.getBoundingClientRect().width>=b.parentElement.getBoundingClientRect().width-1),'profit box spans the card');
   const nameLines=await A.p.$$eval('#stats-sales .sales-st tbody tr:not(.sales-sum) td:first-child[style*="nowrap"]',a=>a.map(td=>{const r=document.createRange();r.selectNodeContents(td.firstChild);return r.getClientRects().length}));
   assert.ok(nameLines.length>0&&nameLines.every(n=>n<=1),'names on one line '+nameLines);
   assert.deepEqual(await A.p.$$eval('#stats-sales .sales-co h3',a=>a.map(x=>x.textContent)),['CP本社','ATアートテック','CPY横浜'],'company order CP, AT, CPY');
   await A.p.click('#stats-sales .sales-col[data-sales-day="CP|1"]');assert.equal(await A.p.$$eval('#stats-sales details:not([data-fold])[open]',a=>a.length)>0,true,'open sections stay open');
   if(width===400)await A.p.locator('#stats-sales .panel').nth(1).screenshot({path:path.join(require('node:os').tmpdir(),'sales-cp-400.png')});assert.match(await A.p.textContent('#stats-sales'),/1日：(\d+件・[\d,]+円|入力なし)/);
   assert.ok(await overflow(A.p)<=0,'overflow '+await overflow(A.p));
   if(width===400)await A.p.screenshot({path:path.join(require('node:os').tmpdir(),'sales-400.png'),fullPage:true});
  });
  await check('シートの数字を書き換えて「読み直す」と変わる。読めない数字は「読めなかったところ」に出す '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),t9=f.tabs.find(x=>x.title==='2026-09 会社');
   const row=t9.rows.findIndex(r=>r[0]==='CP'&&Number(r[1])===30000000);assert.ok(row>0);t9.rows[row][3]='22,000,000';t9.rows[row+1][4]='あいうえ';
   /* シートの行の順を変えても、画面は CP・AT・CPY の順 */
   {const hd=t9.rows[0],body=t9.rows.slice(1).reverse();t9.rows=[hd,...body]}
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);await A.p.click('[data-sales-month="2026-09"]');
   const t=await A.p.textContent('#stats-sales');assert.match(t,/22,000,000円/);assert.match(t,/読めなかったところがあります：.*「2026-09 会社」\d+行目の「実績粗利」/);assert.deepEqual(await A.p.$$eval('#stats-sales .sales-co h3',a=>a.map(x=>x.textContent.slice(0,3).replace(/[^A-Z]/g,''))),['CP','AT','CPY']);
  });
  await check('前の形（1か月を1つのタブ「2026-08」）も今までどおり読める。表を分けた月でタブが欠けていると「…のタブがありません」と出す '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),tb=n=>f.tabs.find(x=>x.title===n);
   const old=[['売上報告（メモ）'],[],...tb('2026-09 会社').rows,[],...tb('2026-09 担当').rows,[],...tb('2026-09 受注').rows];
   f.tabs.push({title:'2026-08',sheetId:99,rows:old});const day=tb('2026-10 受注');f.tabs.splice(f.tabs.indexOf(day),1);
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.deepEqual(await A.p.evaluate(()=>BB.ui.sales.months.map(m=>[m.key,m.cos.length,m.staff.length,m.days.length>0])),[['2026-08',3,15,true],['2026-09',3,15,true],['2026-10',3,15,false],['2026-11',3,15,true]]);
   await A.p.click('[data-sales-month="2026-10"]');assert.match(await A.p.textContent('#stats-sales'),/「2026-10 受注」のタブがありません/);
   await A.p.click('[data-sales-month="2026-08"]');const t=await A.p.textContent('#stats-sales');assert.match(t,/22,000,000円/,'old single tab is read');assert.doesNotMatch(t,/タブがありません/);
   f.tabs.splice(f.tabs.findIndex(x=>x.title==='2026-08'),1);f.tabs.push(day);
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);await A.p.click('[data-sales-month="2026-10"]');
  });
  await check('毎日の確認（社長・本部長・GM）：今日の済み・未と今月の日数を出し、社長はHUBから今日の確認を付けられる（その1マスだけ書く）。完了の行は薄い色、粗利に粗利率 '+width+'px',async()=>{
   await open(A.p);await A.p.click('[data-sales-month="2026-11"]');
   const box=()=>A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-chk');
   let t=await box().textContent();
   assert.match(t,/社長 未/);assert.match(t,/本部長 未/);assert.match(t,/GM 未/);assert.match(t,/今月（9日まで）：社長 8日・本部長 6日・GM 5日/);
   if(width===400){await box().scrollIntoViewIfNeeded();await A.p.evaluate(()=>window.scrollBy(0,-200));await box().screenshot({path:path.join(require('node:os').tmpdir(),'sales-chk-before-400.png')})}
   G.cellPuts=[];await box().locator('[data-act=salescheck]').click();await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.deepEqual(G.cellPuts,["'2026-11 確認'!C10"],'only the one cell (CP, day 9) is written');
   t=await box().textContent();assert.match(t,/社長 ✓ 済/);assert.match(t,/今月（9日まで）：社長 9日/);assert.equal(await box().locator('[data-act=salescheck]').count(),0);
   assert.match(await A.p.textContent('#stats-sales'),/CP：今日の社長の確認を付けました/);
   assert.match(await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).textContent(),/確認日\s*社長 11\/09/);
   for(const sm of await A.p.$$('#stats-sales details:not([data-fold]):not([hidden]):not(.sales-card) > summary'))await sm.click();
   /* v1.50.53 完了の行の数字は少し太く、施工中の行はふつう */
   assert.deepEqual(await A.p.evaluate(()=>{const w=sel=>getComputedStyle(document.querySelector(sel)).fontWeight;return [w('#stats-sales .sales-st tbody tr.sales-done:not(.sales-sum) td.num'),w('#stats-sales .sales-st tbody tr:not(.sales-done):not(.sales-sum) td.num')]}),['600','400']);
   const done=await A.p.$$eval('#stats-sales tr.sales-done',a=>a.map(r=>r.textContent));assert.ok(done.length>=7&&done.every(x=>/完了/.test(x)),'完了 rows are tinted');
   assert.ok(await A.p.$$eval('#stats-sales tr.sales-done td',a=>a.every(td=>getComputedStyle(td).backgroundColor!=='rgba(0, 0, 0, 0)')));
   assert.match(await A.p.textContent('#stats-sales .sales-st thead'),/金額（円）.*粗利（円）粗利率/);assert.match(await A.p.textContent('#stats-sales .sales-st tbody'),/[\d,]+粗利率 \d+%/);assert.match(await A.p.locator('#stats-sales .sales-st tr.sales-sum').last().textContent(),/合計.*[\d,]+粗利率 \d+%/);
   /* v1.50.48 状態は名前の下。表は右が切れない（横にはみ出さない） */
   assert.match(await A.p.locator('#stats-sales .sales-st tbody tr.sales-done td').first().textContent(),/^見本 .郎完了$/);
   assert.deepEqual(await A.p.$$eval('#stats-sales .sales-st',a=>a.map(t=>{const w=t.closest('.tbl-wrap');return w.scrollWidth-w.clientWidth<=1})),[true,true,true],'staff tables fit');
   assert.match(await A.p.textContent('details[data-fold="sales"] > summary'),/グループ各社売上報告/);
   assert.match(await A.p.textContent('details[data-fold="sales"] > summary .foldsub'),/（旧3社報告書）/);/* v1.50.56 前の呼び名を添える */
   /* 施工中の粗利が空なら「—」。合計に「その他」（営業外売上）は入れない */
   const sums=await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-st tr.sales-sum').allTextContents();
   assert.match(sums[1],/施工中.*—$/);
   const num=s=>Number(s.replace(/[^0-9]/g,''));
   const amts=await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).locator('.sales-st tr.sales-sum td:nth-child(3)').allTextContents(),amt=i=>num(amts[i]);assert.equal(amt(2),amt(0)+amt(1),'合計 = 完了物件 + 施工中 (その他 is not added)');
   assert.match(await A.p.textContent('#stats-sales'),/合計に「その他」の営業外売上は入れていません/);
   assert.ok(await overflow(A.p)<=0,'overflow');
   if(width===400)await A.p.locator('#stats-sales .panel').filter({hasText:'CP本社'}).screenshot({path:path.join(require('node:os').tmpdir(),'sales-check-400.png')});
  });
  await check('本物のシート（名前に「試作」がない）を読んでいるときは「試作用のシートを作り直す」を出さず、札は「社長だけ」 '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）');f.name='CPG HUB_売上報告';
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.equal(await A.p.locator('#stats-sales [data-act=salesdemo]').count(),0);assert.match(await A.p.textContent('#stats-sales .chip'),/^社長だけ$/);
   f.name='CPG HUB_売上報告（試作・架空）';await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.equal(await A.p.locator('#stats-sales [data-act=salesdemo]').count(),1);
  });
  await check('数字を入れる（HUBから）：毎日の受注はない日なら行を足し、ある日はそのマスだけ直す。会社の数字・担当者別も変えたマスだけ書き、会社の更新日を今日にする '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),tb=n=>f.tabs.find(x=>x.title===n);
   await open(A.p);await A.p.click('[data-sales-month="2026-11"]');await A.p.click('#stats-sales .sales-edit > summary');
   assert.match(await A.p.textContent('#stats-sales .sales-edit'),/この日はまだシートにありません/,'day 9 is not in the sheet yet');
   assert.equal(await A.p.inputValue('#se_day'),'9');
   await A.p.fill('#se_day_n','4');await A.p.fill('#se_day_amt','120,000');G.batch=[];G.appends=[];
   await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.deepEqual(G.appends,[['2026-11 受注',['CP',9,4,120000]]],await A.p.textContent('#stats-sales [role=status]:last-of-type')+JSON.stringify(await A.p.evaluate(()=>BB.ui.salesMsg)));
   assert.deepEqual(G.batch.flatMap(b=>b.data.map(d=>[d.range,d.values[0][0]])),[["'2026-11 会社'!O2",'11/09']],'only 更新日 of CP');
   assert.equal(G.batch[0].valueInputOption,'RAW');
   assert.match(await A.p.textContent('#stats-sales'),/シートに保存しました（2か所）/);assert.ok(await A.p.$eval('#stats-sales .sales-edit',d=>d.open),'stays open');
   /* ある日を直す：そのマスだけ */
   await A.p.selectOption('#se_day','3');assert.equal(await A.p.inputValue('#se_day_n'),tb('2026-11 受注').rows.find(r=>r[0]==='CP'&&r[1]===3)[2].toLocaleString('ja-JP'));
   await A.p.fill('#se_day_amt','777,000');G.batch=[];G.appends=[];await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   const r3=tb('2026-11 受注').rows.findIndex(r=>r[0]==='CP'&&r[1]===3)+1;
   assert.deepEqual(G.batch.flatMap(b=>b.data.map(d=>[d.range,d.values[0][0]])),[["'2026-11 受注'!D"+r3,777000]],'更新日 is already today, so only the amount');assert.deepEqual(G.appends,[]);
   /* 会社の数字（AT の実績売上） */
   await A.p.click('[data-sales-edco="AT"]');await A.p.click('[data-sales-edkind="co"]');await A.p.fill('#se_co_3','8,888,888');G.batch=[];
   await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   const atRow=tb('2026-11 会社').rows.findIndex(r=>r[0]==='AT')+1;
   assert.deepEqual(G.batch.flatMap(b=>b.data.map(d=>[d.range,d.values[0][0]])),[["'2026-11 会社'!D"+atRow,8888888],["'2026-11 会社'!O"+atRow,'11/09']]);
   await A.p.click('[data-sales-month="2026-11"]');assert.match(await A.p.locator('#stats-sales .panel').filter({hasText:'ATアートテック'}).textContent(),/8,888,888円/);
   /* 担当者別（CPY の最初の人の金額） */
   await A.p.click('[data-sales-edco="CPY"]');await A.p.click('[data-sales-edkind="st"]');assert.equal(await A.p.locator('#se_st_1_prof').count(),0,'施工中 has no 粗利 input');
   await A.p.fill('#se_st_0_amt','1,234,567');G.batch=[];await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.equal(G.batch[0].data.length,2,'amount + 更新日');assert.match(G.batch[0].data[0].range,/^'2026-11 担当'!G\d+$/);assert.equal(G.batch[0].data[0].values[0][0],1234567);
   assert.ok(await overflow(A.p)<=0,'overflow');
   if(width===400){await A.p.locator('#stats-sales .sales-edit').scrollIntoViewIfNeeded();await A.p.evaluate(()=>scrollBy(0,-160));await A.p.locator('#stats-sales .sales-edit').screenshot({path:path.join(require('node:os').tmpdir(),'sales-edit-400.png')})}
  });
  await check('数字を入れる：シートでほかの人が先に変えていたら・式のマスは、書かずに止める。数字でないものは入れない '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),co=f.tabs.find(x=>x.title==='2026-11 会社');
   await A.p.click('[data-sales-edco="CP"]');await A.p.click('[data-sales-edkind="co"]');
   const cpRow=co.rows.findIndex(r=>r[0]==='CP');co.rows[cpRow][1]=12345;/* ほかの人がシートで目標売上を変えた */
   await A.p.fill('#se_co_1','99,999,999');G.batch=[];await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.deepEqual(G.batch,[],'nothing written');assert.match(await A.p.textContent('#stats-sales'),/書きませんでした。CPの目標売上がシートで変わっています（今は 12345）/);
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);await A.p.click('[data-sales-month="2026-11"]');
   co.formulas={[cpRow+','+2]:'=C9*2'};await A.p.fill('#se_co_2','1');G.batch=[];await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.deepEqual(G.batch,[]);assert.match(await A.p.textContent('#stats-sales'),/CPの目標粗利は式なので書きません/);delete co.formulas;
   await A.p.fill('#se_co_2','あいう');G.batch=[];await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.deepEqual(G.batch,[]);assert.match(await A.p.textContent('#stats-sales'),/CPの目標粗利は数字で入れてください/);
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);await A.p.click('[data-sales-month="2026-11"]');
   G.batch=[];await A.p.click('[data-act=salessave]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);assert.match(await A.p.textContent('#stats-sales'),/変わったところはありません/);assert.deepEqual(G.batch,[]);
   assert.deepEqual(A.errors,[]);
  });
  await check('ドライブから見えないシート（HUB以外で作ったシート）でも：名前は表計算の題名から取り、今日の更新は会社の「更新日」で見る。名前が分からなくても作り直すボタンは出さない '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),co=f.tabs.find(x=>x.title==='2026-11 会社');
   G.driveHidden=true;f.name='CPG HUB_売上報告';for(const r of co.rows.slice(1))r[14]='11/03';
   await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.match(await A.p.textContent('#stats-sales .banner'),/今日はまだ更新されていません。シートの最終更新 11\/3（会社の更新日）/);
   assert.equal(await A.p.locator('#stats-sales [data-act=salesdemo]').count(),0);assert.match(await A.p.textContent('#stats-sales .chip'),/^社長だけ$/);
   co.rows[1][14]='11/09';await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.match(await A.p.textContent('#stats-sales'),/シートの最終更新 11\/9（会社の更新日）（今日）/);assert.equal(await A.p.evaluate(()=>BB.ui.sales.today),true);
   /* 名前も取れないとき（題名も読めない）でも、作り直すボタンは出さない */
   const save=f.name;f.name='';await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);assert.equal(await A.p.locator('#stats-sales [data-act=salesdemo]').count(),0);
   f.name='CPG HUB_売上報告（試作・架空）';G.driveHidden=false;await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
  });
  await check('毎日の更新：同期のたびに売上報告を読み直す。今日（日本時間）に更新がなければ「今日はまだ更新されていません」を目立たせる '+width+'px',async()=>{
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）');
   /* 入力の試験で今日にした会社の「更新日」を前の日に戻す（ドライブの更新日時で見る） */
   for(const r of f.tabs.find(x=>x.title==='2026-11 会社').rows.slice(1))r[14]='11/03';await A.p.click('[data-act=salesload]');await A.p.waitForFunction(()=>!BB.ui.salesBusy);
   assert.match(await A.p.textContent('#stats-sales'),/シートの最終更新 11\/9 10:30（今日）/);
   f.modified='2026-11-08T14:59:00Z';/* 11/8 23:59（日本時間）＝昨日 */
   let rows=await sync(A.p);await A.p.waitForFunction(()=>BB.ui.gsync.rows.some(x=>x.name==='売上報告'));rows=await A.p.evaluate(()=>BB.ui.gsync.rows);
   const sr=rows.find(x=>x.name==='売上報告');assert.equal(sr.ok,'warn');assert.match(sr.msg,/今日はまだ更新されていません（最終更新 11\/8 23:59）/);
   assert.match(await A.p.textContent('.gsync'),/△ 売上報告：/);assert.doesNotMatch(await A.p.textContent('.gsync'),/× 売上報告/);/* v1.50.56 エラーではなく△（お知らせ） */
   { const own=rows.filter(x=>x.ok!==true&&x.ok!=='warn'&&x.name!=='日付の変わった案件'&&x.name!=='社員の記録');const lab=await A.p.evaluate(()=>BB.homeSyncLabels().join('／'));assert.equal((lab.match(/同期エラー (\d+)件/)||[0,'0'])[1],String(own.length),'今日まだ更新されていないのは同期エラーに数えない'); }
   await open(A.p);const b=await A.p.textContent('#stats-sales .banner');assert.match(b,/今日はまだ更新されていません。シートの最終更新 11\/8 23:59/);
   if(width===400)await A.p.locator('#stats-sales').screenshot({path:path.join(require('node:os').tmpdir(),'sales-stale-400.png')});
   const t9=f.tabs.find(x=>x.title==='2026-10 会社'),row=t9.rows.findIndex(r=>r[0]==='CP'&&r[3]!==undefined&&/^\d/.test(String(r[3])));t9.rows[row][3]='12,345,000';
   f.modified='2026-11-08T15:00:00Z';/* 11/9 0:00（日本時間）＝今日 */
   await sync(A.p);await A.p.waitForFunction(()=>BB.ui.gsync.rows.some(x=>x.name==='売上報告'));
   const sr2=(await A.p.evaluate(()=>BB.ui.gsync.rows)).find(x=>x.name==='売上報告');assert.equal(sr2.ok,true);assert.match(sr2.msg,/今日の更新を読みました（11\/9 00:00）/);
   await open(A.p);await A.p.click('[data-sales-month="2026-10"]');const t=await A.p.textContent('#stats-sales');assert.match(t,/12,345,000円/,'read again by sync');assert.doesNotMatch(t,/今日はまだ更新されていません/);
   assert.ok(await overflow(A.p)<=0);assert.deepEqual(A.errors,[]);
  });
  /* v1.50.60 今月の受注（今日まで）：社長の同期で会社の数字のファイルに書き出し、ホームのタイルに出す。社員の端末はそれを読んで同じタイルを出す */
  await check('今月の受注のタイル：社長の同期で会社の数字に書き出し、社員の端末も読んで出す '+width+'px',async()=>{
   for(const [id,co] of [['numcp000000000000000001','CP'],['numat000000000000000001','AT']])G.files[id]={id,name:'CPG HUB_会社の数字_'+co,owner:ADMIN,created:'2026-10-01T00:00:00Z',perms:[],readers:[STAFF],tabs:[{title:'会社の数字',sheetId:0,rows:[]},{title:'情報',sheetId:1,rows:[['項目','値'],['会社',co]]}]};
   await A.p.evaluate(()=>{BB.db.settings.data.numbers={CP:'numcp000000000000000001',AT:'numat000000000000000001'};BB.save()});
   const f=Object.values(G.files).find(x=>x.name==='CPG HUB_売上報告（試作・架空）'),days=tabOf(f,'2026-11 受注').slice(1).filter(r=>Number(r[1])<=9);
   const want=co=>{const ds=days.filter(r=>r[0]===co),n=v=>Number(String(v??'').replace(/,/g,''))||0;return [ds.reduce((s,r)=>s+n(r[2]),0),ds.reduce((s,r)=>s+n(r[3]),0)]};
   await sync(A.p);await A.p.waitForFunction(()=>BB.ui.gsync.rows.some(x=>x.name==='売上報告'));await A.p.evaluate(()=>BB.go('home'));
   for(const id of ['numcp000000000000000001','numat000000000000000001']){const rows=tabOf(G.files[id],'今月の受注');assert.ok(rows&&rows.length===4,JSON.stringify(rows));assert.deepEqual(rows[1].slice(0,3),['CP',...want('CP').map(String)]);assert.equal(rows[1][6],'2026-11-09')}
   const tile=await A.p.textContent('#home-orders');
   assert.match(tile,/今月の受注（11\/9まで）/);
   for(const co of ['CP','AT','CPY']){const [n,a]=want(co);assert.ok(tile.includes(co+n+'件 '+a.toLocaleString('ja-JP')+'円'),co+' '+tile)}
   const [tn,ta]=['CP','AT','CPY'].map(want).reduce((s,x)=>[s[0]+x[0],s[1]+x[1]],[0,0]);assert.ok(tile.includes('合計'+tn+'件 '+ta.toLocaleString('ja-JP')+'円'),tile);
   assert.match(tile,/今日 /);assert.doesNotMatch(tile,/粗利/);
   /* 1件単価（客単価）：金額÷件数（四捨五入） */
   for(const co of ['CP','AT','CPY']){const [n,a]=want(co);if(n)assert.ok(tile.includes('1件単価 '+Math.round(a/n).toLocaleString('ja-JP')+'円'),co+' unit '+tile)}
   assert.ok(tile.includes('1件単価 '+Math.round(ta/tn).toLocaleString('ja-JP')+'円'),'total unit');
   assert.equal(await A.p.$eval('#home-summary .tiles',t=>t.firstElementChild.id),'home-orders','first tile');
   assert.ok(await overflow(A.p)<=0);assert.deepEqual(A.errors,[]);
   if(width===400)await A.p.locator('#home-orders').screenshot({path:path.join(require('node:os').tmpdir(),'ord-tile-400.png')});
   /* v1.50.61 薄い青の背景。社長の端末は「タップして数字を入れる ›」があり、押すと売上報告の「数字を入れる」（今月）が開く */
   assert.equal(await A.p.$eval('#home-orders',e=>getComputedStyle(e).backgroundColor),await A.p.evaluate(()=>{const d=document.createElement('div');d.style.background='var(--blue-soft)';document.body.appendChild(d);const c=getComputedStyle(d).backgroundColor;d.remove();return c}));
   assert.match(await A.p.textContent('#home-orders .ord-go'),/タップして数字を入れる/);
   await A.p.evaluate(()=>{BB.ui.salesMonth='2026-10';BB.ui.salesEdOpen=false;BB.render()});
   await A.p.click('#home-orders');assert.equal(await A.p.evaluate(()=>BB.ui.view),'stats');
   assert.equal(await A.p.$eval('#sales-edit',d=>d.open),true);assert.match(await A.p.textContent('#sales-edit>summary'),/数字を入れる（11月）/);
   assert.ok(await A.p.$eval('details[data-fold="sales"]',d=>d.open));
   const top=await A.p.$eval('#sales-edit',e=>e.getBoundingClientRect().top);assert.ok(top>=0&&top<900,'scrolled to the input '+top);
   await A.p.evaluate(()=>{BB.ui.salesEdOpen=false;BB.go('home')});
   /* 社員の端末：自分の記録シートの「会社の数字の場所」から読む */
   G.files.rec00000000000000000001={id:'rec00000000000000000001',name:'記録',owner:STAFF,created:'2026-10-01T00:00:00Z',perms:[],tabs:[{title:'会社の数字の場所',sheetId:0,rows:[['会社','ファイルID'],['CP','numcp000000000000000001']]}]};
   const S=await device(width,s=>{window.__acct=s},STAFF);
   await S.p.evaluate(()=>{const d=BB.db.settings.data;d.ob={legacy:true};d.sheetId='rec00000000000000000001';BB.save();BB.go('home')});
   assert.equal(await S.p.$$eval('#home-orders',a=>a.length),0,'nothing before it arrives');
   await S.p.evaluate(()=>BB.gAuthorize(true));await S.p.evaluate(()=>BB.ordLoad());await S.p.evaluate(()=>BB.render());
   assert.equal(await S.p.textContent('#home-orders'),tile.replace(/タップして数字を入れる ›$/,''),'same tile on the staff device (without the input link)');
   assert.equal(await S.p.$$eval('#home-orders .ord-go',a=>a.length),0);assert.equal(await S.p.$eval('#home-orders',e=>e.tagName),'DIV');
   if(width===400)await S.p.locator('#home-orders').screenshot({path:path.join(require('node:os').tmpdir(),'ord-tile-staff-400.png')});
   assert.ok(await overflow(S.p)<=0);assert.deepEqual(S.errors,[]);await S.c.close();
  });
  await A.c.close();
  /* 社員の端末には出ない */
  const E=await device(width);
  await check('社員の端末（社長でない）には売上報告が出ない '+width+'px',async()=>{
   await E.p.evaluate(()=>{BB.db.settings.data.ob={legacy:true};BB.save();BB.go('stats')});
   assert.equal(await E.p.$$eval('#stats-sales',a=>a.length),0);assert.deepEqual(E.errors,[]);
  });
  await E.c.close();
 }
 /* 読み取りの単体：見出しの行を探す・行の位置が前後してもよい・会社名の間違い */
 await check('見出しの行を探して読む（前に空行やメモがあってもよい）。3つの表（会社・担当者別・毎日の受注）を読み、知らない会社名・状態は読めなかったところに出す',async()=>{
  const P=await device(400);
  const r=await P.p.evaluate(()=>BB.salesParse([['メモ'],[],
   ['会社','目標売上','目標粗利','実績売上','実績粗利','前月売上','前月粗利','最終粗利予想','人件費','Notes未入力','社長確認日','本部長確認日','GM確認日','GMの名前','更新日'],
   ['CP','1,000','500','800','300','700','200','','100','2','10/2','10/1','10/1','見本 GM','10/3'],['XX','1','1','1','1','','','','','','','','','',''],[],
   ['会社','区分','担当','状態','物件数','基準値','金額','粗利'],['AT','営業①','見本 九郎','完了','2','','100','50'],['AT','営業①','見本 九郎','途中','1','','30','5'],[],
   ['会社','日','受注件数','受注金額'],['CP','1','3','55,000'],['CP','40','1','1']]));
  assert.deepEqual(r.cos.map(c=>[c.co,c['目標売上'],c['実績売上'],c['前月粗利'],c['最終粗利予想'],c['人件費'],c['Notes未入力'],c['社長確認日'],c['GMの名前'],c['更新日']]),[['CP',1000,800,200,null,100,2,'10/2','見本 GM','10/3']]);
  assert.deepEqual(r.staff.map(x=>[x.co,x.group,x.name,x.state,x.n,x.amt]),[['AT','営業①','見本 九郎','完了',2,100],['AT','営業①','見本 九郎','途中',1,30]]);
  assert.deepEqual(r.days,[{co:'CP',day:1,n:3,amt:55000,row:12}]);assert.deepEqual(r.cos.map(c=>c.row),[4]);
  const bad=r.bad.join('／');assert.match(bad,/会社「XX」/);assert.match(bad,/状態「途中」/);assert.match(bad,/「日」/);
  await P.c.close();
 });
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
