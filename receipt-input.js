/* Read-only receipt input helpers. Uses only caller-supplied local data.
   No network, storage writes, accounting classification or source-case updates. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorkHubReceiptInput=api;})(globalThis,function(){
 'use strict';
 const text=x=>typeof x==='string'?x.trim():'';
 const norm=x=>text(x).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('ja-JP');
 const cell=x=>typeof x==='string'||typeof x==='number'?String(x):'';
 const sharedKey=(sourceId,id)=>'@shared:'+JSON.stringify([String(sourceId),String(id)]);
 function caseChoices(owned=[],sources=[]){
  const rows=[];
  for(const c of owned)if(c&&text(c.id)&&!c.ro&&c.stage!=='lost')rows.push({key:c.id,shared:false,id:c.id,owner:'この端末',company:text(c.company),property:text(c.property),room:text(c.room),jobNo:text(c.jobNo),ref:null});
  for(const source of sources){if(!source?.ok||!text(source.s?.sheetId)||!Array.isArray(source.cases))continue;
   const owner=text(source.s.name)||'共有元',sourceId=text(source.s.sheetId);
   for(const r of source.cases){const id=cell(r?.['受付番号']);if(!id.trim()||r['段階キー']==='lost'||r['段階']==='失注')continue;
    const ref={kind:'shared',sourceId,caseId:id,owner,company:cell(r['会社']),property:cell(r['物件']),room:cell(r['部屋']),jobNo:cell(r['仕事番号'])};
    rows.push({key:sharedKey(sourceId,id),shared:true,id,owner,company:ref.company,property:ref.property,room:ref.room,jobNo:ref.jobNo,ref});
   }
  }
  const unique=new Map(),conflicts=new Set();
  for(const r of rows){if(!unique.has(r.key))unique.set(r.key,r);else if(JSON.stringify(unique.get(r.key))!==JSON.stringify(r))conflicts.add(r.key);}
  return [...unique.values()].filter(r=>!conflicts.has(r.key)).sort((a,b)=>Number(a.shared)-Number(b.shared)||a.owner.localeCompare(b.owner,'ja')||b.id.localeCompare(a.id,'ja')||a.key.localeCompare(b.key));
 }
 const choiceLabel=c=>[c.shared?c.owner:'この端末',c.company,c.id,[c.property,c.room].filter(Boolean).join(' '),c.jobNo?'仕事番号 '+c.jobNo:''].filter(Boolean).join('｜');
 function siteLabel(r){return [text(r?.site),text(r?.room)].filter(Boolean).join(' ');}
 function caseLabel(r){const ref=r?.caseRef;return ref?.kind==='shared'?[ref.caseId,ref.owner,ref.company].filter(Boolean).join(' / '):String(r?.caseId||'');}
 function ranked(receipts){
  const time=v=>{if(typeof v!=='string')return 0;const t=Date.parse(v);return Number.isFinite(t)?t:0;};
  return receipts.filter(r=>r&&typeof r==='object'&&!r.ro&&!r.readOnly).map((r,index)=>({r,index,at:Math.max(0,time(r.updatedAt),time(r.createdAt),...(Array.isArray(r.edits)?r.edits.map(e=>time(e?.at)):[])),seq:Number(/^R-(\d+)$/.exec(String(r.id||''))?.[1])||0})).sort((a,b)=>b.at-a.at||b.seq-a.seq||b.index-a.index).map(x=>x.r);
 }
 function suggestions(receipts,field,query='',payee='',limit=5){
  if(!['payee','item'].includes(field))return [];
  let rows=ranked(Array.isArray(receipts)?receipts:[]);const selected=norm(payee);
  if(field==='item'&&selected)rows=rows.filter(r=>norm(r.payee)===selected).concat(rows.filter(r=>norm(r.payee)!==selected));
  const needle=norm(query),seen=new Set(),out=[];
  for(const r of rows){const value=text(r[field]),key=norm(value);if(!key||seen.has(key)||needle&&!key.includes(needle))continue;seen.add(key);out.push(value);if(out.length>=Math.min(5,Math.max(1,limit)))break;}
  return out;
 }
 return {sharedKey,caseChoices,choiceLabel,siteLabel,caseLabel,suggestions};
});
