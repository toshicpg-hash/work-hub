/* Display-only work calendar mapping. No Google writes or business storage. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CPGCalendarScope=api})(globalThis,()=>{
'use strict';
const key=identity=>'workhub_calendar_scope_v1:'+JSON.stringify([identity.account||'',identity.record||'',identity.viewer||'']);
const valid=rows=>Array.isArray(rows)&&rows.every(r=>r&&typeof r.id==='string'&&r.id&&r.work===true&&['person','mixed'].includes(r.mode)&&(r.mode==='mixed'||(['CP','CPY','AT','unknown'].includes(r.company)&&typeof r.person==='string'&&r.person)))&&new Set(rows.map(r=>r.id)).size===rows.length;
function load(storage,identity){try{const s=storage.getItem(key(identity));if(s===null)return {rows:[],state:'unset'};const v=JSON.parse(s);return v.version===1&&valid(v.rows)?{rows:v.rows,state:'ready'}:{rows:[],state:'invalid'}}catch{return {rows:[],state:'invalid'}}}
function save(storage,identity,rows){if(!valid(rows))return false;const s=JSON.stringify({version:1,rows});try{storage.setItem(key(identity),s);return storage.getItem(key(identity))===s}catch{return false}}
function span(e){
 const jst=value=>{const d=new Date(value);if(!Number.isFinite(+d))return '';const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('-')};
 if(e.allDay){const end=new Date((e.end||e.start)+'T00:00:00Z');return [e.start,Number.isFinite(+end)?new Date(+end-86400000).toISOString().slice(0,10):e.start]}
 return [jst(e.start),jst(new Date(+new Date(e.end||e.start)-1))];
}
function project({g,rows,model,cases=[],resolvePerson,readable,from='',to='9999-12-31'}){
 const people=model.candidates.filter(p=>model.selection.person==='all'||p.sheetId===model.selection.person),allowed=new Set(model.people.map(p=>p.sheetId));
 const approved=valid(rows)?rows.filter(r=>readable(r.id)&&(r.mode==='mixed'||allowed.has(r.person)&&(r.company==='unknown'||model.people.find(p=>p.sheetId===r.person)?.companies.includes(r.company)))):[];
 const co=model.selection.company,person=model.selection.person,match=(company,id)=>(co==='all'||co===company)&&(person==='all'||person===id);
 const maps=new Map(approved.map(r=>[r.id,r])),events=[],unidentified=[],privacyUnconfirmed=[];
 for(const e of g.data?.events||[]){const r=maps.get(e.calendarId),[first,last]=span(e);if(!r||!model.usable||e.private===true||!first||last<from||first>to)continue;let company=r.company,id=r.person;
  if(e.private!==false){if(r.mode==='mixed'||match(company,id)||(company==='unknown'&&(person==='all'||person===id)))privacyUnconfirmed.push(e);continue}
  if(r.mode==='mixed'){
   // A bare case number is not provenance. Require exact saved event+calendar identity.
   const hit=cases.filter(c=>e.id&&e.hub&&c.id===e.hub&&c.gcal?.id===e.id&&c.gcal?.cal===e.calendarId);
   if(hit.length!==1){unidentified.push(e);continue}company=hit[0].company;id=resolvePerson(hit[0]);
   if(!['CP','CPY','AT'].includes(company)||!allowed.has(id)){unidentified.push(e);continue}
  }
  if(company==='unknown'&&co!=='all'){if(person==='all'||person===id)unidentified.push(e);continue}
  if(match(company,id))events.push(e);
 }
 const sources=g.data?.sources||[],readyState=['ok','kept'].includes(g.state);
 const coverage=(r,day)=>readyState&&sources.some(s=>s.id===r.id&&(s.from||g.from)<=day&&(s.to||g.to)>=day);
 const status=day=>people.map(p=>{const assigned=approved.filter(r=>r.mode==='person'&&r.person===p.sheetId&&(co==='all'||r.company===co));return {id:p.sheetId,name:p.name,ready:model.usable&&assigned.length>0&&assigned.every(r=>coverage(r,day)),reason:!assigned.length?'仕事用カレンダー未設定':assigned.every(r=>coverage(r,day))?'取得済み':'未取得・読取失敗または保存範囲外'};});
 const onDay=(list,day)=>list.some(e=>{const [first,last]=span(e);return first<=day&&last>=day});
 const unfetched=day=>!model.usable||!people.length||status(day).some(p=>!p.ready);
 const mixedMissing=day=>approved.filter(r=>r.mode==='mixed'&&!coverage(r,day));
 const dayState=day=>unfetched(day)?'unfetched':mixedMissing(day).length?'additional':onDay(privacyUnconfirmed,day)?'privacy':onDay(unidentified,day)?'unidentified':'ready';
 const unknown=day=>dayState(day)!=='ready';
 return {events,unidentified,privacyUnconfirmed,status,unknown,unfetched,dayState,mixedMissing,approved};
}
return {key,valid,load,save,project};
});
