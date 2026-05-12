import * as THREE from 'three';

const CAR_COLS = [0xCC2200,0x2244CC,0xFFCC00,0x228833,0xCC6600,0xAA44CC,0xF0F0F0,0x111111,0x448888,0xEE4488,0x88AAFF];

function rf(a, b) { return Math.random() * (b - a) + a; }
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function makeCar(color) {
  const g = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.85, 5.2),
    new THREE.MeshLambertMaterial({ color })
  );
  body.castShadow = true;
  g.add(body);

  const cabinColor = new THREE.Color(color).multiplyScalar(0.65);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, 0.7, 2.9),
    new THREE.MeshLambertMaterial({ color: cabinColor })
  );
  cabin.position.set(0, 0.77, -0.25);
  cabin.castShadow = true;
  g.add(cabin);

  // windows
  const gm = new THREE.MeshLambertMaterial({ color: 0x88BBDD, transparent: true, opacity: 0.55 });
  const fw = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.6), gm);
  fw.position.set(0, 0.78, 1.24); fw.rotation.x = -0.22; g.add(fw);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.6), gm);
  rw.position.set(0, 0.78, -1.74); rw.rotation.x = 0.22; g.add(rw);

  // headlights
  const hm = new THREE.MeshBasicMaterial({ color: 0xFFFF99 });
  [-1,1].forEach(s => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.12), hm);
    h.position.set(s*0.9, -0.07, 2.62); g.add(h);
  });
  // tail lights
  const tm = new THREE.MeshBasicMaterial({ color: 0xFF2200 });
  [-1,1].forEach(s => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.12), tm);
    tl.position.set(s*0.9, -0.07, -2.62); g.add(tl);
  });

  // wheels
  const wm = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const wg = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 14);
  [[-1.35, 1.75], [1.35, 1.75], [-1.35,-1.75], [1.35,-1.75]].forEach(([wx,wz]) => {
    const w = new THREE.Mesh(wg, wm);
    w.rotation.z = Math.PI/2;
    w.position.set(wx, -0.45, wz);
    g.add(w);
    // hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.35,8), new THREE.MeshLambertMaterial({color:0x888888}));
    hub.rotation.z = Math.PI/2;
    hub.position.set(wx, -0.45, wz);
    g.add(hub);
  });

  g.scale.setScalar(0.95);
  return g;
}

function makeTruck(color) {
  const g = new THREE.Group();
  // cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3.5), new THREE.MeshLambertMaterial({ color }));
  cab.position.set(0, 1, 2.5); cab.castShadow = true; g.add(cab);
  // trailer
  const trailer = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 7), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).offsetHSL(0,0,0.1) }));
  trailer.position.set(0, 1.25, -3); trailer.castShadow = true; g.add(trailer);
  const wm = new THREE.MeshLambertMaterial({ color: 0x222222 });
  [[-1.6,3],[1.6,3],[-1.6,-1.5],[1.6,-1.5],[-1.6,-4.5],[1.6,-4.5]].forEach(([wx,wz]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.35,12), wm);
    w.rotation.z = Math.PI/2; w.position.set(wx, 0.5, wz); g.add(w);
  });
  g.scale.setScalar(0.85);
  return g;
}

export class VehicleSystem {
  constructor(scene, network) {
    this.scene = scene;
    this.network = network; // array of nodes
    this.vehicles = [];
    this.count = 0;
    this.speedMult = 1;
  }

  init(n = 42) {
    const truckChance = 0.12;
    for (let i = 0; i < n; i++) {
      const isTruck = Math.random() < truckChance;
      this._spawn(isTruck);
    }
    this.count = n;
  }

  _spawn(isTruck = false) {
    const nodes = this.network;
    const startIdx = ri(0, nodes.length - 1);
    const start = nodes[startIdx];
    if (!start.edges.length) return;
    const nextIdx = start.edges[ri(0, start.edges.length-1)];

    const color = CAR_COLS[ri(0, CAR_COLS.length-1)];
    const mesh = isTruck ? makeTruck(color) : makeCar(color);

    // lane offset perpendicular to direction
    const next = nodes[nextIdx];
    const dx = next.x - start.x, dz = next.z - start.z;
    const len = Math.hypot(dx, dz) || 1;
    const laneOff = 2.8; // offset to one lane
    const ox = -dz/len * laneOff;
    const oz =  dx/len * laneOff;

    mesh.position.set(start.x + ox, 0.55, start.z + oz);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.userData = {
      type: 'vehicle', name: isTruck ? 'Delivery Truck' : 'Autonomous Car',
      badge: 'Transport',
      stats: {
        Speed:    ri(40,90)+' km/h',
        Battery:  ri(20,100)+'%',
        Passengers: isTruck ? 1 : ri(1,4),
        Route:    'AI-Optimized',
      }
    };
    this.scene.add(mesh);

    this.vehicles.push({
      mesh, isTruck,
      cur: startIdx, nxt: nextIdx,
      prog: Math.random(),
      speed: isTruck ? rf(8,14) : rf(16,28),
      laneSign: Math.random() > 0.5 ? 1 : -1,
    });
  }

  update(delta) {
    const dt = delta * this.speedMult;
    for (const v of this.vehicles) {
      const cur = this.network[v.cur];
      const nxt = this.network[v.nxt];
      const segLen = Math.hypot(nxt.x - cur.x, nxt.z - cur.z);
      if (segLen < 0.1) continue;

      v.prog += v.speed * dt / segLen;

      if (v.prog >= 1) {
        v.prog = 0;
        v.cur = v.nxt;
        const c = this.network[v.cur];
        const candidates = c.edges.filter(e => e !== v.cur);
        if (!candidates.length) { v.nxt = v.cur; continue; }
        v.nxt = candidates[Math.floor(Math.random() * candidates.length)];
        const n2 = this.network[v.nxt];
        const dx2 = n2.x - c.x, dz2 = n2.z - c.z;
        v.mesh.rotation.y = Math.atan2(dx2, dz2);
      }

      const t = v.prog;
      const px = cur.x + (nxt.x - cur.x) * t;
      const pz = cur.z + (nxt.z - cur.z) * t;
      const dx = nxt.x - cur.x, dz = nxt.z - cur.z;
      const len2 = Math.hypot(dx, dz) || 1;
      const ox = -dz/len2 * 2.8 * v.laneSign;
      const oz =  dx/len2 * 2.8 * v.laneSign;
      v.mesh.position.set(px + ox, 0.55, pz + oz);
    }
  }
}
