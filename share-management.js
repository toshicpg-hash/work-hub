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
   /* v1.50.12 結果が不明な付与でも、今その人の共有が1つも無く、前に確認済みの付与も無ければ「付与されなかった」と分かるので、もう一度付与してよい（重複しない）。
      共有が残っているとき・解除の結果が不明なときは、今までどおり個別確認 */
   /* あとで確認済みになった付与（読戻しで共有がちょうど1つと確かめた）より前の、結果不明の付与は、もう考えなくてよい */
   const live=events.filter((r,i)=>!(r.state==='intent'&&r.action==='grant'&&events.slice(i+1).some(v=>v.state==='verified'&&v.action==='grant')));
   const unknown=live.filter(r=>r.state==='intent'),notGranted=unknown.length>0&&unknown.every(r=>r.action==='grant')&&!ps.length&&!live.some(r=>r.state==='verified');
   /* v1.50.24 結果が不明な付与の後始末：付与を決めたとき（意図の記録）にその人の共有が無く（permission が空）、今その人の共有がちょうど1つで、
      直接のユーザー共有・意図と同じ役割・今も予定どおりの役割なら、前の付与は届いていたと見て「維持」にする（要確認を出し続けない）。
      ただし、その共有を当機能の付与とはみなさない（確認済みの記録は書かない）ので、あとで予定から外れても自動では解除しない（そのときは要確認）。
      もう一度付与することもない。確認済みの記録が前にある人・解除の記録がある人・役割が違う人は、今までどおり個別確認 */
   const arrived=unknown.length>0&&!live.some(r=>r.state==='verified')&&unknown.every(r=>r.action==='grant'&&!r.permission&&r.role===role)&&ps.length===1&&direct(p)&&!!role&&p.role===role;
   if(arrived){action='keep';reason='前回の付与は届いていました（共有がちょうど1つ・予定の役割）。維持します（当機能では解除しません）';}
   else if(unknown.length&&!notGranted){action='review';reason='過去の操作結果が不明。再付与・解除せず個別確認してください';}
   else if(notGranted&&role){action='grant';reason='前回の付与は届いていませんでした（共有なし）。もう一度付与（履歴に記録）';}
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
async function executeOneByOne(planRows,specs,rows,list,io){
 let expected=rows.slice(),snap=new Map(specs.map(s=>[s.id,fingerprint(s.permissions)])),done=0;
 const check=async()=>{await io.guard();const got=await io.readHistory();history(got,list);if(stable(got)!==stable(expected))fail('共有管理履歴が別の操作で変わりました。再確認してください。');};
 const ops=planRows.filter(x=>['grant','revoke'].includes(x.action));
 for(const x of ops){
  if(io.cancelled&&io.cancelled())fail('途中で中止しました。確認済みの変更は残り、未実行分は変更していません。');
  if(io.step)io.step(x,done+1,ops.length);
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
  await check();const verified={...record,permission:pid,state:'verified',at:io.now()};/* v1.50.3 確認済みの記録のすぐあとの読み直しは省き、次の変更の前と最後に確かめる */await io.append(verified);expected.push(verified);snap.set(x.file,fingerprint(after));done++;io.progress(x,done);
 }
 /* 次の変更の前と、最後に、履歴と社員一覧を確かめる */
 if(done)await check();
 return {done,review:planRows.filter(x=>x.action==='review').length};
}
/* v1.50.32 まとめて実行（io.batch のとき）：違うファイルへの変更を1回分（ラウンド）にまとめ、同じファイルへの変更は別のラウンドに分ける。
   1件ずつと同じ順番の約束を守る：変える前の確認 → 意図の記録（まとめて追記）→ 履歴の確認 → 直前の確認 → 変更（同時）→ 読戻し → 確認済みの記録。
   ラウンドの中で失敗したものがあっても、成功したものは確認済みを記録してから止める。中止は次のラウンドから */
async function executeBatched(planRows,specs,rows,list,io){
 let expected=rows.slice(),snap=new Map(specs.map(s=>[s.id,fingerprint(s.permissions)])),done=0,started=0;
 const check=async()=>{let got;if(io.guardHistory)got=await io.guardHistory();else{await io.guard();got=await io.readHistory();}history(got,list);if(stable(got)!==stable(expected))fail('共有管理履歴が別の操作で変わりました。再確認してください。');};
 const appendAll=async recs=>{if(io.appendMany&&recs.length>1)await io.appendMany(recs);else for(const r of recs)await io.append(r);expected.push(...recs);};
 const ops=planRows.filter(x=>['grant','revoke'].includes(x.action)),rounds=[];
 {const left=ops.slice();while(left.length){const seen=new Set(),r=[];for(let i=0;i<left.length;){if(seen.has(left[i].file)){i++;continue}seen.add(left[i].file);r.push(left.splice(i,1)[0])}rounds.push(r)}}
 for(const r of rounds){
  if(io.cancelled&&io.cancelled())fail('途中で中止しました。確認済みの変更は残り、未実行分は変更していません。');
  for(const x of r)if(io.step)io.step(x,++started,ops.length);
  await check();
  const before=await Promise.all(r.map(x=>io.permissions(x.file)));
  r.forEach((x,i)=>{if(fingerprint(before[i])!==snap.get(x.file))fail('確認後に共有が変わりました。変更せず再確認してください。')});
  const recs=r.map(x=>({list,op:io.id(),action:x.action,file:x.file,email:x.email,role:x.role,permission:x.permission||'',state:'intent',at:io.now()}));
  await appendAll(recs);await check();
  const again=await Promise.all(r.map(x=>io.permissions(x.file)));
  r.forEach((x,i)=>{if(fingerprint(again[i])!==snap.get(x.file))fail('実行直前に共有が変わりました。操作は未実行です。')});
  const res=await Promise.allSettled(r.map(async(x,i)=>{
   let pid=recs[i].permission;
   if(x.action==='grant'){const g=await io.grant(x.file,x.email,x.role);if(!g||!g.id)fail('付与結果が不明です。自動再試行しません。');pid=g.id;}
   else await io.revoke(x.file,pid);
   const after=await io.permissions(x.file),found=after.filter(p=>norm(p.emailAddress)===x.email);
   if(x.action==='grant'?(found.length!==1||found[0].id!==pid||found[0].role!==x.role||!direct(found[0])):after.some(p=>p.id===pid))fail('共有変更後の読戻しを確認できません。個別確認してください。');
   if(fingerprint(before[i].filter(p=>p.id!==pid))!==fingerprint(after.filter(p=>p.id!==pid)))fail('操作中に別の共有が変わりました。後続の変更を止めました。');
   return {pid,after};
  }));
  const ok=[];let err=null;res.forEach((v,i)=>{if(v.status==='fulfilled')ok.push({x:r[i],rec:recs[i],...v.value});else err=err||v.reason});
  if(ok.length){await check();await appendAll(ok.map(o=>({...o.rec,permission:o.pid,state:'verified',at:io.now()})));
   for(const o of ok){snap.set(o.x.file,fingerprint(o.after));done++;if(io.progress)io.progress(o.x,done)}}
  if(err)throw err;
 }
 if(done)await check();
 return {done,review:planRows.filter(x=>x.action==='review').length};
}
function execute(planRows,specs,rows,list,io){return io&&io.batch?executeBatched(planRows,specs,rows,list,io):executeOneByOne(planRows,specs,rows,list,io)}
return {plan,execute,history,fingerprint};
});
