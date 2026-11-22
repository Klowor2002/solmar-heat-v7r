// peds.js — people: wandering pedestrians and Vulture gang members.
//
// One low-poly humanoid factory serves both. Peds stroll the
// pavements and scatter from danger; gang members stand their
// ground, strafe, and shoot. Both walk with a simple two-leg swing
// so the city never looks frozen.

import * as THREE from 'three';
import { collideCircle } from './city.js';

const SHIRTS = [0xd8546a, 0x4a90d8, 0xf2e3c9, 0x59c96e, 0xe8a33d, 0x9a6ae0, 0xe8e8f0, 0x3dc9c0];
const PANTS = [0x23283e, 0x3d3d4a, 0x5a4632, 0x1d2f28, 0x6e2f3a];
const SKIN = [0xf2c49b, 0xc98d5e, 0x8a5a34, 0x6e4226];

export function makeHumanoid(shirt, pants, skin, gang = false) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), legMat);
  legL.position.set(-0.14, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.12;
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), armMat);
  armL.position.set(-0.37, 1.1, 0);
  const armR = armL.clone(); armR.position.x = 0.37;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.66;
  g.add(legL, legR, torso, armL, armR, head);
  if (gang) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    band.position.y = 1.74; g.add(band);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x0c0c10 }));
    gun.position.set(0.37, 1.06, 0.24); g.add(gun);
  }
  g.userData = { legL, legR, armL, armR, walkPhase: Math.random() * 6 };
  return g;
}

let pedSeq = 0;
export class Ped {
  constructor(scene, x, z, opts = {}) {
    this.id = ++pedSeq;
    this.gang = !!opts.gang;
    this.mesh = makeHumanoid(
      opts.shirt ?? SHIRTS[(Math.random() * SHIRTS.length) | 0],
      PANTS[(Math.random() * PANTS.length) | 0],
      SKIN[(Math.random() * SKIN.length) | 0], this.gang);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.health = this.gang ? 100 : 40;
    this.state = 'wander';           // wander | flee | stand | combat | down
    this.wanderTarget = null;
    this.fleeFrom = null;
    this.fleeTime = 0;
    this.shootCd = 1 + Math.random() * 1.5;
    this.dead = false;
    this.fare = false;               // taxi passenger flag
    this.name = opts.name || null;
  }
  get pos() { return this.mesh.position; }

  update(dt, ctx) {
    if (this.dead) return;
    const u = this.mesh.userData;
    let move = 0;

    if (this.state === 'flee') {
      this.fleeTime -= dt;
      if (this.fleeTime <= 0) { this.state = 'wander'; this.wanderTarget = null; }
      else if (this.fleeFrom) {
        const want = Math.atan2(this.pos.x - this.fleeFrom.x, this.pos.z - this.fleeFrom.z);
        this.turnToward(want, dt, 6);
        move = 3.6;
      }
    } else if (this.state === 'combat') {
      // handled by combat.js positioning; here just face the player
      if (ctx.playerPos) this.turnToward(Math.atan2(ctx.playerPos.x - this.pos.x, ctx.playerPos.z - this.pos.z), dt, 5);
    } else if (this.state === 'stand') {
      if (ctx.playerPos) this.turnToward(Math.atan2(ctx.playerPos.x - this.pos.x, ctx.playerPos.z - this.pos.z), dt, 3);
    } else { // wander
      if (!this.wanderTarget || this.pos.distanceTo(this.wanderTarget) < 1.6) {
        // pick a new pavement point: near a road, offset to the kerb.
        // The along-axis stays inside the city wall — past it the
        // pavement ends at the beach and the sea.
        const rx = ctx.roads[(Math.random() * ctx.roads.length) | 0];
        const along = -170 + Math.random() * 340;
        const side = Math.random() < 0.5 ? -9.5 : 9.5;
        this.wanderTarget = Math.random() < 0.5
          ? new THREE.Vector3(rx + side, 0, along)
          : new THREE.Vector3(along, 0, rx + side);
      }
      const want = Math.atan2(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
      this.turnToward(want, dt, 3.5);
      move = 1.35;
    }

    if (move > 0) {
      this.pos.x += Math.sin(this.heading) * move * dt;
      this.pos.z += Math.cos(this.heading) * move * dt;
      collideCircle(this.pos, 0.55, ctx.colliders);
      u.walkPhase += dt * move * 3.4;
    }
    const sw = Math.sin(u.walkPhase) * (move > 0 ? 0.5 : 0);
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
    this.mesh.rotation.y = this.heading;
    this.speed = move;
  }

  turnToward(want, dt, rate) {
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  scare(fromPos) {
    if (this.gang || this.dead) return;
    this.state = 'flee';
    this.fleeFrom = fromPos;
    this.fleeTime = 2.5 + Math.random() * 2;
  }

  hurt(dmg) {
    this.health -= dmg;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      return true;
    }
    return false;
  }
}

export function spawnCrowd(scene, rng, count = 26) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const rx = [-156, -104, -52, 0, 52, 104, 156][(rng() * 7) | 0];
    const side = rng() < 0.5 ? -9.5 : 9.5;
    const along = -200 + rng() * 400;
    const p = rng() < 0.5 ? new Ped(scene, rx + side, along) : new Ped(scene, along, rx + side);
    peds.push(p);
  }
  return peds;
}
