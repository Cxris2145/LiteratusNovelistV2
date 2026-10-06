import * as THREE from 'three';
import type { TavernTableAction, TavernTableAnchor } from './tavern-table.types';

export interface TavernTableScene {
  resize(): void;
  render(time: number, animate: boolean): void;
  setPointer(x: number, y: number): void;
  setHover(action: TavernTableAction | null): void;
  setToast(value: boolean): void;
  react(emoji: string, time: number): void;
  anchors(): TavernTableAnchor[];
  dispose(): void;
}

/** Objetos modelados localmente: sin modelos remotos ni texturas descargadas. */
export function createTavernTable(canvas: HTMLCanvasElement): TavernTableScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.OrthographicCamera(-6.2, 6.2, 2.23, -2.23, .1, 50);
  camera.position.set(0, 7, 12);
  camera.lookAt(0, .45, 0);
  scene.add(new THREE.HemisphereLight(0xffe7c4, 0x302235, 1.8));
  const key = new THREE.DirectionalLight(0xffd7a0, 2.6);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.normalBias = .025;
  key.shadow.bias = -.0002;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9ba9e5, .8);
  fill.position.set(4, 3, -3);
  scene.add(fill);

  const resources = new Set<{ dispose(): void }>();
  const track = <T extends { dispose(): void }>(value: T): T => { resources.add(value); return value; };
  const material = (color: number, roughness = .65, metalness = 0): THREE.MeshStandardMaterial =>
    track(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const wood = material(0x723e23);
  const darkWood = material(0x382116);
  const gold = material(0xc89746, .3, .75);
  const bronze = material(0x775331, .4, .65);
  const paper = material(0xf3ddb0);
  const ink = material(0x221929, .3);
  const wax = material(0xffe0a3, .8);
  const leather = material(0x713946);
  const glass = track(new THREE.MeshPhysicalMaterial({ color: 0xdceef5, transparent: true, opacity: .28, roughness: .12, metalness: .08, side: THREE.DoubleSide, depthWrite: false }));
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = root): THREE.Mesh => {
    const object = new THREE.Mesh(track(geometry), mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root): THREE.Mesh =>
    mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const cylinder = (r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root): THREE.Mesh =>
    mesh(new THREE.CylinderGeometry(r, r, h, 32), mat, x, y, z, parent);
  const sphere = (r: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root): THREE.Mesh =>
    mesh(new THREE.SphereGeometry(r, 16, 12), mat, x, y, z, parent);
  const ring = (r: number, thickness: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root): THREE.Mesh => {
    const object = mesh(new THREE.TorusGeometry(r, thickness, 8, 32), mat, x, y, z, parent);
    object.rotation.x = Math.PI / 2;
    return object;
  };
  const group = (x: number, y: number, z: number): THREE.Group => {
    const object = new THREE.Group(); object.position.set(x, y, z); root.add(object); return object;
  };
  const texture = (width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
    const image = document.createElement('canvas'); image.width = width; image.height = height;
    const context = image.getContext('2d');
    if (!context) throw Error('Canvas 2D no disponible');
    paint(context);
    const result = track(new THREE.CanvasTexture(image)); result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return result;
  };

  // Roble con tablones, vetas, canto tallado y remaches de latón.
  const grain = texture(1024, 512, ctx => {
    ctx.fillStyle = '#724323'; ctx.fillRect(0, 0, 1024, 512);
    for (let y = 0; y < 512; y += 2) {
      ctx.strokeStyle = `rgba(${y % 6 ? '53,25,13' : '230,167,94'},${.07 + (y % 7) * .012})`;
      ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= 1024; x += 8) {
        const yy = y + Math.sin(x * .008 + y * .2) * (2 + y % 5);
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
    for (let y = 70; y < 512; y += 90) {
      ctx.strokeStyle = '#60331e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
    }
    for (const [x, y] of [[260, 120], [780, 340]]) {
      for (let r = 8; r < 34; r += 5) { ctx.strokeStyle = '#713e24'; ctx.beginPath(); ctx.ellipse(x, y, r * 2.5, r * .3, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    // Marcas del uso: arañazos y zonas de roble pulidas por las jarras.
    for (let i = 0; i < 90; i++) {
      const x = (i * 137) % 1024, y = (i * 71) % 512;
      ctx.strokeStyle = i % 3 ? 'rgba(26,14,9,.12)' : 'rgba(225,180,116,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 + i % 34, y + i % 3 - 1); ctx.stroke();
    }
    for (const [x, y] of [[320, 240], [760, 270]]) {
      ctx.strokeStyle = 'rgba(36,19,10,.2)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(x, y, 28, 21, -.1, 0, Math.PI * 2); ctx.stroke();
    }
  });
  const top = track(new THREE.MeshStandardMaterial({ map: grain, color: 0xe5c7a5, roughness: .85 }));
  const apron = cylinder(1, .4, darkWood, 0, -.23, 0); apron.scale.set(5.34, 1, 2.37);
  const edging = cylinder(1, .1, bronze, 0, -.02, 0); edging.scale.set(5.5, 1, 2.47);
  const tabletop = mesh(new THREE.CylinderGeometry(1, 1, .13, 96), [wood, top, darkWood], 0, .055, 0);
  tabletop.scale.set(5.4, 1, 2.4);
  const carvedRim = ring(1, .006, gold, 0, .125, 0); carvedRim.scale.set(5.29, 2.29, 1);
  for (let i = -5; i <= 5; i++) {
    const angle = i * .23;
    sphere(.036, gold, Math.sin(angle) * 5.37, -.17, Math.cos(angle) * 2.41);
  }

  // Los libros tienen tapas, lomo, páginas y herrajes separados.
  const book = (x: number, y: number, z: number, color: number, angle: number): THREE.Group => {
    const item = group(x, y, z); item.rotation.y = angle;
    const cover = material(color);
    box(1.28, .12, .82, paper, 0, .08, 0, item);
    box(1.36, .045, .9, cover, 0, .005, 0, item);
    box(1.36, .045, .9, cover, 0, .165, 0, item);
    box(.09, .2, .9, cover, -.65, .09, 0, item);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.15, .015, .09, gold, sx * .56, .196, sz * .36, item);
    for (let i = 0; i < 4; i++) box(1.22, .003, .005, bronze, 0, .04 + i * .026, .415, item);
    return item;
  };
  book(-2.65, .14, -.8, 0x2a5964, -.18);
  book(-2.62, .34, -.8, 0x67364e, .08);
  book(-2.6, .54, -.8, 0x3f604c, -.07);
  const pageTexture = texture(256, 256, ctx => {
    ctx.fillStyle = '#f2dcaf'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#a18760'; ctx.lineWidth = 2;
    for (let y = 42; y < 225; y += 15) { ctx.beginPath(); ctx.moveTo(25, y); ctx.lineTo(224 - y % 35, y); ctx.stroke(); }
    ctx.strokeStyle = '#8b3942'; ctx.lineWidth = 3; ctx.strokeRect(22, 20, 35, 35);
  });
  const pageMaterial = track(new THREE.MeshStandardMaterial({ map: pageTexture, roughness: .85, side: THREE.DoubleSide }));
  const openBook = group(-1.55, .15, 1.05); openBook.rotation.y = -.22;
  box(1.85, .06, 1.02, leather, 0, 0, 0, openBook);
  for (const direction of [-1, 1]) {
    const pages = box(.88, .075, .94, paper, direction * .45, .075, 0, openBook);
    pages.rotation.z = direction * -.08;
    const page = box(.88, .008, .94, pageMaterial, direction * .45, .12, 0, openBook);
    page.rotation.z = direction * -.08;
  }
  const turningPage = new THREE.Group(); turningPage.position.y = .135; openBook.add(turningPage);
  box(.87, .008, .94, pageMaterial, .44, 0, 0, turningPage);
  box(.045, .003, .34, material(0x963745), .12, .13, .61, openBook);

  // Pergaminos atados, con bordes y cilindros huecos.
  const scroll = group(-3.45, .18, -.2); scroll.rotation.y = -.2;
  for (let i = 0; i < 2; i++) {
    const tube = cylinder(.13, .95, paper, 0, .14 + i * .26, 0, scroll); tube.rotation.z = Math.PI / 2;
    const end = cylinder(.095, .01, bronze, .48, .14 + i * .26, 0, scroll); end.rotation.z = Math.PI / 2;
    const tie = ring(.133, .018, leather, 0, .14 + i * .26, 0, scroll); tie.rotation.y = Math.PI / 2;
  }

  // Luz viva y cera sobre candeleros de metal.
  const fireMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffbd49 }));
  const coreMaterial = track(new THREE.MeshBasicMaterial({ color: 0xfff4c0 }));
  const flames: THREE.Mesh[] = [];
  const fire = (x: number, y: number, z: number, parent: THREE.Object3D): void => {
    const flame = sphere(.065, fireMaterial, x, y, z, parent); flame.scale.set(.8, 2.7, .8); flame.castShadow = false;
    const core = sphere(.035, coreMaterial, x, y - .015, z + .015, parent); core.scale.set(.7, 2.8, .7); core.castShadow = false;
    flames.push(flame, core);
  };
  for (const [x, z, height] of [[-3.95, .7, .72], [-3.35, 1.03, .45]]) {
    const candle = group(x, .13, z);
    cylinder(.24, .07, bronze, 0, .035, 0, candle);
    cylinder(.055, .18, gold, 0, .15, 0, candle);
    cylinder(.16, .06, gold, 0, .24, 0, candle);
    cylinder(.12, height, wax, 0, .27 + height / 2, 0, candle);
    for (let i = 0; i < 3; i++) { const drip = sphere(.045, wax, Math.cos(i * 2) * .1, height + .19 - i * .055, Math.sin(i * 2) * .1, candle); drip.scale.y = 1.5; }
    cylinder(.012, .045, ink, 0, .29 + height, 0, candle);
    fire(0, .43 + height, 0, candle);
  }
  const lantern = group(0, .13, -.3);
  cylinder(.31, .09, bronze, 0, .045, 0, lantern);
  cylinder(.24, .035, gold, 0, .11, 0, lantern);
  box(.38, .64, .32, glass, 0, .46, 0, lantern).castShadow = false;
  for (const x of [-.2, .2]) for (const z of [-.17, .17]) cylinder(.023, .72, bronze, x, .47, z, lantern);
  mesh(new THREE.ConeGeometry(.34, .25, 4), bronze, 0, .95, 0, lantern).rotation.y = Math.PI / 4;
  const handle = ring(.1, .018, bronze, 0, 1.12, 0, lantern); handle.rotation.x = 0;
  cylinder(.09, .14, wax, 0, .22, 0, lantern);
  fire(0, .47, 0, lantern);
  const lampLight = new THREE.PointLight(0xffb65c, 3, 6, 2); lampLight.position.set(0, .65, -.3); root.add(lampLight);

  // Jarras de madera: duelas, aros, espuma y asas con volumen.
  const mugs: THREE.Group[] = [];
  const steam: { sprite: THREE.Sprite; origin: THREE.Vector3; phase: number }[] = [];
  const smokeTexture = texture(64, 64, ctx => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,240,214,.7)'); gradient.addColorStop(.45, 'rgba(255,240,214,.25)'); gradient.addColorStop(1, 'rgba(255,240,214,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  });
  for (const [x, z] of [[-2.65, .38], [2.9, .7]]) {
    const mug = group(x, .13, z); mugs.push(mug);
    cylinder(.23, .49, wood, 0, .25, 0, mug);
    for (const y of [.1, .4]) ring(.236, .021, bronze, 0, y, 0, mug);
    for (let i = 0; i < 12; i++) box(.012, .42, .015, darkWood, Math.sin(i * Math.PI / 6) * .229, .25, Math.cos(i * Math.PI / 6) * .229, mug);
    const handle = ring(.16, .041, gold, .29, .26, 0, mug); handle.rotation.x = 0;
    cylinder(.22, .035, paper, 0, .51, 0, mug);
    for (let i = 0; i < 9; i++) sphere(.03 + i % 3 * .008, wax, Math.sin(i * 2.4) * .16, .54, Math.cos(i * 2.4) * .16, mug);
    for (let i = 0; i < 3; i++) {
      const mat = track(new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: .2, depthWrite: false }));
      const sprite = new THREE.Sprite(mat); mug.add(sprite); sprite.scale.set(.2, .3, 1);
      steam.push({ sprite, origin: new THREE.Vector3(0, .6, 0), phase: i / 3 });
    }
  }

  // Pociones de cristal coloreado con burbujas en el interior.
  const bubbles: { mesh: THREE.Mesh; phase: number }[] = [];
  const potions: THREE.MeshStandardMaterial[] = [];
  for (const [x, z, color, size] of [[1.25, -.72, 0x9362ce, 1], [1.92, -.92, 0x34a28e, .78]]) {
    const bottle = group(x, .13, z); bottle.scale.setScalar(size);
    const body = sphere(.25, glass, 0, .34, 0, bottle); body.scale.y = 1.2; body.castShadow = false;
    const liquid = track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .18, roughness: .22, metalness: .1 }));
    potions.push(liquid);
    const fill = sphere(.218, liquid, 0, .29, 0, bottle); fill.scale.y = .85;
    cylinder(.095, .29, glass, 0, .64, 0, bottle).castShadow = false;
    ring(.1, .023, gold, 0, .78, 0, bottle);
    cylinder(.08, .13, wood, 0, .83, 0, bottle);
    for (let i = 0; i < 3; i++) bubbles.push({ mesh: sphere(.024, coreMaterial, Math.sin(i * 2) * .08, .28, .12, bottle), phase: i / 3 });
  }

  // Tintero de cerámica y pluma: la silueta no invade la cara de Maguito.
  const writing = group(2.55, .13, -.75);
  cylinder(.22, .25, ink, 0, .14, 0, writing);
  ring(.2, .025, gold, 0, .28, 0, writing);
  const quill = new THREE.Group(); quill.position.y = .29; quill.rotation.z = -.3; writing.add(quill);
  const stem = cylinder(.013, 1.1, gold, 0, .48, 0, quill); stem.castShadow = false;
  const feather = sphere(.17, paper, .07, .8, 0, quill); feather.scale.set(.8, 2.1, .2);
  for (let i = 0; i < 7; i++) { const barb = box(.2, .009, .006, bronze, .07, .54 + i * .06, .035, quill); barb.rotation.z = .4; }

  // Reloj de arena de bronce.
  const hourglass = group(-1.2, .13, -.95);
  for (const y of [.04, .8]) cylinder(.24, .08, bronze, 0, y, 0, hourglass);
  for (let i = 0; i < 3; i++) cylinder(.018, .72, gold, Math.sin(i * Math.PI * 2 / 3) * .21, .42, Math.cos(i * Math.PI * 2 / 3) * .21, hourglass);
  const profile = [[.16, .09], [.17, .17], [.12, .29], [.028, .41], [.12, .53], [.17, .66], [.16, .76]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(profile, 24), glass, 0, 0, 0, hourglass).castShadow = false;
  const sand = material(0xd9a44d);
  const lowerSand = mesh(new THREE.ConeGeometry(.145, .1, 24), sand, 0, .15, 0, hourglass);
  const upperSand = mesh(new THREE.ConeGeometry(.135, .21, 24), sand, 0, .63, 0, hourglass); upperSand.rotation.z = Math.PI;
  const sandStream = cylinder(.005, .36, sand, 0, .42, 0, hourglass);
  sandStream.castShadow = false;
  const grains = Array.from({ length: 5 }, (_, i) => {
    const grain = sphere(.009, gold, .008 * Math.sin(i * 2), .4, .012, hourglass);
    grain.castShadow = false;
    return grain;
  });

  // Cofre articulado y monedas acuñadas; se abre al enviar destellos.
  const chest = group(1.35, .13, 1.22); chest.rotation.y = -.17;
  box(1.03, .43, .64, wood, 0, .23, 0, chest);
  for (const x of [-.37, .37]) box(.055, .45, .67, bronze, x, .24, 0, chest);
  const lid = new THREE.Group(); lid.position.set(0, .46, -.32); chest.add(lid);
  const lidShape = new THREE.Shape(); lidShape.moveTo(-.52, 0); lidShape.lineTo(.52, 0); lidShape.absellipse(0, 0, .52, .23, 0, Math.PI, false, 0); lidShape.closePath();
  mesh(new THREE.ExtrudeGeometry(lidShape, { depth: .64, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 1, steps: 1, curveSegments: 16 }), wood, 0, 0, 0, lid);
  box(.12, .19, .045, gold, 0, .44, .35, chest);
  box(.027, .08, .047, ink, 0, .43, .36, chest);
  const coins: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const coin = group(.3 + Math.sin(i * 2.4) * .38, .145 + (i % 3) * .035, .9 + Math.cos(i * 2.4) * .19);
    coins.push(coin);
    cylinder(.09, .026, gold, 0, 0, 0, coin);
    ring(.065, .008, bronze, 0, .015, 0, coin);
  }

  // Gato de la taberna modelado en 3D, con bufanda y cola animada.
  const cat = group(3.95, .14, .1); cat.rotation.y = -.18;
  const fur = material(0x211b2c, .9);
  const body = sphere(.27, fur, 0, .29, 0, cat); body.scale.set(1, 1.2, .85);
  sphere(.22, fur, 0, .63, .04, cat);
  for (const x of [-.15, .15]) mesh(new THREE.ConeGeometry(.085, .22, 3), fur, x, .83, .01, cat);
  const eyes: THREE.Mesh[] = [];
  const pupils: THREE.Mesh[] = [];
  for (const x of [-.08, .08]) {
    eyes.push(sphere(.055, gold, x, .65, .239, cat));
    const pupil = sphere(.022, ink, x, .65, .282, cat); pupil.scale.set(.6, 1.8, .5);
    pupils.push(pupil);
  }
  sphere(.018, leather, 0, .585, .265, cat);
  ring(.21, .045, leather, 0, .44, .02, cat);
  box(.09, .25, .045, leather, .1, .31, .22, cat);
  const tail = new THREE.Group(); tail.position.set(.19, .17, -.07); cat.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.35, 0, 0), new THREE.Vector3(.45, .26, -.03), new THREE.Vector3(.36, .4, 0)]);
  mesh(new THREE.TubeGeometry(tailCurve, 20, .048, 8, false), fur, 0, 0, 0, tail);

  let pointerX = 0, pointerY = 0, toast = false, reaction = '', reactionAt = -100, lastShadow = -100;
  let hover: TavernTableAction | null = null;
  const emphasis = { book: 0, invite: 0, rewards: 0, cat: 0, potions: 0, hourglass: 0 };
  const resize = (): void => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 500 ? 1.25 : 1.6));
    renderer.setSize(width, height, false);
    camera.left = -6.2; camera.right = 6.2;
    camera.top = 6.2 * height / width; camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
  };
  resize();
  return {
    resize,
    setPointer(x, y) { pointerX = Math.max(-1, Math.min(1, x)); pointerY = Math.max(-1, Math.min(1, y)); },
    setHover(action) { hover = action; },
    setToast(value) { toast = value; },
    react(emoji, time) { reaction = emoji; reactionAt = time; },
    anchors() {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      return ([
        ['book', -1.55, .3, 1.05],
        ['invite', -2.65, .45, .38],
        ['rewards', 1.35, .6, 1.22],
        ['cat', 3.95, .62, .1],
        ['potions', 1.55, .5, -.82],
        ['hourglass', -1.2, .5, -.95],
      ] as const).map(([action, x, y, z]) => {
        const point = root.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
        return { action, x: (point.x + 1) * 50, y: (1 - point.y) * 50 };
      });
    },
    render(time, animate) {
      if (!animate || time - lastShadow >= .25) {
        renderer.shadowMap.needsUpdate = true;
        lastShadow = time;
      }
      const t = animate ? time : 0;
      for (const action of ['book', 'invite', 'rewards', 'cat', 'potions', 'hourglass'] as const) {
        const target = animate && hover === action ? 1 : 0;
        emphasis[action] = animate ? THREE.MathUtils.lerp(emphasis[action], target, .12) : 0;
      }
      root.rotation.y += ((animate ? pointerX * .022 : 0) - root.rotation.y) * .08;
      root.rotation.x += ((animate ? pointerY * .009 : 0) - root.rotation.x) * .08;
      flames.forEach((flame, i) => { flame.scale.y = 2.7 + Math.sin(t * 5.1 + i) * .3; flame.rotation.z = Math.sin(t * 3.2 + i) * .06; });
      lampLight.intensity = 3 + (animate ? Math.sin(t * 4) * .22 : 0);
      steam.forEach(({ sprite, origin, phase }) => {
        const p = animate ? (t * .18 + phase) % 1 : phase;
        sprite.position.copy(origin); sprite.position.y += p * .7; sprite.position.x = Math.sin(p * 4 + phase) * .1;
        sprite.scale.set(.14 + p * .22, .2 + p * .32, 1);
        (sprite.material as THREE.SpriteMaterial).opacity = Math.sin(p * Math.PI) * .22;
      });
      bubbles.forEach(({ mesh, phase }) => {
        const speed = t * (0.14 + emphasis.potions * 0.35) + phase;
        mesh.position.y = .2 + (speed % 1) * .26;
      });
      tail.rotation.z = animate ? Math.sin(t * (.8 + emphasis.cat * 2.2)) * (.14 + emphasis.cat * .25) : 0;
      body.scale.y = 1.2 + (animate ? Math.sin(t * (1.4 + emphasis.cat * 2.5)) * (.025 + emphasis.cat * .04) : 0);
      const blinking = animate && (t % 7.5 > 7.25 || emphasis.cat > .5);
      eyes.forEach(eye => { eye.scale.y = blinking ? .12 : 1; });
      pupils.forEach(pupil => { pupil.scale.y = blinking ? .12 : 1.8; });
      quill.rotation.z = -.3 + (animate ? Math.sin(t * .9) * .035 : 0) + emphasis.book * .14;
      const sandProgress = animate ? (t % 45) / 45 : .35;
      upperSand.scale.y = 1 - sandProgress * .55;
      upperSand.position.y = .735 - .105 * upperSand.scale.y;
      lowerSand.scale.y = 1 + sandProgress * 1.1;
      lowerSand.position.y = .1 + .05 * lowerSand.scale.y;
      grains.forEach((grain, i) => { grain.position.y = .4 - ((t * (.75 + emphasis.hourglass * 1.5) + i / 5) % 1) * .2; });
      hourglass.rotation.z = animate && emphasis.hourglass ? Math.sin(t * 3.5) * .08 : 0;
      const age = time - reactionAt;
      const pulse = animate && age >= 0 && age < 2.8 ? Math.sin(age / 2.8 * Math.PI) : 0;
      const magic = reaction === '✨' ? pulse : 0;
      potions.forEach((liquid, i) => {
        liquid.emissiveIntensity = .18 + magic * .8 + emphasis.potions * .55 + (animate ? (Math.sin(t * (1.1 + emphasis.potions * 2) + i) + 1) * .035 : 0);
      });
      mugs.forEach((mug, i) => {
        const cheer = reaction === '🍺' ? pulse : 0;
        mug.position.y = .13 + emphasis.invite * .14 + cheer * .15;
        mug.rotation.z = animate && toast ? Math.sin(t * 7) * .12 * (i ? -1 : 1) : cheer * .1 * (i ? -1 : 1);
      });
      lid.rotation.x = -Math.max(magic * .85, emphasis.rewards * .28);
      coins.forEach((coin, i) => { coin.position.y = .145 + (i % 3) * .035 + (reaction === '✨' ? pulse * .12 : 0); });
      turningPage.rotation.z = Math.max(reaction === '📖' ? pulse * 2.6 : 0, emphasis.book * .28);
      renderer.render(scene, camera);
    },
    dispose() {
      key.shadow.map?.dispose();
      resources.forEach(resource => resource.dispose());
      resources.clear(); scene.clear(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
