'use strict';
const assert=require('node:assert/strict'),N=require('../staff-names.js');let n=0;function test(name,f){f();console.log('PASS',name);n++}
const a={name:'例題 一郎',email:'a@example.com',sheetId:'A'},b={name:'例題 二郎',email:'b@example.com',sheetId:'B'};
test('同姓は推測しない・所有シートで識別',()=>{assert.equal(N.resolve([a,b],'例題',null,[]),null);assert.equal(N.resolve([a,b],'例題','B',[]),b);assert.equal(N.resolve([a,b],'例題一',null,[]),a);assert.equal(N.resolve([a,b],'根拠なし',null,[]),null)});
test('同名・略称衝突を先頭や管理者へ寄せない',()=>{const c={...b,name:a.name};assert.equal(N.resolve([a,c],a.name,null,[]),null);assert.equal(N.resolve([a,c],a.name,'B',[]),c);assert.match(N.label(a,[a,c]),/a@example.com／A/);assert.match(N.label(c,[a,c]),/b@example.com／B/)});
const r=N.change(a,'例題 正式一郎','change-a','2026-11-02T00:00:00Z'),done={...r,state:'confirmed'};
test('意図だけでは表示変更しない・確定後も旧キー/原本不変',()=>{const before=JSON.stringify(a);assert.equal(N.overlay([a],[r])[0].name,a.name);const p=N.overlay([a],[r,done])[0];assert.equal(p.name,'例題 正式一郎');assert.equal(p.nameKey,a.name);assert.equal(N.resolve([p],a.name,null,[]),p);assert.equal(JSON.stringify(a),before);assert.equal(N.pending([r],'A').length,1);assert.equal(N.pending([r,done],'A').length,0)});
test('重複は一致時だけ許容・別内容や確定のみは停止',()=>{assert.equal(N.parse([r,r,done,done]).length,2);assert.throws(()=>N.parse([r,{...r,after:'違う'}]));assert.throws(()=>N.parse([done]));assert.throws(()=>N.parse([r,{...done,sheetId:'B'}]));assert.throws(()=>N.parse([{...r,at:'不明'}]));assert.throws(()=>N.change(a,'<script>','x',r.at))});
test('2回の変更後も旧登録名・変更前名を解決',()=>{const p=N.overlay([a],[r,done])[0],r2=N.change(p,'例題 最終名','change-b',r.at),q=N.overlay([p],[r,done,r2,{...r2,state:'confirmed'}])[0];assert.equal(q.nameKey,a.name);assert.equal(N.resolve([q],r.after,null,[]),q);assert.equal(N.resolve([q],a.name,null,[]),q)});
console.log('ALL PASS',n);
