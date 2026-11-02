/* Foundation fixture only: no application data filtering or Google access. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const source=fs.readFileSync(path.join(__dirname,'../view-scope.js'),'utf8');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:12px;font:16px sans-serif}section{display:flex;flex-wrap:wrap;gap:12px}label{display:flex;flex-direction:column;flex:1 1 140px;min-width:0}select{font:inherit;max-width:100%;min-width:0;width:100%;padding:8px}p{overflow-wrap:anywhere}button{font:inherit;white-space:normal;overflow-wrap:anywhere}</style><nav></nav><main></main><script src="/view-scope.js"></script><script>
const people=Array.from({length:20},(_,i)=>({sheetId:'fixture-sheet-'+i,name:i<2?'例題 同名':'例題 社員'+i,company:['CP','CPY','AT'][i%3],role:'社員'}));
const context={people,selfId:people[0].sheetId,allowAll:true,canView:p=>!p.removed,readState:'ready'};
const identity={account:'fixture@example.com',record:'fixture-record',viewer:'fixture-viewer'};
const API=CPGViewScope;let selection=API.load(localStorage,identity,context).selection,page='ホーム';
const pages=['ホーム','予定','案件','ToDo','数字','領収書'];
document.querySelector('nav').innerHTML=pages.map(s=>'<button data-page="'+s+'">'+s+'</button>').join('');
function draw(){document.querySelector('main').innerHTML='<h1>'+page+'</h1>'+API.controls(context,selection)+'<p>選択基盤だけの合成プレビュー（業務データ未接続）</p>';}
document.addEventListener('click',e=>{if(e.target.dataset.page){page=e.target.dataset.page;draw()}});
document.addEventListener('change',e=>{const k=e.target.matches('[data-scope-company]')?'company':e.target.matches('[data-scope-person]')?'person':null;if(!k)return;const next={...selection,[k]:e.target.value};if(API.save(localStorage,identity,next).ok)selection=next;draw();document.querySelector(k==='company'?'[data-scope-company]':'[data-scope-person]').focus()});
window.fixture={context,identity,get selection(){return selection},draw};draw();
</script>`;
(async()=>{let browser;const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/view-scope.js'?'text/javascript':'text/html');res.end(req.url==='/view-scope.js'?source:html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port);
assert.equal(await page.locator('[data-scope-person]').inputValue(),'fixture-sheet-0');
await page.locator('[data-scope-company]').selectOption('CPY');assert.equal(await page.locator('[data-scope-person]').inputValue(),'fixture-sheet-0');assert.match(await page.locator('[role=status]').innerText(),/全員には切り替えていません/);
// Native select keyboard path as well as touch focus; no fill-only selection.
await page.locator('[data-scope-person]').tap();await page.keyboard.press('Escape');await page.locator('[data-scope-person]').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
assert.match(await page.locator('[data-scope-person]').inputValue(),/^fixture-sheet-\d+$/);
await page.locator('[data-scope-person]').selectOption('fixture-sheet-1');
for(const name of ['予定','案件','ToDo','数字','領収書','ホーム']){await page.getByRole('button',{name,exact:true}).tap();assert.equal(await page.locator('[data-scope-company]').inputValue(),'CPY');assert.equal(await page.locator('[data-scope-person]').inputValue(),'fixture-sheet-1')}
await page.reload();assert.equal(await page.locator('[data-scope-person]').inputValue(),'fixture-sheet-1');console.log('PASS synthetic navigation across six screens and reload preserve sheet ID');
await page.evaluate(()=>{fixture.context.people.find(p=>p.sheetId==='fixture-sheet-1').removed=true;fixture.draw()});assert.match(await page.locator('[role=status]').innerText(),/確認できません/);assert.equal(await page.locator('[data-scope-person]').inputValue(),'fixture-sheet-1');console.log('PASS removal keeps unavailable selection, never all');
for(const width of [360,390,820]){await page.reload();await page.setViewportSize({width,height:width===820?900:844});await page.evaluate(()=>{const nodes=[...document.querySelectorAll('body,body *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,size]of nodes)e.style.fontSize=(size*1.5)+'px'});assert.equal(await page.locator('select').first().evaluate(e=>getComputedStyle(e).fontSize),'24px');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}console.log('PASS 360/390/820 widths with actual computed fonts 150%');
assert.deepEqual(errors,[]);console.log('3 scope browser foundation groups passed');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
