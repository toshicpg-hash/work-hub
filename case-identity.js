/* Device-local case name/room correction. No network calls or schema migration. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WorkHubCaseIdentity=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const PREFIX='workhub_case_identity_edit_v1:',FORMAT='workhub-case-identity-edit-v1';
  const stages=['new','site','quoted','hold','won','lost'];
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const clone=v=>JSON.parse(JSON.stringify(v));
  function canonical(v){
    if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
    if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
    return JSON.stringify(v);
  }
  function fail(code,message,extra){const error=new Error(message);error.code=code;Object.assign(error,extra);throw error;}
  function editable(c){return object(c)&&typeof c.id==='string'&&!!c.id&&!c.ro&&stages.includes(c.stage);}
  function read(storage,key){
    let raw,db;
    try{raw=storage.getItem(key);db=JSON.parse(raw);}catch{fail('READ','端末の最新記録を読み取れないため変更していません。');}
    if(!object(db)||!Array.isArray(db.cases)||!Array.isArray(db.todos)||!object(db.settings))fail('FORMAT','端末の記録の形式を確認できないため変更していません。');
    return {raw,db};
  }
  function target(db,id){
    const rows=db.cases.filter(c=>object(c)&&c.id===id);
    if(rows.length!==1)fail(rows.length?'DUPLICATE':'MISSING',rows.length?'同じ受付番号が複数あるため変更していません。':'対象の案件が見つからないため変更していません。');
    if(!editable(rows[0]))fail('READONLY','この端末の引渡前の案件だけ修正できます。社員の閲覧記録・引渡後の記録は変更していません。');
    return rows[0];
  }
  function fields(input){
    if(!object(input)||Object.keys(input).some(k=>!['property','room'].includes(k))||['property','room'].some(k=>typeof input[k]!=='string'))fail('FIELDS','物件名と号室を確認してください。');
    const patch={property:input.property.trim(),room:input.room.trim()};
    if(!patch.property||patch.property.length>300||patch.room.length>100)fail('FIELDS','物件名を入れてください（物件名300文字、号室100文字まで）。');
    return patch;
  }
  function open(storage,key,id){const {raw,db}=read(storage,key);return {id,before:clone(target(db,id)),beforeRaw:raw};}
  function commit(storage,key,session,input,{operationId,at}={}){
    const patch=fields(input);
    if(!session||typeof session.id!=='string'||!object(session.before)||session.before.id!==session.id)fail('SESSION','編集元の記録を確認できません。入力を控え、開き直してください。');
    const latest=read(storage,key),current=target(latest.db,session.id);
    if(canonical(current)!==canonical(session.before))fail('CONFLICT','編集中にこの案件が変更されました。上書きせず入力を残しています。最新の記録を確認してください。');
    if(Object.keys(patch).every(k=>(current[k]??'')===patch[k]))return {changed:false,raw:latest.raw,db:latest.db};
    if(typeof operationId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(operationId)||typeof at!=='string'||!Number.isFinite(Date.parse(at)))fail('IDENTITY','編集履歴の識別情報を確認できないため変更していません。');
    const historyKey=PREFIX+operationId,proofKey=historyKey+':verified';
    if(storage.getItem(historyKey)!==null||storage.getItem(proofKey)!==null)fail('IDENTITY','同じ編集履歴があるため保存を中止しました。');
    const after={...current,...patch},next={...latest.db,cases:latest.db.cases.map(c=>c===current?after:c)},nextRaw=JSON.stringify(next);
    const record={format:FORMAT,operationId,at,id:session.id,beforeRaw:latest.raw,before:clone(current),after:clone(after)},backup=JSON.stringify(record);
    try{storage.setItem(historyKey,backup);if(storage.getItem(historyKey)!==backup)throw Error('backup');}
    catch{fail('BACKUP','編集前の控えを保存・照合できないため、案件は変更していません。');}
    if(storage.getItem(key)!==latest.raw)fail('CONFLICT','保存直前に端末の記録が変わりました。上書きせず入力を残しています。');
    try{storage.setItem(key,nextRaw);}catch{fail('WRITE','案件を保存できませんでした。編集前の控えと入力は残しています。');}
    let confirmed;
    try{confirmed=storage.getItem(key);}catch{fail('READBACK','保存後の読み戻しを確認できません。再保存せず、最新の記録を確認してください。',{mayHaveSaved:true});}
    if(confirmed!==nextRaw)fail('READBACK','保存後の内容が一致しません。保存を繰り返さず、最新の記録を確認してください。',{mayHaveSaved:true});
    let proofSaved=false;const proof=JSON.stringify({format:FORMAT,operationId,id:session.id,at,verified:true});
    try{storage.setItem(proofKey,proof);proofSaved=storage.getItem(proofKey)===proof;}catch{}
    return {changed:true,verified:true,proofSaved,raw:confirmed,db:JSON.parse(confirmed),historyKey};
  }
  function history(storage,id){
    const records=[],warnings=[];
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);if(!key?.startsWith(PREFIX)||key.endsWith(':verified'))continue;
      try{
        const r=JSON.parse(storage.getItem(key));
        if(r.format!==FORMAT||!object(r.before)||!object(r.after)||r.id!==r.before.id||r.id!==r.after.id)throw Error('history');
        if(r.id!==id)continue;
        let verified=false;try{const proof=JSON.parse(storage.getItem(key+':verified'));verified=proof?.verified===true&&proof.operationId===r.operationId&&proof.id===r.id;}catch{}
        records.push({...r,verified,key});
      }catch{warnings.push(key);}
    }
    return {records:records.sort((a,b)=>String(b.at).localeCompare(String(a.at))),warnings};
  }
  function previousFields(record,id){if(!record||record.format!==FORMAT||record.id!==id||record.before?.id!==id)fail('HISTORY','この案件の控えを確認できません。');return fields({property:record.before.property??'',room:record.before.room??''});}
  return {PREFIX,FORMAT,editable,fields,open,commit,history,previousFields,canonical};
});
