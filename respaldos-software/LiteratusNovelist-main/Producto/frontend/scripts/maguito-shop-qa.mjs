import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
const root = process.cwd();
const dist = join(root, 'dist/frontend/browser');
const out = join(root, 'tmp/maguito-shop');
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
const catalogSources=await Promise.all(['0003_seed_maguito_wearables.py','0004_seed_tavern_wearables.py'].map(file=>readFile(join(root,'../backend/learning/migrations',file),'utf8')));
const shopItems=catalogSources.flatMap(source=>Array.from(source.matchAll(/\('([^']+)', '([^']+)', '([^']+)',\s+'([^']+)', (\d+), '([^']+)'\)/g)).map((match,index)=>({id:match[1],code:match[1],value:match[2],name:match[3],description:match[4],cost_ink:Number(match[5]),icon:match[6],asset_url:'',item_type:'maguito_wear',sort_order:index,is_owned:['wear_head_beret','wear_cape_emerald','wear_face_mustache','wear_neck_bowtie'].includes(match[1]),is_equipped:['wear_head_beret','wear_neck_bowtie'].includes(match[1]),quantity:['wear_head_beret','wear_cape_emerald','wear_face_mustache','wear_neck_bowtie'].includes(match[1])?1:0})));
shopItems.push({id:'shield',code:'shield',name:'Protector de racha',description:'Protege un día de tu racha.',cost_ink:50,icon:'shield',asset_url:'',value:'',item_type:'streak_shield',sort_order:1,is_owned:false,is_equipped:false,quantity:0});
let balance=1000;
const mutations=[];
function fixture(url, method, body) {
  const u = new URL(url), path = u.pathname;
  if(failPath && path.endsWith(failPath)) return { message: 'Prueba de conexión fallida' };
  if(path.endsWith('/learning/shop/')) return shopItems;
  if(path.includes('/learning/shop/') && method==='POST') {
    const data=JSON.parse(body);mutations.push({path,data});
    const item=shopItems.find(item=>item.code===data.item_code);
    const slot=item?.value.split(':')[0] || data.slot;
    shopItems.filter(item=>item.value.startsWith(slot+':')).forEach(item=>item.is_equipped=false);
    if(item) { if(path.endsWith('/buy/')) {item.is_owned=true;item.quantity=1;balance-=item.cost_ink;} item.is_equipped=true; }
    return {success:true,message:'Prueba de canje o vestuario completada.',ink_balance:balance};
  }
  if(path.endsWith('/finance/subscription/')) return {subscription:null,cosmetics:{maestro:false,frame:null},ink_balance:balance};
  if(path.endsWith('/finance/plans/')) return [{code:'lector',name:'Lector',price:'4.99',currency:'USD',daily_token_limit:15000,daily_time_limit:null,monthly_ink_bonus:150,benefits:['Conversaciones literarias'],purchasable:true}];
  if(path.endsWith('/finance/ink-packages/')) return [{amount:200,price:'990',currency:'CLP'}];
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
  const shopState=()=>evaluate(`(() => {
    const shop=ng.getComponent(document.querySelector('app-tavern'));
    return {outfit:shop.previewOutfit,current:shop.currentOutfit,trying:shop.tryingItems.map(item=>item.code),shown:shop.visibleShopItems.map(item=>item.code),overflow:document.documentElement.scrollWidth-innerWidth};
  })()`);
  const clickCard=async(code,kind='preview')=>{
    const name=shopItems.find(item=>item.code===code).name;
    await evaluate(`(() => {const card=Array.from(document.querySelectorAll('.shop-item')).find(card=>card.querySelector('h3').textContent===${JSON.stringify(name)});if(!card)throw Error('Falta tarjeta');const button=${kind==='preview'?'card.querySelector(".tv-item-preview")':`Array.from(card.querySelectorAll('.item-actions button')).find(button=>button.textContent.trim()===${JSON.stringify(kind)})`};if(!button||button.disabled)throw Error('Botón no disponible');button.click();})()`);
    await sleep(100);
    if(kind!=='preview') {
      await waitFor("!!document.querySelector('.popup-close-corner')");
      await evaluate("document.querySelector('.popup-close-corner').click()");
      await waitFor("!document.querySelector('.popup-close-corner')");
    }
  };
  const filter=async(index)=>{await evaluate(`document.querySelectorAll('.tv-wear-filters button')[${index}].click()`);await sleep(100);};
  const search=async(query)=>{await evaluate(`(() => {const input=document.querySelector('.tv-shop-search input');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(100);};
  for(const [width,height] of [[1920,1080],[1440,1000],[768,1024],[390,844],[320,740]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500},sessionId);
    await send('Page.navigate',{url:'http://127.0.0.1:4392/tavern/tienda?filtro=maguito'},sessionId);
    await waitFor("document.querySelectorAll('.tv-item-preview').length===17");await sleep(400);
    const state=await shopState();
    if(state.overflow>1)throw Error('Tienda desborda: '+width);
    if(!await evaluate("(() => {const ids=Array.from(document.querySelectorAll('app-maguito defs [id]')).map(el=>el.id);return new Set(ids).size===ids.length;})()"))throw Error('Gradientes de prendas comparten identificadores');
    if(!await evaluate("Array.from(document.querySelectorAll('.tv-item-preview app-maguito')).every(el=>el.classList.contains('mg-paused')&&el.classList.contains('mg-crop-detail'))"))throw Error('Miniaturas animando o sin encuadre');
    await evaluate("document.querySelector('#bazar-title').scrollIntoView({block:'start'})");await sleep(150);
    await capture('tienda-'+width);
    if(width===1440) {
      await clickCard('wear_head_crown');await clickCard('wear_face_beard');await clickCard('wear_eyes_halfmoon');await clickCard('wear_cape_emerald');
      let combo=await shopState();
      if(combo.trying.length!==4||combo.outfit.head!=='crown'||combo.outfit.face!=='beard'||combo.outfit.eyes!=='halfmoon'||combo.outfit.cape!=='emerald')throw Error('No combina cuatro espacios');
      if(mutations.length)throw Error('Probar envió un canje');
      await filter(3);await capture('barbas-1440');
      await filter(2);await capture('lentes-1440');
      await clickCard('wear_eyes_monocle');
      combo=await shopState();if(combo.trying.length!==4||combo.outfit.eyes!=='monocle'||combo.outfit.face!=='beard')throw Error('Lentes borraron combinación');
      await search('MONOCULO');
      if((await shopState()).shown.join(',')!=='wear_eyes_monocle')throw Error('Búsqueda con acentos falló');
      await clickCard('wear_eyes_monocle','Canjear');await waitFor("document.querySelector('.shop-item').textContent.includes('Puesto')");
      if(mutations.length!==1 || mutations[0].data.item_code!=='wear_eyes_monocle')throw Error('Canje equivocado');
      combo=await shopState();if(combo.current.eyes!=='monocle'||combo.trying.length!==3)throw Error('Canje pierde otras pruebas');
      await evaluate("document.querySelector('.tv-owned-toggle').click()");await search('estelares');
      if(!await evaluate("!!document.querySelector('.tv-shop-empty')"))throw Error('Selección vacía sin salida');
      await evaluate("document.querySelector('.tv-shop-empty button').click()");await filter(5);await capture('vestimenta-1440');
      await clickCard('wear_cape_emerald','Ponérselo');await waitFor("ng.getComponent(document.querySelector('app-tavern')).currentOutfit.cape==='emerald'");
      await clickCard('wear_cape_emerald','Quitar');await waitFor("!ng.getComponent(document.querySelector('app-tavern')).currentOutfit.cape");
      if(mutations.length!==3)throw Error('Equipar o quitar duplicó operación');
      await evaluate("document.querySelector('.tv-fitting .button').click()");
      if((await shopState()).trying.length)throw Error('Restablecer no limpia el probador');
      await filter(1);await capture('sombreros-1440');
      await filter(4);await capture('cuello-1440');
      for(const theme of ['light-gallery','high-contrast-light','high-contrast-dark']) {
        await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await sleep(100);await capture('tienda-'+theme);
      }
      await evaluate("document.documentElement.removeAttribute('data-theme')");
      console.log('PASS: combinaciones, lentes, barbas, búsqueda, baúl y canje/equipar/quitar con datos ficticios');
    }
    if(width<500) {
      await clickCard('wear_face_beard');await clickCard('wear_eyes_star');await filter(3);
      if((await shopState()).overflow>1)throw Error('Probador con piezas desborda móvil');
      await capture('barbas-'+width);
      const blocked=await evaluate("Array.from(document.querySelectorAll('.tv-fitting-pieces button,.tv-wear-filters button')).filter(el=>{const box=el.getBoundingClientRect();return box.top>=document.querySelector('.main-header').getBoundingClientRect().bottom&&box.bottom<=innerHeight&&!el.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));}).length");
      if(blocked)throw Error('Filtros o piezas tapados');
    }
    report.push({width,...await shopState()});console.log('PASS: tienda y vestuario a '+width+'px');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:'http://127.0.0.1:4392/tavern'},sessionId);await waitFor("!!document.querySelector('.ts-table-fallback.is-replaced')");
  await evaluate("(() => {const hall=ng.getComponent(document.querySelector('app-tavern-hall'));hall.zone.run(()=>hall.me={...hall.me,outfit:{head:'tophat',face:'beard',eyes:'monocle',cape:'royal',neck:'scarf-red'}});})()");await sleep(200);await capture('taberna-vestuario');
  await writeFile(join(out,'report.json'),JSON.stringify({report,errors,mutations},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: QA terminada. Capturas: '+out);
} finally {
  socket?.close(); browser.kill(); await new Promise(r=>server.close(r));
}
