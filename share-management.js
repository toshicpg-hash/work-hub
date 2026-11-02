/* CPG-owned permission journal. No Google/global state here; all I/O is injected. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CPGShares=api})(typeof globalThis==='object'?globalThis:this,()=>{
'use strict';
const norm=x=>String(x||'').trim().toLowerCase();
const stable=x=>JSON.stringify(x);
const fail=m=>{throw Error(m)};
const fingerprint=ps=>stable(ps.map(p=>({id:p.id,email:norm(p.emailAddress),role:p.role,type:p.type,inherited:!!(p.permissionDetails||[]).some(d=>d.inherited)})).sort((a,b)=>String(a.id).localeCompare(String(b.id))));
const direct=p=>p&&p.type==='user'&&!(p.permissionDetails||[]).some(d=>d.inherited);
function history(rows,list){
 const ops=new Map();
 for(const r of rows){
  if(!r||r.list!==list||typeof r.op!=='string'||!r.op||!['intent','verified'].includes(r.state)||!['grant','revoke'].includes(r.action)||!r.file||!r.email||!['reader','writer'].includes(r.role)||!r.at||!Number.isFinite(Date.parse(r.at)))fail('共有管理履歴が不整合です。共有変更を止めました。');
  const old=ops.get(r.op);
  if(r.state==='intent'){if(old)fail('共有管理履歴の操作IDが重複しています。');}
  else if(!old||old.state!=='intent'||['list','action','file','email','role','permission'].some(k=>k!=='permission'&&r[k]!==old[k])||!r.permission||old.action==='revoke'&&r.permission!==old.permission)fail('共有管理履歴の読戻し記録が不整合です。');
  ops.set(r.op,r);
 }
 return [...ops.values()];
}
function plan(specs,rows,list){
 const hs=history(rows,list),out=[];
 for(const s of specs){
  if(new Set(s.permissions.map(p=>p.id)).size!==s.permissions.length||s.permissions.some(p=>!p.id))fail('共有一覧のIDが不整合です。');
  const want=new Map(s.want.map(w=>[norm(w.email),w.role]));
  const emails=new Set([...want.keys(),...s.permissions.filter(p=>s.managed.some(e=>norm(e)===norm(p.emailAddress))).map(p=>norm(p.emailAddress)),...hs.filter(r=>r.file===s.id).map(r=>norm(r.email))]);
  for(const email of emails){
   const ps=s.permissions.filter(p=>norm(p.emailAddress)===email),p=ps[0],role=want.get(email)||'',events=hs.filter(r=>r.file===s.id&&norm(r.email)===email),last=events.at(-1);
   const base={file:s.id,label:s.label,email,before:p?p.role:'なし',after:role||'なし',permission:p&&p.id,role:role||p&&p.role};
   const owned=last&&last.state==='verified'&&last.action==='grant'&&p&&last.permission===p.id&&last.role===p.role&&direct(p);
   let action,reason;
   if(events.some(r=>r.state==='intent')){action='review';reason='過去の操作結果が不明。再付与・解除せず個別確認してください';}
   else if(ps.length>1){action='review';reason='同じ付与先の権限が複数あります';}
   else if(role&&!p&&last&&last.state==='verified'&&last.action==='grant'){action='review';reason='以前の付与が見つかりません。外部解除の可能性があるため再付与しません';}
   else if(role&&!p){action='grant';reason='新規付与（履歴に記録）';}
   else if(role&&p&&p.role===role&&direct(p)){action='keep';reason=owned?'当機能の共有を維持':'既存共有を再利用・当機能では解除しません';}
   else if(p&&role){action='review';reason='既存の種類・役割が予定と違います。自動変更しません';}
   else if(p&&owned){action='revoke';reason='当機能の付与記録と一致する共有を解除';}
   else if(p){action='review';reason='旧共有・帰属不明・外部変更の可能性。残して個別確認';}
   else continue;
   out.push({...base,action,reason});
  }
 }
 return out;
}
async function execute(planRows,specs,rows,list,io){
 let expected=rows.slice(),snap=new Map(specs.map(s=>[s.id,fingerprint(s.permissions)])),done=0;
 const check=async()=>{await io.guard();const got=await io.readHistory();history(got,list);if(stable(got)!==stable(expected))fail('共有管理履歴が別の操作で変わりました。再確認してください。');};
 for(const x of planRows.filter(x=>['grant','revoke'].includes(x.action))){
  if(io.cancelled&&io.cancelled())fail('途中で中止しました。確認済みの変更は残り、未実行分は変更していません。');
  await check();
  const before=await io.permissions(x.file);if(fingerprint(before)!==snap.get(x.file))fail('確認後に共有が変わりました。変更せず再確認してください。');
  const record={list,op:io.id(),action:x.action,file:x.file,email:x.email,role:x.role,permission:x.permission||'',state:'intent',at:io.now()};
  await io.append(record);expected.push(record);await check();
  // Recheck immediately after the durable intent; concurrent changes are never silently reconciled.
  if(fingerprint(await io.permissions(x.file))!==snap.get(x.file))fail('実行直前に共有が変わりました。操作は未実行です。');
  let pid=record.permission;
  if(x.action==='grant'){const r=await io.grant(x.file,x.email,x.role);if(!r||!r.id)fail('付与結果が不明です。自動再試行しません。');pid=r.id;}
  else await io.revoke(x.file,pid);
  const after=await io.permissions(x.file),found=after.filter(p=>norm(p.emailAddress)===x.email);
  if(x.action==='grant'?(found.length!==1||found[0].id!==pid||found[0].role!==x.role||!direct(found[0])):after.some(p=>p.id===pid))fail('共有変更後の読戻しを確認できません。個別確認してください。');
  // Ensure unrelated entries were not changed during the operation.
  if(fingerprint(before.filter(p=>p.id!==pid))!==fingerprint(after.filter(p=>p.id!==pid)))fail('操作中に別の共有が変わりました。後続の変更を止めました。');
  await check();const verified={...record,permission:pid,state:'verified',at:io.now()};await io.append(verified);expected.push(verified);await check();snap.set(x.file,fingerprint(after));done++;io.progress(x,done);
 }
 return {done,review:planRows.filter(x=>x.action==='review').length};
}
return {plan,execute,history,fingerprint};
});
