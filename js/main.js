import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x00020a);
scene.fog = new THREE.FogExp2(0x00040e, 0.010);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 32, 88);

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 200;
controls.maxPolarAngle = Math.PI / 2.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.22;
controls.target.set(0, 8, 0);
controls.update();

// ── Bloom post-processing ─────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  1.8,   // strength
  0.70,  // radius
  0.28   // threshold
);
composer.addPass(bloomPass);

// ── Night lighting ────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x040a1e, 3));
const moon = new THREE.DirectionalLight(0x0a1888, 0.12);
moon.position.set(-30, 100, -50);
scene.add(moon);
scene.add(new THREE.HemisphereLight(0x060e28, 0x00020a, 0.4));

// ── Stars ─────────────────────────────────────────────────────────────────────
{
  const pos = new Float32Array(9000 * 3);
  for (let i = 0; i < 9000; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), r = 400;
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = Math.abs(r * Math.cos(ph)) + 20;
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xaabbff, size: 0.85, sizeAttenuation: true, transparent: true, opacity: 0.88
  })));
}

// ── Grid constants ────────────────────────────────────────────────────────────
const CELL  = 1.62;
const BW    = 1.16;
const WEEKS = 53;
const DAYS  = 7;

// ── Cyberpunk blue palette ────────────────────────────────────────────────────
const B_COLOR = [0x060c18, 0x0a1428, 0x0c1830, 0x0e1c38, 0x101e40];
const W_COLOR = [0x080808, 0x080e18, 0x0c1428, 0x101c38, 0x142248];
const E_INT   = [0, 2.5, 4.0, 6.0, 8.0];
const ROOF_C  = [0x010204, 0x020408, 0x020408, 0x010308, 0x010206];

function lvl(n) { return n===0?0 : n<=2?1 : n<=5?2 : n<=10?3 : 4; }

// ── Window texture (dense blue/cyan mix) ──────────────────────────────────────
const _texCache = {};
function winTex(lv) {
  if (_texCache[lv]) return _texCache[lv];
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#010204'; ctx.fillRect(0, 0, 256, 512);
  const cols = 2, rows = 6;
  const gx = 256 / cols, gy = 512 / rows;
  const litPct = [0.01, 0.24, 0.42, 0.58, 0.74][lv];
  const WIN_COLS = [
    [255,255,255],[235,248,255],[210,238,255],[255,252,180],
    [255,245,80], [255,235,50], [255,220,30], [225,242,255],
  ];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const rnd = Math.random();
    if (rnd < litPct) {
      const wc = WIN_COLS[~~(Math.random() * WIN_COLS.length)];
      ctx.fillStyle = `rgb(${wc[0]},${wc[1]},${wc[2]})`;
    } else {
      ctx.fillStyle = 'rgb(0,0,0)';
    }
    const wx = gx * 0.42, wy = gy * 0.88;
    ctx.fillRect(gx*c + (gx-wx)/2, gy*r + (gy-wy)/2, wx, wy);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (_texCache[lv] = t);
}

// ── Tracked blink meshes ──────────────────────────────────────────────────────
let _blinkMeshes = [];

