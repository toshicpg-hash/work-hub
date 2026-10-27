/* Receipt originals: local file validation and a verified, retryable save.
   No Google requests, schema migration, image conversion or deletion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorkHubReceiptFiles=api;})(globalThis,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);
 const fail=(message,uncertain=false)=>Object.assign(new Error(message),{mayHaveSaved:uncertain});
 const editable=r=>r&&(r.method==='立替'?['未提出','差戻し'].includes(r.status):!r.closeNo);
 const FIELD_NAMES=['date','payee','item','amount','company','method','cardId','cat','caseId','site','jobNo','note'];
 async function describe(blob){
  if(!blob||typeof blob.slice!=='function'||!blob.size)throw fail('空のファイルは取り込めません。原本を確認してください。');
  const b=new Uint8Array(await blob.slice(0,512).arrayBuffer()),text=new TextDecoder('latin1').decode(b);
  let type='',ext='',kind='image';
  if(text.startsWith('%PDF-')){type='application/pdf';ext='pdf';kind='pdf';}
  else if(b[0]===255&&b[1]===216&&b[2]===255){type='image/jpeg';ext='jpg';}
  else if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)){type='image/png';ext='png';}
  else if(/^GIF8[79]a/.test(text)){type='image/gif';ext='gif';}
  else if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'){type='image/webp';ext='webp';}
  else if(text.startsWith('BM')){type='image/bmp';ext='bmp';}
  else if(text.startsWith('II*\0')||text.startsWith('MM\0*')){type='image/tiff';ext='tif';}
  else if(text.slice(4,8)==='ftyp'){
   const brands=text.slice(8,80);
   if(/avif|avis/.test(brands)){type='image/avif';ext='avif';}
   else if(/heic|heix|hevc|hevx/.test(brands)){type='image/heic';ext='heic';}
   else if(/mif1|msf1/.test(brands)){type='image/heif';ext='heif';}
  }
  if(!type)throw fail('PDFまたは対応する画像ファイルを選んでください。ファイルの形式を確認できません。');
  const name=typeof blob.name==='string'?blob.name:'',suffix=(name.match(/\.([a-z0-9]+)$/i)||[])[1]?.toLowerCase();
  const aliases={jpg:['jpg','jpeg','jpe'],png:['png'],gif:['gif'],webp:['webp'],bmp:['bmp'],tif:['tif','tiff'],heic:['heic'],heif:['heif'],avif:['avif'],pdf:['pdf']};
  if(suffix&&Object.values(aliases).flat().includes(suffix)&&!aliases[ext].includes(suffix))throw fail('拡張子と内容が一致しません。原本を確認してください：'+name);
  if(suffix&&aliases[ext].includes(suffix))ext=suffix;
  return {name:name||('原本.'+ext),type,ext,kind,size:blob.size};
 }
 const typed=(blob,meta)=>blob.type===meta.type?blob:blob.slice(0,blob.size,meta.type);
 async function sameBytes(a,b){
  if(!a||!b||a.size!==b.size)return false;
  for(let start=0;start<a.size;start+=262144){const [x,y]=await Promise.all([a.slice(start,start+262144).arrayBuffer(),b.slice(start,start+262144).arrayBuffer()]);const u=new Uint8Array(x),v=new Uint8Array(y);if(u.some((n,i)=>n!==v[i]))return false;}
  return true;
 }
 async function select(files,existing=[],uuid=()=>crypto.randomUUID()){
  const added=[];
  for(const blob of files){const meta=await describe(blob);let duplicate=false;
   for(const x of [...existing,...added])if(x.blob.size===blob.size&&await sameBytes(x.blob,blob)){duplicate=true;break;}
   if(!duplicate)added.push({blob,meta,token:uuid()});
  }
  return added;
 }
 function read(storage,key){const raw=storage.getItem(key);let db;try{db=JSON.parse(raw);}catch{throw fail('端末の最新記録を確認できません。入力は残しています。');}if(!db||!Array.isArray(db.receipts)||!db.settings?.rcpt)throw fail('端末の領収書記録を確認できません。入力は残しています。');return {raw,db};}
 function open(storage,key,id=null,uuid=()=>crypto.randomUUID()){
  const before=read(storage,key),record=id?before.db.receipts.find(r=>r.id===id):null;
  if(id&&(!record||!editable(record)))throw fail('この領収書は現在変更できません。最新の状態を確認してください。');
  return {id,operationId:uuid(),before:record?clone(record):null,createdAt:new Date().toISOString(),expectedRecord:null,backup:null};
 }
 function latest(storage,key,session){
  const current=read(storage,key),same=current.db.receipts.filter(r=>r.receiptOperationId===session.operationId);
  if(same.length){if(same.length!==1||!session.expectedRecord||canonical(same[0])!==canonical(session.expectedRecord))throw fail('前回の保存結果と記録が一致しません。再登録せず、入力を控えて確認してください。',true);return {...current,already:same[0]};}
  const record=session.id?current.db.receipts.find(r=>r.id===session.id):null;
  if(session.id&&(!editable(record)||canonical(record)!==canonical(session.before)))throw fail('別の画面でこの領収書が更新されています。古い内容では保存しません。入力は残しています。');
  return current;
 }
 function get(db,key){return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly'),q=tx.objectStore('photos').get(key);tx.oncomplete=()=>resolve(q.result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('添付を読み戻せません。'));});}
 function batch(db,entries){return new Promise((resolve,reject)=>{
  const tx=db.transaction('photos','readwrite'),st=tx.objectStore('photos');let reason;
  try{for(const {key,value} of entries){const q=st.get(key);q.onsuccess=()=>{if(q.result===undefined)try{st.add(value,key);}catch(e){reason=e;tx.abort();}};}}
  catch(e){reason=e;tx.abort();}
  tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(reason||tx.error||Error('添付の一括保存を完了できません。'));
 });}
 function fieldsOf(fields){const v=Object.fromEntries(FIELD_NAMES.map(k=>[k,fields[k]??'']));if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Number.isFinite(Date.parse(v.date+'T00:00:00Z'))||new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)!==v.date||!v.payee||!Number.isSafeInteger(v.amount)||v.amount<1||!['CP','CPY','AT'].includes(v.company)||!['立替','法人カード'].includes(v.method)||v.method==='法人カード'&&!v.cardId)throw fail('日付・支払先・金額・会社・支払い方法を確認してください。');return v;}
 async function commit(env,session,fields,files=[],removed=[]){
  const {storage,key,db,defaults,historyFields,now=()=>new Date().toISOString()}=env;
  let current=latest(storage,key,session);
  if(current.already){for(const x of files){const k='receipt-'+session.operationId+'-'+x.token;if(!await sameBytes(await get(db,k),x.blob))throw fail('前回の添付を読み戻せません。再登録せず確認してください。',true);}const verify=latest(storage,key,session);if(!verify.already)throw fail('前回の保存結果を確認できません。',true);return {db:verify.db,raw:verify.raw,record:verify.already,recovered:true};}
  const values=fieldsOf(fields),attachments=[];
  for(const x of files)attachments.push({...x,meta:await describe(x.blob),key:'receipt-'+session.operationId+'-'+x.token});
  current=latest(storage,key,session);
  if(!session.backup)session.backup=JSON.stringify({format:'workhub-receipt-before-v1',operationId:session.operationId,at:now(),beforeRaw:current.raw,receipt:session.before});
  const backupKey='receipt-before-'+session.operationId;
  await batch(db,[{key:backupKey,value:new Blob([session.backup],{type:'application/json'})},...attachments.map(x=>({key:x.key,value:x.blob}))]);
  const backup=await get(db,backupKey);if(!backup||await backup.text()!==session.backup)throw fail('保存前の控えを読み戻せません。本文は保存していません。');
  for(const x of attachments)if(!await sameBytes(await get(db,x.key),x.blob))throw fail('添付の保存内容を読み戻せません。本文は保存していません。入力は残しています。');
  current=latest(storage,key,session);if(current.already)return {db:current.db,raw:current.raw,record:current.already,recovered:true};
  let seq=current.db.rseq||0,id=session.id;
  if(!id){do{id='R-'+String(++seq).padStart(4,'0');}while(current.db.receipts.some(r=>r.id===id));}
  const before=session.id?current.db.receipts.find(r=>r.id===id):null,record=before?{...defaults(),...clone(before)}:{...defaults(),id,createdAt:session.createdAt};
  const photos=(before?.photos||[]).filter(k=>!removed.includes(k)),pext={...record.pext},pfiles={...record.pfiles};
  for(const x of attachments){photos.push(x.key);pext[x.key]=x.meta.ext;pfiles[x.key]=x.meta;}
  const next={...values,photos};
  if(before?.everSub)for(const [field,label] of historyFields){const a=field==='photos'?JSON.stringify(before.photos):String(before[field]??''),b=field==='photos'?JSON.stringify(photos):String(next[field]??'');if(a!==b)record.edits.push({at:now(),field,label,from:a,to:b});}
  Object.assign(record,next,{pext,pfiles,receiptOperationId:session.operationId});
  const data=clone(current.db);if(before)data.receipts[data.receipts.findIndex(r=>r.id===id)]=record;else{data.rseq=seq;data.receipts.push(record);}data.settings.rcpt.lastCo=record.company;
  const raw=JSON.stringify(data);session.expectedRecord=clone(record);
  if(storage.getItem(key)!==current.raw)throw fail('保存直前に別の更新がありました。入力は残しています。もう一度保存してください。');
  let writeError;try{storage.setItem(key,raw);}catch(e){writeError=e;}
  let persisted;try{persisted=storage.getItem(key);}catch{throw fail('保存結果を確認できません。再登録せず「保存状況を確認」を押してください。',true);}
  if(persisted!==raw){const knownUnchanged=persisted===current.raw;throw fail(writeError&&knownUnchanged?'端末へ保存できませんでした。入力と添付は残しています。空き容量を確認して再試行してください。':'保存内容の一致を確認できません。再登録せず「保存状況を確認」を押してください。',!knownUnchanged);}
  return {db:data,raw,record,recovered:!!writeError};
 }
 return {describe,typed,sameBytes,select,read,open,commit,editable,canonical,get};
});
