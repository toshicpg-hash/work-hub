'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const block=html.slice(html.indexOf('const ROLES='),html.indexOf('const roleLabel='));
const ctx={};vm.createContext(ctx);vm.runInContext("const COMPANIES=['CP','CPY','AT'];"+block+';globalThis.can=canSee;',ctx);
const gm={sheetId:'gm',role:'GM',gmCo:'CPY',company:'CPY'},employee={sheetId:'employee',role:'社員',gmCo:'',company:'CPY'};
assert.equal(ctx.can(gm,employee),true);
for(const company of ['CP','AT','CP,CPY','CPY,AT','CP,CPY,AT','', 'CPY CPY','CPY,UNKNOWN'])assert.equal(ctx.can(gm,{...employee,company}),false,company);
for(const role of ['全社','GM','unknown'])assert.equal(ctx.can(gm,{...employee,role}),false,role);
assert.equal(ctx.can(gm,{...employee,gmCo:'CPY'}),false);
assert.equal(ctx.can(gm,{...employee,role:'全社',company:'CP,CPY,AT',gmCo:'CP'}),false);
assert.equal(ctx.can(gm,{...employee,removed:true}),false);
assert.equal(ctx.can(gm,{...employee,sheetId:'gm'}),false);
assert.equal(ctx.can({...gm,removed:true},employee),false);
assert.equal(ctx.can({...gm,role:'社員',gmCo:''},employee),false);
const all={...gm,role:'全社',gmCo:'CP'};
for(const s of [employee,{...employee,company:'CP,CPY,AT',role:'GM',gmCo:'AT'}])assert.equal(ctx.can(all,s),true);
console.log('PASS single-company employee scope; multi-company/management exclusions; self/removed/nonviewer; all-company scope preserved');
/* v1.50.19 同じ会社のGMが2人：2人とも同じ一般社員を見られ、GM同士はおたがいを見ない。片方を外しても、もう片方は見られる */
{const gm2={sheetId:'gm2',role:'GM',gmCo:'CPY',company:'CPY'};
 assert.equal(ctx.can(gm2,employee),true);assert.equal(ctx.can(gm,employee),true);
 assert.equal(ctx.can(gm,gm2),false);assert.equal(ctx.can(gm2,gm),false);
 assert.equal(ctx.can({...gm,role:'社員',gmCo:''},employee),false);assert.equal(ctx.can(gm2,employee),true,'removing one GM keeps the other');
 console.log('PASS two GMs of one company see the same employees, not each other');}
/* v1.50.19 統括GM：同じ会社のほかのGMの記録も見る（一方向）。印は役割がGMでGMの会社がある人だけ。印を外せば見ない */
{const lead={sheetId:'lead',role:'GM',gmCo:'CPY',company:'CPY',gmLead:true},sub={sheetId:'sub',role:'GM',gmCo:'CPY',company:'CPY'};
 assert.equal(ctx.can(lead,sub),true,'lead sees the other GM');assert.equal(ctx.can(sub,lead),false,'never the reverse');
 assert.equal(ctx.can(lead,employee),true);assert.equal(ctx.can(sub,employee),true,'the other GM keeps its view');
 assert.equal(ctx.can(lead,{...sub,gmCo:'CP'}),false,'GMs of another company are not seen');
 assert.equal(ctx.can(lead,{...sub,role:'全社',gmCo:'CPY',company:'CP,CPY,AT'}),false,'全社 holding a GM company is not seen');
 assert.equal(ctx.can({...lead,gmLead:false},sub),false,'removing the mark removes the view');
 assert.equal(ctx.can({...lead,role:'全社'},employee),true);assert.equal(ctx.can({...sub,gmLead:true,role:'社員',gmCo:''},employee),false,'a mark without the GM role does nothing');
 assert.equal(ctx.can(lead,{...lead,sheetId:'lead2'}),false,'another lead is not seen');
 assert.equal(ctx.can(lead,{...sub,removed:true}),false);
 console.log('PASS lead GM sees the other GMs of its company one way; mark removal and non-GM marks have no effect');}
const validation=html.slice(html.indexOf('function shareValidateStaff('),html.indexOf('async function adminShareSync('));
const guard={D:()=>({viewListId:'view-list'})};vm.createContext(guard);vm.runInContext(validation+';this.check=shareValidateStaff',guard);
const row={sheetId:'active-file',email:'same@example.com',removed:false};
assert.doesNotThrow(()=>guard.check([row,{...row,sheetId:'old-file',removed:true},{...row,sheetId:'older-file',removed:true}]));
assert.throws(()=>guard.check([row,{...row,sheetId:'conflict',email:'SAME@example.com'}]),/重複/);
assert.throws(()=>guard.check([row,{...row,removed:true}]),/ファイルID/);
assert.throws(()=>guard.check([{...row,boxId:'view-list'}]),/ファイルID/);
assert.throws(()=>guard.check([row,{sheetId:'other-file',boxId:'active-file',email:'other@example.com'}]),/ファイルID/);
console.log('PASS removed email history allowed; multiple active accounts and cross-file identity collisions rejected');
