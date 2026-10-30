/* Employee-only request box reader/reporter. Contract pinned to b7fa934:docs/指示箱.md.
   No writes to the box or 連絡. Reports are append-only on the employee sheet. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorkHubRequestBoxEmployee=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const BOX=['指示ID','内容','期限','指示日','状態','出した人Gmail','出した人の表示','取消日時','取消した人'];
const REPORT=['指示ID','状態','完了日','完了メモ','書いた日時'];
const clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const day=iso=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const utc=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(x)&&validDay(x.slice(0,10))&&Number.isFinite(Date.parse(x));
const validId=x=>typeof x==='string'&&/^B-\d{8}-[a-z0-9]{6}$/.test(x)&&validDay(x.slice(2,6)+'-'+x.slice(6,8)+'-'+x.slice(8,10));
function fail(msg){throw Error(msg);}
function table(rows,header){if(!Array.isArray(rows)||!Array.isArray(rows[0])||header.some((v,i)=>rows[0][i]!==v))fail('指示箱の列を確認できません。元の記録を保持しています。');return rows.slice(1).filter(r=>Array.isArray(r)&&r.some(v=>v!==''&&v!=null));}
function boxes(rows){const seen=new Set();return table(rows,BOX).map(r=>{const [id,title,due='',at='',status,email='',sender='',cancelledAt='',cancelledBy='']=r.map(v=>String(v??''));if(!validId(id)||seen.has(id)||!title||!['未完了','取り消し'].includes(status)||(due&&!validDay(due))||!validDay(at)||(cancelledAt&&!utc(cancelledAt)))fail('指示箱の行を確認できません。重複IDや日付を確認してください。');seen.add(id);return {id,title,due,at,status,email,sender,cancelledAt,cancelledBy};});}
function reports(rows){const out={};for(const r of table(rows,REPORT)){const [id,status,date,memo='',at]=r.map(v=>String(v??''));if(!validId(id)||status!=='完了'||!validDay(date)||!utc(at))fail('指示の報告の行を確認できません。');if(!out[id]||Date.parse(at)>Date.parse(out[id].at))out[id]={id,date,memo,at};}return out;}
function source(state,own){if(state==null)return null;if(!object(state)||state.version!==1||!object(state.sources))fail('指示箱の端末記録を確認できません。');return state.sources[own]||null;}
function put(state,own,s){const next=state==null?{version:1,sources:{}}:clone(state);source(next,own);next.sources[own]=s;return next;}
function itemState(s,item){return item.status==='取り消し'||s.cancelled?.[item.id]?'取り消し':s.reports?.[item.id]?'完了':s.pending?.[item.id]?'報告未送信':'未完了';}
function tasks(state,own){const s=source(state,own);if(!s||s.blocked)return [];return (s.items||[]).filter(t=>itemState(s,t)==='未完了').map(t=>({...t,boxId:s.boxId,stale:!!s.error}));}
function pending(state,own){const s=source(state,own);if(!s)return [];return Object.values(s.pending||{}).map(p=>({...p,cancelled:!!s.cancelled?.[p.id],blocked:!!s.blocked}));}
function complete(state,own,id,memo,at){const s=source(state,own),t=s?.items?.find(t=>t.id===id);if(!s||s.error||s.blocked||!t||itemState(s,t)!=='未完了')fail('最新の指示箱を同期してから完了を報告してください。');if(typeof memo!=='string'||memo.length>2000||!Number.isFinite(Date.parse(at)))fail('完了メモを確認してください。');const next=clone(s);next.pending[id]={id,title:t.title,date:day(at),memo:memo.trim(),at:new Date(at).toISOString()};return put(state,own,next);}
/* io.check verifies current own sheet, account/read epoch and storage before and after every await.
   io.commit must durably persist/readback; failure throws and stops further writes. */
