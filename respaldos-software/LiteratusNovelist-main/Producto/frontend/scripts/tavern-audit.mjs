// Development QA with isolated fixtures: no real payments, account or backend writes.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist/frontend/browser');
const out = join(root, 'docs/audits/taberna');
const profile = await mkdtemp(join(tmpdir(), 'literatus-tavern-qa-'));
const server = createServer(async (req, res) => {
  const name = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!name.startsWith(dist + sep) && name !== dist) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(name);
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[extname(name)] || 'application/octet-stream'); res.end(data);
  } catch { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(join(dist, 'index.html'))); }
});
await new Promise(resolvePromise => server.listen(4380, '127.0.0.1', resolvePromise));
await mkdir(out, { recursive: true });
const browser = spawn(process.env.CHROME_BIN || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9337', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
const plans = [
  { code: 'aprendiz', name: 'Aprendiz', price: '7.99', currency: 'USD', daily_token_limit: 100000, daily_time_limit: 18000, monthly_ink_bonus: 0, benefits: ['Personalización actual de Literatus'], purchasable: true },
  { code: 'maestro', name: 'Maestro', price: '14.99', currency: 'USD', daily_token_limit: 300000, daily_time_limit: null, monthly_ink_bonus: 500, benefits: ['Insignia y marco Maestro durante tu período pagado'], purchasable: true }
];
const usage = { date: '2026-09-30', server_now: new Date().toISOString(), resets_at: new Date(Date.now()+3600000).toISOString(), tokens_used: 192000,
  tokens_reserved: 0, token_limit: 300000, tokens_remaining: 108000, active_seconds: 8280, time_limit: null, has_plan: true, plan_available: true, ink_balance: 1420 };
function fixture(url) {
  const path = new URL(url).pathname;
  if (path.endsWith('/finance/plans/')) return plans;
  if (path.endsWith('/finance/ink-packages/')) return [{ amount: 200, price: '990', currency: 'CLP' }, { amount: 500, price: '1990', currency: 'CLP' }, { amount: 1200, price: '3990', currency: 'CLP' }];
  if (path.endsWith('/finance/subscription/')) return { subscription: { plan: plans[1], status: 'ACTIVE', active: true, paid_until: new Date(Date.now()+28*86400000).toISOString(), renews_at: new Date(Date.now()+28*86400000).toISOString(), cancel_at_period_end: false, pending_plan: null }, cosmetics: { maestro: true, frame: 'frame-maestro' }, ink_balance: 1420 };
  if (path.endsWith('/ai/usage/')) return usage;
  if (path.endsWith('/users/profile/')) return { username: 'Lector QA', level: 1, xp: 0, ink_balance: 1420, theme: 'default', avatar_color: '#3174cf', equipped_frame: '', subscription_cosmetics: { maestro: true } };
  if (path.includes('/daily-reward/status/')) return { can_claim: true, ink_reward: 20, xp_reward: 15 };
  if (path.endsWith('/learning/shop/')) return [
    { code: 'qa-shield', name: 'Protector de racha', description: 'Protege tu recorrido de lectura.', cost_ink: 100, item_type: 'streak_shield', icon: 'shield', quantity: 0, is_owned: false },
    { code: 'qa-frame', name: 'Marco del explorador', description: 'Dale otro marco a tu perfil.', cost_ink: 200, item_type: 'profile_frame', icon: 'filter_frames', quantity: 1, is_owned: true }
  ];
  if (path.endsWith('/users/me/')) return { id: 'qa', username: 'Lector QA', email: 'qa@example.invalid', is_staff: false, is_superuser: false };
  return { count: 0, results: [] };
}
let socket;
const report = [];
const errors = [];
try {
  let version;
  for (let i = 0; i < 50; i++) {
    try { version = await (await fetch('http://127.0.0.1:9337/json/version')).json(); break; } catch { await sleep(100); }
  }
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(resolvePromise => socket.addEventListener('open', resolvePromise, { once: true }));
  let counter = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolvePromise, reject) => {
    const id = ++counter; pending.set(id, { resolvePromise, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const job = pending.get(message.id); pending.delete(message.id);
      if (message.error) job.reject(Error(message.error.message)); else job.resolvePromise(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Fetch.requestPaused') {
      const value = fixture(message.params.request.url);
      await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,OPTIONS' }],
        body: Buffer.from(JSON.stringify(value)).toString('base64') }, message.sessionId);
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*' }, { urlPattern: '*/api/health/*' }] }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('literatus_guide_dismissed','true'); localStorage.setItem('access_token','qa-fixture'); localStorage.setItem('user_profile',JSON.stringify({id:'qa',username:'Lector QA',email:'qa@example.invalid',is_staff:false,is_superuser:false})); } catch {}` }, sessionId);
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
    await send('Page.navigate', { url: 'http://127.0.0.1:4380/tavern' }, sessionId);
    await sleep(2300);
    for (const theme of ['default', 'neon', 'light-gallery', 'high-contrast-dark', 'high-contrast-light', 'sepia']) {
      await send('Runtime.evaluate', { expression: `document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)});` }, sessionId);
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
      await sleep(100);
      const contrastResult = await send('Runtime.evaluate', { expression: `(() => {
        const rgb = value => { const n=(value.match(/[\\d.]+/g)||[]).map(Number); return [n[0]||0,n[1]||0,n[2]||0,n[3]??1]; };
        const blend = (front,back) => front.slice(0,3).map((value,i)=>value*front[3]+back[i]*(1-front[3]));
        const lum = color => color.map(value=>{ const x=value/255; return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4); }).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        const results=[];
        for (const el of document.querySelectorAll('.tavern a,.tavern button,.plan-badge,.plan-quota,.plan-description,.section-heading>span')) {
          if (el.disabled||!el.getClientRects().length) continue;
          let bg=[255,255,255]; const layers=[];
          for(let node=el;node;node=node.parentElement) layers.unshift(rgb(getComputedStyle(node).backgroundColor));
          for(const layer of layers) bg=blend(layer,bg);
          const fg=blend(rgb(getComputedStyle(el).color),bg); const a=lum(fg),b=lum(bg);
          const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          results.push({ text:el.textContent.trim().slice(0,50), ratio:Math.round(ratio*100)/100 });
        }
        return { minimum: Math.min(...results.map(r=>r.ratio)), failures:results.filter(r=>r.ratio<4.5) };
      })()`, returnByValue: true }, sessionId);
      const contrast = contrastResult.result.value;
      if (contrast.failures.length) throw Error('Contraste insuficiente: ' + theme + ' ' + JSON.stringify(contrast));
      const result = await send('Runtime.evaluate', { expression: `(() => { const el=document.querySelector('.tavern'); if(!el) throw Error('Taberna no montada'); const text=el.textContent; return { width:innerWidth, overflow:el.scrollWidth-el.clientWidth, hasPrices:text.includes('7,99')&&text.includes('14,99'), hasUsage:text.includes('192.000'), hasBazar:!!el.querySelector('.shop-item'), reducedMotion:getComputedStyle(el.querySelector('.hero-art')).backgroundImage, height:document.documentElement.scrollHeight }; })()`, returnByValue: true }, sessionId);
      const state = result.result.value;
      if (!state || !state.hasPrices || !state.hasUsage || state.overflow > 2) throw Error('Revisión visual fallida: ' + JSON.stringify(state));
      report.push({ theme, ...state, contrast });
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.min(state.height, 9000), scale: 1 } }, sessionId);
      await writeFile(join(out, `${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      console.log(`${theme} ${width}: sin desbordamiento, precios y cuenta visibles`);
    }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ fixtures: true, states: report, errors }, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  socket?.close(); browser.kill(); await new Promise(resolvePromise => server.close(resolvePromise));
  const tempRoot = resolve(tmpdir());
  if (resolve(profile).startsWith(tempRoot + sep)) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
