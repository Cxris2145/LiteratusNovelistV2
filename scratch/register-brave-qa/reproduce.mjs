import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const out=fileURLToPath(new URL('.',import.meta.url));
const workspace=resolve(out,'../..');
const app=join(workspace,'respaldos-software/LiteratusNovelist-main/Producto/frontend/dist/frontend/browser');
const origin='http://127.0.0.1:4398';
const debugPort=9348;
const browserPath='C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const profile=join(out,`browser-profile-${Date.now()}`);
const after=process.argv.includes('--after');
const suffix=after?'-after':'';
const report={ phase:after?'candidate-mitigation':'baseline', mode:'headless, default GPU settings', isolatedProfile:true, savedAutofillAvailable:false, browserExecutable:browserPath, steps:[], crashes:[], runtimeErrors:[], consoleErrors:[], failedResources:[], registerRequests:[], screenshots:[], browserExit:null, unexpectedSocketClose:null };
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm'};
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const server=createServer(async(req,res)=>{
  try {
    let path=resolve(app,'.'+decodeURIComponent(new URL(req.url,origin).pathname));
    if(path!==app&&!path.startsWith(app+sep))throw Error('Path outside fixture root');
    if(!(await stat(path).catch(()=>null))?.isFile())path=join(app,'index.html');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
});
await mkdir(profile,{recursive:true});
await new Promise(done=>server.listen(4398,'127.0.0.1',done));
const browser=spawn(browserPath,['--headless=new','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
let stderr='';let cleanup=false;let socket;let closeBrowser;
browser.stderr.on('data',data=>{stderr=(stderr+String(data)).slice(-65536);});
browser.on('exit',(code,signal)=>{if(!cleanup)report.browserExit={code,signal};});
async function retry(fn,n=120){let error;for(let i=0;i<n;i++){try{return await fn();}catch(e){error=e;await pause(150);}}throw error;}
function assert(ok,msg){if(!ok)throw Error(msg);}
try {
  const version=await retry(async()=>(await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json());
  report.browserVersion=version;
  socket=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  let nextId=0;const pending=new Map();
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(['Target.targetCrashed','Inspector.targetCrashed','Inspector.detached'].includes(msg.method)&&!cleanup)report.crashes.push({event:msg.method,params:msg.params});
    if(msg.method==='Runtime.exceptionThrown'&&report.runtimeErrors.length<30)report.runtimeErrors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error'&&report.consoleErrors.length<30)report.consoleErrors.push(msg.params.args.map(a=>a.value??a.description).join(' ').slice(0,1000));
    if(msg.method==='Network.loadingFailed'&&report.failedResources.length<50)report.failedResources.push({error:msg.params.errorText,blockedReason:msg.params.blockedReason,type:msg.params.type});
    if(msg.method==='Network.requestWillBeSent'&&new URL(msg.params.request.url).pathname.includes('/users/register/'))report.registerRequests.push({method:msg.params.request.method,url:msg.params.request.url});
    if(!msg.id||!pending.has(msg.id))return;
    const entry=pending.get(msg.id);pending.delete(msg.id);clearTimeout(entry.timer);
    if(msg.error)entry.fail(Error(msg.error.message));else entry.ok(msg.result);
  });
  socket.addEventListener('close',event=>{
    if(!cleanup)report.unexpectedSocketClose={code:event.code,reason:event.reason};
    for(const entry of pending.values()){clearTimeout(entry.timer);entry.fail(Error('CDP socket closed'));}pending.clear();
  });
  const send=(method,params={},sessionId)=>new Promise((ok,fail)=>{
    const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout: '+method));},10000);
    pending.set(id,{ok,fail,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
  closeBrowser=()=>send('Browser.close');
  report.gpu=await send('SystemInfo.getInfo').catch(e=>({error:e.message}));
  await send('Target.setDiscoverTargets',{discover:true});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const cmd=(method,params={})=>send(method,params,sessionId);
  const evaluate=async expression=>{
    const result=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Inspector.enable');await cmd('Network.enable');await cmd('Performance.enable');
  await cmd('Network.setBlockedURLs',{urls:['http://localhost:8000/*','http://localhost:8010/*','*supabase.co/*']});
  await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('literatus_guide_dismissed','true');localStorage.setItem('literatus_guide_seen','true');`});
  await cmd('Page.navigate',{url:origin+'/register'});
  await retry(async()=>assert(await evaluate(`!!document.querySelector('app-register input[formcontrolname="username"]')`),'Registration input not mounted'));
  await evaluate('document.fonts.ready');await pause(600);
  const selector='app-register input[formcontrolname="username"]';
  const focus=async()=>{
    const p=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
    await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
  };
  const key=async(key,code,virtual,modifiers=0)=>{
    await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual,modifiers});
    await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual,modifiers});
  };
  const clear=async()=>{await key('a','KeyA',65,2);await key('Backspace','Backspace',8);};
  const sample=async name=>{
    const state=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const c=window.ng?.getComponent(document.querySelector('app-register'));return{valueLength:el.value.length,valuePreview:el.value.slice(0,60),maxLength:el.maxLength,autocomplete:el.autocomplete,spellcheck:el.spellcheck,panelBackdropFilter:getComputedStyle(document.querySelector('app-register .glass-panel')).backdropFilter,inputTransitionProperty:getComputedStyle(el).transitionProperty,focused:document.activeElement===el,activeField:document.activeElement?.getAttribute('formcontrolname'),formValueLength:c?.registerForm.controls.username.value.length,usernameErrors:c?.registerForm.controls.username.errors,bodyOverflow:document.documentElement.scrollWidth-innerWidth};})()`);
    const perf=await cmd('Performance.getMetrics');const keep=['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','LayoutCount','RecalcStyleCount','TaskDuration'];
    const metrics=Object.fromEntries(perf.metrics.filter(m=>keep.includes(m.name)).map(m=>[m.name,m.value]));
    report.steps.push({name,...state,metrics});
  };
  await sample('mounted');await focus();await sample('mouse-focus');
  for(const text of after?['chris']:['Cxris','admin','Christopher']){
    await clear();
    for(const ch of text){
      await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,unmodifiedText:ch,windowsVirtualKeyCode:ch.toUpperCase().charCodeAt(0)});
      await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:ch,windowsVirtualKeyCode:ch.toUpperCase().charCodeAt(0)});
      await pause(60);
    }
    await sample('native-key-events-'+text);
  }
  await sample('native-key-events-letter-by-letter');
  await key('Tab','Tab',9);await sample('tab-to-email');
  await key('Tab','Tab',9,8);await sample('shift-tab-back');
  await key('ArrowDown','ArrowDown',40);await key('Escape','Escape',27);await sample('autofill-popup-shortcut-empty-profile');
  await focus();await clear();await cmd('Input.insertText',{text:'NombrePegado_Árbol_123'});await sample('paste-equivalent-insertText');
  await clear();await cmd('Input.insertText',{text:'a'});await key('Tab','Tab',9);await sample('short-name-validation');
  await focus();await clear();await cmd('Input.insertText',{text:'Lector'.repeat(1365)});await sample('long-input-8190-characters');
  await clear();await cmd('Input.insertText',{text:after?'chris':'lector_final'});
  for(let i=0;i<5;i++){await key('Tab','Tab',9);await key('Tab','Tab',9,8);}
  await sample('five-focus-blur-cycles');
  await evaluate('scrollTo({top:0,behavior:"instant"})');
  const shot=await cmd('Page.captureScreenshot',{format:'png',fromSurface:true});
  await writeFile(join(out,`register-brave-filled${suffix}.png`),Buffer.from(shot.data,'base64'));report.screenshots.push(`register-brave-filled${suffix}.png`);
  await pause(3000);await sample('stable-three-seconds-after-input');
  report.processInfo=await send('SystemInfo.getProcessInfo');
  report.targets=(await send('Target.getTargets')).targetInfos.map(t=>({type:t.type,url:t.url,attached:t.attached}));
  report.result=report.crashes.length||report.browserExit||report.unexpectedSocketClose?'crash-or-disconnect-observed':'no-crash-reproduced';
}catch(error){report.result='qa-error';report.error=error.stack||String(error);}
finally{
  cleanup=true;
  await closeBrowser?.().catch(()=>{});socket?.close();browser.kill();server.close();
  await pause(600);
  const target=resolve(profile),base=resolve(out)+sep;
  if(!target.startsWith(base)||!target.split(sep).at(-1).startsWith('browser-profile-'))throw Error('Refused cleanup outside QA folder');
  await rm(target,{recursive:true,force:true}).catch(error=>{report.cleanupError=error.message;});
  if(stderr.trim())await writeFile(join(out,`browser-stderr${suffix}.log`),stderr);
  await writeFile(join(out,`report${suffix}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:report.result,steps:report.steps,crashes:report.crashes,runtimeErrors:report.runtimeErrors,browserExit:report.browserExit,unexpectedSocketClose:report.unexpectedSocketClose,registerRequests:report.registerRequests,error:report.error,cleanupError:report.cleanupError},null,2));
}