// ── Build one building ────────────────────────────────────────────────────────
function makeBuilding(count, lv, seed) {
  const group = new THREE.Group();
  const rng = (lo, hi) => lo + (Math.abs(Math.sin(seed*127.1 + lo*31.4)) % 1) * (hi - lo);

  const maxH = [0.06, 7, 15, 25, 34][lv];
  const h    = lv === 0 ? 0.05 : Math.min(0.5 + count * 0.88, maxH);
  const fw   = BW * (0.82 + rng(0, 0.22));

  const t = winTex(lv).clone();
  t.repeat.set(fw / 0.88, h / 0.88);
  t.offset.set(rng(0, 1), rng(0, 1));

  const wc = new THREE.Color(W_COLOR[lv]);

  const sideMat = new THREE.MeshStandardMaterial({
    color: B_COLOR[lv], map: t,
    emissive: wc, emissiveMap: t, emissiveIntensity: E_INT[lv],
    roughness: lv >= 3 ? 0.08 : 0.28,
    metalness: lv >= 3 ? 0.80 : 0.55,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: ROOF_C[lv], roughness: 0.92 });

  // Main tower body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(fw, h, fw),
    [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]
  );
  body.position.y = h / 2;
  body.castShadow = true;
  group.add(body);

  // Lobby plinth
  if (lv >= 1) {
    const lh = Math.min(h * 0.09, 0.45);
    const lobby = new THREE.Mesh(
      new THREE.BoxGeometry(fw + 0.22, lh, fw + 0.22),
      new THREE.MeshStandardMaterial({ color: 0x040810, roughness: 0.88 })
    );
    lobby.position.y = lh / 2;
    group.add(lobby);
  }

  // Setback sections — creates stepped silhouette for tall buildings
  const topH = lv >= 4 ? h + h*0.28 + h*0.13 : (lv >= 3 ? h + h*0.25 : h);
  if (lv >= 3 && h > 7) {
    const sb1H = h * 0.26, sb1W = fw * 0.78;
    const sb1T = winTex(lv).clone();
    sb1T.repeat.set(sb1W/0.88, sb1H/0.88);
    sb1T.offset.set(rng(0,1), rng(0,1));
    const sb1Mat = new THREE.MeshStandardMaterial({
      color: 0x02040a, map: sb1T, emissive: wc, emissiveMap: sb1T,
      emissiveIntensity: E_INT[lv] * 1.05, roughness: 0.08, metalness: 0.85,
    });
    const sb1 = new THREE.Mesh(new THREE.BoxGeometry(sb1W, sb1H, sb1W), [sb1Mat,sb1Mat,roofMat,roofMat,sb1Mat,sb1Mat]);
    sb1.position.y = h + sb1H / 2;
    group.add(sb1);

    if (lv === 4 && h > 16) {
      const sb2H = h * 0.12, sb2W = fw * 0.55;
      const sb2T = winTex(lv).clone();
      sb2T.repeat.set(sb2W/0.88, sb2H/0.88);
      sb2T.offset.set(rng(0,1), rng(0,1));
      const sb2Mat = new THREE.MeshStandardMaterial({
        color: 0x01030a, map: sb2T, emissive: wc, emissiveMap: sb2T,
        emissiveIntensity: E_INT[lv] * 1.2, roughness: 0.06, metalness: 0.90,
      });
      const sb2 = new THREE.Mesh(new THREE.BoxGeometry(sb2W, sb2H, sb2W), [sb2Mat,sb2Mat,roofMat,roofMat,sb2Mat,sb2Mat]);
      sb2.position.y = h + sb1H + sb2H / 2;
      group.add(sb2);
    }
  }

  // Rooftop HVAC
  if (lv >= 2 && h > 3) {
    const hMat = new THREE.MeshStandardMaterial({ color: 0x050810, roughness: 0.9 });
    for (let i = 0; i < lv + 1; i++) {
      const uw = rng(0.10, 0.28), uh = rng(0.08, 0.24), ud = rng(0.10, 0.28);
      const u = new THREE.Mesh(new THREE.BoxGeometry(uw, uh, ud), hMat);
      u.position.set(rng(-fw*0.32, fw*0.32), h + uh/2, rng(-fw*0.32, fw*0.32));
      group.add(u);
    }
  }

  // Antenna + blink light
  if (lv >= 3 && h > 5) {
    const aH = h * rng(0.07, 0.14);
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.042, aH, 4),
      new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.25, metalness: 0.90 })
    );
    ant.position.y = h + aH / 2;
    group.add(ant);

    const bl = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true })
    );
    bl.position.y = h + aH + 0.07;
    _blinkMeshes.push(bl);
    group.add(bl);
  }

  // Cyan neon crown strip on skyscrapers
  if (lv >= 3 && h > 5) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(fw * 0.85, 0.09, fw * 0.85),
      new THREE.MeshBasicMaterial({ color: lv === 4 ? 0x44ddff : 0x2288ff })
    );
    strip.position.y = h + 0.045;
    group.add(strip);
  }

  // Point lights — blue/cyan glow around tall buildings
  if (lv === 4) {
    const pl1 = new THREE.PointLight(0x33aaff, 3.2, 18); pl1.position.y = h * 0.5; group.add(pl1);
    const pl2 = new THREE.PointLight(0x88ddff, 2.2, 10); pl2.position.y = h + 0.5; group.add(pl2);
  } else if (lv === 3) {
    const pl = new THREE.PointLight(0x2277ff, 1.8, 12); pl.position.y = h * 0.5; group.add(pl);
  }

  group.userData.h = h;
  return group;
}

// ── Street lamp (blue-tinted for cyberpunk) ───────────────────────────────────
function makeLamp(x, z) {
  const g = new THREE.Group();
  const pMat = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.7, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.036, 2.8, 6), pMat);
  pole.position.y = 1.4; g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.60, 4), pMat);
  arm.rotation.z = Math.PI / 2; arm.position.set(0.30, 2.82, 0); g.add(arm);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), new THREE.MeshBasicMaterial({ color: 0x66bbff }));
  head.position.set(0.60, 2.82, 0); g.add(head);
  const light = new THREE.PointLight(0x3377cc, 1.3, 11, 2);
  light.position.set(0.60, 2.82, 0); g.add(light);
  g.position.set(x, 0, z);
  return g;
}

