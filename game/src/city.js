// city.js — Solmar City: a neon coastal grid at dusk.
//
// Layout is a strict grid so traffic, the minimap and mission
// routing all share one mental model: avenues run along Z at fixed
// X coords, streets along X at fixed Z coords, and every block
// between them holds one building (or a car park, or an alley).
// Landmarks sit on named blocks; each exposes a DOOR point out on
// the kerb — mission targets are always door points, never building
// centres, because a centre is inside a solid footprint and a
// player can never stand there.

import * as THREE from 'three';

export const ROADS = [-156, -104, -52, 0, 52, 104, 156];
export const ROAD_HALF = 7;
export const BLOCK_CENTERS = [-130, -78, -26, 26, 78, 130];
export const WORLD_EDGE = 178;          // last kerb before the beach
export const BEACH_X = 186;             // sand starts here
export const WATER_X = 218;             // water starts here

export function onRoad(x, z) {
  for (const r of ROADS) if (Math.abs(x - r) <= ROAD_HALF || Math.abs(z - r) <= ROAD_HALF) return true;
  return x > WORLD_EDGE; // the shore road and pier apron count as drivable
}

function signTexture(text, bg, fg, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = `900 ${h * 0.52}px "Arial Black", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 18;
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(rng, warm) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#141a2e'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) for (let x = 8; x < 120; x += 16) {
    const lit = rng() < 0.42;
    g.fillStyle = lit ? (warm ? '#ffd489' : '#aee6ff') : '#1d2742';
    g.fillRect(x, y, 10, 9);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const landmarks = {};
  const lots = [];

  // --- sky, light, ground -------------------------------------------
  scene.background = new THREE.Color(0x191233);
  scene.fog = new THREE.Fog(0x241640, 190, 620);
  const hemi = new THREE.HemisphereLight(0x8a7bd8, 0x241a33, 1.08);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a5c, 1.15);
  sun.position.set(-160, 120, -220);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x5e7bff, 0.35);
  fill.position.set(180, 90, 160);
  scene.add(fill);

  const groundMat = new THREE.MeshLambertMaterial({ color: 0x232838 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0);
  scene.add(ground);

  // --- roads ---------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x1b1d29 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c26a });
  const roadGeoV = new THREE.PlaneGeometry(ROAD_HALF * 2, 440);
  const roadGeoH = new THREE.PlaneGeometry(440, ROAD_HALF * 2);
  for (const r of ROADS) {
    const v = new THREE.Mesh(roadGeoV, roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, 0, 0); scene.add(v);
    const h = new THREE.Mesh(roadGeoH, roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0, r); scene.add(h);
    // dashed centre lines
    for (let d = -208; d <= 208; d += 16) {
      if (ROADS.some((o) => Math.abs(d - o) < 11)) continue;
      const dv = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), lineMat);
      dv.rotation.x = -Math.PI / 2; dv.position.set(r, 0.02, d); scene.add(dv);
      const dh = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), lineMat);
      dh.rotation.x = -Math.PI / 2; dh.position.set(d, 0.02, r); scene.add(dh);
    }
  }
  // shore road along the beach
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(14, 440), roadMat);
  shore.rotation.x = -Math.PI / 2; shore.position.set(179, 0, 0); scene.add(shore);

  // --- beach, water, pier -------------------------------------------
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(36, 440),
    new THREE.MeshLambertMaterial({ color: 0xc9a86a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(200, 0.01, 0); scene.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x14486b, emissive: 0x0a2f4a });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 440), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(332, -0.4, 0); scene.add(water);

  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6e5136 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(58, 1.2, 26), pierMat);
  pier.position.set(226, 0.6, 0); scene.add(pier);
  for (let px = 202; px <= 250; px += 12) for (const pz of [-11, 11]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3), pierMat);
    post.position.set(px, -0.6, pz); scene.add(post);
  }
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x274b63, emissive: 0x0d2f45 }));
  kiosk.position.set(246, 3.2, 8); scene.add(kiosk);
  colliders.push({ minX: 243, maxX: 249, minZ: 5, maxZ: 11 });

  // palms along the shore
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
  for (let z = -200; z <= 200; z += 26) {
    const px = 190 + rng() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 7), trunkMat);
    trunk.position.set(px, 3.5, z); trunk.rotation.z = 0.12; scene.add(trunk);
    const fronds = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 7), frondMat);
    fronds.position.set(px + 0.8, 7.4, z); scene.add(fronds);
  }

  // --- buildings ------------------------------------------------------
  const winTexA = windowTexture(rng, true);
  const winTexB = windowTexture(rng, false);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x0d0f18 });
  const neonMats = [0xff5ea8, 0x5ee7ff, 0xffd94d, 0x9dff5e, 0xff7a5c]
    .map((c) => new THREE.MeshBasicMaterial({ color: c }));

  function building(x, z, w, d, h, tex) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x666666, emissiveMap: tex });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    scene.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), roofMat);
    roof.position.set(x, h + 0.35, z); scene.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }
  function neonStrip(x, y, z, w, mat, rotY = 0) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, 0.3), mat);
    s.position.set(x, y, z); s.rotation.y = rotY; scene.add(s);
  }
  function sign(x, y, z, text, bg, fg, rotY = 0, w = 16) {
    const tex = signTexture(text, bg, fg);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: tex }));
    s.position.set(x, y, z); s.rotation.y = rotY; scene.add(s);
  }
  function doorOf(x, z, half, dir) {
    // dir: 0 = south (+z), 1 = north, 2 = east, 3 = west — point sits
    // on the block, a few metres clear of the wall, facing the road.
    if (dir === 0) return new THREE.Vector3(x, 0, z + half + 3.5);
    if (dir === 1) return new THREE.Vector3(x, 0, z - half - 3.5);
    if (dir === 2) return new THREE.Vector3(x + half + 3.5, 0, z);
    return new THREE.Vector3(x - half - 3.5, 0, z);
  }

  const LANDMARK_BLOCKS = new Set(['26,-26', '78,26', '130,-78', '-78,-26', '-130,130', '-26,78', '-26,-78']);
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const key = `${bx},${bz}`;
    if (LANDMARK_BLOCKS.has(key)) continue;
    const roll = rng();
    if (roll < 0.16) { // car park
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(34, 34),
        new THREE.MeshLambertMaterial({ color: 0x1a1c26 }));
      lot.rotation.x = -Math.PI / 2; lot.position.set(bx, 0.015, bz); scene.add(lot);
      lots.push({ x: bx, z: bz });
      continue;
    }
    const w = 20 + rng() * 9, d = 20 + rng() * 9, h = 13 + rng() * rng() * 46;
    building(bx, bz, w, d, h, rng() < 0.5 ? winTexA : winTexB);
    if (rng() < 0.55) neonStrip(bx, h - 2 - rng() * 4, bz + d / 2 + 0.2, w * 0.8, neonMats[(rng() * neonMats.length) | 0]);
    if (rng() < 0.3) neonStrip(bx + w / 2 + 0.2, h - 3, bz, d * 0.8, neonMats[(rng() * neonMats.length) | 0], Math.PI / 2);
  }

  // --- landmarks ------------------------------------------------------
  // Solmar Tower — the tall one, centre-east.
  {
    const x = 26, z = -26;
    const tower = building(x, z, 24, 24, 92, winTexB);
    tower.material = new THREE.MeshLambertMaterial({ color: 0x2a3560, emissive: 0x1a2450 });
    const crown = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10),
      new THREE.MeshBasicMaterial({ color: 0xff5ea8 }));
    crown.position.set(x, 96, z); scene.add(crown);
    sign(x, 84, z + 12.3, 'SOLMAR', '#120a24', '#ff5ea8', 0, 22);
    sign(x, 84, z - 12.3, 'SOLMAR', '#120a24', '#ff5ea8', Math.PI, 22);
    landmarks.tower = { name: 'Solmar Tower', pos: new THREE.Vector3(x, 0, z), door: doorOf(x, z, 12, 0) };
  }
  // Bank of Solmar — columns and a gold sign.
  {
    const x = 78, z = 26;
    building(x, z, 30, 22, 17, winTexA);
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 12),
        new THREE.MeshLambertMaterial({ color: 0xcfd6e8 }));
      col.position.set(x + i * 5.4, 6, z + 12.6); scene.add(col);
    }
    sign(x, 14.5, z + 11.3, 'BANK OF SOLMAR', '#191204', '#ffd94d', 0, 24);
    landmarks.bank = { name: 'Bank of Solmar', pos: new THREE.Vector3(x, 0, z), door: doorOf(x, z, 11, 0) };
  }
  // Chop Shop — low, wide, open dark mouth facing west.
  {
    const x = 130, z = -78;
    building(x, z, 30, 26, 9, winTexA);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0x05060a }));
    mouth.position.set(x - 15.2, 3, z); scene.add(mouth);
    sign(x - 15.4, 7.6, z, 'CHOP SHOP', '#0d0d0d', '#ff7a5c', -Math.PI / 2, 18);
    landmarks.chopshop = { name: 'Chop Shop', pos: new THREE.Vector3(x, 0, z), door: doorOf(x, z, 15, 3) };
  }
  // Mona's Garage — the player's home workshop.
  {
    const x = -78, z = -26;
    building(x, z, 28, 24, 10, winTexB);
    sign(x, 8.2, z + 12.3, "MONA'S GARAGE", '#101826', '#5ee7ff', 0, 22);
    neonStrip(x, 5.5, z + 12.2, 24, neonMats[1]);
    landmarks.garage = { name: "Mona's Garage", pos: new THREE.Vector3(x, 0, z), door: doorOf(x, z, 12, 0) };
  }
  // Safehouse — small, quiet, south-west corner.
  {
    const x = -130, z = 130;
    building(x, z, 18, 16, 8, winTexA);
    sign(x, 6.8, z - 8.3, 'SAFEHOUSE', '#0c1410', '#9dff5e', Math.PI, 13);
    landmarks.safehouse = { name: 'Safehouse', pos: new THREE.Vector3(x, 0, z), door: doorOf(x, z, 8, 1) };
  }
  // Vista Hotel — north-centre; the starter Comet waits by its kerb.
  {
    const x = -26, z = 78;
    building(x, z, 30, 24, 26, winTexA);
    sign(x, 22, z + 12.3, 'VISTA HOTEL', '#160d20', '#c99dff', 0, 22);
    landmarks.hotel = { name: 'Vista Hotel', pos: new THREE.Vector3(x, 0, z), door: doorOf(x, z, 12, 0) };
  }
  // The Alley — two slabs with a gap, Vulture turf.
  {
    const bx = -26, bz = -78;
    building(bx - 11, bz, 16, 34, 21, winTexB);
    building(bx + 11, bz, 16, 34, 21, winTexB);
    landmarks.alley = { name: 'The Alley', pos: new THREE.Vector3(bx, 0, bz), door: new THREE.Vector3(bx, 0, bz + 20) };
  }
  landmarks.pier = { name: 'Solmar Pier', pos: new THREE.Vector3(226, 0, 0), door: new THREE.Vector3(238, 0, 0) };

  // --- streetlights ----------------------------------------------------
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30364a });
  for (const rx of ROADS) for (const rz of ROADS) {
    for (const [ox, oz] of [[9, 9], [-9, -9], [9, -9], [-9, 9]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4), poleMat);
      pole.position.set(rx + ox, 3.2, rz + oz); scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), lampMat);
      lamp.position.set(rx + ox, 6.5, rz + oz); scene.add(lamp);
    }
  }

  return { colliders, landmarks, lots, waterMat };
}

// Circle-vs-AABB push-out used by every mover in the game.
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) { pos.x = c.maxX + radius; continue; }
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    }
  }
  // world bounds: fences on the landward sides, water stops cars cold
  pos.x = Math.max(-WORLD_EDGE - 6, Math.min(pos.x, WATER_X + 30));
  pos.z = Math.max(-218, Math.min(pos.z, 218));
}
