/* v1.50.17 受付番号の記号：人ごとのアルファベット2文字。社長の端末が自動で振って社員一覧と各社員の記録シートに書き、社員の端末は同期で受け取って新しい受付番号に使う。
   Synthetic fixtures only (fictional names, example.com). In-memory Google Sheets; no live Google requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..');
const hook='window.CN={get db(){return DB},get ui(){return ui},go,render,save,dataSync,sharedRestore,corpRun,roBuild,gDesc,numRow,dataRows,newCaseCode,caseCodesAssign,caseCodeWrite,codeCheck,codeSuggest,roleVal,codeNorm,casePrefix,'+
 'setup(){gAuthorize=async()=>{G.token="synthetic";G.scope=GSCOPE+" "+DSCOPE;G.exp=Date.now()+3600000};gAuthorize();adminSync=async()=>({});corpWait=async()=>{}}};';
const A='synthetic-a-sheet-0000000001',B='synthetic-b-sheet-0000000002',C='synthetic-c-sheet-0000000003',DX='synthetic-d-sheet-0000000004';
const LIST='synthetic-list-0000000000001';
const staff=[
 {name:'見本 一郎',email:'a@example.com',sheetId:A,company:'CP',role:'社員'},
 {name:'見本 二郎',email:'b@example.com',sheetId:B,company:'CPY',role:'社員',caseCode:'QX'},
 {name:'見本 三郎',email:'c@example.com',sheetId:C,company:'AT',role:'社員'},
 {name:'見本 四郎',email:'d@example.com',sheetId:DX,company:'CP',role:'社員',removed:true,caseCode:'MK'}];
const info=[['項目','値']];
function seed(){return {[A]:{'案件':[['受付番号']],'情報':info},[B]:{'案件':[['受付番号']],'情報':info,'受付番号の記号':[['受付番号の記号'],['QX']]},[C]:{'案件':[['受付番号']],'情報':info},[LIST]:{'社員':[]}};}
let server,browser,origin;const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
async function device({store,deny=new Set(),width=400,fail=new Set()}){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 const J=(r,o,st=200)=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 const tabOf=x=>{let t=decodeURIComponent(x).replace(/!.*$/,'');if(t.startsWith("'"))t=t.slice(1,-1).replace(/''/g,"'");return t};
 await c.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.origin===origin){if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});return r.continue()}
  if(u.hostname!=='sheets.googleapis.com')return J(r,{});
  const m=decodeURIComponent(u.pathname).match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/),id=m[1],rest=m[2],method=r.request().method();
  if(deny.has(id))return J(r,{error:{code:403}},403);
  if(fail.has(id))return J(r,{error:{code:404}},404);
  const sh=store[id];if(!sh)return J(r,{error:{code:404}},404);
  if(rest===''&&method==='GET')return J(r,{sheets:Object.keys(sh).map(title=>({properties:{title,sheetId:1,gridProperties:{rowCount:1000,columnCount:40}}}))});
  if(rest===':batchUpdate'){for(const q of r.request().postDataJSON().requests||[]){if(q.addSheet)sh[q.addSheet.properties.title]=[];if(q.updateCells)sh['案件']=q.updateCells.rows.map(x=>(x.values||[]).map(v=>v.userEnteredValue?Object.values(v.userEnteredValue)[0]:'')).filter(x=>x.some(y=>y!==''))}return J(r,{})}
  if(rest==='/values:batchGet')return J(r,{valueRanges:u.searchParams.getAll('ranges').map(x=>({values:sh[tabOf(x)]||[]}))});
  const v=rest.match(/^\/values\/([^:]+)(:clear)?$/);if(v){const t=tabOf(v[1]);if(v[2]){sh[t]=[];return J(r,{})}const body=r.request().postDataJSON();const vals=body.values.map(x=>x.map(y=>y));while(vals.length&&vals[vals.length-1].every(y=>y===''))vals.pop();sh[t]=vals.map(x=>{const a=x.slice();while(a.length&&a[a.length-1]==='')a.pop();return a});return J(r,{})}
  return J(r,{});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-06T03:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.CN);
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>{const d=document.documentElement;return Math.max(d.scrollWidth-d.clientWidth,...[...document.querySelectorAll('.panel,section,.row,.card,.seg')].map(x=>x.scrollWidth-x.clientWidth))});
async function newCase(p,prop){
 await p.evaluate(()=>CN.go('new'));await p.click('[data-nco="CP"]');await p.fill('#n_prop',prop);await p.fill('#n_client','見本管理');
 await p.evaluate(()=>document.getElementById('newForm').requestSubmit());
 return p.evaluate(prop=>CN.db.cases.find(c=>c.property===prop)?.id,prop);
}
async function main(){
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const store=seed(),all=[];
 const admin=async()=>{const d=await device({store});all.push(d);await d.p.evaluate(({staff,LIST})=>{CN.setup();const d=CN.db.settings.data;d.admin=true;d.ob={legacy:true};d.listId=LIST;d.staff=JSON.parse(JSON.stringify(staff));CN.save()},{staff,LIST});return d};
 await check('記号の作り方：自動はアルファベット2文字・I/Oなし・CP/ATなし・使い済みは避ける。手で入れる記号は I/O も可',async()=>{
  const d=await admin();
  const r=await d.p.evaluate(()=>{const out=[];for(let i=0;i<300;i++)out.push(CN.newCaseCode([{caseCode:'QX'}]));
   const full=[];for(const x of 'ABCDEFGHJKLMNPQRSTUVWXYZ')for(const y of 'ABCDEFGHJKLMNPQRSTUVWXYZ')if(!(x+y==='ZZ'))full.push({caseCode:x+y});
   return {out,last:CN.newCaseCode(full),none:CN.newCaseCode(full.concat({caseCode:'ZZ'})),norm:[CN.codeNorm(' qx '),CN.codeNorm('CP'),CN.codeNorm('OH'),CN.codeNorm('Q1'),CN.codeNorm('ABC'),CN.codeNorm('ｏｈ'),CN.codeNorm('at')]}});
  for(const c of r.out){assert.match(c,/^[A-HJ-NP-Z]{2}$/);assert.ok(!['CP','AT','QX'].includes(c),c)}
  assert.ok(new Set(r.out).size>50,'random');assert.equal(r.last,'ZZ');assert.equal(r.none,'');
  assert.deepEqual(r.norm,['QX','','OH','','ABC','OH',''],'manual codes may use I/O; full-width and lower case are accepted; 3 letters allowed since v1.50.23');
 });
 await check('社長：共有を合わせるときに、記号のない人に振る。共有を外した人・決まっている人の記号は変えない。重なりは下の人だけ振り直す',async()=>{
  const d=all[0];
  const r=await d.p.evaluate(()=>{const st=CN.db.settings.data.staff;const log=CN.caseCodesAssign(st);CN.save();
   const dup=[{name:'甲',sheetId:'x1',caseCode:'KM'},{name:'乙',sheetId:'x2',caseCode:'km'},{name:'丙',sheetId:'x3',caseCode:'CP'}];const log2=CN.caseCodesAssign(dup);
   return {codes:st.map(s=>[s.name,s.caseCode||'']),log,dup:dup.map(s=>s.caseCode),log2,again:CN.caseCodesAssign(st)}});
  const code=Object.fromEntries(r.codes);
  assert.equal(code['見本 二郎'],'QX');assert.equal(code['見本 四郎'],'MK');
  for(const n of ['見本 一郎','見本 三郎'])assert.match(code[n],/^[A-HJ-NP-Z]{2}$/);
  assert.equal(new Set(Object.values(code)).size,4,'unique');
  assert.equal(r.log.length,2);assert.deepEqual(r.again,[],'second time assigns nothing');
  assert.equal(r.dup[0],'KM');assert.notEqual(r.dup[1],'KM');assert.match(r.dup[1],/^[A-HJ-NP-Z]{2}$/);assert.notEqual(r.dup[2],'CP');assert.equal(r.log2.length,2);
 });
 await check('社長：各社員の記録シートに「受付番号の記号」を書き、同じなら書かない',async()=>{
  const d=all[0];
  const w1=await d.p.evaluate(async()=>{const out=[];for(const s of CN.db.settings.data.staff.filter(s=>!s.removed))out.push(await CN.caseCodeWrite(s));return out});
  const code=Object.fromEntries(await d.p.evaluate(()=>CN.db.settings.data.staff.map(s=>[s.name,s.caseCode])));
  assert.deepEqual(w1,[true,false,true],'B already had QX');
  assert.deepEqual(store[A]['受付番号の記号'],[['受付番号の記号'],[code['見本 一郎']]]);
  assert.deepEqual(store[C]['受付番号の記号'],[['受付番号の記号'],[code['見本 三郎']]]);
  const puts=[];d.p.on('request',r=>{if(r.method()!=='GET')puts.push(r.url())});
  const w2=await d.p.evaluate(async()=>{const out=[];for(const s of CN.db.settings.data.staff.filter(s=>!s.removed))out.push(await CN.caseCodeWrite(s));return out});
  assert.deepEqual(w2,[false,false,false]);assert.deepEqual(puts,[]);
  assert.deepEqual(d.errors,[]);
 });
 await check('社長：「役割を変える」で名前から決めた記号を入れられる。案は今の記号、なければGmailの頭2文字。重なり・形の違いは保存の前に止める',async()=>{
  const d=all[0];
  const r=await d.p.evaluate(()=>{const st=CN.db.settings.data.staff;
   return {cur:CN.codeSuggest(st[1]),mail:CN.codeSuggest({email:'oh.sample@example.com',sheetId:'zz'}),taken:CN.codeSuggest({email:'qx.sample@example.com',sheetId:'zz'}),digits:CN.codeSuggest({email:'12ab@example.com',sheetId:'zz'}),
    dup:CN.codeCheck({caseCode:'QX'},st[0].sheetId),dupRemoved:CN.codeCheck({caseCode:'MK'},st[0].sheetId),self:CN.codeCheck({caseCode:'QX'},st[1].sheetId),bad:CN.codeCheck({codeBad:'1A'},st[0].sheetId),ok:CN.codeCheck({caseCode:'KH'},st[0].sheetId)}});
  assert.equal(r.cur,'QX');assert.equal(r.mail,'OH');assert.equal(r.taken,'','already used by someone else');assert.equal(r.digits,'AB');
  assert.match(r.dup,/「QX」は、見本 二郎さんが使っています/);assert.match(r.dupRemoved,/見本 四郎さん/,'removed staff codes are not reused');
  assert.equal(r.self,'');assert.match(r.bad,/アルファベット2〜3文字/);assert.equal(r.ok,'');
  /* 画面：役割を変える → 欄に今の記号。重なる記号では保存を始めない */
  await d.p.evaluate(()=>{CN.ui.dRole=0;CN.go('stats')});
  assert.equal(await d.p.$eval('#dr_code',e=>e.value),await d.p.evaluate(()=>CN.db.settings.data.staff[0].caseCode));
  assert.ok(await overflow(d.p)<=1);
  await d.p.fill('#dr_code','qx');await d.p.evaluate(()=>document.querySelector('[data-act="droledo"]').click());
  assert.match(await d.p.evaluate(()=>document.body.textContent),/「QX」は、見本 二郎さんが使っています/);
  assert.equal(await d.p.evaluate(()=>!!CN.ui.dbusy),false,'not started');
  await d.p.evaluate(()=>{CN.ui.dRole=0;CN.render()});await d.p.fill('#dr_code','ｋｈ');
  assert.deepEqual(await d.p.evaluate(()=>{const v=CN.roleVal('dr');return [v.caseCode,v.codeBad||'']}),['KH','']);
  await d.p.fill('#dr_code','');assert.equal(await d.p.evaluate(()=>'caseCode' in CN.roleVal('dr')),false,'empty keeps the current code');
  await d.p.evaluate(()=>{CN.ui.dRole=null;CN.render()});
  assert.deepEqual(d.errors,[]);
 });
 await check('社長の社員一覧に記号が出る（400px ではみ出さない）',async()=>{
  const d=all[0];await d.p.evaluate(()=>{CN.ui.dview='admin';CN.go('stats')});
  const t=await d.p.evaluate(()=>document.body.textContent);assert.match(t,/受付番号 QX-/);assert.match(t,/受付番号 MK-/);
  assert.ok(await overflow(d.p)<=1);
 });
 await check('社員の端末：同期で記号を受け取り、新しい受付番号は「記号-番号」。今までの番号は変えない。番号は続きから',async()=>{
  const d=await device({store});all.push(d);
  await d.p.evaluate(B=>{CN.setup();const d=CN.db.settings.data;d.ob={legacy:true};d.sheetId=B;CN.db.settings.rcpt.name='見本 二郎';CN.save()},B);
  assert.match(String(await newCase(d.p,'見本荘その1')),/^U-\d{4}$/,'before the code arrives');
  await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});
  assert.equal(await d.p.evaluate(()=>CN.casePrefix()),'QX');
  const ids=await d.p.evaluate(()=>CN.db.cases.map(c=>c.id));
  const id2=await newCase(d.p,'見本荘その2');
  const n1=Number(ids.find(x=>/^U-/.test(x)).slice(2));assert.equal(id2,'QX-'+String(n1+1).padStart(4,'0'));
  assert.ok(await d.p.evaluate(()=>CN.db.cases.some(c=>c.property==='見本荘その1'&&/^U-/.test(c.id))),'old id kept');
  await d.p.evaluate(()=>{CN.ui.dview='mine';CN.go('stats')});assert.match(await d.p.evaluate(()=>document.body.textContent),/受付番号の記号：QX-/);
  assert.ok(await overflow(d.p)<=1);
  assert.deepEqual(d.errors,[]);
 });
 await check('社員の端末：別の記録シートにつなぎ直すと、前の記号は使わない（U に戻る）',async()=>{
  const d=all[all.length-1];await d.p.evaluate(C=>{CN.db.settings.data.sheetId=C;CN.save()},C);
  assert.equal(await d.p.evaluate(()=>CN.casePrefix()),'U');
 });
 /* v1.50.23 記号は2文字か3文字（例：小泉→KOI） */
 await check('3文字の記号：形の確認（全角・小文字をそろえる、CP・AT・CPY・CPG と4文字は使えない）。KH と KHI は別の記号。同じ3文字は止める',async()=>{
  const d=all[0];
  const r=await d.p.evaluate(()=>({norm:['koi','ＫＯＩ',' Khi ','CPY','cpg','CP','ABCD','K1I','OH'].map(CN.codeNorm),
   kh:CN.codeCheck({caseCode:'KHI'},'x',[{name:'甲',sheetId:'y',caseCode:'KH'}]),dup:CN.codeCheck({caseCode:'KOI'},'x',[{name:'乙',sheetId:'y',caseCode:'KOI'}]),
   bad:(()=>{document.body.insertAdjacentHTML('beforeend','<input id="zz_code" value="cpy">');const v=CN.roleVal('zz');document.getElementById('zz_code').remove();return CN.codeCheck(v,'x',[])})(),
   auto:Array.from({length:100},()=>CN.newCaseCode([])).every(c=>/^[A-HJ-NP-Z]{2}$/.test(c))}));
  assert.deepEqual(r.norm,['KOI','KOI','KHI','','','','','','OH']);
  assert.equal(r.kh,'','KH and KHI are different codes');assert.match(r.dup,/「KOI」は、乙さんが使っています/);
  assert.match(r.bad,/アルファベット2〜3文字/);assert.equal(r.auto,true,'automatic codes stay 2 letters');
 });
 const K='synthetic-koi-sheet-00000000001';store[K]={'案件':[['受付番号']],'情報':info,'受付番号の記号':[['受付番号の記号'],['KOI']]};
 await check('3文字の記号の社員の端末：受付番号は「KOI-0001」。案件一覧・番号で探す・カレンダーの説明・記録シートへの書き出し・数字の画面で壊れない（400px）',async()=>{
  const d=await device({store});all.push(d);
  await d.p.evaluate(K=>{CN.setup();const x=CN.db.settings.data;x.ob={legacy:true};x.sheetId=K;CN.db.settings.rcpt.name='見本 小三';CN.save()},K);
  await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});assert.equal(await d.p.evaluate(()=>CN.casePrefix()),'KOI');
  assert.equal(await newCase(d.p,'見本荘こ1'),'KOI-0001');assert.equal(await newCase(d.p,'見本荘こ2'),'KOI-0002');
  await d.p.evaluate(()=>{CN.ui.q='';CN.go('cases')});let t=await d.p.textContent('main');assert.match(t,/KOI-0001/);assert.match(t,/KOI-0002/);
  await d.p.fill('#q','KOI-0002');t=await d.p.textContent('main');assert.match(t,/見本荘こ2/);assert.doesNotMatch(t,/見本荘こ1/,'search by the 3-letter number');
  assert.match(await d.p.evaluate(()=>CN.gDesc(CN.db.cases.find(c=>c.id==='KOI-0002'))),/^受付番号：KOI-0002\n/);
  await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});
  assert.deepEqual(store[K]['案件'].slice(1).map(r=>r[0]).sort(),['KOI-0001','KOI-0002'],'written to the record sheet');
  await d.p.evaluate(()=>{CN.ui.q='';CN.go('stats')});assert.ok(await overflow(d.p)<=1);
  await d.p.evaluate(()=>CN.go('cases'));assert.ok(await overflow(d.p)<=1);
  assert.deepEqual(d.errors,[]);
 });
 await check('3文字の記号：空の端末で共有の記録から取り込むと、番号の続き（KOI-0003）から付く',async()=>{
  const d=await device({store});all.push(d);
  await d.p.evaluate(K=>{CN.setup();const x=CN.db.settings.data;x.ob={legacy:true};x.sheetId=K;CN.db.settings.rcpt.name='見本 小三';CN.save()},K);
  await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});
  assert.ok(await d.p.evaluate(()=>!!CN.ui.sheetGuard),'empty device is stopped before writing');
  await d.p.evaluate(async()=>{await CN.sharedRestore()});
  assert.deepEqual(await d.p.evaluate(()=>CN.db.cases.map(c=>c.id).sort()),['KOI-0001','KOI-0002']);assert.equal(await d.p.evaluate(()=>CN.db.seq),2);
  await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});assert.equal(await newCase(d.p,'見本荘こ3'),'KOI-0003');await d.p.evaluate(async()=>{await CN.dataSync(()=>{})});
  assert.deepEqual(d.errors,[]);
 });
 await check('3文字の記号：社長の端末で社員の記録を読み込むと、案件一覧に KOI の番号で出て、会社の数字の行も作れる',async()=>{
  const d=all[0];
  await d.p.evaluate(K=>{const x=CN.db.settings.data;x.staff=[{name:'見本 小三',email:'koi@example.com',sheetId:K,company:'CP',role:'社員',caseCode:'KOI'}];CN.save()},K);
  const data=await d.p.evaluate(async()=>(await CN.corpRun()).map(x=>[x.ok,(x.cases||[]).map(r=>r['受付番号']).sort()]));
  assert.deepEqual(data,[[true,['KOI-0001','KOI-0002','KOI-0003']]]);
  await d.p.evaluate(()=>{CN.ui.q='';CN.go('cases')});await require('./scope-selection-helper').allPeople(d.p);const t=await d.p.textContent('main');assert.match(t,/KOI-0001/);assert.match(t,/KOI-0003/);
  const n=await d.p.evaluate(()=>(CN.ui.corpRO||[]).filter(c=>/^KOI-/.test(c.id)).map(c=>CN.numRow(c).length));assert.ok(n.length===3&&n.every(x=>x>0),'company-number rows: '+JSON.stringify(n));
  assert.ok(await overflow(d.p)<=1);assert.deepEqual(d.errors,[]);
 });
 for(const d of all)await d.c.close();
 console.log('ALL PASS',results.length);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
