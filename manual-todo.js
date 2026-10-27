/* Manual, device-local ToDo editing only. No Google or network access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorkHubManualTodo=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const PREFIX='workhub_manual_todo_edit_v1:',FORMAT='workhub-manual-todo-edit-v1';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
function fail(code,message,extra){const error=new Error(message);error.code=code;Object.assign(error,extra);throw error;}
function editable(t){return object(t)&&typeof t.id==='string'&&!!t.id&&!t.order&&!t.ro&&!t.auto&&!t.nav&&!t.caseId&&!t.googleId&&!t.googleCalendarId&&!t.gcal&&!['google','calendar'].includes(t.source)&&!['リクエスト','社長から'].includes(t.kind);}
function read(storage,key){let raw,db;try{raw=storage.getItem(key);db=JSON.parse(raw);}catch{fail('READ','端末の最新記録を読み取れないため、変更していません。');}if(!object(db)||!Array.isArray(db.todos)||!Array.isArray(db.cases)||!object(db.settings))fail('FORMAT','端末の記録の形式を確認できないため、変更していません。');return {raw,db};}
function target(db,id){const matches=db.todos.filter(t=>object(t)&&t.id===id);if(matches.length!==1)fail(matches.length?'DUPLICATE':'MISSING',matches.length?'同じIDが複数あるため編集できません。元の記録を保持しています。':'対象のToDoが見つかりません。元の記録を確認してください。');const t=matches[0];if(!editable(t))fail('NOT_MANUAL','この端末の手入力ToDoだけを編集できます。社員の記録やリクエストは変更していません。');return t;}
function open(storage,key,id){const {raw,db}=read(storage,key);const t=target(db,id);return {id,before:clone(t),beforeRaw:raw};}
function fields(value){if(!object(value)||['title','due','tantou'].some(k=>typeof value[k]!=='string')||Object.keys(value).some(k=>!['title','due','tantou'].includes(k)))fail('FIELDS','内容・期限・担当を確認してください。');const v={title:value.title.trim(),due:value.due,tantou:value.tantou.trim()};if(!v.title||v.title.length>2000||v.tantou.length>200)fail('FIELDS','内容を入れてください（内容は2000文字、担当は200文字まで）。');if(v.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.due)||!Number.isFinite(Date.parse(v.due+'T00:00:00Z'))||new Date(v.due+'T00:00:00Z').toISOString().slice(0,10)!==v.due))fail('DATE','期限の日付を確認してください。');return v;}
function commit(storage,key,session,input,{operationId,at}={}){
 const patch=fields(input);if(!session||typeof session.id!=='string'||!object(session.before)||session.id!==session.before.id)fail('SESSION','編集の元の記録を確認できません。入力を控え、開き直してください。');
 const latest=read(storage,key),current=target(latest.db,session.id);if(canonical(current)!==canonical(session.before))fail('CONFLICT','編集を開いた後にこのToDoが変更されました。保存せず入力を残しています。最新の記録を確認してください。',{latest:clone(current)});
 if(Object.keys(patch).every(k=>(current[k]??'')===patch[k]))return {changed:false,raw:latest.raw,db:latest.db};
 if(typeof operationId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(operationId)||typeof at!=='string'||!Number.isFinite(Date.parse(at)))fail('IDENTITY','編集履歴の識別情報を確認できません。変更していません。');
 const historyKey=PREFIX+operationId,proofKey=historyKey+':verified';if(storage.getItem(historyKey)!==null||storage.getItem(proofKey)!==null)fail('IDENTITY','同じ編集履歴があるため、重複する保存を中止しました。');
 const after={...current,...patch},next={...latest.db,todos:latest.db.todos.map(t=>t===current?after:t)},nextRaw=JSON.stringify(next),record={format:FORMAT,operationId,at,id:session.id,beforeRaw:latest.raw,before:clone(current),after:clone(after)},backup=JSON.stringify(record);
 try{storage.setItem(historyKey,backup);if(storage.getItem(historyKey)!==backup)throw Error('Backup readback failed');}catch{fail('BACKUP','編集前の控えを保存・照合できないため、ToDoは変更していません。');}
 if(storage.getItem(key)!==latest.raw)fail('CONFLICT','保存直前に端末の記録が変わりました。上書きせず入力を残しています。最新の記録を確認してください。');
 try{storage.setItem(key,nextRaw);}catch{fail('WRITE','ToDoを保存できませんでした。編集前の控えと入力内容を保持しています。');}
 let confirmed;try{confirmed=storage.getItem(key);}catch{fail('READBACK','保存後の読み戻しを確認できません。再保存せず、最新の記録を確認してください。',{mayHaveSaved:true});}
 if(confirmed!==nextRaw)fail('READBACK','保存後の内容が一致しません。上書きを繰り返さず、最新の記録を確認してください。',{mayHaveSaved:true});
 let proofSaved=false;const proof=JSON.stringify({format:FORMAT,operationId,id:session.id,at,verified:true});try{storage.setItem(proofKey,proof);proofSaved=storage.getItem(proofKey)===proof;}catch{}
 return {changed:true,verified:true,proofSaved,raw:confirmed,db:JSON.parse(confirmed),historyKey};
}
/* Cancellation keeps the original row and done flag; it is not payment/completion. */
function cancel(storage,key,session,reason,{operationId,at}={}){
 if(typeof reason!=="string"||!reason.trim()||reason.trim().length>500)fail('REASON','取消理由を入れてください（500文字まで）。');
 if(!session||typeof session.id!=="string"||!object(session.before)||session.id!==session.before.id)fail('SESSION','取消元の記録を確認できません。開き直してください。');
 const latest=read(storage,key),current=target(latest.db,session.id);
 if(canonical(current)!==canonical(session.before))fail('CONFLICT','取消画面を開いた後にこのToDoが変更されました。上書きせず入力を残しています。最新の記録を確認してください。');
 if(current.cancelled)return {changed:false,raw:latest.raw,db:latest.db};
 if(current.done)fail('STATE','完了済みのToDoはこの操作で取り消せません。完了状態は変更していません。');
 if(typeof operationId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(operationId)||typeof at!=='string'||!Number.isFinite(Date.parse(at)))fail('IDENTITY','取消履歴の識別情報を確認できません。変更していません。');
 const historyKey=PREFIX+operationId,proofKey=historyKey+':verified';
 if(storage.getItem(historyKey)!==null||storage.getItem(proofKey)!==null)fail('IDENTITY','同じ履歴があるため重複する取消を中止しました。');
 const after={...current,cancelled:true,cancelledAt:at,cancelReason:reason.trim()},next={...latest.db,todos:latest.db.todos.map(t=>t===current?after:t)},nextRaw=JSON.stringify(next);
 const record={format:FORMAT,action:'cancel',operationId,at,id:session.id,beforeRaw:latest.raw,before:clone(current),after:clone(after)},backup=JSON.stringify(record);
 try{storage.setItem(historyKey,backup);if(storage.getItem(historyKey)!==backup)throw Error('Backup readback failed');}catch{fail('BACKUP','取消前の控えを保存・照合できないため、ToDoは変更していません。');}
 if(storage.getItem(key)!==latest.raw)fail('CONFLICT','保存直前に端末の記録が変わりました。上書きせず取消を止めました。');
 try{storage.setItem(key,nextRaw);}catch{fail('WRITE','取消を保存できませんでした。元の記録と入力は保持しています。');}
 let confirmed;try{confirmed=storage.getItem(key);}catch{fail('READBACK','取消後の読み戻しを確認できません。繰り返し操作せず、最新の記録を確認してください。',{mayHaveSaved:true});}
 if(confirmed!==nextRaw)fail('READBACK','取消後の内容が一致しません。繰り返し操作せず、最新の記録を確認してください。',{mayHaveSaved:true});
 let proofSaved=false;const proof=JSON.stringify({format:FORMAT,action:'cancel',operationId,id:session.id,at,verified:true});
 try{storage.setItem(proofKey,proof);proofSaved=storage.getItem(proofKey)===proof;}catch{}
 return {changed:true,verified:true,proofSaved,raw:confirmed,db:JSON.parse(confirmed),historyKey};
}
function history(storage,id){const records=[],warnings=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(PREFIX)||key.endsWith(':verified'))continue;try{const raw=storage.getItem(key),r=JSON.parse(raw);if(r.format!==FORMAT||!object(r.before)||!object(r.after)||r.id!==r.before.id||r.id!==r.after.id)throw Error('Invalid history');if(r.id!==id)continue;let verified=false;try{const proof=JSON.parse(storage.getItem(key+':verified'));verified=proof?.verified===true&&proof.operationId===r.operationId&&proof.id===r.id;}catch{}records.push({...r,verified,key,raw});}catch{warnings.push(key);}}
 return {records:records.sort((a,b)=>String(b.at).localeCompare(String(a.at))),warnings};}
function previousFields(record,id){if(!record||record.format!==FORMAT||record.id!==id||!object(record.before)||record.before.id!==id)fail('HISTORY','このToDoの控えを確認できません。');return fields({title:record.before.title??'',due:record.before.due??'',tantou:record.before.tantou??''});}
return {PREFIX,FORMAT,editable,open,commit,cancel,fields,history,previousFields,canonical};
});