// ── Flying drone ──────────────────────────────────────────────────────────────
let _drones = [];
function makeDrone(x, y, z, seed) {
  const g = new THREE.Group();
  g.add(Object.assign(
    new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  ));
  const light = new THREE.PointLight(0x88ccff, 1.4, 10);
  g.add(light);
  g.position.set(x, y, z);
  g.userData.t    = seed * Math.PI * 2;
  g.userData.cx   = x; g.userData.cz = z;
  g.userData.rx   = 18 + seed * 12;
  g.userData.rz   = 6  + seed * 4;
  g.userData.speed = 0.28 + seed * 0.18;
  return g;
}

// ── Canvas label ──────────────────────────────────────────────────────────────
function makeLabel(text, fs, fill, cw, ch) {
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d'); ctx.clearRect(0,0,cw,ch);
  ctx.font = `bold ${fs}px -apple-system,sans-serif`;
  ctx.fillStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cw/2, ch/2);
  return new THREE.CanvasTexture(cv);
}

// ── City group ────────────────────────────────────────────────────────────────
const city = new THREE.Group();
scene.add(city);
let buildings = [];

// ── Build city ────────────────────────────────────────────────────────────────
function buildCity(contributions, username) {
  while (city.children.length) city.remove(city.children[0]);
  for (const d of _drones) scene.remove(d);
  buildings = []; _blinkMeshes = []; _drones = [];

  const W = WEEKS * CELL, D = DAYS * CELL;
  const ox = -W/2, oz = -D/2;

  // Ground — dark reflective asphalt
  const gndMat = new THREE.MeshStandardMaterial({ color: 0x010408, roughness: 0.04, metalness: 0.92, envMapIntensity: 1.4 });
  const gnd = new THREE.Mesh(new THREE.BoxGeometry(W+7, 0.45, D+9), gndMat);
  gnd.position.y = -0.23; gnd.receiveShadow = true; city.add(gnd);

  // Block pads
  const padMat = new THREE.MeshStandardMaterial({ color: 0x04080e, roughness: 0.06, metalness: 0.88 });
  for (let wk = 0; wk < WEEKS; wk++) for (let d = 0; d < DAYS; d++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(BW+0.05, 0.07, BW+0.05), padMat);
    p.position.set(ox+wk*CELL+CELL/2, 0.035, oz+d*CELL+CELL/2);
    p.receiveShadow = true; city.add(p);
  }

  // Neon street grid lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x002244 });
  for (let i = 0; i <= WEEKS; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, D+0.2), lineMat);
    m.rotation.x = -Math.PI/2; m.position.set(ox+i*CELL, 0.08, oz+D/2); city.add(m);
  }
  for (let i = 0; i <= DAYS; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W+0.2, 0.05), lineMat);
    m.rotation.x = -Math.PI/2; m.position.set(0, 0.08, oz+i*CELL); city.add(m);
  }

  // Glowing neon border strips
  const bW = W+5.6, bD = D+7.8;
  [[bW,0.07,0.14,0,0,oz-3.9,0x00ccff],[bW,0.07,0.14,0,0,oz+D+3.9,0x00ccff],
   [0.14,0.07,bD,ox-2.8,0,0,0xff6600],[0.14,0.07,bD,ox+W+2.8,0,0,0xff6600]]
  .forEach(([gw,gh,gd,gx,gy,gz,col]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(gw,gh,gd),
      new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(gx, gy, gz); city.add(m);
  });

  // Neon street puddle lights — pools of color on the reflective floor
  const NEON = [0x00ccff, 0xff8800, 0xffee00, 0x00ffaa, 0xff3388];
  [
    [ox-2.5, oz+D*0.2], [ox-2.5, oz+D*0.8],
    [ox+W+2.5, oz+D*0.3], [ox+W+2.5, oz+D*0.7],
    [W*0.1, oz-3.5], [W*-0.1, oz+D+3.5],
    [ox+W*0.3, oz-3.5], [ox+W*0.7, oz+D+3.5],
  ].forEach(([x,z], i) => {
    const col = NEON[i % NEON.length];
    const pl = new THREE.PointLight(col, 5, 14, 2);
    pl.position.set(x, 0.4, z); city.add(pl);
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false })
    );
    disc.rotation.x = -Math.PI/2; disc.position.set(x, 0.09, z); city.add(disc);
  });

  // Street lamps
  for (let wk = 0; wk < WEEKS; wk += 5) {
    city.add(makeLamp(ox+wk*CELL+CELL/2, oz-1.5));
    city.add(makeLamp(ox+wk*CELL+CELL/2, oz+D+1.5));
  }
  for (let d = 0; d < DAYS; d += 2) {
    city.add(makeLamp(ox-1.5, oz+d*CELL+CELL/2));
    city.add(makeLamp(ox+W+1.5, oz+d*CELL+CELL/2));
  }

  // Username label
  const nTex = makeLabel('@'+username, 38, '#3388ff', 512, 68);
  const nPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W*0.42, W*0.42*68/512),
    new THREE.MeshBasicMaterial({ map: nTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  nPlane.rotation.x = -Math.PI/2; nPlane.position.set(0, 0.02, oz-2.6); city.add(nPlane);

  // Month labels
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let lastM = -1;
  for (let i = 0; i < contributions.length; i++) {
    const m = new Date(contributions[i].date+'T00:00:00').getMonth();
    if (m !== lastM) {
      lastM = m; const wk = Math.floor(i/7);
      const mp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6),
        new THREE.MeshBasicMaterial({ map: makeLabel(MON[m],18,'#152840',64,24), transparent:true, depthWrite:false, side:THREE.DoubleSide }));
      mp.rotation.x = -Math.PI/2; mp.position.set(ox+wk*CELL+CELL/2, 0.03, oz-0.95); city.add(mp);
    }
  }
  ['','Mon','','Wed','','Fri',''].forEach((lb,d) => {
    if (!lb) return;
    const mp = new THREE.Mesh(new THREE.PlaneGeometry(1.4,0.55),
      new THREE.MeshBasicMaterial({ map: makeLabel(lb,18,'#152840',56,22), transparent:true, depthWrite:false, side:THREE.DoubleSide }));
    mp.rotation.x = -Math.PI/2; mp.position.set(ox-1.15, 0.03, oz+d*CELL+CELL/2); city.add(mp);
  });

  // Buildings
  for (let i = 0; i < contributions.length; i++) {
    const c = contributions[i];
    const wk = Math.floor(i/7), day = i%7;
    if (wk >= WEEKS) continue;
    const lv = lvl(c.count);
    const b = makeBuilding(c.count, lv, i);
    b.position.set(ox+wk*CELL+CELL/2, 0, oz+day*CELL+CELL/2);
    b.scale.y = 0.001;
    b.userData.date = c.date; b.userData.count = c.count;
    b.userData.lv = lv; b.userData.wk = wk;
    city.add(b); buildings.push(b);
  }

  // Flying drones
  for (let i = 0; i < 5; i++) {
    const h = 14 + Math.random() * 22;
    const d = makeDrone(
      (Math.random()-0.5) * W * 0.7, h, (Math.random()-0.5) * 20,
      Math.random()
    );
    scene.add(d); _drones.push(d);
  }

  // Stats
  const total  = contributions.reduce((s,c) => s+c.count, 0);
  const active = contributions.filter(c => c.count>0).length;
  const best   = Math.max(...contributions.map(c => c.count));
  let streak=0, maxS=0;
  contributions.forEach(c => { if(c.count>0){streak++;maxS=Math.max(maxS,streak);}else streak=0; });
  document.getElementById('s-user').textContent   = '@'+username;
  document.getElementById('s-total').textContent  = total.toLocaleString();
  document.getElementById('s-streak').textContent = maxS+' days';
  document.getElementById('s-best').textContent   = best+' contributions';
  document.getElementById('s-active').textContent = active.toLocaleString()+' days';

  _animStart = performance.now();
  _animating = true;
}

