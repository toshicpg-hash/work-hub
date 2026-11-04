/* Full-name display and append-only name history. Stored case/ToDo keys are not migrated. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CPGNames=api})(globalThis,()=>{
'use strict';
const flat=x=>String(x||'').replace(/[\s　]+/g,'');
const clean=x=>String(x||'').trim().replace(/[\s　]+/g,' ');
const same=(a,b)=>flat(a)===flat(b);
const aliases=p=>[p.name,p.registeredName,p.nameKey,...(p.nameAliases||[])].filter(x=>typeof x==='string'&&x.trim());
function shortNames(p,known){return aliases(p).flatMap(n=>{const parts=clean(n).split(' '),f=flat(n),family=parts.length>1?parts[0]:(known||[]).find(k=>f.startsWith(k)&&f.length>k.length);return family?[family,family+f.slice(family.length,family.length+1)]:[]})}
function matches(list,key,known){const n=String(key||'').trim();if(!n)return [];const exact=list.filter(p=>aliases(p).some(a=>same(a,n)));return exact.length?exact:list.filter(p=>shortNames(p,known).some(a=>same(a,n)));}
function resolve(list,key,owner,known){
 const n=String(key||'').trim(),own=list.filter(p=>p.sheetId===owner||aliases(p).some(a=>same(a,owner)));
 if(!n)return own.length===1?own[0]:null;
 const found=matches(list,n,known);
 // Full/old-name collisions never resolve by owner: the key may name somebody else.
 if(list.some(p=>aliases(p).some(a=>same(a,n))))return found.length===1?found[0]:null;
 return found.length===1?found[0]:own.length===1&&found.includes(own[0])?own[0]:null;
}
/* v1.50.2 表示名（社員一覧の「表示名」。例：肩書）があればそれを出す。同じ表示名・同じ氏名の人がほかにいれば、氏名を添えて区別する */
const disp=p=>clean(p&&p.displayName)||clean(p&&p.name);
function label(p,list){const n=clean(p.name),d=clean(p.displayName);
 if(d){const dup=(list||[]).some(q=>q&&q!==p&&(q.sheetId?q.sheetId!==p.sheetId:true)&&(same(disp(q),d)||same(clean(q.name),d)));return dup?d+'（'+n+'）':d}
 return matches(list,n,[]).length>1?n+'（'+([p.email,p.sheetId].filter(Boolean).join('／')||'本人未特定')+'）':n}
function parse(rows){
 const byId=new Map(),ordered=[];
 for(const r of rows){
  if(!r||typeof r.id!=='string'||!r.id||typeof r.sheetId!=='string'||!r.sheetId||!['intent','confirmed'].includes(r.state)||typeof r.before!=='string'||typeof r.after!=='string'||!clean(r.before)||!clean(r.after)||typeof r.registeredName!=='string'||!r.registeredName||!Array.isArray(r.aliases)||r.aliases.some(n=>typeof n!=='string')||!Number.isFinite(Date.parse(r.at)))throw Error('氏名変更履歴が不整合です。保存を止めました。');
  const key=r.id+':'+r.state,old=byId.get(key);if(old){if(JSON.stringify(old)!==JSON.stringify(r))throw Error('同じ氏名変更IDに違う内容があります。');continue;}
  if(r.state==='confirmed'){const intent=byId.get(r.id+':intent');if(!intent||['sheetId','before','after','registeredName','at','previousId'].some(k=>r[k]!==intent[k])||JSON.stringify(r.aliases)!==JSON.stringify(intent.aliases))throw Error('氏名変更の確認記録が一致しません。');}
  byId.set(key,r);ordered.push(r);
 }
 return ordered;
}
function chain(rows,sheetId){
 const entries=parse(rows).filter(r=>r.sheetId===sheetId&&r.state==='confirmed'),byId=new Map(entries.map(r=>[r.id,r]));
 if(!entries.length)return [];
 const children=new Map();for(const r of entries){const prev=r.previousId||'';if(prev===r.id)throw Error('氏名履歴の参照が循環しています。');if(children.has(prev))throw Error('氏名履歴の順序が曖昧です。');children.set(prev,r);if(byId.has(prev)){const p=byId.get(prev);if(p.after!==r.before||p.registeredName!==r.registeredName)throw Error('氏名履歴の前後が一致しません。');}}
 // Detect cycles, including disconnected ones; missing predecessors remain unresolved.
 for(const r of entries){const seen=new Set();let at=r;while(at){if(seen.has(at.id))throw Error('氏名履歴の参照が循環しています。');seen.add(at.id);at=byId.get(at.previousId)}}
 const path=[];let r=children.get('');while(r){path.push(r);r=children.get(r.id)}
 if(path.length!==entries.length)return [];return path;
}
function overlay(staff,rows){return staff.map(p=>{
 const path=chain(rows,p.sheetId),last=path.at(-1);
 return last?{...p,name:last.after,registeredName:p.registeredName||p.name,nameKey:last.registeredName,nameChangeId:last.id,nameAliases:last.aliases,nameHistory:path.map(({before,after,at})=>({before,after,at}))}:p;
})}
function pending(rows,sheetId){const r=parse(rows),resolved=new Set(chain(r,sheetId).map(x=>x.id));return r.filter(x=>x.sheetId===sheetId&&x.state==='intent'&&!resolved.has(x.id));}
function change(p,after,id,at){const n=clean(after);if(!n||n.length>100||/[\u0000-\u001f<>]/.test(n))throw Error('氏名は1〜100文字で入力してください。');if(n===clean(p.name))throw Error('氏名は変わっていません。');return {id,previousId:p.nameChangeId||'',sheetId:p.sheetId,state:'intent',before:clean(p.name),after:n,registeredName:p.nameKey||p.registeredName||p.name,aliases:[...new Set(aliases(p).map(clean))],at};}
return {flat,clean,matches,resolve,label,parse,chain,overlay,pending,change};
});
