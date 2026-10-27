/* Read-only projection of already-authorized receipt snapshots. No I/O or writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorkHubSharedReceipts=api;})(globalThis,function(){
 'use strict';
 const str=v=>v==null?'':String(v),cell=(r,k)=>str(r&&r[k]);
 const key=(source,id,index)=>JSON.stringify([source,id,index]);
 const companyList=s=>str(s?.company).split(/[,、，\s]+/).filter(Boolean);
 function authorized(context={},data=[]){
  let allowed=[];
  if(context.admin)allowed=(context.staff||[]).filter(s=>!s.removed);
  else{
   const list=context.viewList||[],me=list.find(s=>str(s.email).toLowerCase()===str(context.email).toLowerCase());
   if(!me||me.removed||!['全社','GM'].includes(me.role)||me.role==='GM'&&!me.gmCo)return [];
   allowed=list.filter(s=>!s.removed&&(s.sheetId===me.sheetId||me.role==='全社'||companyList(s).includes(me.gmCo)));
  }
  const ids=new Set(allowed.map(s=>str(s.sheetId)).filter(Boolean)),seen=new Set();
  return (Array.isArray(data)?data:[]).filter(x=>{const id=str(x?.s?.sheetId);if(!ids.has(id)||seen.has(id))return false;seen.add(id);return true;});
 }
 function parseSheet(values){
  const required=['受付ID','日付','支払先','金額','支払い方法'];
  if(!Array.isArray(values)||!Array.isArray(values[0])||!required.every(k=>values[0].includes(k)))return {state:'invalid',message:'領収書の列を確認できません。空とは判定していません。'};
  return {state:'ready'};
 }
 function originalLinks(value){
  const out=[],seen=new Set();
  for(const token of str(value).split(/\s+/)){
   try{const u=new URL(token);if(u.protocol!=='https:'||u.hostname!=='drive.google.com'||u.username||u.password||u.port)continue;
    const id=/^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(u.pathname)?.[1]||(/^\/(?:open|uc)$/.test(u.pathname)?u.searchParams.get('id'):'');
    if(!/^[a-zA-Z0-9_-]+$/.test(id||'')||seen.has(id))continue;seen.add(id);const view=new URL('https://drive.google.com/file/d/'+id+'/view');const resource=u.searchParams.get('resourcekey');if(resource)view.searchParams.set('resourcekey',resource);out.push(view.href);
   }catch{}
  }
  return out;
 }
 function amount(value){const text=str(value).trim();if(!text)return null;const n=Number(text);return Number.isFinite(n)&&n>=0?n:null;}
 function rows(source,previous=false){
  const snapshot=previous?source.receiptPrevious:source,sourceId=str(source.s.sheetId),counts=new Map(),raw=Array.isArray(snapshot?.rc)?snapshot.rc:[];
  for(const r of raw){const id=cell(r,'受付ID');if(id)counts.set(id,(counts.get(id)||0)+1);}
  return raw.filter(r=>r&&typeof r==='object'&&Object.values(r).some(v=>str(v).trim())).map((r,index)=>{
   const id=cell(r,'受付ID'),method=cell(r,'支払い方法');
   return {key:key(sourceId,id,index),sourceId,id,index,owner:str(source.s.name),date:cell(r,'日付'),payee:cell(r,'支払先'),item:cell(r,'内容'),category:cell(r,'区分'),amount:amount(r['金額']),company:cell(r,'会社'),site:cell(r,'現場'),jobNo:cell(r,'仕事番号'),status:cell(r,'状態'),claimNo:cell(r,'精算書番号'),method:['立替','法人カード'].includes(method)?method:'未確認',rawMethod:method,submitter:cell(r,'提出者'),links:originalLinks(r['写真リンク']),previous,duplicate:!!id&&counts.get(id)>1,missingId:!id};
  });
 }
 function state(source){
  if(source.accessDenied)return 'denied';
  if(!source.ok)return 'failed';
  if(!Array.isArray(source.rc))return 'unknown';
  if(source.receiptRead?.state==='invalid')return 'invalid';
  if(source.receiptRead?.state==='ready')return 'ready';
  return source.rc.length?'cached':'unknown';
 }
 function summary(list){
  const group=method=>{const rows=method?list.filter(r=>r.method===method):list;return {count:rows.length,total:rows.reduce((s,r)=>s+(r.amount??0),0),unconfirmed:rows.filter(r=>r.amount===null).length};};
  return {all:group(),advance:group('立替'),card:group('法人カード'),unknown:group('未確認')};
 }
 function project(context,data,filter={}){
  return authorized(context,data).filter(s=>!filter.source||s.s.sheetId===filter.source).map(s=>{
   const st=state(s),previous=!['ready','cached'].includes(st)&&st!=='denied'&&['ready','cached'].includes(state({ok:true,...s.receiptPrevious})),available=['ready','cached'].includes(st)||previous;
   const all=available?rows(s,previous):[],coRows=all.filter(r=>!filter.company||r.company===filter.company),filtered=coRows.filter(r=>!filter.method||r.method===filter.method);
   return {source:s,state:st,previous,rows:filtered,summary:summary(coRows)};
  });
 }
 return {authorized,parseSheet,originalLinks,amount,rows,state,summary,project,key};
});