// ── Grow animation ────────────────────────────────────────────────────────────
let _animating = false, _animStart = 0;
const GROW_MS = 650, STAGGER = 22;
function easeOutBack(t) { const c = 1.70158+1; return 1+c*Math.pow(t-1,3)+1.70158*Math.pow(t-1,2); }

function tickAnim(now) {
  if (!_animating) return;
  let done = true;
  for (const b of buildings) {
    const t = Math.max(0, (now-_animStart-b.userData.wk*STAGGER)/GROW_MS);
    b.scale.y = Math.max(0.001, easeOutBack(Math.min(t,1)));
    if (t < 1) done = false;
  }
  if (done) _animating = false;
}

// ── Blink ─────────────────────────────────────────────────────────────────────
let _blinkT = 0;
function tickBlink(dt) {
  _blinkT += dt;
  const on = Math.sin(_blinkT * 2.5) > 0.4;
  for (const o of _blinkMeshes) o.material.opacity = on ? 1 : 0.05;
}

// ── Drone flight ──────────────────────────────────────────────────────────────
function tickDrones(dt) {
  for (const d of _drones) {
    d.userData.t += dt * d.userData.speed;
    const t = d.userData.t;
    d.position.x = d.userData.cx + Math.sin(t) * d.userData.rx;
    d.position.z = d.userData.cz + Math.cos(t * 0.7) * d.userData.rz;
    d.position.y += Math.sin(t * 1.3) * 0.008;
  }
}

