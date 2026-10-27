import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const out=fileURLToPath(new URL('.',import.meta.url));
const workspace=resolve(out,'../..');
const app=join(workspace,'respaldos-software/LiteratusNovelist-main/Producto/frontend/dist/frontend/browser');
const origin='http://127.0.0.1:4399',debugPort=9349;
const profile=join(out,`browser-profile-${Date.now()}`);
const finalOnly=process.argv.includes('--final');
const report={checks:[],screenshots:[],runtimeErrors:[],consoleErrors:[],backendRequests:[]};
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{let path=resolve(app,'.'+decodeURIComponent(new URL(req.url,origin).pathname));if(path!==app&&!path.startsWith(app+sep))throw Error('Outside fixture root');if(!(await stat(path).catch(()=>null))?.isFile())path=join(app,'index.html');res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await mkdir(profile,{recursive:true});await new Promise(done=>server.listen(4399,'127.0.0.1',done));
const browser=spawn('C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',['--headless=new','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,closeBrowser,cleanup=false;
async function retry(fn,n=100){let error;for(let i=0;i<n;i++){try{return await fn();}catch(e){error=e;await pause(120);}}throw error;}
function assert(ok,message){if(!ok)throw Error(message);}
const fixtures=Array.from({length:6},(_,i)=>({full:false,friend_code:['K7Q2XM','LUNA24','TINTA8','LECTOR','MAGIA9','CUENTO'][i],username:['LunaEscribe','Mar_de_Tinta','Felipe','UnaLectoraConUnNombreExtraordinariamenteLargo','admin','eithan'][i],avatar:null,outfit:{head:['witch-flower','aviator','wizard','beret','wizard','wizard'][i]},equipped_frame:'',equipped_title:'',is_public:true,relation:i===4?'incoming':i===5?'friend':'none',request_id:i===4?'qa-incoming':null,reason:['2 amigos en común','También disfruta de los cuentos','Lector de Literatus','Comparte tus historias favoritas','Quiere ser tu amigo','Lector de Literatus'][i],mutual_friends:i===0?2:0}));
const me={full:true,friend_code:'CX7RIS',username:'Cxris',avatar:null,outfit:{head:'wizard'},equipped_frame:'',equipped_title:'',tagline:'Siempre hay otra historia.',bio:'',level:12,level_name:'Lector',xp:1200,favorite_genres:[],stats:{books:2,books_read:1,reviews:0,friends:0,brindis:0},member_since:'2026-01-01T00:00:00Z',is_public:true,relation:'self',request_id:null,pending_incoming:0};
try{
  const version=await retry(async()=>(await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json());report.browserVersion=version.Browser;
  socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  let nextId=0;const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method==='Runtime.exceptionThrown')report.runtimeErrors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error'&&report.consoleErrors.length<20)report.consoleErrors.push(msg.params.args.map(a=>a.value??a.description).join(' ').slice(0,700));if(msg.method==='Network.requestWillBeSent'&&msg.params.request.url.includes('/api/v1/'))report.backendRequests.push({method:msg.params.request.method,url:msg.params.request.url});if(!msg.id||!pending.has(msg.id))return;const e=pending.get(msg.id);pending.delete(msg.id);clearTimeout(e.timer);if(msg.error)e.fail(Error(msg.error.message));else e.ok(msg.result);});
  socket.addEventListener('close',()=>{for(const e of pending.values()){clearTimeout(e.timer);e.fail(Error('CDP socket closed'));}pending.clear();});
  const send=(method,params={},sessionId)=>new Promise((ok,fail)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},12000);pending.set(id,{ok,fail,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  closeBrowser=()=>send('Browser.close');const {targetId}=await send('Target.createTarget',{url:'about:blank'});const{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});const cmd=(method,params={})=>send(method,params,sessionId);
  const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const waitFor=expression=>retry(async()=>assert(await evaluate(expression),expression));
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['http://localhost:8000/*','http://localhost:8010/*','*supabase.co/*']});await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('literatus_guide_dismissed','true');localStorage.setItem('literatus_guide_seen','true');`});
  async function fixture(width=1440,height=1000,{count=6,mode='success',theme='default',reduced=false}={}){
    await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=480});await cmd('Emulation.setTouchEmulationEnabled',{enabled:width<=480});await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await cmd('Page.navigate',{url:origin+'/tavern'});await waitFor('!!window.ng&&!!document.querySelector("app-tavern-hall")');
    const cards=Array.from({length:count},(_,i)=>({...fixtures[i%fixtures.length],...(i>=6?{friend_code:'QA'+i,username:'Lector '+(i+1)}:{})}));
    await evaluate(`(()=>{
      if(${JSON.stringify(theme)}==='default')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)});
      const hall=ng.getComponent(document.querySelector('app-tavern-hall'));const community=hall.community;const Subject=community.changed$.constructor;
      const qa=window.__qa={cards:${JSON.stringify(cards)},mode:${JSON.stringify(mode)},calls:[],notifications:[],pending:[]};
      const response=(kind,value,delay=60,error=false)=>{const subject=new Subject();if(kind==='suggestions'&&qa.mode==='hold'){qa.pending.push(subject);return subject;}setTimeout(()=>hall.zone.run(()=>{if(error)subject.error({error:{message:'Error de prueba'},message:'Error de prueba'});else{subject.next(value);subject.complete();}}),delay);return subject;};
      community.suggestions=()=>{qa.calls.push({method:'suggestions'});return response('suggestions',{results:qa.cards},100,qa.mode==='error');};
      community.search=query=>{qa.calls.push({method:'search',query});return response('search',{results:query.toLowerCase().includes('nadie')?[]:qa.cards.slice(0,2)},query==='lento'?1000:100,query==='error');};
      community.sendRequest=target=>{qa.calls.push({method:'sendRequest',target});return response('action',{success:true,id:'qa-sent',state:'pending',message:'Solicitud enviada'},140);};
      community.cancel=id=>{qa.calls.push({method:'cancel',id});return response('action',{success:true,message:'Solicitud cancelada'},140);};
      community.accept=id=>{qa.calls.push({method:'accept',id});return response('action',{success:true,state:'accepted',message:'Solicitud aceptada'},140);};
      hall.notification.success=message=>{qa.notifications.push({type:'success',message});return'qa-notice';};hall.notification.error=message=>qa.notifications.push({type:'error',message});
      hall.loggedIn=true;hall.me=${JSON.stringify(me)};hall.loading=false;hall.setFriends([]);ng.applyChanges(hall);hall.zone.run(()=>hall.openAddFriend());
    })()`);
    await waitFor('!!document.querySelector("app-add-friend-dialog")&&!!document.querySelector(".mat-mdc-dialog-surface")');await evaluate('document.fonts.ready');if(mode==='success')await waitFor('ng.getComponent(document.querySelector("app-add-friend-dialog")).suggestions.length==='+count);await pause(350);
  }
  const dialog='ng.getComponent(document.querySelector("app-add-friend-dialog"))';
  async function metrics(name){report.checks.push({name,...await evaluate(`(()=>{const host=document.querySelector('app-add-friend-dialog'),panel=host.querySelector('.af'),surface=host.closest('.mat-mdc-dialog-surface'),r=panel.getBoundingClientRect();const scrolls=[surface,host,...host.querySelectorAll('*')].filter(el=>el&&['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1);return{width:Math.round(r.width),height:Math.round(r.height),insideViewport:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,panelOverflow:panel.scrollWidth-panel.clientWidth,bodyOverflow:document.documentElement.scrollWidth-innerWidth,scrollContainers:scrolls.map(el=>el.className||el.tagName),focused:document.activeElement?.id||document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName,allAvatarsPaused:[...host.querySelectorAll('app-maguito')].every(el=>ng.getComponent(el).paused),ariaLabelledBy:host.closest('[role="dialog"]')?.getAttribute('aria-labelledby'),state:{suggestions:${dialog}.suggestions.length,results:${dialog}.results.length,searching:${dialog}.searching,failed:${dialog}.failed,suggestionsFailed:${dialog}.suggestionsFailed}};})()`)});}
  async function capture(name){const r=await evaluate(`(()=>{const r=document.querySelector('app-add-friend-dialog .af').getBoundingClientRect();return{x:Math.max(0,r.left-10),y:Math.max(0,r.top-10),width:Math.min(innerWidth,r.width+20),height:Math.min(innerHeight,r.height+20),scale:1};})()`);const{data}=await cmd('Page.captureScreenshot',{format:'png',fromSurface:true,...{clip:r}});await writeFile(join(out,name+'.png'),Buffer.from(data,'base64'));report.screenshots.push(name+'.png');}
  async function typeQuery(text){await evaluate('document.querySelector("#af-query").focus()');await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await cmd('Input.insertText',{text});}
  if(finalOnly){
    await fixture();await evaluate(`document.querySelector('.af-results li .af-action').click()`);await waitFor(dialog+`.suggestions[0].relation==='outgoing'`);await pause(250);await capture('dialog-desktop-sent');await metrics('desktop-sent');
    report.checks.push({name:'sent-state-copy',...await evaluate(`({detail:document.querySelector('.af-results li .af-reason').innerText.trim(),button:document.querySelector('.af-results li .af-action').innerText.trim(),ariaLabel:document.querySelector('.af-results li .af-action').getAttribute('aria-label')})`)});
    await fixture(390,844,{theme:'light-gallery',reduced:true});await capture('dialog-mobile-light-final');await metrics('light-final');
    report.checks.push({name:'friend-state-contrast',...await evaluate(`(()=>{const fg=getComputedStyle(document.querySelector('.af-action.is-friend')).color,bg=getComputedStyle(document.querySelector('.af')).backgroundColor;const lum=value=>{const c=value.match(/[\\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const a=lum(fg),b=lum(bg);return{foreground:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};})()`)});
  }else{
  await fixture();await capture('dialog-desktop-suggestions');await metrics('desktop-six-suggestions');
  await typeQuery('luna');await waitFor(dialog+'.searched&&!'+dialog+'.searching');await capture('dialog-desktop-search');await metrics('search-results');
  await evaluate(`(()=>{const clear=[...document.querySelectorAll('app-add-friend-dialog button')].find(el=>(el.getAttribute('aria-label')||'').toLowerCase().includes('limpiar'));if(clear)clear.click();else{const c=${dialog};c.query.setValue('');ng.applyChanges(c);}})()`);await pause(450);await metrics('cleared-search');
  await evaluate(`document.querySelector('.af-results li .af-action').click()`);await waitFor(dialog+`.suggestions[0].relation==='outgoing'`);await evaluate(`document.querySelector('.af-results li .af-action').click()`);await waitFor(dialog+`.suggestions[0].relation==='none'`);
  report.checks.push({name:'send-then-cancel',...await evaluate(`({calls:window.__qa.calls,relation:${dialog}.suggestions[0].relation,busy:${dialog}.busy})`)});
  await evaluate(`document.querySelectorAll('.af-results li .af-action')[4].click()`);await waitFor(dialog+`.suggestions[4].relation==='friend'`);report.checks.push({name:'accept-request',passed:true});
  await typeQuery('lento');await pause(420);await evaluate(`document.querySelector('.af-clear').click()`);await pause(1150);await metrics('cleared-inflight-search');
  let trapped=true;for(let i=0;i<20;i++){await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});trapped=trapped&&await evaluate('document.querySelector("app-add-friend-dialog").contains(document.activeElement)');}report.checks.push({name:'keyboard-focus-trap',trapped});
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor('!document.querySelector("app-add-friend-dialog")');report.checks.push({name:'escape-closes',passed:true});
  await fixture(390,844);await capture('dialog-mobile-390');await metrics('mobile-390');
  await fixture(320,844);await capture('dialog-mobile-320');await metrics('mobile-320-long-names');
  await fixture(1440,1000,{count:18});await capture('dialog-desktop-many');await metrics('many-suggestions');
  await fixture(390,844,{mode:'hold'});await capture('dialog-mobile-loading');await metrics('loading');
  await fixture(390,844,{count:0});await capture('dialog-mobile-empty');await metrics('empty-suggestions');
  await fixture(390,844,{mode:'error'});await waitFor(dialog+'.suggestionsFailed');await capture('dialog-mobile-error');await metrics('suggestions-error');
  await evaluate(`(()=>{window.__qa.mode='success';const c=${dialog};c.loadSuggestions();})()`);await waitFor(dialog+'.suggestions.length===6&&!'+dialog+'.suggestionsLoading');await metrics('suggestions-retry');
  await typeQuery('error');await waitFor(dialog+'.failed&&!'+dialog+'.searching');await capture('dialog-mobile-search-error');await metrics('search-error');
  await fixture(390,844,{theme:'light-gallery',reduced:true});await capture('dialog-mobile-light');await metrics('light-reduced-motion');report.checks.push({name:'reduced-motion',running:await evaluate(`document.querySelector('app-add-friend-dialog').getAnimations({subtree:true}).filter(a=>a.playState==='running').length`)});
  }
  report.result='completed';
}catch(error){report.result='qa-error';report.error=error.stack||String(error);}
finally{cleanup=true;await closeBrowser?.().catch(()=>{});socket?.close();browser.kill();server.close();await pause(500);const target=resolve(profile),base=resolve(out)+sep;if(!target.startsWith(base)||!target.split(sep).at(-1).startsWith('browser-profile-'))throw Error('Unsafe cleanup path');await rm(target,{recursive:true,force:true}).catch(error=>report.cleanupError=error.message);await writeFile(join(out,finalOnly?'report-final.json':'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
