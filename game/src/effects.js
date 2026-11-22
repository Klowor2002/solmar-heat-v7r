// effects.js — juice: particle bursts, tracers, the gold objective
// beam, floating tokens, and camera shake.
//
// Everything is pooled and recycled; nothing allocates per frame.
// The objective beam is the game's main wayfinding device: a tall
// translucent gold column you can see across the whole city.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeAmt = 0;

    // particle pool: one Points cloud, ring-buffered. Colours are
    // per-particle (a colour attribute), because a single material
    // colour made every live particle take the newest burst's
    // colour — gold token sparkles turned impact bursts gold too.
    this.maxP = 900;
    this.pPos = new Float32Array(this.maxP * 3);
    this.pCol = new Float32Array(this.maxP * 3);
    this.pVel = new Float32Array(this.maxP * 3);
    this.pLife = new Float32Array(this.maxP);
    this.pHead = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, transparent: true, opacity: 0.95, vertexColors: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < this.maxP; i++) this.pPos[i * 3 + 1] = -50;

    // tracers: a few short-lived line segments
    this.tracers = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    // objective beam + ground ring
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 90, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd94d, transparent: true, opacity: 0.30,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    this.beam.position.y = 45;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    scene.add(this.beam, this.ring);
    this.beamTarget = null;
  }

  burst(pos, n, color, spread = 3, up = 3) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.pHead; this.pHead = (this.pHead + 1) % this.maxP;
      this.pCol[i * 3] = c.r; this.pCol[i * 3 + 1] = c.g; this.pCol[i * 3 + 2] = c.b;
      this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y + 0.5; this.pPos[i * 3 + 2] = pos.z;
      this.pVel[i * 3] = (Math.random() - 0.5) * spread;
      this.pVel[i * 3 + 1] = Math.random() * up;
      this.pVel[i * 3 + 2] = (Math.random() - 0.5) * spread;
      this.pLife[i] = 0.5 + Math.random() * 0.5;
    }
  }

  tracer(a, b) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const p = t.line.geometry.attributes.position.array;
    p[0] = a.x; p[1] = a.y; p[2] = a.z; p[3] = b.x; p[4] = b.y; p[5] = b.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.life = 0.07;
  }

  setBeam(pos) { this.beamTarget = pos; }

  shake(n) { this.shakeAmt = Math.min(1.2, this.shakeAmt + n); }

  update(dt, t) {
    for (let i = 0; i < this.maxP; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 6.5 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -50;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const tr of this.tracers) {
      if (tr.life > 0) { tr.life -= dt; if (tr.life <= 0) tr.line.material.opacity = 0; }
    }
    const show = !!this.beamTarget;
    this.beam.visible = this.ring.visible = show;
    if (show) {
      this.beam.position.x = this.beamTarget.x;
      this.beam.position.z = this.beamTarget.z;
      this.ring.position.x = this.beamTarget.x;
      this.ring.position.z = this.beamTarget.z;
      const s = 1 + Math.sin(t * 3.2) * 0.12;
      this.ring.scale.set(s, s, 1);
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.4);
  }

  applyShake(camera) {
    if (this.shakeAmt <= 0) return;
    camera.position.x += (Math.random() - 0.5) * this.shakeAmt * 0.35;
    camera.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.3;
  }
}

// The 12 gold tokens: spinning coins on plinths of light.
export class Tokens {
  constructor(scene, spots) {
    this.items = [];
    const geo = new THREE.CylinderGeometry(0.85, 0.85, 0.18, 18);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd94d });
    spots.forEach((s, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(s.x, 1.15, s.z);
      scene.add(m);
      this.items.push({ mesh: m, idx: i, taken: false });
    });
  }
  update(dt, t, playerPos, collected, onCollect) {
    for (const it of this.items) {
      if (it.taken || collected.has(it.idx)) { it.mesh.visible = false; it.taken = true; continue; }
      it.mesh.rotation.z += dt * 2.4;
      it.mesh.position.y = 1.15 + Math.sin(t * 2 + it.idx) * 0.18;
      if (playerPos && it.mesh.position.distanceTo(playerPos) < 2.6) {
        it.taken = true; it.mesh.visible = false;
        onCollect(it.idx, it.mesh.position);
      }
    }
  }
}
