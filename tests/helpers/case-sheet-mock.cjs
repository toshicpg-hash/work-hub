'use strict';
/* A bounded Sheets model: updates cannot exceed the grid; a rejected batch applies nothing.
   This models documented behavior, not a live Google compatibility test. */
module.exports=function reply(network,req){
 const u=new URL(req.url()),decoded=decodeURIComponent(u.pathname),method=req.method();
 network.grid??={sheetId:17,columnCount:29,rowCount:3};network.exports??={};network.calls??=[];
 network.calls.push({method,path:decoded});
 const fail=message=>({status:400,body:{error:{message}}});
 if(method==='GET'){
  if(network.fault==='metadata')return fail('synthetic metadata denied');
  return {body:{sheets:['案件','入金','立替','情報','ToDo'].map((title,i)=>({properties:{title,sheetId:i?17+i:17,...(network.fault==='missing-grid'?{}:{gridProperties:title==='案件'?{columnCount:network.grid.columnCount,rowCount:network.grid.rowCount}:{columnCount:29,rowCount:1000}})}}))}};
 }
 if(decoded.endsWith(':batchUpdate')){
  if(network.fault==='batch')return fail('synthetic batch rejected');
  const grid={...network.grid};let values=network.exports['案件'];
  for(const r of req.postDataJSON().requests){
   if(r.appendDimension){if(network.fault==='expand')return fail('synthetic expansion denied');const d=r.appendDimension;if(d.sheetId!==grid.sheetId||!Number.isInteger(d.length)||d.length<1)return fail('bad append');const k=d.dimension==='COLUMNS'?'columnCount':d.dimension==='ROWS'?'rowCount':null;if(!k)return fail('bad dimension');grid[k]+=d.length;}
   else if(r.updateCells){if(network.fault==='values')return fail('synthetic values rejected after validating expansion');const x=r.updateCells;if(x.range?.sheetId!==grid.sheetId||x.fields!=='userEnteredValue')return fail('bad target/fields');if(x.rows.length>grid.rowCount||x.rows.some(r=>r.values.length>grid.columnCount))return fail('Range exceeds grid limits');values=x.rows.map(r=>r.values.map(c=>{const v=c.userEnteredValue||{};return v.stringValue??v.numberValue??v.boolValue??'';}));}
   else return fail('unexpected operation');
  }
  network.grid=grid;network.exports['案件']=values;network.batches=(network.batches||0)+1;return {body:{replies:req.postDataJSON().requests.map(()=>({}))}};
 }
 const tab=decoded.split('/values/')[1]?.split('!')[0].replace(/^'|'$/g,'').replace(/:clear$/,'');
 if(method==='PUT'){const rows=req.postDataJSON().values;if(tab==='案件'&&rows.some(r=>r.length>network.grid.columnCount))return fail('Range exceeds grid limits');network.exports[tab]=rows;}
 if(decoded.endsWith(':clear')){network.exports[tab]=[];if(tab==='案件')network.caseClear=true;}
 return {body:{}};
};
