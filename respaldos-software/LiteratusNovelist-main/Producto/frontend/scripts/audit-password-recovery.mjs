// Backend en 8010 con LITERATUS_PREVIEW_EMAIL_DIR y frontend preview en 4300.
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, 'docs', 'audits', 'password-recovery');
const scratch = join(root, '.tmp-achievements-recovery-browser');
const profile = join(scratch, `profile-${Date.now()}`);
const mailDir = resolve(root, '..', 'backend', '.tmp-achievements-preview', 'mail');
const origin = 'http://127.0.0.1:4300';
const api = 'http://127.0.0.1:8010/api/v1/';
const email = 'recuperacion@preview.example';
const oldPassword = 'LecturaAnterior2026!';
const newPassword = 'HistoriasNuevas2026!';
const report = { checks: [], screenshots: [], runtimeErrors: [], overflows: [] };
const sleep = ms => new Promise(done => setTimeout(done, ms));
function assert(ok, message) { if (!ok) throw new Error(message); }
async function retry(fn, attempts = 100) {
  let error;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) { error = err; await sleep(150); }
  }
  throw error;
}
await mkdir(output, { recursive: true });
await mkdir(profile, { recursive: true });
await mkdir(mailDir, { recursive: true });
const priorMails = new Set(await readdir(mailDir));
const browser = spawn(process.env.CHROME_BIN || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9338', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
let socket;
try {
  const version = await retry(async () => (await fetch('http://127.0.0.1:9338/json/version')).json());
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
  const cmd = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = expression => retry(async () => {
    const value = await evaluate(`Boolean(${expression})`); assert(value, `No se cumplió: ${expression}`); return value;
  });
  const fill = async (selector, value) => {
    await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    await sleep(50);
  };
  const submit = () => evaluate('document.querySelector("form .recovery-primary").click()');
  async function captureStage(stage) {
    for (const theme of ['default', 'light-gallery']) {
      for (const width of [1440, 390]) {
        await cmd('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: width === 390 });
        await evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)}); window.scrollTo(0,0);`);
        await sleep(100);
        const name = `${stage}-${theme}-${width}.png`;
        if (await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')) report.overflows.push(name);
        const { data } = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
        await writeFile(join(output, name), Buffer.from(data, 'base64'));
        report.screenshots.push(name);
      }
    }
  }
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(origin)}) localStorage.setItem('literatus_guide_dismissed', 'true');` });
  await cmd('Page.navigate', { url: origin + '/login' });
  await waitFor(`document.querySelector('a[href="/forgot-password"]')`);
  await evaluate(`document.querySelector('a[href="/forgot-password"]').click()`);
  await waitFor('document.querySelector("#recovery-email")');
  await captureStage('email');
  await fill('#recovery-email', email);
  await submit();
  await waitFor('document.querySelector("#recovery-code")');
  const code = await retry(async () => {
    for (const name of (await readdir(mailDir)).filter(name => !priorMails.has(name))) {
      const body = await readFile(join(mailDir, name), 'utf8');
      if (body.includes(email)) {
        const match = body.match(/es: ([0-9]{6})/);
        if (match) return match[1];
      }
    }
    throw new Error('No llegó el correo a la bandeja local de prueba.');
  });
  report.checks.push('Enlace desde login solicita el código y el correo llega a la bandeja aislada.');
  assert(await evaluate('document.querySelector("#recovery-code").getAttribute("autocomplete") === "one-time-code"'), 'Falta autocompletado del código');
  assert(await evaluate('document.querySelector(".recovery-resend button").disabled'), 'Reenvío sin espera');
  report.checks.push('Código admite autocompletado; reenvío espera 60 segundos.');
  await captureStage('code');
  await fill('#recovery-code', code === '999999' ? '888888' : '999999');
  await submit();
  await waitFor('document.querySelector(".recovery-error")?.innerText.includes("incorrecto")');
  report.checks.push('Código incorrecto muestra un error sin cambiar la contraseña.');
  await fill('#recovery-code', code);
  await submit();
  await waitFor('document.querySelector("#newPassword")');
  assert(await evaluate('location.pathname === "/reset-password" && !location.search && !Object.keys(localStorage).some(k => /recovery|reset_token/.test(k))'), 'Permiso de recuperación persistido');
  report.checks.push('Código válido abre la contraseña nueva; permiso fuera de URL y localStorage.');
  await captureStage('new-password');
  await fill('#newPassword', newPassword);
  await fill('#confirmPassword', oldPassword);
  await submit();
  await waitFor('document.querySelector(".recovery-error")?.innerText.includes("no coinciden")');
  report.checks.push('Confirmación diferente se rechaza.');
  await fill('#newPassword', oldPassword);
  await fill('#confirmPassword', oldPassword);
  await submit();
  await waitFor('document.querySelector(".recovery-error")?.innerText.includes("distinta de la anterior")');
  report.checks.push('Servidor rechaza la contraseña anterior y permite corregirla.');
  await captureStage('previous-password-error');
  await fill('#newPassword', '12345678');
  await fill('#confirmPassword', '12345678');
  await submit();
  await waitFor('document.querySelector(".recovery-error")?.innerText.includes("común")');
  report.checks.push('Reglas de seguridad del servidor se muestran en la página.');
  await fill('#newPassword', newPassword);
  await fill('#confirmPassword', newPassword);
  await submit();
  await waitFor('document.querySelector(".recovery-success")');
  report.checks.push('Contraseña distinta se guarda y presenta acceso a iniciar sesión.');
  await captureStage('success');
  const oldLogin = await fetch(api + 'users/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, password: oldPassword }) });
  assert(oldLogin.status === 401, 'La contraseña anterior sigue siendo válida');
  const newLogin = await fetch(api + 'users/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, password: newPassword }) });
  assert(newLogin.ok, 'La contraseña nueva no permite entrar');
  report.checks.push('La contraseña anterior ya no inicia sesión; la nueva sí.');
  await cmd('Page.navigate', { url: origin + '/reset-password' });
  await waitFor(`document.querySelector('a[href="/forgot-password"]')`);
  assert(await evaluate('!document.querySelector("#newPassword")'), 'Formulario accesible sin verificación');
  report.checks.push('Abrir o recargar directamente la página exige un código nuevo.');
  assert(!report.runtimeErrors.length, 'Errores de JavaScript');
  assert(!report.overflows.length, 'Desbordamiento horizontal');
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, runtimeErrors: report.runtimeErrors, overflows: report.overflows }, null, 2));
} finally {
  await writeFile(join(output, 'audit.json'), JSON.stringify(report, null, 2));
  socket?.close();
  await new Promise(done => {
    const stopper = spawn('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    stopper.on('exit', done); stopper.on('error', () => { browser.kill(); done(); });
  });
  if (resolve(profile).startsWith(resolve(scratch) + sep)) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
