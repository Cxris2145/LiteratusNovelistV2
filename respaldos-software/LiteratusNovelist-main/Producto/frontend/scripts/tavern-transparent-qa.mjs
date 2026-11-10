import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
const root = process.cwd();
const dist = join(root, 'dist/frontend/browser');
const out = join(root, 'tmp/tavern-transparent');
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
const browser = spawn('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--remote-debugging-port=9339', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const me = { full: true, friend_code: 'QA1234', username: 'Maguito', tagline: 'Lector de mundos, escritor de posibilidades.', bio: 'Siempre hay tiempo para otra historia.', outfit: { head: 'beret' }, level: 12, level_name: 'Cronista', xp: 1200, equipped_title: '', favorite_genres: [{ name: 'Acción y aventura', slug: 'aventura' }, { name: 'Cuentos', slug: 'cuentos' }, { name: 'Ensayos', slug: 'ensayos' }], stats: { books_read: 8, reviews: 3, friends: 2, brindis: 4 }, member_since: '2026-01-01', relation: 'self', request_id: null, pending_incoming: 0 };
let messages = [];
let friendCount = 10;
let invitations = { incoming: [], outgoing: [] };
let failPath = '';
let inventory = [
  { id: 'book-done', book_title: 'Rayuela', author_name: 'Julio Cortázar', progress: { completion_percentage: '100', updated_at: '2026-10-04' } },
  { id: 'book-reading', book_title: 'Don Quijote de la Mancha', author_name: 'Miguel de Cervantes', progress: { completion_percentage: '42', updated_at: '2026-10-03' } }
];
const missions = [
  { id: 'mission-week', current_count: 3, is_completed: false, progress_percentage: 60, mission: { title: 'Cinco capítulos, cinco aventuras', description: 'Lee cinco capítulos durante esta semana.', target_count: 5, ink_reward: 20, xp_reward: 50, reset_type: 'weekly' } },
  { id: 'mission-done', current_count: 1, is_completed: true, progress_percentage: 100, mission: { title: 'Una nueva historia', description: 'Empieza una lectura esta semana.', target_count: 1, ink_reward: 10, xp_reward: 20, reset_type: 'weekly' } },
  { id: 'mission-month', current_count: 0, is_completed: false, progress_percentage: 0, mission: { title: 'Misión mensual', reset_type: 'monthly' } }
];
const friends = Array.from({ length: 16 }, (_, i) => ({ friend_code: 'AMIGO' + i, username: ['LunaEscribe', 'El Cronista'][i] || 'Amigo ' + i, outfit: { head: i % 2 ? 'aviator' : 'witch-flower', cape: i % 2 ? 'red' : 'default' }, tagline: 'Una historia más', level: 9, level_name: 'Lector', equipped_title: '', status: { kind: i % 2 ? 'reading' : 'tavern', label: i % 2 ? 'Leyendo' : 'En la taberna', book_title: i % 2 ? 'Don Quijote' : null }, brindis_given: false }));
const entries = [{ rank: 1, username: 'Maguito', friend_code: 'QA1234', outfit: me.outfit, points: 240, is_me: true }, ...friends.slice(0, 2).map((f, i) => ({ rank: i + 2, username: f.username, friend_code: f.friend_code, outfit: f.outfit, points: 150 - i * 30, is_me: false }))];
function fixture(url, method, body) {
  const u = new URL(url), path = u.pathname;
  if(failPath && path.endsWith(failPath)) return { message: 'Prueba de conexión fallida' };
  if(path.endsWith('/library/inventory/')) return inventory;
  if(path.endsWith('/library/missions/')) return missions;
  if(path.endsWith('/community/tavern/invitations/') && method==='POST') {
    const code=JSON.parse(body).friend_code, friend=friends.find(f=>f.friend_code===code);
    const invitation={id:'invite-'+code,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString(),user:friend};
    invitations.outgoing.push(invitation); return {success:true,message:'Invitación enviada.',id:invitation.id};
  }
  if(path.includes('/community/tavern/invitations/') && path.endsWith('/respond/')) {
    invitations.incoming=[]; return {success:true,message:'Ya estás en la mesa. ¡Salud!'};
  }
  if (path.endsWith('/community/me/')) return { ...me, stats: { ...me.stats, friends: friendCount } };
  if (path.endsWith('/community/friends/')) return { results: friends.slice(0, friendCount) };
  if (path.endsWith('/community/requests/')) return { incoming: [], outgoing: [] };
  if (path.endsWith('/community/ranking/')) return { scope: u.searchParams.get('scope') || 'week', period_start: null, entries, me: entries[0], participants: 3 };
  if (path.endsWith('/community/tavern/activity/')) return { messages, reactions: [], invitations };
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
      await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: failPath && new URL(m.params.request.url).pathname.endsWith(failPath) ? 500 : 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PATCH,DELETE' }], body: Buffer.from(JSON.stringify(fixture(m.params.request.url, m.params.request.method, m.params.request.postData))).toString('base64') }, m.sessionId);
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
  const waitFor=async expression=>{ for(let attempt=0;attempt<60;attempt++){if(await evaluate(expression))return;await sleep(100);}throw Error('Espera fallida: '+expression);};
  const closeDialog=async()=>{await evaluate("document.querySelector('app-tavern-table-dialog .td-close').click()");await waitFor("!document.querySelector('app-tavern-table-dialog')");};
  const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));};
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*' }, { urlPattern: '*/api/health/*' }] }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('literatus_guide_dismissed','true'); if(!localStorage.getItem('qa-guest')) { localStorage.setItem('access_token','qa-fixture'); localStorage.setItem('user_profile',JSON.stringify({id:'qa',username:'Maguito',email:'qa@example.invalid',is_staff:false,is_superuser:false,has_completed_onboarding:true})); }` }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844], [320, 740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
    await send('Page.navigate', { url: 'http://127.0.0.1:4392/tavern' }, sessionId);
    await sleep(1600);
    for(let attempt=0;attempt<30;attempt++) { if(await evaluate("document.querySelector('.ts-table-fallback')?.classList.contains('is-replaced')")) break; await sleep(100); }
    if(!await evaluate("document.querySelector('.ts-table-fallback').classList.contains('is-replaced')&&document.querySelector('app-tavern-table canvas').width>0")) throw Error('Mesa WebGL no montada');
    const state = await evaluate(`(() => { const hall=document.querySelector('.th-hall'), stage=document.querySelector('.ts-stage'); if(!hall||!stage) throw Error('Taberna no montada'); const box=s=>{const b=document.querySelector(s).getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height};}; return {webgl:!!document.querySelector('.ts-table-fallback.is-replaced'),footer:!!document.querySelector('app-footer'), seatTranslate:getComputedStyle(document.querySelector('.ts-seat')).translate, width:innerWidth, overflow:document.documentElement.scrollWidth-innerWidth, hall:box('.th-hall'), profile:box('.area-profile'), scene:box('.ts-stage'), side:box('.area-side'), dock:box('.ts-chat-dock'), sharedBackground:getComputedStyle(hall).backgroundImage.includes('tavern-backdrop'), stageBackground:getComputedStyle(stage).backgroundImage, reactions:document.querySelectorAll('.ts-react-pill').length}; })()`);
    if(state.footer) throw Error('El pie de página sigue en la taberna'); if (state.overflow > 2 || !state.sharedBackground || state.stageBackground !== 'none' || state.reactions !== 5) throw Error('Distribución incorrecta: ' + JSON.stringify(state));
    const seated=await evaluate("ng.getComponent(document.querySelector('app-tavern-scene')).seats.map(seat=>seat.guest.code)");
    if(seated.length!==5 || seated.some(code=>code.startsWith('AMIGO') && Number(code.slice(5))%2)) throw Error('Asientos no respetan presencia: '+seated);
    if(!await evaluate("document.querySelectorAll('.ts-table-tools button').length===3 && document.querySelectorAll('.tt-object').length===3")) throw Error('Faltan accesos a los objetos');
    const glass = await evaluate(`(() => {
      const hero=getComputedStyle(document.querySelector('.th-hero'));
      const alpha=selector=>{const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');ctx.fillStyle=getComputedStyle(document.querySelector(selector)).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]/255;};
      return {hero:alpha('.th-hero'),border:hero.borderTopWidth,shadow:hero.boxShadow,blur:hero.backdropFilter,profile:alpha('.pc'),friends:alpha('.fl'),ranking:alpha('.rk'),chat:alpha('.ts-chat-bar'),tools:alpha('.ts-table-tools button'),embers:document.querySelectorAll('.ts-ember').length,motion:getComputedStyle(document.querySelector('.ts-ember')).animationName};
    })()`);
    if(glass.hero!==0 || glass.border!=='0px' || glass.shadow!=='none' || glass.blur!=='none') throw Error('El título conserva una barra: '+JSON.stringify(glass));
    if([glass.profile,glass.friends,glass.ranking,glass.chat,glass.tools].some(alpha=>alpha<.4||alpha>.81)) throw Error('Transparencia incorrecta: '+JSON.stringify(glass));
    if(glass.embers!==6 || glass.motion!=='none') throw Error('Brasas no respetan movimiento reducido');
    console.log('PASS: cabecera transparente, cristal y movimiento reducido',JSON.stringify(glass));
    if(width===1920) {
      for(const theme of ['light-gallery','sepia','neon','high-contrast-light','high-contrast-dark']) {
        await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`); await sleep(100);
        const themed=await evaluate(`(() => {const el=document.querySelector('.pc'),ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return {alpha:ctx.getImageData(0,0,1,1).data[3]/255,blur:getComputedStyle(el).backdropFilter,overflow:document.documentElement.scrollWidth-innerWidth};})()`);
        if(themed.overflow>2 || (theme.startsWith('high-contrast') && (themed.alpha!==1 || themed.blur!=='none'))) throw Error('Tema falló: '+theme+JSON.stringify(themed));
        await capture('tema-'+theme);
      }
      await evaluate("document.documentElement.removeAttribute('data-theme')");
      console.log('PASS: temas claro, sepia, neón y ambos de alto contraste');
    }
    if(width>=1440 && await evaluate("document.querySelector('.th-hero').getBoundingClientRect().height>90")) throw Error('Título no compacto');
    if (width > 1000 && !(state.profile.x + state.profile.w <= state.scene.x && state.scene.x + state.scene.w <= state.side.x)) throw Error('Paneles no laterales');
    if (state.dock.x < 0 || state.dock.x + state.dock.w > width) throw Error('Chat fuera de pantalla');
    if(width<500) { const blocked=await evaluate(`Array.from(document.querySelectorAll('.ts-chat-icon-btn,.ts-chat-send-btn,.ts-react-pill,.ts-table-tools button')).filter(el=>{const b=el.getBoundingClientRect(); return !el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}).map(el=>el.getAttribute('aria-label') || el.textContent.trim())`); if(blocked.length) throw Error('Controles tapados: '+blocked.join(', ')); } report.push(state); console.log(JSON.stringify(state));
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(out, `tavern-${width}.png`), Buffer.from(shot.data, 'base64'));
    if (width === 1440) {
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sessionId);
      const before=await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).elapsed"); await sleep(500);
      const after=await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).elapsed");
      if(after<=before) throw Error('La animación 3D no avanza');
      const emberStart=await evaluate("getComputedStyle(document.querySelector('.ts-ember')).transform"); await sleep(200);
      if(emberStart===await evaluate("getComputedStyle(document.querySelector('.ts-ember')).transform")) throw Error('Las brasas no animan');
      for (const [index,action] of ['book','invite','rewards'].entries()) {
        await evaluate(`document.querySelectorAll('.ts-table-tools button')[${index}].focus()`); await sleep(200);
        if(await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).hoverAction")!==action) throw Error('Objeto no responde al teclado: '+action);
        await capture('objeto-'+action+'-1440');
      }
      await evaluate("document.activeElement.blur()");
      await evaluate("document.querySelectorAll('.ts-react-pill')[4].click()"); await sleep(800);
      const magic=await send('Page.captureScreenshot',{format:'png'},sessionId); await writeFile(join(out,'magic-1440.png'),Buffer.from(magic.data,'base64'));
      await evaluate("document.querySelectorAll('.ts-react-pill')[3].click()"); await sleep(750);
      const reading=await send('Page.captureScreenshot',{format:'png'},sessionId); await writeFile(join(out,'reading-1440.png'),Buffer.from(reading.data,'base64'));
      await evaluate("document.querySelectorAll('.ts-react-pill')[0].click()"); await sleep(200);
      if(!await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).toasting")) throw Error('La mesa no brinda');
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
      for(let attempt=0;attempt<20;attempt++) { if(await evaluate("(() => {const table=ng.getComponent(document.querySelector('app-tavern-table')); return table.motion.matches && table.frame===0;})()")) break; await sleep(100); }
      const stopped=await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).elapsed"); await sleep(180);
      if(stopped!==await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).elapsed")) throw Error('Movimiento reducido no respetado: '+JSON.stringify(await evaluate("(() => {const table=ng.getComponent(document.querySelector('app-tavern-table')); return {matches:table.motion.matches,frame:table.frame,elapsed:table.elapsed};})()")));
      const fallback=await evaluate("window.qaContextExtension=document.querySelector('app-tavern-table canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); !!window.qaContextExtension");
      if(fallback) {
        await evaluate("window.qaContextExtension.loseContext()"); await sleep(180);
        if(await evaluate("document.querySelector('.ts-table-fallback').classList.contains('is-replaced')")) throw Error('Respaldo SVG oculto al perder WebGL');
        await evaluate("window.qaContextExtension.restoreContext()"); await sleep(800);
        if(!await evaluate("document.querySelector('.ts-table-fallback').classList.contains('is-replaced')")) throw Error('Mesa no recuperada al restaurar WebGL');
      }
      console.log('PASS: animaciones, cofre, páginas, brindis, movimiento reducido y restauración WebGL');
      await evaluate("document.querySelector('.tt-object[aria-label=\"Compartir una lectura\"]').click()");
      await waitFor("!!document.querySelector('#td-book')");
      if(await evaluate("getComputedStyle(document.querySelector('label[for=td-book]')).color==='rgb(0, 0, 0)'")) throw Error('Etiqueta ilegible sobre fondo oscuro');
      await evaluate("document.querySelectorAll('.ts-table-tools button')[0].click()");
      if(await evaluate("document.querySelectorAll('app-tavern-table-dialog').length!==1")) throw Error('Diálogos duplicados');
      if(!await evaluate("document.querySelector('#td-book').value==='book-reading'")) throw Error('No prioriza lectura en curso');
      if(!await evaluate("document.querySelector('app-tavern-table-dialog a[href=\"/reader/book-reading\"]')!=null")) throw Error('Continuar lectura apunta a id incorrecto');
      await evaluate("const field=document.querySelector('#td-quote');field.value='La libertad es uno de los más preciosos dones';field.dispatchEvent(new Event('input',{bubbles:true}))");
      await capture('lectura-1440');
      failPath='/community/tavern/messages/';
      await evaluate("Array.from(document.querySelectorAll('app-tavern-table-dialog button')).find(button=>button.textContent.includes('Compartir en la mesa')).click()");
      await waitFor("!!document.querySelector('app-tavern-table-dialog .td-error')");
      if(!await evaluate("document.querySelector('#td-quote').value.includes('La libertad')")) throw Error('Pierde cita al fallar');
      failPath='';
      await evaluate("Array.from(document.querySelectorAll('app-tavern-table-dialog button')).find(button=>button.textContent.includes('Compartir en la mesa')).click()");
      await waitFor("!document.querySelector('app-tavern-table-dialog')");
      if(!messages.some(message=>message.content.includes('De «Don Quijote')&&message.content.includes('La libertad'))) throw Error('Cita no enviada');
      if(!await evaluate("Array.from(document.querySelectorAll('.ts-bubble.is-chat')).some(bubble=>bubble.getAttribute('aria-label').includes('La libertad')&&bubble.getAttribute('tabindex')==='0')")) throw Error('Cita completa no accesible en bocadillo');
      await evaluate("document.querySelectorAll('.ts-table-tools button')[2].click()");
      await waitFor("document.querySelectorAll('.td-mission').length===2");
      if(await evaluate("document.querySelector('app-tavern-table-dialog').textContent.includes('Misión mensual')")) throw Error('Cofre incluye misión mensual');
      await capture('cofre-1440');await closeDialog();
      await evaluate("document.querySelectorAll('.ts-table-tools button')[1].click()");await waitFor("document.querySelectorAll('.td-friend').length===10");
      await evaluate("document.querySelectorAll('.td-friend')[1].querySelector('button').click()");
      await waitFor("document.querySelectorAll('.td-friend')[1].querySelector('button').disabled && document.querySelectorAll('.td-friend')[1].textContent.includes('Invitación enviada')");
      if(invitations.outgoing.length!==1) throw Error('No envía invitación');
      await capture('invitaciones-1440');await closeDialog();
      friendCount=0; await evaluate("(() => {const hall=ng.getComponent(document.querySelector('app-tavern-hall'));hall.zone.run(()=>hall.refreshLive());})()");
      await waitFor("document.querySelectorAll('.ts-seat').length===1 && document.querySelectorAll('.ts-empty-seat').length===2");
      await capture('mesa-sin-amigos-1440');
      await evaluate("document.querySelector('.ts-empty-seat').click()");
      await waitFor("document.querySelector('app-tavern-table-dialog')?.textContent.includes('primer amigo')");
      await closeDialog();
      friendCount=10; await evaluate("(() => {const hall=ng.getComponent(document.querySelector('app-tavern-hall'));hall.zone.run(()=>hall.refreshLive());})()");await waitFor("document.querySelectorAll('.ts-seat').length===5");
      invitations.incoming=[{id:'received-invite',user:friends[0],expires_at:new Date(Date.now()+1800000).toISOString(),created_at:new Date().toISOString()}];
      await evaluate("(() => {const hall=ng.getComponent(document.querySelector('app-tavern-hall'));hall.zone.run(()=>hall.refreshLive());})()");
      await waitFor("!!document.querySelector('.th-invitation')");
      await evaluate("document.querySelector('.th-invitation button').click()");await waitFor("!document.querySelector('.th-invitation')");
      inventory=[];await evaluate("document.querySelectorAll('.ts-table-tools button')[0].click()");
      await waitFor("document.querySelector('app-tavern-table-dialog')?.textContent.includes('primera historia')");
      if(!await evaluate("document.querySelector('app-tavern-table-dialog a[href=\"/catalog\"]')!=null")) throw Error('Biblioteca vacía sin salida');
      await closeDialog();
      console.log('PASS: lecturas, citas y reintento, cofre semanal, invitaciones y biblioteca vacía');
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
    if(width===390) {
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sessionId);
      await evaluate('scrollTo(0,document.documentElement.scrollHeight)'); await sleep(300);
      if(!await evaluate("document.querySelector('app-tavern-scene').dataset.ambientPaused==='true'&&getComputedStyle(document.querySelector('.ts-ember')).animationPlayState==='paused'")) throw Error('Ambiente continúa fuera de pantalla');
      const offscreen=await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).elapsed"); await sleep(150);
      if(offscreen!==await evaluate("ng.getComponent(document.querySelector('app-tavern-table')).elapsed")) throw Error('WebGL continúa fuera de pantalla');
      await evaluate('scrollTo(0,0)');await sleep(300);
      if(!await evaluate("document.querySelector('app-tavern-scene').dataset.ambientPaused==='false'")) throw Error('Ambiente no reanuda');
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
      await evaluate("document.querySelectorAll('.ts-table-tools button')[2].click()");await waitFor("document.querySelectorAll('.td-mission').length===2");
      if(await evaluate("document.documentElement.scrollWidth>innerWidth")) throw Error('Diálogo desborda móvil');
      await capture('cofre-390');await closeDialog();
    }
  }
  await evaluate(`localStorage.setItem('qa-guest','true'); localStorage.removeItem('access_token'); localStorage.removeItem('user_profile'); localStorage.removeItem('literatus-theme');`);
  await send('Page.navigate',{url:'http://127.0.0.1:4392/tavern'},sessionId); await sleep(1400);
  if(!await evaluate(`!!document.querySelector('.th-visitor')&&document.querySelectorAll('.ts-seat').length>0`)) throw Error('Vista de visitante falló');
  if(await evaluate("!!document.querySelector('app-footer')")) throw Error('Pie visible para visitante en la taberna');
  await evaluate("document.querySelector('.th-visitor-copy a').click()"); await sleep(650);
  if(!await evaluate("!!document.querySelector('app-footer')&&!!document.querySelector('app-login')")) throw Error('Pie ausente al salir de la taberna');
  await evaluate("history.back()"); await sleep(650);
  if(!await evaluate("!!document.querySelector('.th-hall')&&!document.querySelector('app-footer')")) throw Error('Pie visible al volver a la taberna');
  await writeFile(join(out,'report.json'),JSON.stringify({report,errors,interactions:['chat','emoji','ranking','agregar amigo','visitante']},null,2));
  if(errors.length) throw Error(errors.join('\n'));
  console.log('PASS: 5 tamaños, mesa 3D y controles de la taberna. Capturas: '+out);
} finally {
  socket?.close(); browser.kill(); await new Promise(r=>server.close(r));
}



