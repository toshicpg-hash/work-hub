'use strict';
/* Persistent cell grid, range/field-mask updates and GET projections. Rejected batches
   commit nothing. This models documented semantics; it is not a live Google test. */
const cellValue=c=>{const v=c?.userEnteredValue||{};return v.stringValue??v.numberValue??v.boolValue??'';};
function valuesOf(cells,grid){
 const rows=Array.from({length:grid.rowCount},(_,r)=>{
  const row=Array.from({length:grid.columnCount},(_,c)=>cellValue(cells[r+','+c]));
  while(row.length&&row.at(-1)==='')row.pop();return row;
 });
 while(rows.length&&!rows.at(-1).length)rows.pop();return rows;
}
module.exports=function reply(network,req){
 const u=new URL(req.url()),decoded=decodeURIComponent(u.pathname),method=req.method();
 network.grid??={sheetId:17,columnCount:29,rowCount:3};network.exports??={};network.calls??=[];
 if(!network.cells){network.cells={};(network.exports['案件']||[]).forEach((row,r)=>row.forEach((v,c)=>{if(v!==''&&v!=null)network.cells[r+','+c]={userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}};}));}
 network.calls.push({method,path:decoded});
 const fail=message=>({status:400,body:{error:{message}}});
 const tab=decoded.split('/values/')[1]?.split('!')[0].replace(/:clear$/,'').replace(/^'|'$/g,'');
 if(method==='GET'){
  if(decoded.endsWith('/values:batchGet'))return {body:{valueRanges:u.searchParams.getAll('ranges').map(range=>({range,values:range.replace(/^'|'$/g,'')==='案件'?valuesOf(network.cells,network.grid):network.exports[range.replace(/^'|'$/g,'')]||[]}))}};
  if(tab==='案件')return {body:{range:"'案件'",values:valuesOf(network.cells,network.grid)}};
  if(network.fault==='metadata')return fail('synthetic metadata denied');
  return {body:{sheets:['案件','入金','立替','情報','ToDo'].map((title,i)=>({properties:{title,sheetId:i?17+i:17,...(network.fault==='missing-grid'?{}:{gridProperties:title==='案件'?{columnCount:network.grid.columnCount,rowCount:network.grid.rowCount}:{columnCount:29,rowCount:1000}})}}))}};
 }
 if(decoded.endsWith(':batchUpdate')){
  if(network.fault==='batch')return fail('synthetic batch rejected');
  const grid={...network.grid},cells=structuredClone(network.cells);
  for(const r of req.postDataJSON().requests){
   if(r.appendDimension){if(network.fault==='expand')return fail('synthetic expansion denied');const d=r.appendDimension;if(d.sheetId!==grid.sheetId||!Number.isInteger(d.length)||d.length<1)return fail('bad append');const k=d.dimension==='COLUMNS'?'columnCount':d.dimension==='ROWS'?'rowCount':null;if(!k)return fail('bad dimension');grid[k]+=d.length;}
   else if(r.updateCells){
    if(network.fault==='values')return fail('synthetic values rejected after validating expansion');
    const x=r.updateCells,location=x.range||x.start,fields=x.fields.split(',');
    if(!location||!!x.range===!!x.start||location.sheetId!==grid.sheetId||fields.some(f=>!['userEnteredValue','userEnteredFormat'].includes(f)))return fail('bad target/fields');
    const sr=x.range?.startRowIndex??x.start?.rowIndex??0,sc=x.range?.startColumnIndex??x.start?.columnIndex??0;
    const er=x.range?(x.range.endRowIndex??grid.rowCount):sr+x.rows.length,ec=x.range?(x.range.endColumnIndex??grid.columnCount):sc+Math.max(0,...x.rows.map(r=>r.values.length));
    if(sr<0||sc<0||er>grid.rowCount||ec>grid.columnCount||sr>er||sc>ec||sr+x.rows.length>er||x.rows.some(r=>sc+r.values.length>ec))return fail('Range exceeds grid limits');
    for(let ri=sr;ri<er;ri++)for(let ci=sc;ci<ec;ci++){
     const supplied=x.rows[ri-sr]?.values?.[ci-sc];if(!x.range&&!supplied)continue;
     const key=ri+','+ci,target=cells[key]??={};
     for(const f of fields){if(supplied?.[f]!==undefined)target[f]=structuredClone(supplied[f]);else delete target[f];}
     if(!Object.keys(target).length)delete cells[key];
    }
   }else return fail('unexpected operation');
  }
  network.grid=grid;network.cells=cells;network.exports['案件']=valuesOf(cells,grid);network.batches=(network.batches||0)+1;
  (network.snapshots??=[]).push(structuredClone(network.exports['案件']));return {body:{replies:req.postDataJSON().requests.map(()=>({}))}};
 }
 if(method==='PUT'){
  const rows=req.postDataJSON().values;if(tab==='案件'){
   if(rows.length>network.grid.rowCount||rows.some(r=>r.length>network.grid.columnCount))return fail('Range exceeds grid limits');
   rows.forEach((row,r)=>row.forEach((v,c)=>{const cell=network.cells[r+','+c]??={};cell.userEnteredValue=typeof v==='number'?{numberValue:v}:{stringValue:String(v)};}));
   network.exports[tab]=valuesOf(network.cells,network.grid);
  }else network.exports[tab]=rows;
 }
 if(decoded.endsWith(':clear')){network.exports[tab]=[];if(tab==='案件'){for(const c of Object.values(network.cells))delete c.userEnteredValue;network.caseClear=true;}}
 return {body:{}};
};
