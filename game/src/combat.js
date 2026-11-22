import { collideCircle } from './city.js';

// combat.js — gunplay: the player's pistol and Vulture return fire.
//
// Hitscan with a closest-approach test against each living target:
// forgiving enough to feel good with a mouse, honest enough that
// cover (a building between you and the muzzle) really blocks the
// shot. Gang members fire on a cadence with spread, so standing in
// the open costs health but a moving player is hard to hit.

import * as THREE from 'three';

const GUN_RANGE = 90;
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
// Scratch for the shot solver: effects.tracer/burst copy the values
// they are handed synchronously, so one reused set of vectors can
// serve every shot without allocating a Vector3 per trigger pull.
const _chest = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function rayHits(origin, dir, target, radius) {
  _to.copy(target).sub(origin);
  const t = _to.dot(dir);
  if (t < 0 || t > GUN_RANGE) return -1;
  const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
  const d2 = (target.x - px) ** 2 + (target.y - py) ** 2 + (target.z - pz) ** 2;
  return d2 <= radius * radius ? t : -1;
}

function blockedByBuilding(origin, target, colliders) {
  // sample the segment; buildings are AABBs and tall enough that a
  // chest-height line through the footprint means no shot
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const x = origin.x + (target.x - origin.x) * f;
    const z = origin.z + (target.z - origin.z) * f;
    for (const c of colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
  }
  return false;
}

export class Combat {
  constructor(state) {
    this.state = state;      // { effects, audio, colliders, onPlayerHit, onKill, onShotFired }
    this.fireCd = 0;
  }

  // Player pulls the trigger. origin/dir from the camera rig.
  playerShoot(origin, dir, targets) {
    if (this.fireCd > 0) return false;
    this.fireCd = 0.24;
    const s = this.state;
    s.audio.shot();
    s.onShotFired?.();
    let best = null, bestT = Infinity;
    for (const t of targets) {
      if (t.dead) continue;
      _chest.set(t.pos.x, 1.25, t.pos.z);
      const hit = rayHits(origin, dir, _chest, 0.85);
      if (hit > 0 && hit < bestT) { bestT = hit; best = t; }
    }
    if (best) _end.set(best.pos.x, 1.25, best.pos.z);
    else _end.copy(origin).addScaledVector(dir, GUN_RANGE);
    if (best && blockedByBuilding(origin, _end, s.colliders)) best = null;
    _muzzle.copy(origin); _muzzle.y -= 0.12;
    s.effects.tracer(_muzzle, _end);
    if (best) {
      const killed = best.hurt(34);
      s.effects.burst(_end, 7, 0xff5d5d, 2, 2);
      if (killed) s.onKill?.(best);
    } else {
      s.effects.burst(_end, 2, 0xd8d8e0, 1, 1);
    }
    return true;
  }

  // A gang member or cop fires at the player.
  npcShoot(shooter, playerPos, playerInCar) {
    const s = this.state;
    const from = new THREE.Vector3(shooter.pos.x, 1.3, shooter.pos.z);
    const to = new THREE.Vector3(playerPos.x, playerInCar ? 0.9 : 1.25, playerPos.z);
    if (blockedByBuilding(from, to, s.colliders)) return;
    s.audio.shot();
    // spread grows with distance; moving targets are harder to hit
    const dist = from.distanceTo(to);
    const hitChance = Math.max(0.12, 0.62 - dist * 0.016);
    const hit = Math.random() < hitChance;
    const end = hit ? to : to.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 3, Math.random() * 1.4, (Math.random() - 0.5) * 3));
    s.effects.tracer(from, end);
    if (hit) s.onPlayerHit?.(playerInCar ? 4 : 7);
  }

  update(dt) { this.fireCd = Math.max(0, this.fireCd - dt); }
}

// Gang behaviour driver: members of the active shootout group
// strafe around their post, keep 6–14 m from the player, and fire.
export function driveGang(dt, group, ctx) {
  for (const m of group) {
    if (m.dead) continue;
    const d = m.pos.distanceTo(ctx.playerPos);
    m.state = 'combat';
    // strafe sideways, drift toward preferred range
    const side = Math.sin(ctx.time * 0.7 + m.id) > 0 ? 1 : -1;
    const toPlayer = Math.atan2(ctx.playerPos.x - m.pos.x, ctx.playerPos.z - m.pos.z);
    let mx = 0, mz = 0;
    const radial = d > 14 ? 1 : d < 6 ? -1 : 0;
    mx += Math.sin(toPlayer) * radial + Math.cos(toPlayer) * side * 0.6;
    mz += Math.cos(toPlayer) * radial - Math.sin(toPlayer) * side * 0.6;
    const l = Math.hypot(mx, mz) || 1;
    m.pos.x += (mx / l) * 1.9 * dt;
    m.pos.z += (mz / l) * 1.9 * dt;
    // a strafing gunman still has to respect the architecture —
    // without this the crew drifts through slab walls and ends up
    // embedded in a building, unshootable behind its own cover test
    if (ctx.colliders) collideCircle(m.pos, 0.55, ctx.colliders);
    m.shootCd -= dt;
    if (m.shootCd <= 0 && d < 30) {
      m.shootCd = 1.3 + Math.random() * 1.1;
      ctx.combat.npcShoot(m, ctx.playerPos, ctx.playerInCar);
    }
  }
}
