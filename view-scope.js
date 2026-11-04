/* Display preferences only. Authorization and record interpretation belong to the caller.
   This module never reads business records, connects to Google, or changes their keys. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CPGViewScope=api})(globalThis,()=>{
'use strict';
const COMPANIES=['CP','CPY','AT'], PREFIX='workhub_view_scope_v1:';
const str=x=>typeof x==='string'?x:'';
const valid=s=>s&&typeof s==='object'&&!Array.isArray(s)&&typeof s.company==='string'&&typeof s.person==='string'&&!!s.person;
const key=identity=>PREFIX+JSON.stringify([str(identity.account).trim().toLowerCase(),str(identity.record),str(identity.viewer)]);
const initial=context=>({company:context.fixedCompany||'all',person:context.selfId||'local:self'});
function load(storage,identity,context){
 try{const raw=storage.getItem(key(identity));if(raw===null)return {selection:initial(context),state:'default'};
  const data=JSON.parse(raw);if(data?.version!==1||!valid(data.selection))return {selection:{company:'invalid',person:'invalid'},state:'invalid'};
  return {selection:{company:data.selection.company,person:data.selection.person},state:'saved'};
 }catch(e){return {selection:{company:'invalid',person:'invalid'},state:'unavailable'};}
}
function save(storage,identity,selection){
 if(!valid(selection))return {ok:false,state:'invalid'};
 const raw=JSON.stringify({version:1,selection:{company:selection.company,person:selection.person}});
 try{storage.setItem(key(identity),raw);return storage.getItem(key(identity))===raw?{ok:true,state:'saved'}:{ok:false,state:'uncertain'};}catch(e){return {ok:false,state:'uncertain'};}
}
function companies(p){return [...new Set(str(p.company).trim().split(/[,、，\s]+/).filter(c=>COMPANIES.includes(c)))];}
function catalog(context){
 // The existing access check must be supplied. Missing/failed authorization is not permission.
 const rows=Array.isArray(context.people)?context.people:[], counts=new Map();
 for(const p of rows)if(p&&!p.removed&&str(p.sheetId))counts.set(p.sheetId,(counts.get(p.sheetId)||0)+1);
 const people=rows.filter(p=>{if(!p||p.removed||!str(p.sheetId)||counts.get(p.sheetId)!==1)return false;
  try{return typeof context.canView==='function'&&context.canView(p)===true}catch(e){return false}})
  .map(p=>({sheetId:p.sheetId,name:str(p.label)||str(p.name)||'氏名未確認',role:str(p.role),companies:companies(p)}));
 const role=['社長','全社','経理','業務管理','GM','社員'];
 people.sort((a,b)=>(COMPANIES.indexOf(a.companies[0])-COMPANIES.indexOf(b.companies[0]))||((role.indexOf(a.role)+1||99)-(role.indexOf(b.role)+1||99))||a.name.localeCompare(b.name,'ja')||a.sheetId.localeCompare(b.sheetId));
 const allowed=context.fixedCompany?[context.fixedCompany].filter(c=>COMPANIES.includes(c)):COMPANIES.filter(c=>people.some(p=>p.companies.includes(c))||(context.localCompanies||[]).includes(c)||(context.availableCompanies||[]).includes(c));
 return {people,companies:allowed,duplicateIds:[...counts].filter(([,n])=>n>1).map(([id])=>id)};
}
function model(context,selection){
 const cat=catalog(context),companyOK=selection.company==='none'?!context.fixedCompany:selection.company==='all'?!context.fixedCompany:cat.companies.includes(selection.company);
 const candidates=companyOK?cat.people.filter(p=>selection.company==='all'||selection.company==='none'||p.companies.includes(selection.company)||(p.sheetId===context.selfId&&(context.localCompanies||[]).includes(selection.company))):[];
 const local=selection.person==='local:self'&&!context.selfId;
 const personOK=selection.person==='all'?context.allowAll===true:local?(selection.company==='all'||selection.company==='none'||(context.localCompanies||[]).includes(selection.company)):candidates.some(p=>p.sheetId===selection.person);
 let state=!companyOK||!personOK?'unavailable':context.readState==='ready'?'ready':context.readState==='failed'?'failed':'unread';
 return {...cat,candidates,selection:{...selection},state,usable:state==='ready',local};
}
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function controls(context,selection){
 const m=model(context,selection), opt=(v,t,selected)=>'<option value="'+esc(v)+'"'+(selected?' selected':'')+'>'+esc(t)+'</option>';
 const company=(context.fixedCompany?'':opt('all','閲覧できる会社すべて',selection.company==='all'))+m.companies.map(c=>opt(c,c,c===selection.company)).join('')+(context.fixedCompany?'':opt('none','会社未設定',selection.company==='none'));
 const person=(context.allowAll?opt('all','閲覧できる人すべて',selection.person==='all'):'')+(!context.selfId?opt('local:self','自分（この端末の記録）',selection.person==='local:self'):'')+m.candidates.map(p=>opt(p.sheetId,p.name+(m.candidates.filter(q=>q.name===p.name).length>1?'（'+p.sheetId+'）':''),p.sheetId===selection.person)).join('');
 const missingCo=!(['all','none'].includes(selection.company)&&!context.fixedCompany)&&!m.companies.includes(selection.company),missingPerson=!m.candidates.some(p=>p.sheetId===selection.person)&&!(selection.person==='all'&&context.allowAll)&&!m.local;
 const message={unavailable:'選択した対象を確認できません。対象を選び直してください。全員には切り替えていません。',unread:'対象の記録は未読込です。0件とは確認できません。',failed:'対象の記録を読めませんでした。0件とは確認できません。'}[m.state]||'';
 return '<section aria-label="共通の表示対象" data-view-scope><label>会社<select data-scope-company>'+ (missingCo?opt(selection.company,'選択した会社を確認できません',true):'')+company+'</select></label><label>人<select data-scope-person>'+(missingPerson?opt(selection.person,'選択した人を確認できません',true):'')+person+'</select></label>'+(message?'<p role="status">'+esc(message)+'</p>':'')+'</section>';
}
return {key,initial,load,save,catalog,model,controls};
});
