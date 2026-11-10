import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
const dist = join(process.cwd(), 'dist/frontend/browser');
const out = join(process.cwd(), 'tmp/tavern-music');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'literatus-music-'));
const server = createServer(async (req, res) => {
  const path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(dist + sep) && path !== dist) { res.writeHead(403).end(); return; }
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  try {
    const data = await readFile(path);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(join(dist, 'index.html'))); }
});
await new Promise(r => server.listen(4393, '127.0.0.1', r));
const browser = spawn('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--remote-debugging-port=9340', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const me = { full: true, friend_code: 'QA1234', username: 'Maguito', tagline: 'Lector de mundos, escritor de posibilidades.', bio: 'Siempre hay tiempo para otra historia.', outfit: { head: 'beret' }, level: 12, xp: 1200, equipped_title: '', favorite_genres: [], stats: { books_read: 8, reviews: 3, friends: 0, brindis: 4 }, member_since: '2026-01-01', relation: 'self', request_id: null, pending_incoming: 0 };
const rank = { rank: 1, username: 'Maguito', friend_code: 'QA1234', outfit: me.outfit, points: 240, is_me: true };
function fixture(url) {
  const u = new URL(url), path = u.pathname;
  if (path.endsWith('/community/me/')) return me;
  if (path.endsWith('/community/friends/')) return { results: [] };
  if (path.endsWith('/community/requests/')) return { incoming: [], outgoing: [] };
  if (path.endsWith('/community/ranking/')) return { scope: 'week', period_start: null, entries: [rank], me: rank, participants: 1 };
  if (path.endsWith('/community/tavern/activity/')) return { messages: [], reactions: [], invitations: { incoming: [], outgoing: [] } };
  if (path.endsWith('/users/profile/')) return { ...me, theme: 'default', ink_balance: 1000 };
  if (path.endsWith('/users/me/')) return { id: 'qa', username: 'Maguito', email: 'qa@example.invalid', has_completed_onboarding: true };
  if (path.includes('/daily-reward/status/')) return { can_claim: false };
  if (path.includes('/ai/usage/')) return { has_plan: false, tokens_used: 0, token_limit: 0, ink_balance: 1000 };
  return { success: true, pending_incoming: 0, count: 0, results: [] };
}
let socket, mode = 'live';
const errors = [], report = [], network = [];
try {
  let version;
  for (let i = 0; i < 50; i++) { try { version = await (await fetch('http://127.0.0.1:9340/json/version')).json(); break; } catch { await sleep(100); } }
  if (!version) throw Error('No se pudo iniciar el navegador');
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, reject) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((r, reject) => { const key = ++id; pending.set(key, { r, reject }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) })); });
  socket.addEventListener('message', async event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.r(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Network.loadingFailed') network.push({ reason: m.params.errorText, blocked: m.params.blockedReason });
    if (m.method === 'Fetch.requestPaused') {
      const request = m.params.request;
      if (request.url.includes('youtube.com/embed/')) {
        if (mode === 'live') await send('Fetch.continueRequest', { requestId: m.params.requestId }, m.sessionId);
        else await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<html><body style="margin:0;background:#171116;color:#f8dfb3;display:grid;place-items:center;height:100vh;font:16px Georgia">Reproductor de prueba</body></html>').toString('base64') }, m.sessionId);
      } else await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PATCH,DELETE' }], body: Buffer.from(JSON.stringify(fixture(request.url))).toString('base64') }, m.sessionId);
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
  const waitFor = async (expression, attempts = 80) => { for (let i = 0; i < attempts; i++) { if (await evaluate(expression)) return; await sleep(100); } throw Error('Espera fallida: ' + expression); };
  const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await writeFile(join(out, name + '.png'), Buffer.from(shot.data, 'base64')); };
  const state = () => evaluate(`(() => {
    const el=document.querySelector('app-tavern-music'); const component=el&&window.ng?.getComponent?.(el);
    const status=el?.querySelector('.tm-status').textContent.trim();
    const play=el?.querySelector('.tm-play');
    const error=status?.startsWith('No pudimos')||status?.startsWith('Esta canción')?status:'';
    const phase=status?.includes('Sonando')?'playing':status?.includes('Pulsa Reproducir')?'blocked':status?.includes('Preparando')?'loading':status?.includes('Cargando')?'buffering':error?'error':'paused';
    const f=el?.querySelector('iframe'); const r=f?.getBoundingClientRect();
    return { state:component?.state??phase, ready:component?.ready??!play?.disabled, error:component?.error??error, status:component?.status??status, volume:component?.volume??Number(el?.querySelector('input').value), count:document.querySelectorAll('app-tavern-music').length,
      overflow:document.documentElement.scrollWidth-innerWidth, frame:r&&{x:r.x,y:r.y,width:r.width,height:r.height},
      header:document.querySelector('.main-header')?.getBoundingClientRect().bottom, isolated:crossOriginIsolated, credentialless:f?.hasAttribute('credentialless'),
      mock:window.qaMusic && {plays:window.qaMusic.plays,pauses:window.qaMusic.pauses,destroyed:window.qaMusic.destroyed,volume:window.qaMusic.volume} };
  })()`);
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId); await send('Network.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*' }, { urlPattern: '*/api/health/*' }, { urlPattern: '*youtube.com/embed/*' }] }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('literatus_guide_dismissed','true'); localStorage.removeItem('literatus_tavern_music');
    const guest=location.search.includes('guest');
    if(guest){localStorage.removeItem('access_token');localStorage.removeItem('user_profile');}
    else{localStorage.setItem('access_token','qa-fixture');localStorage.setItem('user_profile',JSON.stringify({id:'qa',username:'Maguito',email:'qa@example.invalid',is_staff:false,is_superuser:false,has_completed_onboarding:true}));}
    if(location.search.includes('mock')) {
      window.qaMusic={plays:0,pauses:0,destroyed:0,volume:0,block:true};
      window.YT={Player:class{
        constructor(frame, options){this.frame=frame;this.events=options.events;window.qaMusic.player=this;queueMicrotask(()=>this.events.onReady({target:this}));}
        playVideo(){window.qaMusic.plays++;window.qaMusic.block?this.events.onAutoplayBlocked():this.events.onStateChange({data:1});}
        pauseVideo(){window.qaMusic.pauses++;this.events.onStateChange({data:2});}
        setVolume(value){window.qaMusic.volume=value;}
        unMute(){window.qaMusic.block=false;}
        destroy(){window.qaMusic.destroyed++;this.frame.remove();}
      }};
    }
  ` }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:4393/tavern' }, sessionId);
  await waitFor("document.querySelector('app-tavern-music')");
  await waitFor("document.querySelector('.tm-play') && (!document.querySelector('.tm-play').disabled || document.querySelector('.tm-status').textContent.includes('No pudimos'))", 250);
  await sleep(1500);
  const live = await state();
  report.push({kind:'real-youtube', ...live});
  console.log(JSON.stringify({kind:'real-youtube', ...live}));
  await capture('live-desktop');
  const playButton = await evaluate("(()=>{const r=document.querySelector('.tm-play').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...playButton},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...playButton},sessionId);
  for(let i=0;i<150;i++){const c=await state();if(c.state==='playing'||c.error)break;await sleep(100);}
  const livePlayback = {...await state(),video:await evaluate("window.ng?.getComponent?.(document.querySelector('app-tavern-music'))?.player?.getVideoData?.()?.title")};
  report.push({kind:'real-youtube-after-click',...livePlayback});
  console.log(JSON.stringify({kind:'real-youtube-after-click',...livePlayback}));
  await capture('live-playing');
  mode = 'mock';
  for (const [width, height] of [[1920,1080],[1440,900],[768,1024],[390,844],[320,740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
    await send('Page.navigate', { url: 'http://127.0.0.1:4393/tavern?qa=mock' }, sessionId);
    await waitFor("document.querySelector('.tm-status')?.textContent.includes('Pulsa Reproducir')");
    let current = await state();
    if (current.overflow > 1 || current.count !== 1 || current.frame.width < 200 || current.frame.height < 200) throw Error('Tamaño de reproductor inválido: ' + JSON.stringify(current));
    if(current.frame.y < current.header) throw Error('La cabecera oculta el vídeo: ' + width);
    await evaluate("document.querySelector('.tm-play').click()");
    await waitFor("document.querySelector('.tm-status')?.textContent.includes('Sonando')");
    await evaluate("(()=>{const input=document.querySelector('.tm-volume input');input.value='17';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    current = await state();
    if(current.volume!==17||current.mock.volume!==17)throw Error('Volumen sin aplicar');
    await capture('mock-' + width);
    report.push({kind:'mock-viewport',width,height,...current});
    await evaluate("document.querySelector('.tm-play').click()");
    if((await state()).state!=='paused')throw Error('La pausa manual no funciona');
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:4393/tavern?qa=mock' }, sessionId);
  await waitFor("document.querySelector('.tm-play') && !document.querySelector('.tm-play').disabled");
  await evaluate("document.querySelector('.tm-play').click()");
  await waitFor("document.querySelector('.tm-status')?.textContent.includes('Sonando')");
  await evaluate("document.querySelector('[aria-label=\"Modo cine: solo la mesa\"]').click()");
  await waitFor("document.querySelector('.tm-status')?.textContent.includes('En pausa') || document.querySelector('.tm-status')?.textContent.includes('Música en pausa')");
  await evaluate("document.querySelector('.th-cinema-banner button').click()");
  await waitFor("document.querySelector('.tm-status')?.textContent.includes('Sonando')");
  report.push({kind:'cinema-pause-resume',...await state()});
  await evaluate("document.querySelector('.mn-link[href=\"/catalog\"]').click()");
  await waitFor("!document.querySelector('app-tavern-music')");
  const destroyed = await evaluate('window.qaMusic.destroyed');
  if(destroyed!==1)throw Error('No destruye al salir');
  report.push({kind:'route-destroy',destroyed});
  await send('Page.navigate', { url: 'http://127.0.0.1:4393/tavern?qa=mock&guest=1' }, sessionId);
  await waitFor("document.querySelector('.tm-status')?.textContent.includes('Pulsa Reproducir')");
  if(!await evaluate("document.querySelector('.th-visitor') && document.querySelectorAll('app-tavern-music').length===1"))throw Error('Sin música para visitantes');
  report.push({kind:'guest',...await state()});
  await capture('guest');
  await writeFile(join(out,'report.json'),JSON.stringify({report,errors,network},null,2));
  if(errors.length)throw Error('Errores JavaScript: '+errors.join('\n'));
  console.log(JSON.stringify({pass:true,checks:report.length,errors,network:network.slice(0,10)}));
} finally { socket?.close(); browser.kill(); await new Promise(r => server.close(r)); }
