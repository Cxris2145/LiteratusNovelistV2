// Ejecutar después de backend/scripts/preview_achievements.py y ng serve --configuration preview --port 4300.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, 'docs', 'audits', 'logros-v2');
const scratch = join(root, '.tmp-achievements-browser');
const profile = join(scratch, `profile-${Date.now()}`);
const backendRoot = resolve(root, '..', 'backend');
const helpers = [];
if (process.argv.includes('--start-servers')) {
  const backendEnv = { ...process.env, LITERATUS_TEST_DB: join(backendRoot, '.tmp-achievements-preview', 'preview.sqlite3'), PYTHONUNBUFFERED: '1' };
  helpers.push(spawn(join(backendRoot, '.venv', 'Scripts', 'python.exe'),
    ['manage.py', 'runserver', '127.0.0.1:8010', '--settings=config.test_settings', '--noreload'],
    { cwd: backendRoot, env: backendEnv, stdio: 'ignore', windowsHide: true }));
  helpers.push(spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve', '--configuration', 'preview', '--port', '4300', '--host', '127.0.0.1'],
    { cwd: root, stdio: 'ignore', windowsHide: true }));
}
const session = JSON.parse(await readFile(join(backendRoot, '.tmp-achievements-preview', 'session.json'), 'utf8'));
const origin = 'http://127.0.0.1:4300';
const api = 'http://127.0.0.1:8010/api/v1/';
const port = 9337;
await mkdir(output, { recursive: true });
await mkdir(profile, { recursive: true });
const browser = spawn(process.env.CHROME_BIN || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function retry(fn, attempts = 100) {
  let error;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) { error = err; await sleep(150); }
  }
  throw error;
}
function assert(ok, message) { if (!ok) throw new Error(message); }
const report = { checks: [], screenshots: [], runtimeErrors: [], overflows: [] };
let socket;
try {
  await retry(async () => assert((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok, 'El frontend aún no responde'), 250);
  await retry(async () => assert((await fetch(api + 'library/achievements/catalog/', { signal: AbortSignal.timeout(1000) })).ok, 'El backend aún no responde'));
  const version = await retry(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json());
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', fail, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') report.runtimeErrors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (!message.id || !pending.has(message.id)) return;
    const { ok, fail } = pending.get(message.id); pending.delete(message.id);
    if (message.error) fail(new Error(message.error.message)); else ok(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++nextId; pending.set(id, { ok, fail }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    try { return await retry(async () => { const value = await evaluate(expression); assert(value, `No se cumplió: ${expression}`); return value; }); }
    catch (err) {
      console.log(await evaluate('({url:location.href, text:document.body.innerText.slice(0,1800)})'));
      const { data } = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(join(output, 'failure.png'), Buffer.from(data, 'base64'));
      throw err;
    }
  };
  const apiGet = async path => {
    const response = await fetch(api + path, { headers: { Authorization: `Bearer ${session.access}` } });
    assert(response.ok, `API ${path}: ${response.status}`); return response.json();
  };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.origin === ${JSON.stringify(origin)}) {
    localStorage.setItem('access_token', ${JSON.stringify(session.access)});
    localStorage.setItem('refresh_token', ${JSON.stringify(session.refresh)});
    localStorage.setItem('user_profile', ${JSON.stringify(JSON.stringify(session.user))});
    localStorage.setItem('literatus_guide_dismissed', 'true');
    localStorage.setItem('literatus_guide_seen', 'true');
    }
  ` });
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: origin + '/achievements' });
  await waitFor('document.querySelectorAll(".achievement-card[data-rarity]").length === 45');
  await waitFor('document.querySelector(".popup-title")?.textContent.includes("Lector Nocturno")');
  const unlockCapture = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(output, 'achievement-unlock.png'), Buffer.from(unlockCapture.data, 'base64'));
  report.screenshots.push('achievement-unlock.png');
  report.checks.push('45 logros cargados desde SQLite; aviso de desbloqueo con premio mostrado al iniciar.');
  await retry(async () => assert(!(await apiGet('library/achievements/me/unnotified/')).length, 'Aviso no marcado'));
  report.checks.push('Aviso marcado como notificado en el backend.');
  await evaluate('document.querySelector(".popup-btn-action").click()');
  await waitFor('document.querySelectorAll(".collection-item").length === 12');
  report.checks.push('Ver premio abre la pestaña Colección.');
  await evaluate(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.innerText.includes('Papiro Dorado')).querySelector('.collection-action').click()`);
  await retry(async () => assert((await apiGet('users/profile/')).equipped_frame === 'frame-gold', 'No se equipó el marco'));
  await waitFor('document.querySelector(".profile-trigger app-avatar-frame")?.getAttribute("data-frame") === "frame-gold"');
  report.checks.push('Equipar un marco desde Colección actualiza el perfil y el menú.');
  await evaluate(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.innerText.includes('Papiro Dorado')).querySelector('.collection-action').click()`);
  await retry(async () => assert((await apiGet('users/profile/')).equipped_frame === '', 'No se quitó el marco'));
  report.checks.push('Quitar marco limpia el perfil.');
  await evaluate(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.innerText.includes('Búho')).querySelector('.collection-action').click()`);
  await retry(async () => assert((await apiGet('users/profile/')).equipped_frame === 'frame-owl', 'No se repuso el marco'));
  await evaluate(`document.querySelectorAll('.collection-content .achievements-tabs__btn')[1].click()`);
  await waitFor('document.querySelectorAll(".collection-item").length === 10');
  await evaluate(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.innerText.includes('Cronista')).querySelector('.collection-action').click()`);
  await retry(async () => assert((await apiGet('users/profile/')).equipped_title === '', 'No se quitó el título'));
  await waitFor(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.innerText.includes('Cronista'))?.querySelector('.collection-action')?.textContent.trim() === 'Equipar'`);
  await evaluate(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.innerText.includes('Cronista')).querySelector('.collection-action').click()`);
  await retry(async () => assert((await apiGet('users/profile/')).equipped_title === 'Cronista', 'No se equipó el título'));
  report.checks.push('Equipar y quitar título desde Colección guarda el texto correcto.');
  await evaluate(`document.querySelectorAll('.collection-content .achievements-tabs__btn')[2].click()`);
  await waitFor('document.querySelectorAll(".collection-item").length === 25');
  for (const name of ['Birrete de graduación', 'Sombrero con pluma', 'Gafas de lectura', 'Broche de pluma', 'Corona de laurel', 'Gorra de detective', 'Medalla del lector', 'Capa de medianoche']) {
    await evaluate(`Array.from(document.querySelectorAll('.collection-item')).find(e => e.querySelector('h3').textContent === ${JSON.stringify(name)}).querySelector('.preview-button').click()`);
    await waitFor(`document.querySelector('.collection-mirror p').textContent.includes(${JSON.stringify(name)})`);
  }
  report.checks.push('Los ocho accesorios nuevos se pueden probar en Maguito, incluidos los exclusivos bloqueados.');
  const shop = await apiGet('learning/shop/');
  assert(!shop.some(item => item.code === 'frame_laurel'), 'Exclusivo no obtenido visible en El Bazar');
  assert(shop.some(item => item.code === 'frame_owl'), 'Premio obtenido no visible');
  report.checks.push('El Bazar oculta exclusivos bloqueados y permite usar premios obtenidos.');

  // Un clic de la app realiza una acción real que completa los cinco espacios de Maguito.
  const face = shop.find(item => item.value === 'face:beard');
  await cmd('Page.navigate', { url: origin + '/tavern?bazar=ropero' });
  await waitFor('document.querySelectorAll(".bz-item").length >= 17');
  await evaluate(`Array.from(Array.from(document.querySelectorAll('.bz-item')).find(e => e.querySelector('h3').textContent.trim() === ${JSON.stringify(face.name)}).querySelectorAll('.bz-actions .bz-btn')).find(b => b.textContent.trim() === 'Canjear').click()`);
  await waitFor('document.querySelector(".popup-title")?.textContent.includes("Maguito de Gala")');
  report.checks.push('Vestir el quinto espacio desbloquea Maguito de Gala y muestra su aviso.');
  await sleep(6500);
  await cmd('Page.navigate', { url: origin + '/achievements' });
  await waitFor('document.querySelectorAll(".achievement-card[data-rarity]").length === 45');

  for (const theme of ['default', 'light-gallery']) {
    for (const width of [1440, 390]) {
      await cmd('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: width === 390 });
      await evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)}); window.scrollTo(0,0);`);
      for (const tab of ['achievements', 'collection']) {
        await evaluate(`document.querySelectorAll('.main-tab-btn')[${tab === 'achievements' ? 0 : 1}].click(); window.scrollTo(0,0);`);
        if (tab === 'collection') await evaluate(`document.querySelectorAll('.collection-content .achievements-tabs__btn')[0].click()`);
        if (width === 390) await evaluate(`document.querySelector(${JSON.stringify(tab === 'collection' ? '.collection-grid' : '.almost-there')})?.scrollIntoView({block:'start'}); window.scrollBy(0,-240);`);
        await sleep(400);
        const overflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth + 1`);
        if (overflow) report.overflows.push(`${tab}-${theme}-${width}`);
        const name = `${tab}-${theme}-${width}.png`;
        const { data } = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
        await writeFile(join(output, name), Buffer.from(data, 'base64'));
        report.screenshots.push(name);
      }
    }
  }
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: origin + '/tavern' });
  await waitFor('document.querySelector(".pc-avatar-wrap app-avatar-frame")?.getAttribute("data-frame") === "frame-owl"');
  await waitFor('document.querySelectorAll(".fl-friend app-avatar-frame[data-frame]").length === 2');
  await waitFor('document.querySelectorAll(".rk-row app-avatar-frame[data-frame]").length >= 3');
  assert(await evaluate(`document.querySelector('.pc-title')?.innerText === 'Cronista' && document.querySelectorAll('.rk-name small').length >= 3`), 'Títulos faltantes');
  report.checks.push('Marco y título visibles en tarjeta, amigos, ranking y menú de la Taberna.');
  const { data } = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(output, 'tavern-desktop.png'), Buffer.from(data, 'base64'));
  report.screenshots.push('tavern-desktop.png');
  const friend = (await apiGet('community/friends/')).results[0];
  await cmd('Page.navigate', { url: origin + '/tavern/amigo/' + friend.friend_code });
  await waitFor(`document.querySelector('.pc-avatar-wrap app-avatar-frame')?.getAttribute('data-frame') === ${JSON.stringify(friend.equipped_frame)}`);
  report.checks.push('Perfil de amigo muestra el mismo marco recibido en su tarjeta.');
  await cmd('Page.navigate', { url: origin + '/profile' });
  await waitFor('document.querySelector("app-avatar-frame.profile-frame")?.getAttribute("data-frame") === "frame-owl"');
  report.checks.push('El perfil propio muestra el marco equipado.');
  assert(!report.runtimeErrors.length, 'Errores de JavaScript en la vista previa');
  assert(!report.overflows.length, 'Desbordamiento horizontal');
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, runtimeErrors: report.runtimeErrors, overflows: report.overflows }, null, 2));
} finally {
  await writeFile(join(output, 'audit.json'), JSON.stringify(report, null, 2));
  socket?.close();
  // La .venv de Windows inicia otro python.exe: cerrar el árbol evita dejar el backend vivo.
  await Promise.allSettled([...helpers, browser].filter(child => child.exitCode === null).map(child => new Promise(done => {
    const stopper = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    stopper.on('exit', done);
    stopper.on('error', () => { child.kill(); done(); });
  })));
  if (resolve(profile).startsWith(resolve(scratch) + sep)) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
