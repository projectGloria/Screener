const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const bg = fs.readFileSync(path.join(root,'background.js'),'utf8').replace(/^import .*;\r?\n/gm,'');
const sandbox = vm.createContext({chrome:{runtime:{onMessage:{addListener(){}}}}});
vm.runInContext(bg,sandbox);
async function install(page) {
 await page.evaluate(() => {
  globalThis.chrome={runtime:{id:'test',onMessage:{addListener(fn){globalThis.handler=fn}}}};
  globalThis.send=(action,extra={})=>new Promise(resolve=>handler({target:'screener-page',action,...extra},{id:'test'},resolve));
 });
 await page.addScriptTag({path:path.join(root,'content.js')});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.SCREENER_CHROMIUM_PATH});
 console.log('Browser',browser.version());
 try {
  const page=await browser.newPage({viewport:{width:1000,height:600}});
  await page.setContent('<style>body{margin:0}#s{width:600px;height:400px;overflow:auto}#child{height:1600px}</style><div id="s"><div id="child">Nested content</div></div>');
  await install(page);
  const info=await page.evaluate(()=>send('prepare',{frameOnly:true}));
  const move=await page.evaluate(()=>send('move',{x:400,y:0}));
  assert.equal(info.width,1000);assert.equal(info.viewportWidth,600);assert.equal(move.x,0);
  console.log('F-001 reproduced: nested host width 600, reported width',info.width,'requested x 400 clamps to',move.x);
  await page.evaluate(()=>send('restore'));
  await page.setContent('<style>body{margin:0}iframe{position:absolute;left:100px;top:80px;width:600px;height:400px;border:0}</style><iframe srcdoc="<style>body{margin:0;height:1500px}</style>Frame"></iframe>');
  const frame=page.frames()[1]; await frame.waitForLoadState(); await install(frame);
  const fi=await frame.evaluate(()=>send('prepare',{frameOnly:true}));
  const fm=await frame.evaluate(()=>send('move',{x:0,y:0}));
  sandbox.fi=fi;sandbox.fm=fm;
  const normalized=vm.runInContext(`normalizeFrameInfo(fm,1,{innerWidth:1000,innerHeight:600},[{href:fi.frameUrl,rect:{x:100,y:80,width:600,height:400}}])`,sandbox);
  assert.equal(fi.captureRect.x,100);assert.equal(normalized.captureRect.x,200);assert.equal(normalized.captureRect.y,160);
  console.log('F-002 reproduced: same-origin frame (100,80) becomes',JSON.stringify(normalized.captureRect));
  await frame.evaluate(()=>send('restore'));
  await page.setContent('<style>body{margin:0;height:1200px}</style>Dynamic page');await install(page);
  const before=await page.evaluate(()=>send('prepare',{frameOnly:true}));
  await page.evaluate(()=>document.body.style.height='2400px');
  const after=await page.evaluate(()=>send('move',{x:0,y:600}));
  assert.equal(before.height,1200);assert.equal(after.height,2400);
  console.log('F-003 reproduced: initial height',before.height,'later height',after.height,'background fixes ys/canvas to initial height');
  await page.evaluate(()=>send('restore'));
  await page.setContent('<style>body{margin:0;height:1200px;background-image:url("data:image/png;base64,AA==")}</style>Slow resource');await install(page);
  await page.evaluate(()=>{
   globalThis.originalTimeout=globalThis.setTimeout;globalThis.timeoutDurations=[];
   globalThis.setTimeout=(fn,ms,...args)=>{timeoutDurations.push(ms);return originalTimeout(fn,ms,...args)};
   window.Image=class {set src(v){} };
   globalThis.done=false;send('prepare',{frameOnly:true}).then(()=>done=true);
  });
  await page.waitForTimeout(100);
  const stalled=await page.evaluate(()=>({done,timers:timeoutDurations,style:[...document.querySelectorAll('style')].some(s=>s.textContent.includes('animation-play-state'))}));
  assert.equal(stalled.done,false);assert.equal(stalled.style,true);assert.equal(stalled.timers.includes(15000),false);
  await page.evaluate(()=>send('cancel'));
  assert.equal(await page.evaluate(()=>done),false);
  console.log('F-004 reproduced: never-settling background leaves prepare pending, watchdog absent, cancel does not settle prepare',JSON.stringify(stalled));
  await page.close();
 } finally {await browser.close()}
 let resolveBlob,saved=0,opened=0;
 const fin=vm.createContext({setTimeout,crypto:require('node:crypto').webcrypto,saveCapture:async()=>saved++,chrome:{runtime:{onMessage:{addListener(){}},getURL:x=>x},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},tabs:{create:async()=>opened++}},canvas:{width:1,height:1,convertToBlob:()=>new Promise(r=>resolveBlob=r)}});
 vm.runInContext(bg,fin);vm.runInContext('job={cancelled:false}',fin);
 const completing=vm.runInContext("finish(canvas,{title:'Synthetic'},'Full page')",fin);
 vm.runInContext('job.cancelled=true',fin);resolveBlob(new Blob(['x']));await completing;
 assert.equal(saved,1);assert.equal(opened,1);
 console.log('F-005 reproduced: cancellation during encoding still saves and opens preview');
})().catch(e=>{console.error(e);process.exitCode=1});
