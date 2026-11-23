/** Production-build regression checks with isolated API fixtures; never uses a real account. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';

const root = process.cwd();
const dist = resolve(root, 'dist/frontend/browser');
const out = resolve(root, 'tmp/tavern-mobile');
await access(join(dist, 'index.html'));
const indexHtml = await readFile(join(dist, 'index.html'));
await mkdir(out, { recursive: true });
const exists = async path => !!path && access(path).then(() => true, () => false);
const candidates = [process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'];
let executable;
for (const candidate of candidates) if (await exists(candidate)) { executable = candidate; break; }
assert(executable, 'Set CHROME_BIN to an installed Chromium browser.');
const profile = await mkdtemp(join(tmpdir(), 'literatus-mobile-qa-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== dist && !path.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch {
    if (extname(path)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/html'); res.end(indexHtml);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
let captureFailure;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], issues = [], report = [], requests = new Map(), performanceChecks = {};
const check = (condition, description) => { if (!condition) issues.push(description); };
let mode = 'full', failMe = false, messageId = 0;
const now = () => new Date().toISOString();
const user = { id: 'qa-mobile', username: 'Maguito', email: 'qa@example.invalid', is_staff: false,
  is_superuser: false, has_completed_onboarding: true };
const me = { full: true, friend_code: 'QA1234', username: user.username,
  tagline: 'Lector de mundos, escritor de posibilidades.', bio: 'Siempre hay tiempo para otra historia.',
  outfit: { head: 'wizard' }, level: 12, level_name: 'Cronista', xp: 1200, xp_to_next_level: 1500,
  equipped_title: '', equipped_frame: '', is_public: true, favorite_genres: [],
  stats: { books: 8, books_read: 8, reviews: 3, friends: 12, brindis: 4 }, member_since: '2026-01-01',
  relation: 'self', request_id: null, pending_incoming: 0 };
const friends = Array.from({ length: 12 }, (_, i) => ({ friend_code: `AMIGO${i}`,
  username: i === 0 ? 'LunaEscribe' : `Amigo con un nombre largo ${i}`, outfit: { head: i % 2 ? 'aviator' : 'witch-flower' },
  tagline: 'Una historia más', level: 9, level_name: 'Lector', equipped_title: '', equipped_frame: '',
  status: { kind: i < 4 ? 'tavern' : 'reading', label: i < 4 ? 'En la taberna' : 'Leyendo', book_title: null },
  brindis_given: false }));
let messages = [{ id: 'initial-message', content: 'Una conversación con palabras largas: extraordinariamenteinteresante.',
  created_at: now(), is_me: false, username: friends[0].username, friend_code: friends[0].friend_code, outfit: friends[0].outfit }];
const members = [{ friend_code: me.friend_code, username: me.username, outfit: me.outfit, is_me: true,
  is_host: true, current_chapter: 1 }, ...friends.slice(0, 2).map(f => ({ ...f, is_me: false, is_host: false, current_chapter: 1 }))];
const club = { id: 'club-qa', name: 'Lectores de historias extraordinarias', mode: 'free',
  unlocked_until_chapter: 3, allow_member_invites: true, is_host: true, my_chapter: 1,
  inventory_id: 'book-qa', book: { id: 'book-qa', title: 'Don Quijote de la Mancha', slug: 'don-quijote', cover_image: null, chapters_count: 3 },
  members, chapters: [1, 2, 3].map(order => ({ order, title: `Una aventura ${order}`, locked: false,
    lock_reason: null, message_count: 0, readers_here: [] })), last_message: null, updated_at: now() };
const shop = [{ id: 'hat-qa', code: 'wear-head-beret', name: 'Boina de lector', description: 'Una boina para tu próxima aventura.',
  item_type: 'maguito_wear', cost_ink: 10, icon: 'checkroom', asset_url: '', value: 'head:beret',
  sort_order: 1, is_owned: true, is_purchasable: true, earned_by: null, is_equipped: false, quantity: 1 }];
function fixture(url, method, body) {
  const path = new URL(url).pathname;
  const empty = mode === 'empty';
  if (method === 'OPTIONS') return {};
  if (path.endsWith('/users/me/')) return { ...user, is_guest: mode === 'guest' };
  if (path.endsWith('/users/profile/')) return { ...me, theme: 'default', ink_balance: 1000 };
  if (path.endsWith('/community/me/')) return me;
  if (path.endsWith('/community/friends/')) return { results: empty ? [] : friends };
  if (path.endsWith('/community/requests/')) return { incoming: [], outgoing: [] };
  if (path.endsWith('/community/tavern/activity/')) return { messages: empty ? [] : messages,
    reactions: [], invitations: { incoming: [], outgoing: [] }, chat_unread: { total: 2, by_friend: { AMIGO0: 2 } } };
  if (path.endsWith('/community/tavern/messages/')) {
    if (method !== 'POST') return { results: messages };
    const message = { ...messages[0], id: `sent-${++messageId}`, content: JSON.parse(body).content,
      created_at: now(), is_me: true, username: me.username, friend_code: me.friend_code, outfit: me.outfit };
    messages.push(message); return { success: true, message };
  }
  if (path.endsWith('/community/chats/')) return { threads: empty ? [] : friends.slice(0, 2).map(f => ({ ...f, unread: 1, last_message: null })), unread_total: 2 };
  if (/\/community\/chats\/[^/]+\/$/.test(path)) return method === 'POST'
    ? { success: true, item: { id: `private-${++messageId}`, content: JSON.parse(body).content, created_at: now(), is_me: true, read: false } }
    : { success: true, messages: [], incremental: false };
  if (path.endsWith('/community/clubs/')) return { results: empty ? [] : [club] };
  if (path.endsWith('/community/clubs/books/')) return { results: [club.book] };
  if (path.endsWith('/community/clubs/club-qa/live/')) return { success: true, club: { ...club, chapters_count: 3 }, members, poll_ms: 8000 };
  if (path.endsWith('/community/clubs/club-qa/')) return { success: true, club };
  if (/\/community\/clubs\/club-qa\/chapters\/\d+\/messages\/$/.test(path)) return { messages: [], incremental: false };
  if (path.endsWith('/learning/shop/')) return empty ? [] : shop;
  if (path.endsWith('/library/inventory/')) return [];
  if (path.endsWith('/library/missions/')) return [];
  if (path.endsWith('/catalog/home/')) return { starter_books: [{ slug: 'don-quijote', title: 'Don Quijote de la Mancha', author_name: 'Miguel de Cervantes', synopsis: 'Una aventura extraordinaria.', cover_image: null }], books: [] };
  if (path.endsWith('/learning/streak/')) return { streak_current: 3, streak_max: 5, streak_shields: 0, is_secured_today: true, is_in_danger: false, calendar: [] };
  if (path.includes('/daily-reward/status/')) return { can_claim: false, ink_reward: 10 };
  if (path.includes('/ai/usage/')) return { has_plan: false, tokens_used: 0, token_limit: 0, ink_balance: 1000 };
  return { success: true, pending_incoming: 0, count: 0, results: [] };
}

try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await sleep(100); }
  }
  assert(port, 'Chromium did not expose its debugging port.');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(key, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const call = pending.get(data.id); pending.delete(data.id); clearTimeout(call.timeout);
      data.error ? call.reject(Error(data.error.message)) : call.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if (data.method === 'Fetch.requestPaused') {
      const request = data.params.request, path = new URL(request.url).pathname;
      requests.set(path, (requests.get(path) || 0) + 1);
      try {
        await send('Fetch.fulfillRequest', { requestId: data.params.requestId,
          responseCode: failMe && path.endsWith('/community/me/') ? 503 : 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PATCH,DELETE' }],
          body: Buffer.from(JSON.stringify(fixture(request.url, request.method, request.postData))).toString('base64') }, data.sessionId);
      } catch (error) {
        // The page cancelled the request (navigation or a superseded poll) before it was fulfilled.
        if (!/Invalid InterceptionId/i.test(error.message)) errors.push(`Fixture: ${error.message}`);
      }
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, description) => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(100); }
    throw Error(`Timed out: ${description}`);
  };
  const click = async selector => {
    await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error('Missing control: '+${JSON.stringify(selector)}); el.focus({preventScroll:true}); el.click(); })()`);
    await waitFor(`!document.documentElement.classList.contains('tavern-morph')`, 'layout transition');
  };
  const screenshot = async name => {
    const shot = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(out, `${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  captureFailure = () => screenshot('failure');
  const viewport = async (width, height, touch = width <= 700) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: touch ? 2 : 1, mobile: touch });
    await command('Emulation.setTouchEmulationEnabled', { enabled: touch, ...(touch ? { maxTouchPoints: 1 } : {}) });
  };
  const navigate = async (nextMode = 'full', query = '') => {
    mode = nextMode; requests.clear();
    await command('Page.navigate', { url: `${origin}/tavern?qa-mode=${nextMode}${query ? '&' + query : ''}` });
    await waitFor(`!!document.querySelector('.ts-stage')`, 'tavern mount');
    if (mode !== 'visitor' && !failMe) await waitFor(`document.querySelectorAll('.ts-seat').length>0`, 'profile and participants');
    await sleep(350);
  };
  const layout = async label => {
    const state = await evaluate(`(() => {
      const box = selector => { const el=document.querySelector(selector); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}; };
      const backdrop=document.querySelector('.th-backdrop'),hall=document.querySelector('.th-hall');
      return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,
        hall:box('.th-hall'),scene:box('.ts-stage'),dock:box('.ts-chat-dock'),
        backdrop:!!document.querySelector('.th-backdrop .th-room'),backdropBox:box('.th-backdrop'),
        backdropAboveHall:getComputedStyle(hall).isolation==='isolate'||Number(getComputedStyle(backdrop).zIndex)>=0,
        footer:!!document.querySelector('app-footer')};
    })()`);
    check(state.overflow <= 1, `${label}: horizontal overflow ${state.overflow}px`);
    check(state.backdrop && !state.footer, `${label}: missing room or unexpected footer`);
    check(state.backdropBox.w > 0 && state.backdropBox.h > 0 && state.backdropAboveHall, `${label}: room backdrop is not visible above the hall background`);
    if (state.dock) check(state.dock.x >= 0 && state.dock.x + state.dock.w <= state.width + 1, `${label}: composer outside viewport`);
    report.push({ label, ...state });
    await writeFile(join(out, 'progress.json'), JSON.stringify({ report, issues, errors, performanceChecks }, null, 2));
    console.log(`${label}: overflow=${state.overflow}px`);
    await screenshot(label);
  };
  const panel = async (trigger, selector, name) => {
    await click(trigger);
    await waitFor(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-modal')==='true'`, `${name} modal`);
    await sleep(250);
    const state = await evaluate(`(() => { const p=document.querySelector(${JSON.stringify(selector)}),r=p.getBoundingClientRect(); return {role:p.getAttribute('role'),focus:p.contains(document.activeElement),x:r.x,y:r.y,w:r.width,bottom:r.bottom,overflow:document.documentElement.scrollWidth-innerWidth}; })()`);
    assert.equal(state.role, 'dialog', `${name}: missing dialog role`);
    check(state.focus, `${name}: focus escaped dialog`);
    check(await evaluate(`document.querySelector('app-tavern-scene')?.getAttribute('data-ambient-paused')==='true'`), `${name}: covered scene should pause`);
    check(state.x >= -1 && state.x + state.w <= 391 && state.bottom <= 845, `${name}: dialog outside viewport`);
    check(state.overflow <= 1, `${name}: horizontal overflow`);
    for (let i = 0; i < 14; i++) await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    check(await evaluate(`document.querySelector(${JSON.stringify(selector)}).contains(document.activeElement)`), `${name}: Tab escaped dialog`);
    await screenshot(`panel-${name}`);
  };
  const closePanel = async selector => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-modal')!=='true'`, 'panel close');
    await sleep(200);
  };
  const keyboard = async (selector, name) => {
    // Simulates iOS occlusion through the app's existing contract; physical keyboards still need device QA.
    await evaluate(`document.documentElement.style.setProperty('--kb-inset','300px'); document.body.classList.add('keyboard-open');`);
    await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)throw Error('Missing keyboard field');el.focus({preventScroll:true});el.scrollIntoView({block:'nearest'});})()`);
    await sleep(100);
    const state = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect(); return {bottom:r.bottom,y:r.y,font:parseFloat(getComputedStyle(el).fontSize),visible:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
    check(state.bottom <= 545 && state.y >= 0, `${name}: field covered by simulated keyboard: ${JSON.stringify(state)}`);
    check(state.font >= 16, `${name}: field text below 16px`);
    check(state.visible, `${name}: focused field obscured`);
    await screenshot(`keyboard-${name}`);
    await evaluate(`document.activeElement?.blur();document.documentElement.style.removeProperty('--kb-inset');document.body.classList.remove('keyboard-open');window.scrollTo(0,0)`);
    await sleep(100);
  };
  await command('Page.enable', {}); await command('Runtime.enable', {});
  await command('Network.enable', {}); await command('Network.setBypassServiceWorker', { bypass: true });
  await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*' }, { urlPattern: '*/api/health/*' }] });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('literatus_guide_dismissed','true');
    const qaMode=new URLSearchParams(location.search).get('qa-mode')||'full';
    if(qaMode==='visitor'){localStorage.removeItem('access_token');localStorage.removeItem('user_profile');}
    else {localStorage.setItem('access_token','qa-fixture');localStorage.setItem('user_profile',JSON.stringify({...${JSON.stringify(user)},is_guest:qaMode==='guest'}));}
  ` });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  for (const [width, height] of [[320,568],[360,800],[390,844],[430,932],[700,1024],[701,1024],[768,1024],[1024,768],[1440,900],[844,390]]) {
    await viewport(width, height, width <= 700 || height <= 500);
    await navigate();
    await layout(`tavern-${width}x${height}`);
    if (width <= 700 || height <= 500) {
      check(await evaluate(`(() => {const r=document.querySelector('.ts-chat-dock').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight+1;})()`), `${width}x${height}: initial composer below viewport`);
      // The bottom navigation and the floating assistant/notebook buttons are fixed: the composer must stay on top.
      const covered = await evaluate(`Array.from(document.querySelectorAll('.ts-chat-input,.ts-chat-send-btn,.ts-emoji-toggle,.ts-participants-toggle')).filter(el=>{
        const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !el.contains(hit);
      }).map(el=>el.className)`);
      check(covered.length===0, `${width}x${height}: table controls covered ${JSON.stringify(covered)}`);
      const artHeight = await evaluate(`document.querySelector('.ts-scene-art').getBoundingClientRect().height`);
      check(artHeight >= 120, `${width}x${height}: the table illustration is only ${artHeight}px tall`);
      const invalid = await evaluate(`Array.from(document.querySelectorAll('.th-actions button,.th-mobile-nav button,.th-mobile-tools button,.ts-chat-bar button,.ts-mobile-toolbar button')).filter(el=>{
        const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width&&r.height&&s.visibility!=='hidden'&&!el.closest('[inert]')&&(r.width<43.5||r.height<43.5);
      }).map(el=>({label:el.getAttribute('aria-label')||el.textContent.trim(),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))`);
      check(invalid.length===0, `${width}x${height}: touch targets smaller than 44px ${JSON.stringify(invalid)}`);
    }
    if (width >= 701 && height > 500) {
      const panels = await evaluate(`(() => {const b=s=>{const el=document.querySelector(s),r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,inert:!!el.closest('[inert]')};};return{profile:b('app-profile-card'),friends:b('app-friend-list'),scene:b('.ts-stage')};})()`);
      assert(panels.profile.w > 0 && panels.profile.h > 0 && !panels.profile.inert, `${width}: profile missing outside mobile`);
      assert(panels.friends.w > 0 && panels.friends.h > 0 && !panels.friends.inert, `${width}: friends missing outside mobile`);
      if (width > 1000) assert(panels.profile.x + panels.profile.w <= panels.scene.x + 1 && panels.scene.x + panels.scene.w <= panels.friends.x + 1, `${width}: desktop columns overlap`);
    }
    if (width === 320 || (width === 844 && height === 390)) {
      await click('.th-mobile-tools .th-icon-toggle');
      await waitFor(`!!document.querySelector('.th-hall.is-cinema')`, 'cinema mode');
      await sleep(400);
      const cinema = await evaluate(`(() => {const exit=document.querySelector('.th-cinema-banner button'),r=exit.getBoundingClientRect(),dock=document.querySelector('.ts-chat-dock').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{exitVisible:r.width>0&&r.y>=0&&r.bottom<=innerHeight&&exit.contains(hit),dockVisible:dock.y>=0&&dock.bottom<=innerHeight,exitRect:{x:r.x,y:r.y,w:r.width,bottom:r.bottom},dockRect:{y:dock.y,bottom:dock.bottom},hit:hit?.outerHTML.slice(0,200)};})()`);
      check(cinema.exitVisible && cinema.dockVisible, `${width}x${height}: cinema exit or composer obscured ${JSON.stringify(cinema)}`);
      await screenshot(`cinema-${width}x${height}`);
      await click('.ts-participants-toggle');
      assert.equal(await evaluate(`document.querySelectorAll('.ts-participant').length`), 5, 'Cinema lost participants');
      await click('.ts-participant[aria-label="Ver perfil de Maguito"]');
      await waitFor(`document.querySelector('#tavern-profile')?.getAttribute('aria-modal')==='true'`, 'own profile in cinema');
      const profileOverlay = await evaluate(`(() => {const p=document.querySelector('#tavern-profile').getBoundingClientRect(),c=document.querySelector('#tavern-profile .tmp-header button'),r=c.getBoundingClientRect();return{top:p.top,bottom:p.bottom,closeVisible:c.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
      check(profileOverlay.top <= 1 && profileOverlay.bottom <= height + 1 && profileOverlay.closeVisible, 'Cinema profile must cover header and keep its close control available');
      await screenshot(`cinema-profile-${width}x${height}`);
      await closePanel('#tavern-profile');
      if (await evaluate(`!!document.querySelector('.th-hall.is-cinema')`)) await click('.th-cinema-banner button');
      await waitFor(`!document.querySelector('.th-hall.is-cinema')`, 'cinema exit');
    }
  }
  await viewport(390,844,true); await navigate();
  assert(!await evaluate(`!!document.querySelector('app-tavern-bazar,app-friend-chat,app-tavern-reading-clubs')`), 'Secondary panels should initialize on first opening.');
  await waitFor(`!!document.querySelector('.ts-table-fallback.is-replaced')`, 'WebGL table readiness');
  performanceChecks.contextLossSupported = await evaluate(`(() => {const gl=document.querySelector('app-tavern-table canvas').getContext('webgl2'); const ext=gl?.getExtension('WEBGL_lose_context'); if(!ext)return false;window.__qaContextLoss=ext;ext.loseContext();return true;})()`);
  if (performanceChecks.contextLossSupported) {
    await waitFor(`!document.querySelector('.ts-table-fallback.is-replaced')`, 'illustrated table fallback after context loss');
    await screenshot('webgl-context-lost');
    await evaluate(`window.__qaContextLoss.restoreContext()`);
    await waitFor(`!!document.querySelector('.ts-table-fallback.is-replaced')`, 'WebGL table restoration');
    performanceChecks.contextRestored = true;
  }
  await evaluate(`(() => {const gl=document.querySelector('app-tavern-table canvas').getContext('webgl2'); window.__qaDrawCalls=0; for(const key of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {const original=gl[key];gl[key]=function(...args){window.__qaDrawCalls++;return original.apply(this,args);};}})()`);
  await sleep(500);
  performanceChecks.activeDrawCalls = await evaluate(`window.__qaDrawCalls`);
  await click('.ts-participants-toggle');
  assert.equal(await evaluate(`document.querySelectorAll('.ts-participant').length`), 5, 'Every table participant must have a profile control.');
  await screenshot('all-participants');
  await click('.ts-participants-toggle');
  await click('.ts-mobile-history');
  await waitFor(`!!document.querySelector('.ts-history')`, 'table history');
  await click('.ts-history-head button');
  await click('.ts-emoji-toggle');
  await waitFor(`!!document.querySelector('.ts-emoji-picker-wrap')`, 'expressions selector');
  assert.equal(await evaluate(`document.querySelectorAll('.ts-expression-reactions .ts-react-pill').length`), 5, 'Expressions must keep all five reactions.');
  await click('.ts-emoji-pick-btn');
  await evaluate(`(() => {const el=document.querySelector('.ts-chat-input');el.value='Una historia más';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('.ts-chat-send-btn');
  await waitFor(`document.querySelector('.ts-chat-input').value===''`, 'message send');
  assert(messages.some(item => item.content === 'Una historia más'), 'Table message was not sent.');
  await keyboard('.ts-chat-input', 'table');
  for (let action = 0; action < 6; action++) {
    await click('.ts-actions-toggle');
    await waitFor(`!!document.querySelector('.ts-actions-menu')`, 'table action menu');
    assert.equal(await evaluate(`document.querySelectorAll('.ts-actions-menu button').length`), 6, 'All six table actions must remain available.');
    await evaluate(`document.querySelectorAll('.ts-actions-menu button')[${action}].click()`);
    await waitFor(`!!document.querySelector('app-tavern-table-dialog')&&!document.querySelector('.td-skeleton')`, 'table action dialog');
    const dialog = await evaluate(`(() => {const r=document.querySelector('mat-dialog-container').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,bottom:r.bottom}})()`);
    check(dialog.x >= 0 && dialog.x + dialog.w <= 391 && dialog.y >= 0 && dialog.bottom <= 845, 'Table dialog extends beyond viewport.');
    await screenshot(`table-action-${action}`);
    await click('.td-close');
    await waitFor(`!document.querySelector('app-tavern-table-dialog')`, 'table action close');
  }
  await panel('.th-mobile-profile', '#tavern-profile', 'profile');
  const pausedDrawCalls = await evaluate(`window.__qaDrawCalls`);
  await sleep(500);
  performanceChecks.coveredDrawCalls = await evaluate(`window.__qaDrawCalls-${pausedDrawCalls}`);
  check(performanceChecks.activeDrawCalls > 0 && performanceChecks.coveredDrawCalls === 0, 'Covered mobile scene must stop WebGL draw calls.');
  await closePanel('#tavern-profile');
  assert(await evaluate(`document.activeElement?.matches('.th-mobile-profile')`), 'Profile trigger did not regain focus.');
  for (const [trigger, selector, name] of [
    ['.th-mobile-nav [aria-controls="tavern-friends"]','#tavern-friends','friends'],
    ['.th-mobile-nav [aria-controls="friend-chat"]','#friend-chat','chat'],
    ['.th-mobile-nav [aria-controls="tavern-reading-clubs"]','#tavern-reading-clubs','clubs'],
    ['.th-mobile-nav [aria-controls="tavern-bazar"]','#tavern-bazar','bazar'],
  ]) { await panel(trigger, selector, name); await closePanel(selector); }
  await click('.th-mobile-nav [aria-controls="friend-chat"]');
  await waitFor(`!!document.querySelector('.fc-thread')`, 'private chat list');
  await click('.fc-thread');
  await waitFor(`!!document.querySelector('#fc-draft:not(:disabled)')`, 'private chat composer');
  await keyboard('#fc-draft','private-chat');
  await evaluate(`(() => {const draft=document.querySelector('#fc-draft');draft.value='Borrador conservado';draft.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await closePanel('#friend-chat');
  await click('.th-mobile-nav [aria-controls="friend-chat"]');
  await waitFor(`!!document.querySelector('#fc-draft')`, 'private chat reopen');
  assert.equal(await evaluate(`document.querySelector('#fc-draft').value`), 'Borrador conservado', 'Closing a panel must preserve the draft.');
  await closePanel('#friend-chat');
  await click('.th-mobile-nav [aria-controls="tavern-reading-clubs"]');
  await waitFor(`!!document.querySelector('.rc-club-card')`, 'reading club list');
  await click('.rc-club-card');
  await waitFor(`!!document.querySelector('.rc-chapter-item')`, 'reading club chapters');
  await click('.rc-chapter-item');
  await waitFor(`!!document.querySelector('#rc-draft:not(:disabled)')`, 'chapter composer');
  await keyboard('#rc-draft','reading-club');
  await closePanel('#tavern-reading-clubs');
  await click('.th-mobile-nav [aria-controls="tavern-bazar"]');
  await waitFor(`!!document.querySelector('.bz-search input')`, 'Bazar search');
  await keyboard('.bz-search input','bazar');
  await closePanel('#tavern-bazar');
  for (const theme of ['neon','light-gallery','sepia','high-contrast-dark','high-contrast-light']) {
    await evaluate(`document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)})`);
    await layout(`theme-${theme}`);
  }
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('empty'); await layout('empty-reduced-motion');
  await navigate('guest'); await layout('guest');
  assert(await evaluate(`!!document.querySelector('.ts-guest-lock-bar')`), 'Guest restrictions disappeared.');
  await navigate('visitor'); await layout('visitor');
  assert(!await evaluate(`!!document.querySelector('app-tavern-bazar,app-friend-chat,app-tavern-reading-clubs')`), 'Visitor initialized account panels.');
  failMe = true; await navigate();
  await waitFor(`!!document.querySelector('.th-error')`, 'load error');
  failMe = false; await click('.th-error button');
  await waitFor(`!document.querySelector('.th-error')&&document.querySelector('.ts-participants-toggle')?.textContent.includes('(5)')`, 'retry recovery');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await command('Emulation.setCPUThrottlingRate', { rate: 4 });
  await command('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 75000 });
  await command('Performance.enable', {});
  await navigate();
  await panel('.th-mobile-nav [aria-controls="tavern-friends"]', '#tavern-friends', 'constrained-friends');
  await closePanel('#tavern-friends');
  await click('.ts-participants-toggle');
  assert.equal(await evaluate(`document.querySelectorAll('.ts-participant').length`), 5, 'Constrained device lost participants');
  await click('.ts-participants-toggle');
  await layout('constrained-cpu4x-network');
  const metrics = await command('Performance.getMetrics', {});
  performanceChecks.constrained = { cpuRate: 4, latencyMs: 150, downloadBytesPerSecond: 200000,
    metrics: Object.fromEntries(metrics.metrics.filter(item => ['TaskDuration','ScriptDuration','LayoutDuration','JSHeapUsedSize','Nodes'].includes(item.name)).map(item => [item.name,item.value])) };
  await command('Emulation.setCPUThrottlingRate', { rate: 1 });
  await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await writeFile(join(out,'report.json'), JSON.stringify({ report, errors, issues, performanceChecks, browser: executable,
    note: 'Chromium touch emulation; real Safari/Android software keyboards require device validation.' }, null, 2));
  assert.deepEqual(errors, [], 'Unexpected JavaScript exceptions');
  assert.deepEqual(issues, [], 'Layout or accessibility regressions');
  console.log(`PASS: ${report.length} layouts, modal focus/close, lazy initialization, guest/visitor and retry. Screenshots: ${out}`);
} catch (error) {
  await captureFailure?.().catch(() => {});
  await writeFile(join(out,'failure.json'), JSON.stringify({ error: error.stack, report, errors, issues, performanceChecks }, null, 2));
  throw error;
} finally {
  socket?.close();
  const exited = new Promise(resolve => browser.once('exit', resolve));
  browser.kill(); await Promise.race([exited, sleep(2000)]);
  await new Promise(resolve => server.close(resolve));
  // Only remove the temporary profile created by this process, under the OS temp directory.
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