async function sync(io){const own=io.own;let state=clone(io.state||{version:1,sources:{}}),s=clone(source(state,own)||{boxId:'',items:[],reports:{},pending:{},cancelled:{}});let sent=0,persistFailed=false;
 const check=()=>io.check();
 const call=async(fn)=>{check();const r=await fn();check();return r;};
 const commit=()=>{check();state=put(state,own,s);try{io.commit(clone(state));}catch(e){persistFailed=true;throw e;}};
 const read=async(id,tab)=>call(()=>io.read(id,tab));
 async function reference(){const tabs=await call(()=>io.tabs(own));if(!tabs.includes('連絡'))return {box:'',tabs};const rows=await read(own,'連絡');if(rows[0]?.[0]!=='指示箱ID')fail('連絡の見出しを確認できません。');const box=String(rows[1]?.[0]||'').trim();if(box&&!/^[A-Za-z0-9_-]+$/.test(box))fail('指示箱IDを確認できません。');if(box===own)fail('指示箱と社員の記録シートが同じです。送信していません。');return {box,tabs};}
 async function refresh(){const ref=await reference();if(s.boxId&&s.boxId!==ref.box){s.blocked=true;fail('指示箱の参照先が変わりました。旧報告を別の箱へ送らないため停止しています。');}if(!ref.box){s.error='';s.items=[];commit();return null;}s.boxId=ref.box;
  const items=boxes(await read(ref.box,'指示'));const rr=ref.tabs.includes('指示の報告')?await read(own,'指示の報告'):[];const done=rr.length?reports(rr):{};
  if(Object.keys(s.reports).some(id=>!done[id]||Date.parse(done[id].at)<Date.parse(s.reports[id].at)))fail('既存の完了報告を確認できません。元の記録を保持して送信を止めています。');
  for(const item of items)if(item.status==='取り消し')s.cancelled[item.id]={at:item.cancelledAt,by:item.cancelledBy};
  s.items=items;s.reports=done;s.error='';s.blocked=false;s.at=new Date().toISOString();commit();return ref;
 }
 try{if(!await refresh())return {sent,open:0};
  for(const p of Object.values(s.pending)){
   // Re-read reference and cancellation before each append. A later cancel still wins on refresh.
   const ref=await refresh();if(!ref)break;const item=s.items.find(t=>t.id===p.id);if(!item||s.cancelled[p.id]||item.status==='取り消し')continue;
   if(!ref.tabs.includes('指示の報告')){try{await call(()=>io.addReportTab());}catch(e){check();if(!(await call(()=>io.tabs(own))).includes('指示の報告'))throw e;}}
   const rr=await read(own,'指示の報告');
   if(rr.length){reports(rr);if(rr.slice(1).some(r=>r[0]===p.id&&r[4]===p.at&&r[1]==='完了'&&r[2]===p.date&&String(r[3]||'')===p.memo)){delete s.pending[p.id];s.reports=reports(rr);commit();sent++;continue;}}
   if(!rr.length){await call(()=>io.appendReport([REPORT]));const header=await read(own,'指示の報告');table(header,REPORT);}else reports(rr);
   // Verify source again after tab setup, before writing. Never redirect a pending report.
   const last=await reference();if(last.box!==s.boxId){s.blocked=true;fail('指示箱の参照先が変わったため報告を止めました。');}
   const fresh=boxes(await read(s.boxId,'指示'));const current=fresh.find(t=>t.id===p.id);if(!current)fail('報告先の指示が見つかりません。');if(current.status==='取り消し'){s.cancelled[p.id]={at:current.cancelledAt,by:current.cancelledBy};commit();continue;}
   await call(()=>io.appendReport([[p.id,'完了',p.date,p.memo,p.at]]));
   const after=await read(own,'指示の報告');reports(after);
   if(!after.slice(1).some(r=>String(r[0])===p.id&&String(r[4])===p.at&&r[1]==='完了'&&r[2]===p.date&&String(r[3]||'')===p.memo))fail('完了報告を読み戻して確認できません。未送信として次の同期で再試行します。');
   delete s.pending[p.id];s.reports=reports(after);commit();sent++;
  }
  await refresh();return {sent,open:tasks(state,own).length};
 }catch(e){s.error=e.status===403?'指示箱または報告へのアクセス権を確認してください。':e.message||'指示箱を確認できません。';if(!persistFailed)try{commit();}catch{}throw e;}
}
return {BOX,REPORT,day,source,tasks,pending,complete,sync,boxes,reports,itemState};
});
