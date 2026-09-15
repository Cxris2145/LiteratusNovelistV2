import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const brave = process.env.CHROME_BIN || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = join(root, 'docs', 'audits', 'visual-accessibility', 'screenshots');
const profileDir = await mkdtemp(join(tmpdir(), 'literatus-audit-'));
const port = 9334;

await mkdir(outputDir, { recursive: true });

const browser = spawn(brave, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

async function retry(fn, attempts = 50) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try { return await fn(); } catch (error) { lastError = error; await sleep(100); }
  }
  throw lastError;
}

let socket;
try {
  const version = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    return response.json();
  });

  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolvePromise, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolvePromise(message.result);
  });

  const send = (method, params = {}, sessionId) => new Promise((resolvePromise, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolvePromise, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  // La captura usa un perfil limpio: se omite únicamente el perfil privado para
  // que la auditoría de las rutas públicas no active el redirect de una sesión 401.
  await send('Network.setBlockedURLs', { urls: ['*users/profile*'] }, sessionId);

  const captures = [
    { name: 'classic-catalog-1440x900', route: '/catalog', theme: 'default', width: 1440, height: 900 },
    { name: 'classic-categories-1440x900', route: '/categories', theme: 'default', width: 1440, height: 900 },
    { name: 'classic-authors-1440x900', route: '/authors', theme: 'default', width: 1440, height: 900 },
    { name: 'classic-characters-1440x900', route: '/characters', theme: 'default', width: 1440, height: 900 },
    { name: 'classic-tavern-1440x900', route: '/tavern', theme: 'default', width: 1440, height: 900 },
    { name: 'light-home-1440x900', route: '/', theme: 'light-gallery', width: 1440, height: 900 },
    { name: 'light-catalog-1440x900', route: '/catalog', theme: 'light-gallery', width: 1440, height: 900 },
    { name: 'neon-catalog-1440x900', route: '/catalog', theme: 'neon', width: 1440, height: 900 },
    { name: 'light-catalog-1024x768', route: '/catalog', theme: 'light-gallery', width: 1024, height: 768 },
    { name: 'light-catalog-390x844', route: '/catalog', theme: 'light-gallery', width: 390, height: 844 },
    { name: 'light-menu-open-390x844', route: '/catalog', theme: 'light-gallery', width: 390, height: 844, openMenu: true }
  ];

  for (const capture of captures) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: capture.width,
      height: capture.height,
      deviceScaleFactor: 1,
      mobile: capture.width <= 480
    }, sessionId);
    await send('Page.navigate', { url: `http://localhost:4200${capture.route}` }, sessionId);
    await retry(async () => {
      const result = await send('Runtime.evaluate', {
        expression: 'document.readyState === "complete" && !!document.querySelector("app-root")',
        returnByValue: true
      }, sessionId);
      if (!result.result.value) throw new Error('Angular aún no está listo');
    });
    await sleep(2500);
    const themeExpression = capture.theme === 'default'
      ? 'document.documentElement.removeAttribute("data-theme"); localStorage.setItem("literatus-theme", "default");'
      : `document.documentElement.setAttribute("data-theme", ${JSON.stringify(capture.theme)}); localStorage.setItem("literatus-theme", ${JSON.stringify(capture.theme)});`;
    await send('Runtime.evaluate', { expression: themeExpression }, sessionId);
    if (capture.openMenu) {
      await send('Runtime.evaluate', { expression: 'document.querySelector(".menu-icon")?.click()' }, sessionId);
    }
    await sleep(350);
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
    await writeFile(join(outputDir, `${capture.name}.png`), Buffer.from(data, 'base64'));
    console.log(`Capturada ${capture.name}.png`);
  }
} finally {
  socket?.close();
  browser.kill();
  if (resolve(profileDir).startsWith(resolve(tmpdir()))) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
