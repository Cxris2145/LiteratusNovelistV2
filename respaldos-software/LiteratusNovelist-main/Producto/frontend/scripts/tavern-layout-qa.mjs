import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
const root = process.cwd();
const dist = join(root, 'dist/frontend/browser');
const out = join(root, 'tmp/tavern-layout');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'literatus-layout-'));
const server = createServer(async (req, res) => {
  const path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(dist + sep) && path !== dist) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(join(dist, 'index.html'))); }
});
await new Promise(r => server.listen(4392, '127.0.0.1', r));
const browser = spawn('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9339', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const me = { full: true, friend_code: 'QA1234', username: 'Maguito', tagline: 'Lector de mundos, escritor de posibilidades.', bio: 'Siempre hay tiempo para otra historia.', outfit: { head: 'wizard' }, level: 12, level_name: 'Cronista', xp: 1200, equipped_title: '', favorite_genres: [{ name: 'Acción y aventura', slug: 'aventura' }, { name: 'Cuentos', slug: 'cuentos' }, { name: 'Ensayos', slug: 'ensayos' }], stats: { books_read: 8, reviews: 3, friends: 2, brindis: 4 }, member_since: '2026-01-01', relation: 'self', request_id: null, pending_incoming: 0 };
let messages = [];
let friendCount = 2;
const friends = Array.from({ length: 16 }, (_, i) => ({ friend_code: 'AMIGO' + i, username: ['LunaEscribe', 'El Cronista'][i] || 'Amigo ' + i, outfit: { head: i % 2 ? 'aviator' : 'witch-flower', cape: i % 2 ? 'red' : 'default' }, tagline: 'Una historia más', level: 9, level_name: 'Lector', equipped_title: '', status: { kind: i % 2 ? 'reading' : 'tavern', label: i % 2 ? 'Leyendo' : 'En la taberna', book_title: i % 2 ? 'Don Quijote' : null }, brindis_given: false }));
const entries = [{ rank: 1, username: 'Maguito', friend_code: 'QA1234', outfit: me.outfit, points: 240, is_me: true }, ...friends.slice(0, 2).map((f, i) => ({ rank: i + 2, username: f.username, friend_code: f.friend_code, outfit: f.outfit, points: 150 - i * 30, is_me: false }))];
function fixture(url, method, body) {
  const u = new URL(url), path = u.pathname;
  if (path.endsWith('/community/me/')) return { ...me, stats: { ...me.stats, friends: friendCount } };
  if (path.endsWith('/community/friends/')) return { results: friends.slice(0, friendCount) };
  if (path.endsWith('/community/requests/')) return { incoming: [], outgoing: [] };
  if (path.endsWith('/community/ranking/')) return { scope: u.searchParams.get('scope') || 'week', period_start: null, entries, me: entries[0], participants: 3 };
  if (path.endsWith('/community/tavern/activity/')) return { messages, reactions: [] };
  if (path.endsWith('/community/tavern/messages/') && method === 'POST') {
    const message = { id: 'message-qa', content: JSON.parse(body).content, created_at: new Date().toISOString(), is_me: true, username: me.username, friend_code: me.friend_code, outfit: me.outfit, reactions: {} };
    messages = [message]; return { success: true, message };
  }
  if (path.endsWith('/users/profile/')) return { ...me, theme: 'default', ink_balance: 1000 };
  if (path.endsWith('/users/me/')) return { id: 'qa', username: me.username, email: 'qa@example.invalid', is_staff: false, is_superuser: false, has_completed_onboarding: true };
  if (path.includes('/daily-reward/status/')) return { can_claim: false };
  if (path.includes('/ai/usage/')) return { has_plan: false, tokens_used: 0, token_limit: 0, ink_balance: 1000 };
  return { success: true, pending_incoming: 0, count: 0, results: [] };
}
let socket;
const errors = [], report = [];
try {
  let version;
  for (let i = 0; i < 50; i++) { try { version = await (await fetch('http://127.0.0.1:9339/json/version')).json(); break; } catch { await sleep(100); } }
  if (!version) throw Error('No se pudo iniciar el navegador de QA');
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, reject) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((r, reject) => { const key = ++id; pending.set(key, { r, reject }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) })); });
  socket.addEventListener('message', async event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.r(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Fetch.requestPaused') {
      await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PATCH,DELETE' }], body: Buffer.from(JSON.stringify(fixture(m.params.request.url, m.params.request.method, m.params.request.postData))).toString('base64') }, m.sessionId);
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*' }, { urlPattern: '*/api/health/*' }] }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('literatus_guide_dismissed','true'); if(!localStorage.getItem('qa-guest')) { localStorage.setItem('access_token','qa-fixture'); localStorage.setItem('user_profile',JSON.stringify({id:'qa',username:'Maguito',email:'qa@example.invalid',is_staff:false,is_superuser:false,has_completed_onboarding:true})); }` }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [320, 740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
    await send('Page.navigate', { url: 'http://127.0.0.1:4392/tavern' }, sessionId);
    await sleep(1600);
    const state = await evaluate(`(() => { const hall=document.querySelector('.th-hall'), stage=document.querySelector('.ts-stage'); if(!hall||!stage) throw Error('Taberna no montada'); const box=s=>{const b=document.querySelector(s).getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height};}; return {width:innerWidth, overflow:document.documentElement.scrollWidth-innerWidth, hall:box('.th-hall'), profile:box('.area-profile'), scene:box('.ts-stage'), side:box('.area-side'), dock:box('.ts-chat-dock'), sharedBackground:getComputedStyle(hall).backgroundImage.includes('tavern-backdrop'), stageBackground:getComputedStyle(stage).backgroundImage, reactions:document.querySelectorAll('.ts-react-pill').length}; })()`);
    if (state.overflow > 2 || !state.sharedBackground || state.stageBackground !== 'none' || state.reactions !== 5) throw Error('Distribución incorrecta: ' + JSON.stringify(state));
    if (width > 1000 && !(state.profile.x + state.profile.w <= state.scene.x && state.scene.x + state.scene.w <= state.side.x)) throw Error('Paneles no laterales');
    if (state.dock.x < 0 || state.dock.x + state.dock.w > width) throw Error('Chat fuera de pantalla');
    if(width<500) { const blocked=await evaluate(`Array.from(document.querySelectorAll('.ts-chat-icon-btn,.ts-chat-send-btn,.ts-react-pill')).filter(el=>{const b=el.getBoundingClientRect(); return !el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}).map(el=>el.getAttribute('aria-label'))`); if(blocked.length) throw Error('Controles tapados: '+blocked.join(', ')); } report.push(state); console.log(JSON.stringify(state));
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(out, `tavern-${width}.png`), Buffer.from(shot.data, 'base64'));
    if (width === 1440) {
      await evaluate(`document.querySelector('.ts-chat-icon-btn').click();`); await sleep(100);
      if (!await evaluate(`!!document.querySelector('.ts-emoji-picker-wrap')`)) throw Error('Selector de emojis no abrió');
      await evaluate(`document.querySelector('.ts-emoji-pick-btn').click(); const input=document.querySelector('.ts-chat-input'); input.value='Una historia más'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.ts-chat-send-btn').click();`); await sleep(250);
      if (!messages.some(m => m.content === 'Una historia más')) throw Error('Chat no envió');
      await evaluate(`document.querySelectorAll('.rk-tabs button')[1].click();`); await sleep(150);
      if (!await evaluate(`document.querySelectorAll('.rk-tabs button')[1].getAttribute('aria-selected')==='true'`)) throw Error('Ranking no cambió');
      await evaluate(`document.querySelector('.th-actions button').click();`); await sleep(150);
      if (!await evaluate(`!!document.querySelector('app-add-friend-dialog')`)) throw Error('Agregar amigo no abrió');
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true}));`);
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  friendCount=16; await send('Page.navigate', { url: 'http://127.0.0.1:4392/tavern' }, sessionId); await sleep(1400);
  for (const theme of ['neon', 'light-gallery', 'sepia', 'high-contrast-dark', 'high-contrast-light']) {
    await evaluate(`document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)})`); await sleep(60);
    const state=await evaluate(`({overflow:document.documentElement.scrollWidth-innerWidth,bg:getComputedStyle(document.querySelector('.pc')).backgroundColor,ink:getComputedStyle(document.querySelector('.pc-name')).color,friendsScroll:document.querySelector('app-friend-list').scrollHeight>document.querySelector('app-friend-list').clientHeight,rankingVisible:document.querySelector('app-tavern-ranking').getBoundingClientRect().bottom<=innerHeight})`);
    if(state.overflow>2 || !state.friendsScroll || !state.rankingVisible) throw Error('Paneles incorrectos en tema ' + theme);
    if(theme.startsWith('high-contrast') && !state.bg.startsWith('rgb(')) throw Error('Panel no opaco');
    console.log(theme, JSON.stringify(state));
    if(theme==='high-contrast-light') { const shot=await send('Page.captureScreenshot',{format:'png'},sessionId); await writeFile(join(out,'tavern-high-contrast-light.png'),Buffer.from(shot.data,'base64')); }
  }
  await evaluate(`localStorage.setItem('qa-guest','true'); localStorage.removeItem('access_token'); localStorage.removeItem('user_profile'); localStorage.removeItem('literatus-theme');`);
  await send('Page.navigate',{url:'http://127.0.0.1:4392/tavern'},sessionId); await sleep(1400);
  if(!await evaluate(`!!document.querySelector('.th-visitor')&&document.querySelectorAll('.ts-seat').length>0`)) throw Error('Vista de visitante falló');
  await writeFile(join(out,'report.json'),JSON.stringify({report,errors,interactions:['chat','emoji','ranking','agregar amigo','visitante']},null,2));
  if(errors.length) throw Error(errors.join('\n'));
  console.log('PASS: 7 tamaños, 5 temas, paneles extensos y controles. Capturas: '+out);
} finally {
  socket?.close(); browser.kill(); await new Promise(r=>server.close(r));
}


