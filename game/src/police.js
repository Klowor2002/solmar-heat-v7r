// police.js — the heat: wanted stars, interceptor cars, foot cops.
//
// Wanted rises with witnessed crime and falls when the player
// breaks line of sight and keeps a low profile. Interceptors chase
// and ram; foot cops close in on foot and are what actually fills
// the BUSTED meter — stand still next to one and the run ends.

import * as THREE from 'three';
import { makeCar, steerToward } from './vehicles.js';
import { Ped } from './peds.js';
import { ROADS } from './city.js';

// Force size by wanted level, indexed by stars: cars answer first
// (one star is a single interceptor), foot cops — the ones who can
// actually fill the BUSTED meter — only join from two stars up.
const CARS_BY_STAR = [0, 1, 2, 3, 3, 4];
const COPS_BY_STAR = [0, 0, 1, 2, 3, 4];

export class Police {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.wanted = 0;
    this.cars = [];
    this.cops = [];
    this.hideTimer = 0;        // time unseen while wanted
    this.spawnCd = 0;
    this.busted01 = 0;
    this.flashPhase = 0;
  }

  get active() { return this.wanted > 0; }

  crime(points, state) {
    // crimes only count when the law is watching: a cop or a ped
    // nearby, or the wanted level is already up
    const seen = this.wanted > 0 || this.cars.length > 0 || this.cops.length > 0;
    if (seen || Math.random() < 0.75) {
      this.wanted = Math.min(5, this.wanted + points);
      this.hideTimer = 0;
    }
  }

  clear() {
    this.wanted = 0;
    this.hideTimer = 0;
    this.busted01 = 0;
  }

  desiredCars() { return CARS_BY_STAR[this.wanted] || 0; }
  desiredCops() { return COPS_BY_STAR[this.wanted] || 0; }

  // Drop units that drifted too far from the action (and wrecked
  // cars) once the heat is off; while wanted, the chase keeps them.
  trimFar(list, isCar, playerPos) {
    for (let i = list.length - 1; i >= 0; i--) {
      const u = list[i];
      if (u.pos.distanceTo(playerPos) > 190 || (isCar && u.health <= 0)) {
        this.scene.remove(u.mesh);
        list.splice(i, 1);
      }
    }
  }

  spawnCar(playerPos) {
    // enter from a road two blocks away, never in the player's face
    const axis = ROADS[(Math.random() * ROADS.length) | 0];
    let x, z;
    if (Math.random() < 0.5) { x = axis; z = playerPos.z + (Math.random() < 0.5 ? -120 : 120); }
    else { z = axis; x = playerPos.x + (Math.random() < 0.5 ? -120 : 120); }
    x = Math.max(-170, Math.min(170, x)); z = Math.max(-170, Math.min(170, z));
    const car = makeCar(this.scene, 'cop', x, z, 0, 0xffffff, 'cop');
    this.cars.push(car);
  }

  spawnCop(playerPos) {
    const a = Math.random() * Math.PI * 2;
    const cop = new Ped(this.scene, playerPos.x + Math.sin(a) * 26, playerPos.z + Math.cos(a) * 26,
      { shirt: 0x1d2f52, name: 'cop' });
    cop.state = 'chase';
    this.cops.push(cop);
  }

  update(dt, ctx) {
    const { playerPos, playerSpeed, playerInCar } = ctx;
    this.spawnCd -= dt;
    this.flashPhase += dt * 7;

    if (this.wanted > 0 && this.spawnCd <= 0) {
      this.spawnCd = 2.2;
      if (this.cars.length < this.desiredCars()) this.spawnCar(playerPos);
      if (this.cops.length < this.desiredCops() && !playerInCar) this.spawnCop(playerPos);
    }
    // trim forces that drifted too far away
    if (this.wanted === 0) { this.trimFar(this.cars, true, playerPos); this.trimFar(this.cops, false, playerPos); }

    let nearestCop = 999;
    let anySight = false;

    for (const car of this.cars) {
      if (car.role === 'player') continue; // the player stole this one — it's theirs now
      const d = car.pos.distanceTo(playerPos);
      nearestCop = Math.min(nearestCop, d);
      if (d < 95) anySight = true;
      if (car.health <= 0) continue;
      // chase: aim at a point just behind the player to ram cleanly
      const tx = playerPos.x, tz = playerPos.z;
      const { crashed } = steerToward(car, tx, tz, dt, this.colliders, 99, true);
      if (crashed) this.flashPhase += 0.1;
      const bar = car.mesh.getObjectByName('lightbar');
      if (bar) {
        const on = Math.sin(this.flashPhase) > 0;
        bar.children[0].material.emissive.setHex(on ? 0xff2244 : 0x330008);
        bar.children[1].material.emissive.setHex(on ? 0x330088 : 0x2266ff);
      }
      // ramming a slow player shoves their car and hurts a little
      if (d < 3.4 && ctx.playerCar && Math.abs(car.speed) > 6) {
        ctx.onRamPlayer?.(car);
      }
    }

    let copTouching = false;
    for (const cop of this.cops) {
      if (cop.dead) continue;
      const d = cop.pos.distanceTo(playerPos);
      nearestCop = Math.min(nearestCop, d);
      if (d < 60) anySight = true;
      if (d > 2.1) {
        cop.turnToward(Math.atan2(playerPos.x - cop.pos.x, playerPos.z - cop.pos.z), dt, 6);
        cop.pos.x += Math.sin(cop.heading) * 3.1 * dt;
        cop.pos.z += Math.cos(cop.heading) * 3.1 * dt;
        cop.mesh.rotation.y = cop.heading;
        const u = cop.mesh.userData;
        u.walkPhase += dt * 9;
        const sw = Math.sin(u.walkPhase) * 0.5;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      } else copTouching = true;
      // cops shoot when close and the player is on foot
      cop.shootCd -= dt;
      if (!playerInCar && d < 17 && d > 2.1 && cop.shootCd <= 0) {
        cop.shootCd = 1.1 + Math.random() * 0.8;
        ctx.onCopShoot?.(cop);
      }
    }

    // BUSTED: a cop on top of a slow or on-foot player
    const vulnerable = !playerInCar || Math.abs(playerSpeed) < 1.2;
    if (copTouching && vulnerable && this.wanted > 0) this.busted01 += dt / 2.4;
    else if (this.busted01 > 0) this.busted01 = Math.max(0, this.busted01 - dt / 1.6);

    // losing the heat
    if (this.wanted > 0) {
      if (!anySight) {
        this.hideTimer += dt;
        if (this.hideTimer > 6 + this.wanted * 1.5) {
          this.wanted -= 1;
          this.hideTimer = 0;
          ctx.onWantedDrop?.(this.wanted);
        }
      } else this.hideTimer = 0;
    }
    return { nearestCop, busted: this.busted01 >= 1 };
  }
}
