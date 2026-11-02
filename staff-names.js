/* Full-name display and append-only name history. Stored case/ToDo keys are not migrated. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CPGNames=api})(globalThis,()=>{
'use strict';
const flat=x=>String(x||'').replace(/[\s　]+/g,'');
const clean=x=>String(x||'').trim().replace(/[\s　]+/g,' ');
const same=(a,b)=>flat(a)===flat(b);
const aliases=p=>[p.name,p.registeredName,p.nameKey,...(p.nameAliases||[])].filter(x=>typeof x==='string'&&x.trim());
function shortNames(p,known){return aliases(p).flatMap(n=>{const parts=clean(n).split(' '),f=flat(n),family=parts.length>1?parts[0]:(known||[]).find(k=>f.startsWith(k)&&f.length>k.length);return family?[family,family+f.slice(family.length,family.length+1)]:[]})}
function resolve(list,key,owner,known){
 const n=String(key||'').trim();const ownerMatches=list.filter(p=>p.sheetId===owner||aliases(p).some(a=>same(a,owner)));
 const own=ownerMatches.length===1?ownerMatches[0]:null;
 if(!n)return own;
 const exact=list.filter(p=>aliases(p).some(a=>same(a,n)));
 if(exact.length)return exact.length===1?exact[0]:own&&exact.includes(own)?own:null;
 const matches=list.filter(p=>shortNames(p,known).some(a=>same(a,n)));
 return matches.length===1?matches[0]:own&&matches.includes(own)?own:null;
}
function label(p,list){const n=clean(p.name);return list.filter(x=>same(x.name,n)).length>1?n+'（'+([p.email,p.sheetId].filter(Boolean).join('／')||'本人未特定')+'）':n}
function parse(rows){
 const byId=new Map(),ordered=[];
 for(const r of rows){
  if(!r||typeof r.id!=='string'||!r.id||typeof r.sheetId!=='string'||!r.sheetId||!['intent','confirmed'].includes(r.state)||typeof r.before!=='string'||typeof r.after!=='string'||!clean(r.before)||!clean(r.after)||typeof r.registeredName!=='string'||!r.registeredName||!Array.isArray(r.aliases)||r.aliases.some(n=>typeof n!=='string')||!Number.isFinite(Date.parse(r.at)))throw Error('氏名変更履歴が不整合です。保存を止めました。');
  const key=r.id+':'+r.state,old=byId.get(key);if(old){if(JSON.stringify(old)!==JSON.stringify(r))throw Error('同じ氏名変更IDに違う内容があります。');continue;}
  if(r.state==='confirmed'){const intent=byId.get(r.id+':intent');if(!intent||['sheetId','before','after','registeredName','at'].some(k=>r[k]!==intent[k])||JSON.stringify(r.aliases)!==JSON.stringify(intent.aliases))throw Error('氏名変更の確認記録が一致しません。');}
  byId.set(key,r);ordered.push(r);
 }
 return ordered;
}
function overlay(staff,rows){const entries=parse(rows);return staff.map(p=>{
 const last=entries.filter(r=>r.sheetId===p.sheetId&&r.state==='confirmed').at(-1);
 return last?{...p,name:last.after,registeredName:p.registeredName||p.name,nameKey:last.registeredName,nameAliases:last.aliases,nameHistory:entries.filter(r=>r.sheetId===p.sheetId&&r.state==='confirmed').map(({before,after,at})=>({before,after,at}))}:p;
})}
function pending(rows,sheetId){const r=parse(rows);return r.filter(x=>x.sheetId===sheetId&&x.state==='intent'&&!r.some(y=>y.id===x.id&&y.state==='confirmed'));}
function change(p,after,id,at){const n=clean(after);if(!n||n.length>100||/[\u0000-\u001f<>]/.test(n))throw Error('氏名は1〜100文字で入力してください。');if(n===clean(p.name))throw Error('氏名は変わっていません。');return {id,sheetId:p.sheetId,state:'intent',before:clean(p.name),after:n,registeredName:p.nameKey||p.registeredName||p.name,aliases:[...new Set(aliases(p).map(clean))],at};}
return {flat,clean,resolve,label,parse,overlay,pending,change};
});
