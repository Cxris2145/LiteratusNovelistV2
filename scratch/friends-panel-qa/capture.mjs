import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('.', import.meta.url));
const workspace = resolve(out, '../..');
const app = join(workspace, 'respaldos-software/LiteratusNovelist-main/Producto/frontend/dist/frontend/browser');
const origin = 'http://127.0.0.1:4397';
const debugPort = 9347;
const browserPath = process.env.CHROME_BIN || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = join(out, `browser-profile-${Date.now()}`);
const report = { checks: [], screenshots: [], runtimeErrors: [] };
const pause = ms => new Promise(done => setTimeout(done, ms));
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
    let path = resolve(app, `.${pathname}`);
    if (path !== app && !path.startsWith(app + sep)) throw new Error('Outside fixture server');
    if (!(await stat(path).catch(() => null))?.isFile()) path = join(app, 'index.html');
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await mkdir(profile, { recursive: true });
await new Promise(done => server.listen(4397, '127.0.0.1', done));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
async function retry(fn, attempts = 100) {
  let error;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { error = e; await pause(150); }
  }
  throw error;
}
function assert(ok, message) { if (!ok) throw new Error(message); }

const friends = [
  { friend_code: 'QA-ADMIN', username: 'admin', avatar: null, outfit: { head: 'wizard' }, equipped_frame: 'frame-gold', equipped_title: 'Erudito Clásico', tagline: '', level: 8, level_name: 'Erudito', status: { kind: 'tavern', label: 'En la taberna', book_title: null }, brindis_given: true },
  { friend_code: 'QA-EITHAN', username: 'eithan', avatar: null, outfit: { head: 'wizard' }, equipped_frame: 'frame-parchment', equipped_title: '', tagline: '', level: 5, level_name: 'Lector', status: { kind: 'reading', label: 'Leyendo La Odisea', book_title: 'La Odisea' }, brindis_given: false },
  { friend_code: 'QA-FELIPE', username: 'Felipe', avatar: null, outfit: { head: 'wizard' }, equipped_frame: '', equipped_title: '', tagline: '', level: 3, level_name: 'Aprendiz', status: { kind: 'away', label: 'De paseo', book_title: null }, brindis_given: false },
];
const me = { full: true, friend_code: 'QA-ME', username: 'Cxris', avatar: null, outfit: { head: 'wizard' }, equipped_frame: '', equipped_title: '', tagline: 'Siempre hay otra historia.', bio: '', level: 12, level_name: 'Lector', xp: 1200, favorite_genres: [{ name: 'Cuentos', slug: 'cuentos' }], stats: { books: 2, books_read: 1, reviews: 0, friends: 3, brindis: 0 }, member_since: '2026-01-01T00:00:00Z', is_public: true, relation: 'self', request_id: null, pending_incoming: 0 };
try {
  const version = await retry(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json());
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', fail, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') report.runtimeErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (!message.id || !pending.has(message.id)) return;
    const { ok, fail } = pending.get(message.id); pending.delete(message.id);
    if (message.error) fail(new Error(message.error.message)); else ok(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++nextId; pending.set(id, { ok, fail }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = expression => retry(async () => assert(await evaluate(expression), expression));
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable');
  await cmd('Network.setBlockedURLs', { urls: ['http://localhost:8000/*', 'http://localhost:8010/*', '*supabase.co/*'] });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('literatus_guide_dismissed', 'true'); localStorage.setItem('literatus_guide_seen', 'true');` });

  async function fixture(width, height, list = friends, incoming = []) {
    await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 480 });
    await cmd('Emulation.setTouchEmulationEnabled', { enabled: width <= 480 });
    await cmd('Page.navigate', { url: origin + '/tavern' });
    await waitFor('!!window.ng && !!document.querySelector("app-tavern-hall") && !!ng.getComponent(document.querySelector("app-tavern-hall"))');
    await evaluate(`(() => {
      const hall = ng.getComponent(document.querySelector('app-tavern-hall'));
      hall.loggedIn = true;
      hall.me = ${JSON.stringify(me)};
      hall.loading = false;
      hall.incoming = ${JSON.stringify(incoming)};
      hall.outgoing = [];
      hall.chatUnread = { total: 3, by_friend: { 'QA-EITHAN': 3 } };
      hall.setFriends(${JSON.stringify(list)});
      ng.applyChanges(hall);
    })()`);
    await waitFor('document.querySelectorAll(".fl-friend").length === ' + list.length);
    await evaluate('document.fonts.ready');
    await pause(600);
  }
  async function capture(name, entire = false) {
    const rect = await evaluate(`(() => {
      const el = document.querySelector('app-friend-list');
      el.scrollIntoView({block: 'center', behavior: 'instant'});
      const r=el.getBoundingClientRect();
      return {x:Math.max(0,r.left-8), y:Math.max(0,r.top+scrollY-8), width:Math.min(innerWidth,r.width+16), height:r.height+16, scale:1};
    })()`);
    const { data } = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, ...(entire ? {} : { clip: rect }) });
    await writeFile(join(out, name + '.png'), Buffer.from(data, 'base64'));
    report.screenshots.push(name + '.png');
  }
  async function metrics(name) {
    const result = await evaluate(`(() => {
      const host=document.querySelector('app-friend-list'); const panel=host.querySelector('.fl');
      const r=panel.getBoundingClientRect();
      const rows=[...panel.querySelectorAll('.fl-friend')];
      const scrollers=[document.querySelector('.area-side'),host,...host.querySelectorAll('*')].filter(el=>el&&['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1);
      return {width:Math.round(r.width), panelOverflow:panel.scrollWidth-panel.clientWidth, documentOverflow:document.documentElement.scrollWidth-innerWidth, rowCount:rows.length,
        allRowsInside:rows.every(el=>{const b=el.getBoundingClientRect();return b.bottom<=r.bottom+1&&b.top>=r.top-1}),
        scrollContainers:scrollers.map(el=>el.className || el.tagName), allAvatarsPaused:[...panel.querySelectorAll('app-maguito')].every(el=>ng.getComponent(el).paused),
        chatTargets:[...panel.querySelectorAll('.fl-chat')].map(el=>({width:el.clientWidth,height:el.clientHeight,accessibleName:el.getAttribute('aria-label')}))};
    })()`);
    report.checks.push({ name, ...result });
  }
  await fixture(1920, 1000); await capture('friends-desktop-350'); await metrics('desktop-350');
  await capture('tavern-desktop', true);
  await evaluate('document.querySelector(".fl-more").click()');
  await waitFor('!!document.querySelector(".mat-mdc-menu-panel")');
  report.checks.push({ name:'material-menu', ...await evaluate(`({expanded:document.querySelector('.fl-more').getAttribute('aria-expanded'),items:[...document.querySelectorAll('.mat-mdc-menu-panel [mat-menu-item]')].map(el=>el.innerText.trim()),rowColumns:getComputedStyle(document.querySelector('.fl-friend')).gridTemplateColumns,children:[...document.querySelector('.fl-friend').children].map(el=>({tag:el.tagName,display:getComputedStyle(el).display}))})`) });
  await capture('tavern-menu-desktop', true);
  await fixture(1100, 900); await capture('friends-desktop-280'); await metrics('desktop-280');
  await fixture(390, 844); await capture('friends-mobile-390'); await metrics('mobile-390');
  await fixture(320, 844); await capture('friends-mobile-320'); await metrics('mobile-320');
  await evaluate('document.querySelector(".fl-more").click()');
  await waitFor('!!document.querySelector(".mat-mdc-menu-panel")');
  await evaluate(`[...document.querySelectorAll('.mat-mdc-menu-panel button')].find(el=>el.innerText.includes('Eliminar amigo')).click()`);
  await waitFor('!!document.querySelector(".fl-confirm")');
  await capture('friends-mobile-confirmation');
  report.checks.push({name:'mobile-confirmation',...await evaluate(`({confirmWidth:document.querySelector('.fl-confirm').getBoundingClientRect().width,panelOverflow:document.querySelector('.fl').scrollWidth-document.querySelector('.fl').clientWidth,deleteLabel:document.querySelector('.fl-confirm').getAttribute('aria-label')})`)});
  const long = friends.map((friend, i) => ({...friend, username:i === 1 ? 'UnaLectoraConUnNombreExtraordinariamenteLargo' : friend.username, equipped_title:i === 1 ? 'Exploradora de todos los mundos literarios' : friend.equipped_title }));
  const incoming = [{ id:'qa-request', created_at:'2026-10-26T18:00:00Z', user:{ full:false, friend_code:'QA-REQUEST', username:'UnaNuevaAmigaConUnNombreMuyLargo', avatar:null, outfit:{head:'wizard'}, equipped_frame:'', equipped_title:'', is_public:true, relation:'incoming', request_id:'qa-request' }}];
  await fixture(320, 844, long, incoming); await capture('friends-mobile-long-requests'); await metrics('mobile-long-requests');
  await fixture(390, 844, []); await capture('friends-mobile-empty'); await metrics('mobile-empty');
  const many=Array.from({length:18},(_,i)=>({...friends[i%3],friend_code:'QA-MANY-'+i,username:'Lector '+(i+1)}));
  await fixture(1920,1000,many,incoming); await capture('friends-desktop-long-list'); await metrics('desktop-long-list');
  await cmd('Emulation.setEmulatedMedia', { features:[{ name:'prefers-reduced-motion', value:'reduce' }] });
  await fixture(390,844); await metrics('reduced-motion');
  const motion=await evaluate(`({running:[...document.querySelector('app-friend-list').getAnimations({subtree:true})].filter(a=>a.playState==='running').length})`);
  report.checks.push({name:'reduced-motion-animations',...motion});
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  socket?.close(); browser.kill(); server.close();
}
