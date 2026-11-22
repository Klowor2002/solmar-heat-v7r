// player.js — Rico, the player: on-foot movement, driving, camera.
//
// Two bodies, one record: on foot Rico is a humanoid with a walk
// cycle and a drawn pistol when aiming; in a car the car is the
// body and Rico hides inside it. The camera is a smoothed chase
// rig in both modes, with the mouse steering the on-foot yaw —
// click the canvas to pointer-lock, or steer with the arrow keys.

import * as THREE from 'three';
import { makeHumanoid } from './peds.js';
import { collideCircle } from './city.js';
import { stepCar, CAR_SPECS } from './vehicles.js';

export class Player {
  constructor(scene) {
    this.mesh = makeHumanoid(0x27324e, 0x1d1d26, 0xc98d5e, false);
    // Rico's signature teal jacket stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.32),
      new THREE.MeshBasicMaterial({ color: 0x2cc8c0 }));
    stripe.position.y = 1.3;
    this.mesh.add(stripe);
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.44),
      new THREE.MeshLambertMaterial({ color: 0x0c0c10 }));
    this.gun.position.set(0.37, 1.06, 0.24);
    this.gun.visible = false;
    this.mesh.add(this.gun);
    scene.add(this.mesh);

    this.heading = Math.PI;          // face north-ish at spawn
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.speed = 0;
    this.car = null;                 // current vehicle or null
    this.health = 100;
    this.walkPhase = 0;
    this.camPos = new THREE.Vector3(0, 6, 12);
    this.aiming = false;
    // camera scratch: the chase rig recomputes its targets every
    // frame, and lerp/lookAt read them synchronously — one reused
    // pair of vectors instead of three allocations per frame
    this._want = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
  }

  get pos() { return this.car ? this.car.pos : this.mesh.position; }
  get visiblePos() { return this.mesh.position; }

  spawnAt(x, z, heading = Math.PI) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.camYaw = heading;
    this.camPos.set(x + Math.sin(heading) * -9, 5, z + Math.cos(heading) * -9);
  }

  enterCar(car) {
    this.car = car;
    car.role = 'player';
    this.mesh.visible = false;
    this.gun.visible = false;
  }

  exitCar(colliders) {
    if (!this.car) return null;
    const car = this.car;
    this.car = null;
    car.role = car.stolen ? 'stolen-parked' : 'parked';
    car.speed = 0;
    // step out on the left side of the car — kerb side, clear of the
    // body so the player never materialises inside a wall or the car
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    this.mesh.position.copy(car.pos).addScaledVector(side, -2.4);
    this.mesh.position.y = 0;
    // resolve the step-out spot NOW, not on the next movement frame:
    // a car parked flush against a wall would otherwise deposit
    // Rico inside the masonry for a frame, and the late push-out
    // can land him on the building's far side
    if (colliders) collideCircle(this.mesh.position, 0.55, colliders);
    this.mesh.visible = true;
    this.heading = car.heading;
    return car;
  }

  // keys: live Set of KeyboardEvent.code strings; dt seconds.
  update(dt, keys, colliders, mouseDX, mouseDY, pointerLocked) {
    if (pointerLocked) {
      this.camYaw -= mouseDX * 0.0026;
      this.camPitch = Math.max(0.06, Math.min(0.9, this.camPitch + mouseDY * 0.0022));
    }
    if (this.car) {
      const input = {
        throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0),
        steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0),
        boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        brake: keys.has('Space'),
      };
      const crashed = stepCar(this.car, input, dt, colliders);
      this.heading = this.car.heading;
      this.speed = this.car.speed;
      this.mesh.position.copy(this.car.pos);
      // chase camera settles behind the car
      const back = 10.5, up = 4.6;
      const want = this._want.set(
        this.car.pos.x - Math.sin(this.car.heading) * back,
        up,
        this.car.pos.z - Math.cos(this.car.heading) * back);
      this.camPos.lerp(want, 1 - Math.pow(0.0001, dt));
      this.camYaw = this.car.heading;
      return crashed;
    }

    // on foot
    let fwd = 0, strafe = 0;
    if (keys.has('KeyW')) fwd += 1;
    if (keys.has('KeyS')) fwd -= 1;
    if (keys.has('KeyA')) strafe -= 1;
    if (keys.has('KeyD')) strafe += 1;
    if (!pointerLocked) {
      if (keys.has('ArrowLeft')) this.camYaw += 1.9 * dt;
      if (keys.has('ArrowRight')) this.camYaw -= 1.9 * dt;
      if (keys.has('ArrowUp')) fwd += 1;
      if (keys.has('ArrowDown')) fwd -= 1;
    }
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const maxSpeed = run ? 6.4 : 3.9;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    const mx = (sin * fwd + cos * strafe);
    const mz = (cos * fwd - sin * strafe);
    const len = Math.hypot(mx, mz) || 1;
    const moving = fwd !== 0 || strafe !== 0;
    this.speed = moving ? maxSpeed : 0;
    if (moving) {
      this.mesh.position.x += (mx / len) * maxSpeed * dt;
      this.mesh.position.z += (mz / len) * maxSpeed * dt;
      this.heading = Math.atan2(mx, mz);
    }
    collideCircle(this.mesh.position, 0.55, colliders);
    this.mesh.position.x = Math.max(-212, Math.min(258, this.mesh.position.x));
    this.mesh.position.z = Math.max(-212, Math.min(212, this.mesh.position.z));
    this.mesh.rotation.y = this.aiming ? this.camYaw : this.heading;

    const u = this.mesh.userData;
    if (moving) {
      this.walkPhase += dt * maxSpeed * 2.6;
      const sw = Math.sin(this.walkPhase) * 0.55;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7;
      u.armR.rotation.x = this.aiming ? -1.35 : sw * 0.7;
    } else {
      u.legL.rotation.x *= 0.8; u.legR.rotation.x *= 0.8;
      u.armL.rotation.x *= 0.8;
      u.armR.rotation.x = this.aiming ? -1.35 : u.armR.rotation.x * 0.8;
    }
    this.gun.visible = this.aiming;

    const back = 7.6;
    const want = this._want.set(
      this.mesh.position.x - Math.sin(this.camYaw) * back * Math.cos(this.camPitch),
      1.7 + Math.sin(this.camPitch) * back,
      this.mesh.position.z - Math.cos(this.camYaw) * back * Math.cos(this.camPitch));
    this.camPos.lerp(want, 1 - Math.pow(0.000001, dt));
    return false;
  }

  applyCamera(camera) {
    camera.position.copy(this.camPos);
    const target = this.car
      ? this._camTarget.set(this.car.pos.x, 1.6, this.car.pos.z)
      : this._camTarget.set(this.mesh.position.x, 1.5, this.mesh.position.z);
    camera.lookAt(target);
  }

  aimDirection() {
    // shots fly from the camera centre: direction the camera faces
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch - 0.32), 0,
      Math.cos(this.camYaw) * Math.cos(this.camPitch - 0.32));
    return dir.normalize();
  }
}
