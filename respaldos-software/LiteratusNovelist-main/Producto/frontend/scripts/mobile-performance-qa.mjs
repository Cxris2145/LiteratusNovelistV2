/**
 * Run after npm run build. All API and external traffic is intercepted with fixtures.
 * Output: tmp/mobile-performance/<QA_LABEL || current>/{report.json,*.png}.
 * QA_DIST selects a different build; CHROME_BIN selects the Chromium executable.
 * Timings and frame gaps are emulator observations, not field INP/FPS or a baseline comparison.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = process.cwd(), dist = resolve(root, process.env.QA_DIST || 'dist/frontend/browser');
const out = resolve(root, 'tmp/mobile-performance', process.env.QA_LABEL || 'current');
await mkdir(out, { recursive: true });
const indexPath = join(dist, 'index.html'), index = await readFile(indexPath), builtAt = (await stat(indexPath)).mtime.toISOString();
const candidates = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
let executable;
for (const candidate of candidates) if (candidate && await access(candidate).then(() => true, () => false)) { executable = candidate; break; }
assert(executable, 'Set CHROME_BIN to an installed Chromium browser.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== dist && !path.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { if (extname(path)) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', 'text/html'); res.end(index); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'literatus-mobile-performance-'));
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(done => setTimeout(done, ms));
const user = { id: 'qa-performance', username: 'LectorQA', email: 'qa@example.invalid', birth_date: '1990-01-01', is_staff: false, is_superuser: false, has_completed_onboarding: true };
const genres = ['ficcion-clasica', 'aventura', 'fantasia', 'misterio', 'poesia', 'historia', 'ensayo', 'teatro'].map((slug, i) => ({ id: String(i + 1), name: slug, slug, book_count: 12 }));
const books = Array.from({ length: 24 }, (_, i) => ({ id: `b${i}`, slug: `libro-${i}`, title: `Historia extraordinaria ${i}`, author_name: 'Autora QA', synopsis: 'Una aventura entre mundos y palabras.', description: 'Una aventura entre mundos y palabras.', cover_image: '/assets/default_cover.jpg', is_featured: i < 6, genres: [genres[i % genres.length]], page_count: 120 + i, word_count: 25000, average_rating: 4.5, total_reviews: 3, is_free: true, price: '0.00', created_at: '2026-01-01T00:00:00Z', editions: [] }));
const inventory = books.map((book, i) => ({ id: `inventory-${i}`, book_id: book.id, book_slug: book.slug, book_title: book.title, author_name: book.author_name, book_cover: book.cover_image, edition: { id: `e${i}`, book }, progress: { completion_percentage: i % 3 === 0 ? 0 : i % 3 === 1 ? 40 : 100 }, acquired_at: '2026-01-01T00:00:00Z' }));
const pathData = { user_status: { hearts: 5, max_hearts: 5, streak_current: 2, streak_max: 2, streak_shields: 0, is_secured_today: true, is_in_danger: false, ink_balance: 100, xp: 100, level: 2 }, chests: [], units: Array.from({ length: 30 }, (_, i) => ({ id: `u-${i + 1}`, unit_number: i + 1, slug: `unit-${i + 1}`, title: `Unidad ${i + 1}`, description: 'Un nuevo relato.', order: i + 1, icon: 'menu_book', banner_color: '#317b72', min_user_level: 1, progress_percentage: 0, is_locked: i > 0, levels: Array.from({ length: 5 }, (_, j) => ({ id: `u-${i + 1}-l-${j + 1}`, level_number: j + 1, order: j + 1, title: `Etapa ${j + 1}`, description: 'Una aventura.', difficulty: 'facil', required_score: 70, xp_reward: 20, ink_reward: 10, is_exam: j === 4, is_chest: j === 2, icon: 'menu_book', stars: 0, best_score: 0, is_completed: false, is_unlocked: i === 0 && j === 0 })) })) };
const stats = { total_books: 24, total_authors: 6, total_characters: 0, total_genres: genres.length };
function fixture(url) {
  const path = new URL(url).pathname;
  if (path.endsWith('/public-home') || path.endsWith('/catalog/home/')) return { version: 1, audience: 'public', generated_at: new Date().toISOString(), stats, books, starter_books: books.slice(0, 4).map(b => ({ slug: b.slug, title: b.title, author: b.author_name, genre: 'Aventura', cover: b.cover_image })), genres: genres.map(g => ({ name: g.name, slug: g.slug, bookCount: g.book_count, image: '/assets/default_cover.jpg' })), cast: [] };
  if (path.endsWith('/users/me/')) return user;
  if (path.endsWith('/users/profile/')) return { ...user, theme: 'default', ink_balance: 100, xp: 100, level: 2, level_name: 'Lector', outfit: {} };
  if (path.endsWith('/catalog/stats/')) return stats;
  if (path.endsWith('/catalog/genres/')) return { count: genres.length, results: genres };
  if (path.endsWith('/catalog/books/recommendations/')) return books.slice(0, 6);
  if (path.endsWith('/catalog/books/')) return { count: books.length, next: null, previous: null, results: books };
  if (/\/catalog\/books\/libro-\d+\/$/.test(path)) return { ...books[0], avatars: [], author: { id: 'a1', name: 'Autora QA', slug: 'autora-qa' } };
  if (path.endsWith('/catalog/authors/')) return { count: 1, results: [{ id: 'a1', name: 'Autora QA', slug: 'autora-qa', photo: null, book_count: 24 }] };
  if (path.endsWith('/hub/avatars/')) return { count: 6, next: null, previous: null, results: books.slice(0, 6).map((book, i) => ({ id: `avatar-${i}`, name: `Personaje ${i}`, book_title: book.title, book_slug: book.slug, description: 'Un personaje de la historia.', avatar_image_url: '/assets/images/default-avatar.svg', tags: [], trend_level: 'new', chat_count: 3 })) };
  if (path.endsWith('/hub/recent/')) return [];
  if (path.endsWith('/learning/path/')) return pathData;
  if (path.endsWith('/learning/streak/')) return { ...pathData.user_status, calendar: [] };
  if (path.endsWith('/learning/shop/')) return [];
  if (path.endsWith('/library/inventory/')) return inventory;
  if (path.endsWith('/library/favorites/')) return books.slice(0, 6).map((book, i) => ({ id: `favorite-${i}`, book, created_at: '2026-01-01T00:00:00Z' }));
  if (path.endsWith('/library/vocabulary/')) return books.slice(0, 8).map((book, i) => ({ id: `word-${i}`, book_id: book.id, book_title: book.title, word: `Palabra ${i}`, definition: 'Significado para practicar.', context_sentence: 'Una frase de la historia.', is_learned: i % 2 === 0, created_at: '2026-01-01T00:00:00Z' }));
  if (path.endsWith('/library/vocabulary/practice/')) return { count: 0, cards: [] };
  if (path.endsWith('/library/vocabulary/') || path.includes('/library/achievements/') || path.endsWith('/library/ink-history/') || path.endsWith('/library/missions/')) return [];
  if (path.includes('/daily-reward/status/')) return { can_claim: false, ink_reward: 10 };
  if (path.includes('/ai/usage/')) return { has_plan: false, tokens_used: 0, token_limit: 0, ink_balance: 100 };
  return { success: true, pending_incoming: 0, count: 0, next: null, previous: null, results: [] };
}
let socket, command, evaluate;
const report = [], errors = [], issues = [], intercepted = new Map();
const check = (value, description) => { if (!value) issues.push(description); };
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await sleep(100); } }
  assert(port, 'Chrome did not expose CDP');
  socket = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((done, reject) => { const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout ${method}`)); }, 30000); pending.set(key, { done, reject, timeout }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) })); });
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) { const call = pending.get(data.id); pending.delete(data.id); clearTimeout(call.timeout); data.error ? call.reject(Error(data.error.message)) : call.done(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if (data.method === 'Fetch.requestPaused') {
      const req = data.params.request, url = new URL(req.url), isApi = url.pathname.startsWith('/api/');
      try {
        if (url.origin === origin && !isApi) { await send('Fetch.continueRequest', { requestId: data.params.requestId }, data.sessionId); return; }
        intercepted.set(url.pathname, (intercepted.get(url.pathname) || 0) + 1);
        await send('Fetch.fulfillRequest', { requestId: data.params.requestId, responseCode: isApi ? 200 : 204, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PATCH,DELETE' }], body: Buffer.from(JSON.stringify(isApi ? fixture(req.url) : {})).toString('base64') }, data.sessionId);
      } catch (error) { if (!/Invalid InterceptionId/i.test(error.message)) errors.push(`fixture: ${error.message}`); }
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  command = (method, params = {}) => send(method, params, sessionId);
  evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expression, label) => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(100); } throw Error(`Timed out ${label}`); };
  const shot = async label => { const r = await command('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, `${label}.png`), Buffer.from(r.data, 'base64')); };
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Network.setBypassServiceWorker', { bypass: true }); await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] }); await command('Performance.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('literatus_guide_seen','true');localStorage.setItem('literatus_guide_dismissed','true');localStorage.setItem('access_token','qa-fixture');localStorage.setItem('user_profile',JSON.stringify(${JSON.stringify(user)}));window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});` });
  const metricNames = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'LayoutCount', 'RecalcStyleDuration', 'RecalcStyleCount'];
  const metrics = async () => Object.fromEntries((await command('Performance.getMetrics')).metrics.filter(x => metricNames.includes(x.name)).map(x => [x.name, x.value]));
  const routes = [ ['/', 'app-home'], ['/catalog', 'app-book-list'], ['/learn', 'app-learning-path'], ['/library', 'app-library-list'], ['/favorites', 'app-favorites'], ['/flashcards', 'app-flashcards'], ['/achievements', 'app-achievements'], ['/authors', 'app-author-list'], ['/characters', 'app-character-hub'], ['/games', 'app-games-hub'] ];
  for (const width of [390, 320, 1280]) {
    const height = width === 1280 ? 800 : width === 320 ? 568 : 844;
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await command('Emulation.setTouchEmulationEnabled', { enabled: width < 700, ...(width < 700 ? { maxTouchPoints: 1 } : {}) });
    await command('Emulation.setCPUThrottlingRate', { rate: width < 700 ? 4 : 1 });
    for (const [route, selector] of width === 390 ? routes : routes.slice(0, 3)) {
      const label = `${width}-${route.replaceAll('/', '') || 'home'}`;
      await command('Page.navigate', { url: origin + route });
      await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, label);
      await sleep(route === '/learn' ? 1600 : 900);
      const state = await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)});return{route:location.pathname,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,text:root.innerText.length,cards:root.querySelectorAll('.book-card,.library-card,[data-level-id]').length,dialogs:document.querySelectorAll('[role=dialog]').length,animations:root.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,blurred:[...root.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight&&s.backdropFilter!=='none'}).map(el=>({tag:el.tagName,class:el.className,filter:getComputedStyle(el).backdropFilter})).slice(0,10)}})()`);
      check(state.route === route || (route === '/' && state.route === '/home'), `${label}: redirected to ${state.route}`);
      check(state.overflow <= 1, `${label}: horizontal overflow ${state.overflow}px`);
      check(state.text > 10, `${label}: empty view`);
      const start = await metrics();
      const work = await evaluate(`(async()=>{const start=performance.now();window.__longTasks=[];for(let i=0;i<100;i++){window.dispatchEvent(new Event('scroll'));document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));await new Promise(done=>setTimeout(done,8));}await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));return{elapsedMs:performance.now()-start,longTasks:window.__longTasks};})()`);
      const end = await metrics();
      report.push({ label, route, cpuRate: width < 700 ? 4 : 1, state, inertEvents: { each: 100, ...work, metricsDelta: Object.fromEntries(metricNames.map(key => [key, end[key] - start[key]])) } });
      const scrollStart = await metrics();
      const scrollWork = await evaluate(`(async()=>{const scroller=document.querySelector('.layout-h .world-scroller'),max=scroller?scroller.scrollWidth-scroller.clientWidth:document.documentElement.scrollHeight-innerHeight,gaps=[];window.__longTasks=[];let previous;for(let i=0;i<30;i++){const t=await new Promise(done=>requestAnimationFrame(done));if(previous!==undefined)gaps.push(t-previous);previous=t;const position=Math.max(0,max)*(i<15?i/14:(29-i)/14);if(scroller)scroller.scrollTo({left:position,behavior:'instant'});else window.scrollTo({top:position,behavior:'instant'});}await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));return{frames:30,maxScroll:max,maxFrameGapMs:Math.max(...gaps),meanFrameGapMs:gaps.reduce((a,b)=>a+b,0)/gaps.length,longTasks:window.__longTasks}})()`);
      const scrollEnd = await metrics();
      report[report.length-1].realScroll = { ...scrollWork, metricsDelta: Object.fromEntries(metricNames.map(key => [key, scrollEnd[key] - scrollStart[key]])) };
      if (route === '/catalog') {
        await evaluate(`document.querySelector('.sort-toggle-btn').click()`); await waitFor(`!!document.querySelector('.sort-dropdown-menu')`, 'sort opened');
        await evaluate(`document.body.click()`); await waitFor(`!document.querySelector('.sort-dropdown-menu')`, 'sort closed outside');
        check(await evaluate(`getComputedStyle(document.querySelector('.card-favorite-btn')).backdropFilter==='none'`) || width === 1280, `${label}: favorite backdrop blur remains`);
      }
      if (route === '/learn') {
        check(await evaluate(`document.querySelectorAll('[data-level-id]').length===150`), `${label}: missing levels`);
        await evaluate(`document.querySelector('[data-level-id="u-1-l-1"]').click()`); await waitFor(`!!document.querySelector('[role=dialog]')`, 'level dialog');
        check(width === 1280 || await evaluate(`getComputedStyle(document.querySelector('app-learning-path .modal-backdrop')).backdropFilter==='none'`), `${label}: level backdrop blur remains`);
        await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await waitFor(`!document.querySelector('[role=dialog]')`, 'level Escape');
        await evaluate(`document.querySelectorAll('.minimap-segment')[1].click()`);
        await waitFor(`document.querySelectorAll('.minimap-segment')[1].classList.contains('is-visible')`, 'second realm visible');
        await sleep(900);
        const lens = await evaluate(`(()=>{const segment=document.querySelector('.minimap-segment.is-visible'),lens=document.querySelector('.minimap-lens'),rail=document.querySelector('.minimap-rail');return{left:segment.offsetLeft,width:segment.offsetWidth,lensLeft:new DOMMatrixReadOnly(getComputedStyle(lens).transform).m41,lensWidth:lens.getBoundingClientRect().width,rail:rail.getBoundingClientRect().width}})()`);
        check(Math.abs(lens.lensLeft - (lens.left - 5)) < 2 && Math.abs(lens.lensWidth - (lens.width + 10)) < 2, `${label}: minimap lens misaligned ${JSON.stringify(lens)}`);
        report.push({ label: `${label}-minimap`, lens });
      }
      await shot(label);
      console.log(`PASS ${label}: overflow ${state.overflow}px, inert events script ${(1000*(end.ScriptDuration-start.ScriptDuration)).toFixed(1)}ms`);
    }
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const [route, selector] of routes.slice(0, 3)) {
    await command('Page.navigate', { url: origin + route }); await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 'reduced ' + route); await sleep(900);
    const running = await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect.getTiming().duration>1).map(a=>({duration:a.effect.getTiming().duration,target:a.effect.target.className}))`);
    report.push({ label: `reduced-${route}`, running }); check(running.length === 0, `Reduced motion ${route}: ${running.length} active animations`);
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ dist, builtAt, note: 'Local production Chromium emulation, fixture APIs, CPU4x on mobile. Inert events are synthetic, not field INP/FPS. No claim of exact before/after baseline.', report, errors, issues, intercepted: Object.fromEntries(intercepted) }, null, 2));
  assert.deepEqual(errors, [], 'Unexpected runtime exceptions'); assert.deepEqual(issues, [], 'Mobile QA issues');
  console.log(`PASS ${report.length} checks. Report ${out}`);
} catch (error) {
  try { const r = await command('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'failure.png'), Buffer.from(r.data, 'base64')); } catch {}
  await writeFile(join(out, 'failure.json'), JSON.stringify({ error: error.stack, report, errors, issues, intercepted: Object.fromEntries(intercepted) }, null, 2)); throw error;
} finally {
  socket?.close(); const exited = new Promise(done => browser.once('exit', done)); browser.kill(); await Promise.race([exited, sleep(2000)]); await new Promise(done => server.close(done));
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
