import * as THREE from 'three';

const GRID = 7;
const CELL = 65;
const ROAD_W = 18;
const BLK = 44;
const HALF = (GRID * CELL) / 2;          // 227.5
const OFF  = -HALF + CELL / 2;           // -195

function r(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rf(min, max) { return Math.random() * (max - min) + min; }

const TYPES = {
  residential: { name:'Residential Tower', badge:'Residential', color:0xD4A574, winColor:0xFFFF99, minH:20, maxH:70, minW:18, maxW:36, weight:25 },
  office:      { name:'Office Tower',       badge:'Commercial',  color:0x5BA0C8, winColor:0xCCEEFF, minH:45, maxH:140,minW:22, maxW:40, weight:20 },
  commercial:  { name:'Shopping Center',    badge:'Commercial',  color:0x9B72CF, winColor:0xDDCCFF, minH:14, maxH:32, minW:30, maxW:44, weight:12 },
  hospital:    { name:'Smart Hospital',     badge:'Healthcare',  color:0xEEEEEE, winColor:0xDDEEFF, minH:28, maxH:48, minW:28, maxW:40, weight:4  },
  school:      { name:'Tech Academy',       badge:'Education',   color:0xF4A261, winColor:0xFFEECC, minH:14, maxH:28, minW:28, maxW:40, weight:4  },
  datacenter:  { name:'Data Center',        badge:'Infrastructure',color:0x4A5568,winColor:0x00FF88,minH:10, maxH:20, minW:32, maxW:42, weight:5  },
  power:       { name:'Power Hub',          badge:'Energy',      color:0xFFCC44, winColor:0xFFFF00, minH:12, maxH:24, minW:26, maxW:38, weight:5  },
  park:        { name:'City Park',          badge:'Green Space', color:null,     winColor:null,      minH:0,  maxH:0,  minW:0,  maxW:0,  weight:14 },
};

const STATS_FN = {
  residential: () => ({ Units: r(50,300), 'Occupancy': r(72,99)+'%', 'Year Built': r(1985,2024), Floors: r(5,22) }),
  office:      () => ({ Companies: r(10,80), Employees: r(500,5000).toLocaleString(), Floors: r(12,42), 'WiFi Nodes': r(20,200) }),
  commercial:  () => ({ Stores: r(20,150), 'Daily Visitors': r(1000,20000).toLocaleString(), Floors: r(2,8), 'Smart Kiosks': r(5,30) }),
  hospital:    () => ({ Beds: r(100,800), Doctors: r(50,500), 'ER Units': r(5,30), 'AI Diagnostics': 'Active' }),
  school:      () => ({ Students: r(500,3000).toLocaleString(), Programs: r(10,40), Classrooms: r(20,80), Devices: r(100,1000) }),
  datacenter:  () => ({ Servers: r(100,5000).toLocaleString(), Storage: r(100,999)+' TB', Uptime: '99.99%', 'Green Energy': r(60,100)+'%' }),
  power:       () => ({ Output: r(10,500)+' MW', 'Solar Panels': r(100,2000), 'Grid Points': r(50,300), Battery: r(10,100)+' MWh' }),
  park:        () => ({ 'Area': r(1,15)+' ha', Trees: r(50,500), 'Visitors/Day': r(100,5000).toLocaleString(), 'Smart Benches': r(5,50) }),
};

function pickType() {
  const keys = Object.keys(TYPES);
  const total = keys.reduce((s, k) => s + TYPES[k].weight, 0);
  let n = Math.random() * total;
  for (const k of keys) { n -= TYPES[k].weight; if (n <= 0) return k; }
  return 'residential';
}

// Shared window textures per type
const _texCache = {};
function windowTex(type) {
  if (_texCache[type]) return _texCache[type];
  const t = TYPES[type];
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const cx = cv.getContext('2d');
  const bc = new THREE.Color(t.color || 0x888888);
  cx.fillStyle = `rgb(${~~(bc.r*255)},${~~(bc.g*255)},${~~(bc.b*255)})`;
  cx.fillRect(0, 0, 128, 256);
  if (t.winColor) {
    const wc = new THREE.Color(t.winColor);
    const cols = 5, rows = 14, ww = 16, wh = 12;
    const gx = (128 - cols*ww)/(cols+1), gy = (256 - rows*wh)/(rows+1);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const lit = Math.random() > 0.3;
      cx.fillStyle = lit
        ? `rgba(${~~(wc.r*255)},${~~(wc.g*255)},${~~(wc.b*255)},${0.7+Math.random()*0.3})`
        : `rgba(${~~(wc.r*40)},${~~(wc.g*40)},${~~(wc.b*40)},0.8)`;
      cx.fillRect(gx+col*(ww+gx), gy+row*(wh+gy), ww, wh);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _texCache[type] = tex;
  return tex;
}

export class CityBuilder {
  constructor(scene) {
    this.scene = scene;
    this.interactables = [];
    this.streetLights = [];
    this.buildingCount = 0;
    this.roadNetwork = null;
  }

  build() {
    this._ground();
    this._roads();
    this._blocks();
    this._streetLights();
    this._props();
    this.roadNetwork = this._network();
  }

  _ground() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x2D5016 })
    );
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.scene.add(g);

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF*2+40, HALF*2+40),
      new THREE.MeshLambertMaterial({ color: 0x777777 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.01;
    base.receiveShadow = true;
    this.scene.add(base);
  }

  _roads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFDD00 });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    for (let i = 0; i <= GRID; i++) {
      const z = OFF + (i - 0.5) * CELL;
      const x = OFF + (i - 0.5) * CELL;

      // horizontal road
      const hr = new THREE.Mesh(new THREE.PlaneGeometry(HALF*2+ROAD_W, ROAD_W), roadMat);
      hr.rotation.x = -Math.PI / 2;
      hr.position.set(0, 0.02, z);
      hr.receiveShadow = true;
      this.scene.add(hr);

      // horizontal center line
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(HALF*2+ROAD_W, 0.35), lineMat);
      hl.rotation.x = -Math.PI / 2;
      hl.position.set(0, 0.05, z);
      this.scene.add(hl);

      // vertical road
      const vr = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, HALF*2+ROAD_W), roadMat);
      vr.rotation.x = -Math.PI / 2;
      vr.position.set(x, 0.02, 0);
      vr.receiveShadow = true;
      this.scene.add(vr);

      // vertical center line
      const vl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, HALF*2+ROAD_W), lineMat);
      vl.rotation.x = -Math.PI / 2;
      vl.position.set(x, 0.05, 0);
      this.scene.add(vl);
    }

    // sidewalk base for each block
    const swMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const bx = OFF + col * CELL;
        const bz = OFF + row * CELL;
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(BLK+2, BLK+2), swMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(bx, 0.015, bz);
        sw.receiveShadow = true;
        this.scene.add(sw);
      }
    }
  }

  _blocks() {
    const forced = {
      '2,2':'park', '4,4':'park', '0,6':'park',
      '6,0':'hospital', '1,5':'school', '5,1':'datacenter', '3,6':'power',
    };

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const bx = OFF + col * CELL;
        const bz = OFF + row * CELL;
        const key = `${col},${row}`;
        const type = forced[key] || pickType();

        if (type === 'park') {
          this._park(bx, bz, col, row);
        } else {
          this._building(bx, bz, type, col, row);
          this.buildingCount++;
        }
      }
    }
  }

  _building(bx, bz, type, col, row) {
    const t = TYPES[type];
    const h  = rf(t.minH, t.maxH);
    const bw = rf(t.minW, Math.min(t.maxW, BLK - 2));
    const bd = rf(t.minW, Math.min(t.maxW, BLK - 2));

    const tex = windowTex(type);
    const tc = tex.clone();
    tc.wrapS = tc.wrapT = THREE.RepeatWrapping;
    tc.repeat.set(bw / 12, h / 12);

    const sideMat = new THREE.MeshLambertMaterial({ color: t.color, map: tc });
    const topMat  = new THREE.MeshLambertMaterial({ color: new THREE.Color(t.color).multiplyScalar(0.75) });
    const btmMat  = new THREE.MeshLambertMaterial({ color: 0x333333 });

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(bw, h, bd),
      [sideMat, sideMat, topMat, btmMat, sideMat, sideMat]
    );
    mesh.position.set(bx, h / 2, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (Math.random() > 0.6) mesh.rotation.y = (Math.random() - 0.5) * 0.12;

    mesh.userData = {
      type: 'building', name: t.name, badge: t.badge, btype: type,
      stats: STATS_FN[type](), col, row, height: h
    };
    this.scene.add(mesh);
    this.interactables.push(mesh);

    this._roofDetails(bx, bz, h, bw, bd, type);

    if (h > 80) this._antenna(bx, bz, h);
  }

  _roofDetails(bx, bz, h, bw, bd, type) {
    if (type === 'hospital') {
      const cm = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(bw*0.4, 0.6, bw*0.1), cm);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(bw*0.1, 0.6, bw*0.4), cm);
      c1.position.set(bx, h+0.3, bz);
      c2.position.set(bx, h+0.3, bz);
      this.scene.add(c1); this.scene.add(c2);
    }
    if (type === 'power' || type === 'datacenter') {
      const pm = new THREE.MeshLambertMaterial({ color: 0x1a3060 });
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(bw*0.25, 0.4, bd*0.18), pm);
        p.position.set(bx + rf(-bw*0.3, bw*0.3), h+0.2, bz + rf(-bd*0.3, bd*0.3));
        p.rotation.x = -0.25;
        this.scene.add(p);
      }
    }
    if (type === 'residential' && Math.random() > 0.5) {
      const wt = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 4, 8), new THREE.MeshLambertMaterial({ color: 0x7B5E2A }));
      wt.position.set(bx + bw*0.25, h+2, bz + bd*0.25);
      this.scene.add(wt);
    }
    if (type === 'office' && Math.random() > 0.4) {
      const hv = new THREE.Mesh(new THREE.BoxGeometry(rf(2,5), rf(2,4), rf(2,5)), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      hv.position.set(bx + rf(-bw*0.3, bw*0.3), h + hv.geometry.parameters.height/2, bz + rf(-bd*0.3, bd*0.3));
      this.scene.add(hv);
    }
  }

  _antenna(bx, bz, h) {
    const aGeo = new THREE.CylinderGeometry(0.2, 0.4, h * 0.14, 5);
    const a = new THREE.Mesh(aGeo, new THREE.MeshLambertMaterial({ color: 0xAAAAAA }));
    a.position.set(bx, h + h*0.07, bz);
    this.scene.add(a);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFF2200 }));
    blink.position.set(bx, h + h*0.145, bz);
    blink.userData.blink = true;
    this.scene.add(blink);
  }

  _park(bx, bz, col, row) {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(BLK - 2, BLK - 2),
      new THREE.MeshLambertMaterial({ color: 0x3FA84A })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(bx, 0.03, bz);
    grass.receiveShadow = true;
    grass.userData = {
      type: 'park', name: 'City Park', badge: 'Green Space',
      btype: 'park', stats: STATS_FN.park(), col, row
    };
    this.scene.add(grass);
    this.interactables.push(grass);

    for (let i = 0; i < r(6, 14); i++) {
      this._tree(bx + rf(-BLK/2+4, BLK/2-4), bz + rf(-BLK/2+4, BLK/2-4));
    }

    // fountain
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 0.8, 16), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    base.position.set(bx, 0.4, bz);
    this.scene.add(base);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.25, 16), new THREE.MeshLambertMaterial({ color: 0x4488EE, transparent:true, opacity:0.7 }));
    water.position.set(bx, 0.93, bz);
    this.scene.add(water);

    // benches
    [[-6,0],[6,0],[0,-6],[0,6]].forEach(([dx,dz]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 0.8), new THREE.MeshLambertMaterial({ color: 0x8B6030 }));
      b.position.set(bx+dx, 0.45, bz+dz);
      this.scene.add(b);
    });

    // path
    const pathMat = new THREE.MeshLambertMaterial({ color: 0xBBAA88 });
    const hPath = new THREE.Mesh(new THREE.PlaneGeometry(BLK-4, 2.5), pathMat);
    hPath.rotation.x = -Math.PI/2; hPath.position.set(bx, 0.04, bz);
    this.scene.add(hPath);
    const vPath = new THREE.Mesh(new THREE.PlaneGeometry(2.5, BLK-4), pathMat);
    vPath.rotation.x = -Math.PI/2; vPath.position.set(bx, 0.04, bz);
    this.scene.add(vPath);
  }

  _tree(x, z) {
    const h = rf(4, 9);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, h, 6), new THREE.MeshLambertMaterial({ color: 0x5C3317 }));
    trunk.position.set(x, h/2, z);
    trunk.castShadow = true;
    this.scene.add(trunk);
    for (let i = 0; i < r(2, 4); i++) {
      const rad = r(2, 5);
      const col = new THREE.Color(0x2E8B57).offsetHSL(0, 0, rf(-0.15, 0.15));
      const f = new THREE.Mesh(new THREE.SphereGeometry(rad, 7, 6), new THREE.MeshLambertMaterial({ color: col }));
      f.position.set(x + rf(-1.5, 1.5), h + rad * (0.4 + i * 0.3), z + rf(-1.5, 1.5));
      f.castShadow = true;
      this.scene.add(f);
    }
  }

  _streetLights() {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const armMat  = new THREE.MeshLambertMaterial({ color: 0x666666 });

    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        if ((i + j) % 2 !== 0) continue;
        const ix = OFF + (j - 0.5) * CELL;
        const iz = OFF + (i - 0.5) * CELL;
        const offsets = [[5,5],[-5,5],[5,-5],[-5,-5]];
        const [ox, oz] = offsets[(i + j) % 4];

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 9, 6), poleMat);
        pole.position.set(ix+ox, 4.5, iz+oz);
        pole.castShadow = true;
        this.scene.add(pole);

        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 5), armMat);
        arm.rotation.z = Math.PI/2;
        arm.position.set(ix+ox+1.2, 9.2, iz+oz);
        this.scene.add(arm);

        const bulbMat = new THREE.MeshBasicMaterial({ color: 0x221100 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), bulbMat);
        bulb.position.set(ix+ox+2.5, 9.2, iz+oz);
        this.scene.add(bulb);

        const pl = new THREE.PointLight(0xFFCC66, 0, 30);
        pl.position.set(ix+ox+2.5, 9, iz+oz);
        this.scene.add(pl);

        this.streetLights.push({ bulb, bulbMat, pl });
      }
    }
  }

  _props() {
    // Traffic lights at key intersections
    const tlMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const lights = [[0,0],[2,2],[4,3],[1,5]];
    lights.forEach(([c, ro]) => {
      const ix = OFF + (c - 0.5) * CELL;
      const iz = OFF + (ro - 0.5) * CELL;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 5), tlMat);
      post.position.set(ix+4, 3.5, iz+4);
      this.scene.add(post);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.2), tlMat);
      box.position.set(ix+4, 8, iz+4);
      this.scene.add(box);
      const cols = [0xFF2200, 0xFFAA00, 0x00CC44];
      cols.forEach((col, idx) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color: col, transparent:true, opacity: idx===2?1:0.2 }));
        l.position.set(ix+4, 8.9 - idx*1.1, iz+4.65);
        this.scene.add(l);
      });
    });

    // Scattered trees outside city
    for (let i = 0; i < 40; i++) {
      const tx = rf(-380, 380);
      const tz = rf(-380, 380);
      if (Math.abs(tx) < HALF+10 && Math.abs(tz) < HALF+10) continue;
      this._tree(tx, tz);
    }
  }

  _network() {
    const nodes = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        nodes.push({ id: i*(GRID+1)+j, x: OFF + (j-0.5)*CELL, z: OFF + (i-0.5)*CELL, edges: [] });
      }
    }
    // horizontal edges
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const a = i*(GRID+1)+j, b = i*(GRID+1)+j+1;
        nodes[a].edges.push(b); nodes[b].edges.push(a);
      }
    }
    // vertical edges
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const a = i*(GRID+1)+j, b = (i+1)*(GRID+1)+j;
        nodes[a].edges.push(b); nodes[b].edges.push(a);
      }
    }
    return nodes;
  }

  setStreetLights(on) {
    this.streetLights.forEach(({ bulbMat, pl }) => {
      bulbMat.color.set(on ? 0xFFDD88 : 0x221100);
      pl.intensity = on ? 2.0 : 0;
    });
  }
}