// ── Hover / tooltip ───────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const ptr = new THREE.Vector2(-9999,-9999);
const tip = document.getElementById('tip');
let hovB = null;

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  ptr.x =  ((e.clientX-r.left)/r.width)*2-1;
  ptr.y = -((e.clientY-r.top)/r.height)*2+1;
  tip.style.left = (e.clientX+14)+'px'; tip.style.top = (e.clientY-46)+'px';
});

function setGroupEmissive(group, intensity) {
  group.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissiveIntensity = intensity; });
}

function checkHover() {
  raycaster.setFromCamera(ptr, camera);
  const hits = raycaster.intersectObjects(buildings, true);
  if (hits.length) {
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== city) obj = obj.parent;
    if (obj !== hovB) {
      if (hovB) setGroupEmissive(hovB, E_INT[hovB.userData.lv]);
      hovB = obj; setGroupEmissive(hovB, E_INT[hovB.userData.lv] + 3.0);
    }
    canvas.style.cursor = 'pointer';
    const {date,count} = obj.userData;
    const ds = new Date(date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const cs = count===0 ? '<span style="color:#484f58">No contributions</span>'
      : `<span class="cnt">${count} contribution${count!==1?'s':''}</span>`;
    tip.innerHTML = `<span class="date">${ds}</span>${cs}`; tip.style.display = 'block';
  } else {
    if (hovB) { setGroupEmissive(hovB, E_INT[hovB.userData.lv]); hovB = null; }
    canvas.style.cursor = ''; tip.style.display = 'none';
  }
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchContributions(username) {
  const res  = await fetch(`/api/github/${encodeURIComponent(username)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'API error');
  return data.contributions ?? data;
}

// ── UI ────────────────────────────────────────────────────────────────────────
const landingEl = document.getElementById('landing');
const loadingEl = document.getElementById('loading');
const hudEl     = document.getElementById('hud');
const errEl     = document.getElementById('err');
const input     = document.getElementById('uinput');
const btn       = document.getElementById('gbtn');

async function go(username) {
  username = username.trim();
  if (!username) {
    errEl.textContent = 'Please enter a GitHub username.';
    input.focus(); input.style.borderColor = '#f85149';
    setTimeout(() => input.style.borderColor = '', 1500); return;
  }
  errEl.textContent = ''; btn.disabled = true;
  landingEl.style.display = 'none'; loadingEl.classList.add('on');
  document.getElementById('load-text').textContent = `Fetching @${username}'s contributions…`;
  try {
    const data = await fetchContributions(username);
    if (!Array.isArray(data) || !data.length) throw new Error('No contribution data returned.');
    loadingEl.classList.remove('on');
    buildCity(data, username);
    hudEl.classList.add('on');
  } catch(e) {
    loadingEl.classList.remove('on'); landingEl.style.display = ''; btn.disabled = false;
    errEl.textContent = e.message || 'Could not fetch contributions.';
  }
}

btn.addEventListener('click', () => go(input.value));
input.addEventListener('keydown', e => e.key==='Enter' && go(input.value));
document.getElementById('demo-btn').addEventListener('click', () => { input.value='torvalds'; go('torvalds'); });

// Auto-load fixed user on start
input.value = 'YanLinHtet-555';
go('YanLinHtet-555');
document.getElementById('btn-new').addEventListener('click', () => {
  while (city.children.length) city.remove(city.children[0]);
  for (const d of _drones) scene.remove(d);
  _drones = []; buildings = []; hovB = null; _blinkMeshes = [];
  hudEl.classList.remove('on'); landingEl.style.display = ''; btn.disabled = false; input.value = ''; input.focus();
});

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight);
});

// ── Loop ──────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
(function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  controls.update();
  tickAnim(performance.now());
  tickBlink(dt);
  tickDrones(dt);
  checkHover();
  composer.render();
})();
