/* Synthetic-only receipt fixtures. No live Google requests, credentials, or user documents. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'..','receipt-test-output'),KEY='workhub_proto_v1',OLD_KEY='R-0010-1';
const hook='window.testHub={get selecting(){return receiptSelecting},get db(){return DB},ui,go,emptyDB,RECEIPT_DEFAULTS,save,render,photoPut,photoGet,rSaveForm,rSend,rBook,photoNames,backupPhotos,driveUpload,G,D,RS,fillPhotos,extOf};';
const results=[];let server,browser,origin,fixture,JPEG;
function syntheticPdf(){
 const chunks=['%PDF-1.4\n'],offsets=[0];
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const stream='BT /F1 12 Tf 15 55 Td (SYNTHETIC RECEIPT TEST ONLY) Tj ET';objects.push('<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(chunks.join('')));chunks.push((i+1)+' 0 obj\n'+objects[i]+'\nendobj\n')}
 const start=Buffer.byteLength(chunks.join(''));chunks.push('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');for(const n of offsets.slice(1))chunks.push(String(n).padStart(10,'0')+' 00000 n \n');chunks.push('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');return Buffer.from(chunks.join(''));
}
const PDF=syntheticPdf(),PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLlkAAAAASUVORK5CYII=','base64');
const pdfFile=(name='scan_synthetic.pdf',mimeType='application/pdf')=>({name,mimeType,buffer:PDF});
const pngFile=(name='image_synthetic.png')=>({name,mimeType:'image/png',buffer:PNG});
async function setup(db=fixture,width=390){
 const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block',acceptDownloads:true});
 await ctx.addInitScript(({db,KEY})=>{if(!localStorage.getItem('receiptTestSeed')){if(db)localStorage.setItem(KEY,JSON.stringify(db));localStorage.setItem('toshi_v5','PAPA_MUST_NOT_CHANGE');localStorage.setItem('toshi_hub_safe_v1','PAPA_HISTORY_MUST_NOT_CHANGE');localStorage.setItem('receiptTestSeed','1')}},{db,KEY});
 const requests=[],errors=[];
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if(url===origin+'/'||url===origin+'/index.html'){
   const source=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(source.includes('corpKeepLoad();\nrender();'),'test hook target must remain present');
   return route.fulfill({contentType:'text/html',body:source.replace('corpKeepLoad();\nrender();',hook+'\ncorpKeepLoad();\nrender();')});
  }
  if(url.startsWith(origin+'/'))return route.continue();
  requests.push({url,method:req.method(),headers:req.headers(),body:req.postDataBuffer()});
  if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files'))return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'synthetic-upload-'+requests.length,webViewLink:'https://drive.google.com/file/d/synthetic-only/view'})});
  // Every other external endpoint is stubbed, including Google sign-in.
  return route.fulfill({status:200,contentType:url.endsWith('/client')?'text/javascript':'application/json',body:url.endsWith('/client')?'':'{}'});
 });
 const p=await ctx.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-27T10:00:00Z'));await p.goto(origin+'/');await p.waitForFunction(()=>!!window.testHub);
 if(db&&JPEG)await p.evaluate(({key,bytes})=>testHub.photoPut(key,new Blob([new Uint8Array(bytes)],{type:'image/jpeg'})),{key:OLD_KEY,bytes:JPEG});
 return {ctx,p,requests,errors};
}
const raw=p=>p.evaluate(KEY=>localStorage.getItem(KEY),KEY);
const read=async p=>JSON.parse(await raw(p));
const mem=p=>p.evaluate(()=>JSON.parse(JSON.stringify(testHub.db)));
const go=(p,view,extra={})=>p.evaluate(({view,extra})=>testHub.go(view,extra),{view,extra});
const select=async(p,files)=>{await p.locator('#r_photo').setInputFiles(files);await p.waitForFunction(()=>!testHub.selecting);};
async function fill(p,payee='SYNTHETIC VENDOR',amount='250'){
 await p.locator('#r_date').fill('2026-10-27');await p.locator('#r_payee').fill(payee);await p.locator('#r_amount').fill(amount);await p.locator('#r_item').fill('Synthetic test only');await p.locator('#r_note').fill('KEEP UNSAVED FORM');
}
async function createForm(p){await go(p,'rform',{rId:null});await fill(p)}
const save=p=>p.evaluate(()=>testHub.rSaveForm());
const pending=p=>p.evaluate(()=>(testHub.ui.rNew||[]).length);
async function photoInfo(p,key){return p.evaluate(async key=>{const b=await testHub.photoGet(key);return b?{type:b.type,size:b.size,bytes:Array.from(new Uint8Array(await b.arrayBuffer()))}:null},key)}
async function photoKeys(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('workhub_receipt_photos',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('photos','readonly'),r=tx.objectStore('photos').getAllKeys();r.onsuccess=()=>resolve(r.result.sort());r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()}}))}
async function guards(p){assert.equal(await p.evaluate(()=>localStorage.getItem('toshi_v5')),'PAPA_MUST_NOT_CHANGE');assert.equal(await p.evaluate(()=>localStorage.getItem('toshi_hub_safe_v1')),'PAPA_HISTORY_MUST_NOT_CHANGE');assert.deepEqual((await photoInfo(p,OLD_KEY)).bytes,JPEG)}
async function clean(a){await guards(a.p);assert.deepEqual(a.errors,[]);await a.ctx.close()}
async function check(name,fn){await fn();results.push(name);console.log('PASS',name)}
async function checkPdfLinks(p,expectedName){
 const card=p.locator('#r_photos .receipt-file:has([data-rfile-open])').first();const links=card.locator('a[href^="blob:"]');await links.first().waitFor();assert(await links.count()>=2,'PDF needs open and download links');
 const opener=links.filter({hasText:/開く/}).first();assert.equal(await opener.getAttribute('target'),'_blank');assert.match(await opener.getAttribute('rel'),/noopener/);
 const dl=card.locator('a[download]').first();assert.equal(await dl.getAttribute('download'),expectedName);
 const bytes=await dl.evaluate(async a=>{const r=await fetch(a.href);return {type:r.headers.get('content-type'),bytes:Array.from(new Uint8Array(await r.arrayBuffer()))}});assert.equal(bytes.type,'application/pdf');assert.deepEqual(bytes.bytes,Array.from(PDF));
 assert.equal(await p.locator('#r_photos iframe,#r_photos embed,#r_photos object').count(),0,'PDF must not be eagerly decoded/rendered');
}
async function clickPdfOpen(p){
 const opened=new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);p.off('popup',onPopup);p.off('download',onDownload)};
  const onPopup=page=>{cleanup();resolve({kind:'popup',page})},onDownload=download=>{cleanup();resolve({kind:'download',download})};
  const timer=setTimeout(()=>{cleanup();reject(new Error('PDF open click produced neither popup nor download'))},8000);p.on('popup',onPopup);p.on('download',onDownload);
 });
 await p.locator('#r_photos [data-rfile-open]').first().click();const result=await opened;
 if(result.kind==='popup'){if(!result.page.isClosed())await result.page.close()}else{const stream=await result.download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),PDF)}
 assert.equal(await p.evaluate(()=>testHub.ui.view),'rform','opening PDF must leave the saved receipt form in its own tab');
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const seed=await setup(null);fixture=await seed.p.evaluate(()=>{const db=testHub.emptyDB();db.rseq=10;db.history=[{keep:'unknown database history'}];db.unknown={keep:true};db.todos=[{id:'keep-todo',title:'SYNTHETIC OLD TODO',due:'',tantou:'',done:false,unknown:'preserve'}];db.receipts=[Object.assign(testHub.RECEIPT_DEFAULTS(),{id:'R-0010',date:'2026-10-26',payee:'SYNTHETIC LEGACY',item:'legacy image',amount:100,photos:['R-0010-1'],pext:{'R-0010-1':'jpg'},drive:{'R-0010-1':{id:'old-synthetic-drive',link:'https://drive.google.com/file/d/synthetic-old/view'}},unknown:{keep:'receipt unknown'},edits:[{at:'2026-10-26T00:00:00Z',label:'KEEP HISTORY',from:'A',to:'B'}]})];return db});
 JPEG=await seed.p.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').fillRect(0,0,1,1);const b=await new Promise(r=>c.toBlob(r,'image/jpeg'));return Array.from(new Uint8Array(await b.arrayBuffer()))});await seed.ctx.close();

 for(const width of [320,390,822])await check('PDF picker, original bytes/MIME/name, reload, lightweight preview '+width+'px',async()=>{
  const a=await setup(fixture,width),{p}=a;const before=await mem(p);await createForm(p);
  assert.equal(await p.locator('#r_photo').getAttribute('capture'),null);const accept=await p.locator('#r_photo').getAttribute('accept');assert(accept.includes('application/pdf')&&accept.includes('.pdf')&&accept.includes('image/'));
  const name='scan_SYNTHETIC_'+('long-name-'.repeat(6))+'<&>.PDF';await select(p,[pdfFile(name)]);assert.equal(await pending(p),1);assert.equal(await p.locator('#r_photos img').count(),0);await checkPdfLinks(p,name);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(out,'receipt-pdf-'+width+'.png'),fullPage:true});await save(p);assert.equal(await p.evaluate(()=>testHub.ui.view),'rcpt');
  let db=await read(p);assert.equal(db.receipts.length,2);const row=db.receipts.find(r=>r.id!=='R-0010'),key=row.photos[0];assert.equal(row.pext[key],'pdf');assert.equal(row.pfiles[key].name,name);assert.equal(row.pfiles[key].type,'application/pdf');assert.equal(row.pfiles[key].size,PDF.length);assert.deepEqual((await photoInfo(p,key)).bytes,Array.from(PDF));assert.equal((await photoInfo(p,key)).type,'application/pdf');assert.deepEqual(db.receipts.find(r=>r.id==='R-0010'),before.receipts[0]);assert.deepEqual(db.todos,before.todos);assert.deepEqual(db.history,before.history);assert.deepEqual(db.unknown,before.unknown);
  await p.reload();await go(p,'rform',{rId:row.id});await checkPdfLinks(p,name);assert.equal(await p.locator('#r_photos img').count(),0);assert.equal(await p.locator('[data-rfile-key]').count(),1);await clickPdfOpen(p);
  const downloadWait=p.waitForEvent('download');await p.locator('#r_photos a[download]').first().click();const download=await downloadWait;assert.match(download.suggestedFilename(),/^scan_SYNTHETIC_.*\.PDF$/); // Platform sanitization can alter unsafe characters; original name is verified in metadata above.
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),PDF);
  await clean(a);
 });

 await check('Legacy JPEG + new PDF/PNG mixed attachments survive editing/reload without migration',async()=>{
  const a=await setup(),{p}=a;await go(p,'rform',{rId:'R-0010'});await fill(p,'SYNTHETIC LEGACY EDIT');await select(p,[pdfFile(),pngFile()]);assert.equal(await pending(p),2);await p.waitForFunction(()=>document.querySelectorAll('#r_photos img').length===2);assert.equal(await p.locator('#r_photos img').count(),2);await save(p);const db=await read(p),row=db.receipts[0];assert.equal(row.id,'R-0010');assert.equal(row.photos.length,3);assert.equal(row.photos[0],OLD_KEY);assert.equal(row.pext[row.photos[1]],'pdf');assert.equal(row.pext[row.photos[2]],'png');assert.deepEqual(row.unknown,fixture.receipts[0].unknown);assert.deepEqual(row.edits,fixture.receipts[0].edits);assert.deepEqual(row.drive,fixture.receipts[0].drive);await p.reload();await go(p,'rform',{rId:'R-0010'});await p.waitForFunction(()=>document.querySelectorAll('#r_photos img[src^="blob:"]').length===2);await checkPdfLinks(p,'scan_synthetic.pdf');await clean(a);
 });

 await check('Cancel/reselect/repeated pick preserves fields and pending attachments; unsupported file rejected',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);await select(p,[]);assert.equal(await pending(p),1);await p.evaluate(()=>testHub.render());assert.equal(await p.locator('#r_note').inputValue(),'KEEP UNSAVED FORM');assert.equal(await pending(p),1);assert.equal(await p.locator('#r_note').inputValue(),'KEEP UNSAVED FORM');await select(p,[{...pdfFile('second.pdf'),buffer:Buffer.concat([PDF,Buffer.from('\n%second')])}]);assert.equal(await pending(p),2);
  await select(p,[{name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.receiptXss=true</script></svg>')}]);assert.equal(await pending(p),2);assert.match(await p.locator('#rSaveStatus').textContent(),/PDF|対応|画像|選/);assert.equal(await p.evaluate(()=>window.receiptXss),undefined);
  await p.locator('[data-rnewx="1"]').click();assert.equal(await pending(p),1);assert.equal(await p.locator('#r_payee').inputValue(),'SYNTHETIC VENDOR');await clean(a);
 });

 for(const mime of ['', 'application/octet-stream'])await check('Drive PDF MIME '+(mime||'empty'),async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile('provider.PDF',mime)]);assert.equal(await pending(p),1);await save(p);const row=(await read(p)).receipts.at(-1),key=row.photos[0];assert.equal(row.photos.length,1);assert.equal(row.pfiles[key].type,'application/pdf');assert.deepEqual((await photoInfo(p,key)).bytes,Array.from(PDF));await go(p,'rform',{rId:row.id});await checkPdfLinks(p,'provider.PDF');await clean(a);
 });
 await check('IndexedDB quota failure leaves draft and prior attachment intact; no false success',async()=>{
  const a=await setup(),{p}=a;await go(p,'rform',{rId:'R-0010'});await fill(p,'SYNTHETIC FAIL IDB');await select(p,[pdfFile()]);await p.locator('[data-rdelph="'+OLD_KEY+'"]').click();const before=await raw(p),keys=await photoKeys(p);
  await p.evaluate(async()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...rest){if(mode==='readwrite')throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,names,mode,...rest)};try{await testHub.rSaveForm()}finally{IDBDatabase.prototype.transaction=original}});
  assert.equal(await p.evaluate(()=>testHub.ui.view),'rform');assert.equal(await p.locator('#r_payee').inputValue(),'SYNTHETIC FAIL IDB');assert.equal(await pending(p),1);assert.equal(await raw(p),before);assert.deepEqual(await photoKeys(p),keys);assert(!/を保存しました/.test(await p.locator('#toast').textContent()));assert.match(await p.locator('#rSaveStatus').textContent(),/保存|容量/);await clean(a);
 });

 await check('Metadata quota failure retains draft/originals and retries the same record without duplicate blobs',async()=>{
  const a=await setup(),{p}=a;await go(p,'rform',{rId:'R-0010'});await fill(p,'SYNTHETIC FAIL METADATA');await select(p,[pdfFile()]);await p.locator('[data-rdelph="'+OLD_KEY+'"]').click();const before=await raw(p),beforeMem=await mem(p),keys=await photoKeys(p);
  await p.evaluate(async KEY=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===KEY)throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,k,v)};try{await testHub.rSaveForm()}finally{Storage.prototype.setItem=original}},KEY);
  assert.equal(await p.evaluate(()=>testHub.ui.view),'rform');assert.equal(await p.locator('#r_note').inputValue(),'KEEP UNSAVED FORM');assert.equal(await pending(p),1);assert.equal(await raw(p),before);assert.deepEqual(await mem(p),beforeMem);const retained=await photoKeys(p);assert(retained.includes(OLD_KEY));assert(retained.length>keys.length);await save(p);assert.equal((await read(p)).receipts.length,1);assert.deepEqual(await photoKeys(p),retained);await clean(a);
 });

 await check('Second attachment add failure aborts the whole IndexedDB batch',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile('first.pdf'),{...pdfFile('second.pdf'),buffer:Buffer.concat([PDF,Buffer.from('\n%second')])}]);const before=await raw(p),keys=await photoKeys(p);
  await p.evaluate(async()=>{const original=IDBObjectStore.prototype.add;let calls=0;IDBObjectStore.prototype.add=function(...args){if(++calls===3)throw new DOMException('synthetic second attachment failure','DataCloneError');return original.apply(this,args)};try{await testHub.rSaveForm()}finally{IDBObjectStore.prototype.add=original}});
  assert.equal(await p.evaluate(()=>testHub.ui.view),'rform');assert.equal(await pending(p),2);assert.equal(await raw(p),before);assert.deepEqual(await photoKeys(p),keys);assert.match(await p.locator('#rSaveStatus').textContent(),/保存|確認/);await clean(a);
 });

 await check('Uncertain readback rechecks the same operation without another write',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);
  await p.evaluate(async KEY=>{const set=Storage.prototype.setItem,get=Storage.prototype.getItem;let written=false;Storage.prototype.setItem=function(k,v){const result=set.call(this,k,v);if(k===KEY)written=true;return result};Storage.prototype.getItem=function(k){if(k===KEY&&written)throw new DOMException('synthetic readback unavailable','SecurityError');return get.call(this,k)};try{await testHub.rSaveForm()}finally{Storage.prototype.setItem=set;Storage.prototype.getItem=get}},KEY);
  assert.equal(await p.evaluate(()=>testHub.ui.view),'rform');assert.equal(await pending(p),1);assert(!/を保存しました/.test(await p.locator('#toast').textContent()));assert.match(await p.locator('#rSaveStatus').textContent(),/確認|再読/);const saved=await raw(p),row=JSON.parse(saved).receipts.at(-1);await p.evaluate(()=>testHub.render());assert(await p.locator('#r_payee').isDisabled());assert.equal(await p.locator('#rForm button[type=submit]').innerText(),'保存状況を確認');assert.equal(JSON.parse(saved).receipts.length,2);assert.deepEqual((await photoInfo(p,row.photos[0])).bytes,Array.from(PDF));
  const writes=await p.evaluate(async KEY=>{const set=Storage.prototype.setItem;let writes=0;Storage.prototype.setItem=function(k,v){if(k===KEY)writes++;return set.call(this,k,v)};try{await testHub.rSaveForm();return writes}finally{Storage.prototype.setItem=set}},KEY);assert.equal(writes,0);assert.equal(await raw(p),saved);await clean(a);
 });

 await check('Concurrent unrelated update merges without overwriting latest state',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);const other=await a.ctx.newPage();await other.goto(origin+'/');await other.waitForFunction(()=>!!window.testHub);await other.evaluate(()=>{testHub.db.unknown.concurrent='KEEP NEWER TAB';testHub.save()});await save(p);const db=await read(p);assert.equal(db.unknown.concurrent,'KEEP NEWER TAB');assert.equal(db.receipts.length,2);assert.equal(await p.evaluate(()=>testHub.ui.view),'rcpt');await clean(a);
 });
 await check('Concurrent edit of the same receipt is rejected with draft retained',async()=>{
  const a=await setup(),{p}=a;await go(p,'rform',{rId:'R-0010'});await fill(p,'SYNTHETIC STALE');await select(p,[pdfFile()]);const other=await a.ctx.newPage();await other.goto(origin+'/');await other.waitForFunction(()=>!!window.testHub);await other.evaluate(()=>{testHub.db.receipts[0].amount=999;testHub.save()});const latest=await raw(other);await save(p);assert.equal(await raw(p),latest);assert.equal(await p.locator('#r_payee').inputValue(),'SYNTHETIC STALE');assert.equal(await pending(p),1);assert.match(await p.locator('#rSaveStatus').textContent(),/別の/);await clean(a);
 });
 await check('Repeated submit saves once; PDF share/XLSX filenames and fallback downloads keep MIME/bytes',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile(),pngFile()]);const during=await p.evaluate(async()=>{const one=testHub.rSaveForm(),two=testHub.rSaveForm();document.querySelector('[data-nav="home"]').click();const state={view:testHub.ui.view,disabled:document.querySelector('#rForm button[type="submit"]').disabled};await Promise.all([one,two]);return state});assert.equal(during.view,'rform');assert.equal(during.disabled,true);const db=await read(p);assert.equal(db.receipts.length,2);assert.equal(db.rseq,11);const row=db.receipts[1];
  const shared=await p.evaluate(async id=>{const r=testHub.db.receipts.find(x=>x.id===id);Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async opts=>{window.receiptShared=await Promise.all(opts.files.map(async f=>({name:f.name,type:f.type,bytes:Array.from(new Uint8Array(await f.arrayBuffer()))})))}});const sheets=testHub.rBook('SYNTHETIC',['HEAD'],'TEST-NO',[r],'CP',true);window.receiptBook=sheets;await testHub.rSend('SYNTHETIC','SYNTHETIC','synthetic.xlsx','TEST-NO',rows=>testHub.rBook('SYNTHETIC',['HEAD'],'TEST-NO',rows,'CP',true),[r]);return window.receiptShared},row.id);
  assert.equal(shared.length,3);assert.equal(shared[0].name,'synthetic.xlsx');assert.equal(shared[1].name,'TEST-NO-1.pdf');assert.equal(shared[1].type,'application/pdf');assert.deepEqual(shared[1].bytes,Array.from(PDF));assert.equal(shared[2].name,'TEST-NO-1-2.png');assert.equal(shared[2].type,'image/png');
  const names=await p.evaluate(()=>window.receiptBook[0].rows[4][11]);assert.equal(names,'TEST-NO-1.pdf TEST-NO-1-2.png');
  const downloadWait=p.waitForEvent('download');await p.evaluate(async id=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});const r=testHub.db.receipts.find(x=>x.id===id);await testHub.rSend('SYNTHETIC','SYNTHETIC','synthetic.xlsx','TEST-NO',rows=>testHub.rBook('SYNTHETIC',['HEAD'],'TEST-NO',rows,'CP',true),[r])},row.id);await downloadWait;
  const fallback=await p.evaluate(async()=>Promise.all(testHub.ui.dl.items.map(async f=>{const r=await fetch(f.url);return {name:f.name,type:r.headers.get('content-type'),bytes:Array.from(new Uint8Array(await r.arrayBuffer()))}})));assert.equal(fallback[1].name,'TEST-NO-1.pdf');assert.equal(fallback[1].type,'application/pdf');assert.deepEqual(fallback[1].bytes,Array.from(PDF));await clean(a);
 });

 await check('Drive backup uses PDF MIME/name and original bytes through mocked upload only',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);await save(p);
  const result=await p.evaluate(async()=>{testHub.G.token='synthetic-token';testHub.G.exp=Date.now()+3600000;testHub.D().rFolder='synthetic-folder';testHub.D().rShared=true;return testHub.backupPhotos()});assert.equal(result.done,1);assert.equal(result.fail,0);const uploads=a.requests.filter(r=>r.url.startsWith('https://www.googleapis.com/upload/drive/v3/files'));assert.equal(uploads.length,1);assert.equal(uploads[0].method,'POST');const body=uploads[0].body;assert(body.includes(Buffer.from('Content-Type: application/pdf')));assert(body.includes(PDF));assert.match(body.toString(),/"name":"[^"\r\n]+\.pdf"/);assert(!a.requests.some(r=>/permissions|oauth2|spreadsheets/.test(r.url)&&r.method!=='GET'));await clean(a);
 });
 await check('Readonly submitted receipt still opens its original PDF and never changes data',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);await save(p);const id=(await read(p)).receipts.at(-1).id;
  await p.evaluate(id=>{testHub.db.receipts.find(r=>r.id===id).status='提出済';testHub.save()},id);const before=await raw(p);await go(p,'rform',{rId:id});assert.equal(await p.locator('#rForm').count(),0);await checkPdfLinks(p,'scan_synthetic.pdf');assert.equal(await p.locator('[data-rdelph]').count(),0);assert.equal(await raw(p),before);await clean(a);
 });
 await check('History, linked case, original removed image and pre-edit snapshot survive same-ID edit',async()=>{
  const db=structuredClone(fixture);db.receipts[0].everSub=true;db.receipts[0].status='差戻し';db.receipts[0].caseId='case-keep';db.receipts[0].site='SYNTHETIC SITE';db.receipts[0].jobNo='SYNTHETIC JOB';db.cases=[{id:'case-keep',type:'reno',stage:'new',company:'CP',property:'SYNTHETIC SITE',room:'101',jobNo:'SYNTHETIC JOB',client:'SYNTHETIC CLIENT',tantou:'',items:[],payments:[],payLog:[]}];
  const a=await setup(db),{p}=a;await go(p,'rform',{rId:'R-0010'});await select(p,[pdfFile()]);await p.locator('[data-rdelph="'+OLD_KEY+'"]').click();await save(p);const after=await read(p),r=after.receipts[0];assert.equal(after.receipts.length,1);assert.equal(r.id,'R-0010');assert.equal(r.caseId,'case-keep');assert.equal(r.site,'SYNTHETIC SITE');assert.equal(r.jobNo,'SYNTHETIC JOB');assert.equal(r.amount,100);assert.deepEqual(r.edits.slice(0,1),fixture.receipts[0].edits);assert(r.edits.some(x=>x.field==='photos'));assert.deepEqual((await photoInfo(p,OLD_KEY)).bytes,JPEG);
  const backup=await p.evaluate(async()=>{const q=indexedDB.open('workhub_receipt_photos',1);const db=await new Promise((ok,no)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});const keys=await new Promise(ok=>{const t=db.transaction('photos'),r=t.objectStore('photos').getAllKeys();t.oncomplete=()=>ok(r.result)});const key=keys.find(k=>String(k).startsWith('receipt-before-'));const b=await new Promise(ok=>{const t=db.transaction('photos'),r=t.objectStore('photos').get(key);t.oncomplete=()=>ok(r.result)});db.close();return JSON.parse(await b.text())});assert.equal(backup.receipt.id,'R-0010');assert.deepEqual(backup.receipt.photos,[OLD_KEY]);await clean(a);
 });
 await check('Share cancellation leaves receipt and attachments intact; missing original blocks incomplete export',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);await save(p);const id=(await read(p)).receipts.at(-1).id,before=await raw(p);
  await p.evaluate(async id=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancelled','AbortError')}});const r=testHub.db.receipts.find(x=>x.id===id);await testHub.rSend('SYNTHETIC','TEST','test.xlsx','TEST-NO',rows=>testHub.rBook('SYNTHETIC',[],'TEST-NO',rows,'CP',true),[r])},id);assert.equal(await raw(p),before);assert.equal(await p.evaluate(()=>!!testHub.ui.dl),false);
  await p.evaluate(async id=>{const r=JSON.parse(JSON.stringify(testHub.db.receipts.find(x=>x.id===id)));r.photos.push('synthetic-missing-original');window.shareCalls=0;Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{shareCalls++}});await testHub.rSend('SYNTHETIC','TEST','test.xlsx','TEST-NO',rows=>testHub.rBook('SYNTHETIC',[],'TEST-NO',rows,'CP',true),[r])},id);assert.equal(await p.evaluate(()=>shareCalls),0);assert.match(await p.locator('#toast').innerText(),/見つからない/);assert.equal(await raw(p),before);await clean(a);
 });
 await check('Corrupted attachment readback blocks metadata save and safely retries original bytes',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);const before=await raw(p);
  await p.evaluate(async()=>{const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){const req=get.call(this,key);if(this.transaction.mode==='readonly'&&String(key).startsWith('receipt-')&&!String(key).startsWith('receipt-before-'))Object.defineProperty(req,'result',{get:()=>new Blob(['corrupt'])});return req;};try{await testHub.rSaveForm()}finally{IDBObjectStore.prototype.get=get;}});assert.equal(await raw(p),before);assert.equal(await pending(p),1);assert.match(await p.locator('#rSaveStatus').innerText(),/読み戻せません/);assert.equal(await p.locator('#r_note').inputValue(),'KEEP UNSAVED FORM');await save(p);assert.equal((await read(p)).receipts.length,2);await clean(a);
 });
 await check('Storage exception after an actual write succeeds only when exact readback confirms it',async()=>{
  const a=await setup(),{p}=a;await createForm(p);await select(p,[pdfFile()]);await p.evaluate(async KEY=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){set.call(this,k,v);if(k===KEY)throw new DOMException('synthetic exception after write','QuotaExceededError');};try{await testHub.rSaveForm()}finally{Storage.prototype.setItem=set;}},KEY);assert.equal((await read(p)).receipts.length,2);assert.equal(await p.evaluate(()=>testHub.ui.view),'rcpt');assert.match(await p.locator('#toast').innerText(),/読み戻して確認/);await clean(a);
 });
 console.log('\n'+results.length+' receipt browser checks passed.');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
