// vehicles.js — car meshes, arcade driving physics, city traffic.
//
// One car record drives everything: { mesh, heading, speed, kind,
// role, stolen, health }. Traffic cars follow the road grid lane by
// lane; the player's car and police cars share the same physics
// step so a chase feels fair — the difference is only who steers.

import * as THREE from 'three';
import { ROADS, collideCircle } from './city.js';

export const CAR_SPECS = {
  sedan: { len: 4.3, wid: 1.9, top: 30, accel: 13, name: 'Solmar Sedan' },
  sport: { len: 4.1, wid: 1.85, top: 40, accel: 19, name: 'Comet GT' },
  hatch: { len: 3.8, wid: 1.8, top: 27, accel: 12, name: 'Pico Hatch' },
  van: { len: 5.2, wid: 2.1, top: 24, accel: 10, name: 'Armoured Van' },
  limo: { len: 6.0, wid: 2.0, top: 29, accel: 12, name: 'Vista Limo' },
  cop: { len: 4.4, wid: 1.9, top: 37, accel: 17, name: 'Interceptor' },
  taxi: { len: 4.3, wid: 1.9, top: 30, accel: 13, name: 'City Cab' },
};

const PAINTS = [0xc23b4e, 0x2e6fd8, 0x35b06f, 0xe0a52c, 0x8a5fd0, 0xd8d8e0, 0x22242e, 0xe86a2c, 0x2cc8c0];

const bodyGeoCache = {};
function box(w, h, d, color, x = 0, y = 0, z = 0, emissive = 0x000000) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, emissive }));
  m.position.set(x, y, z);
  return m;
}

export function makeCarMesh(kind, color) {
  const spec = CAR_SPECS[kind];
  const g = new THREE.Group();
  const paint = kind === 'cop' ? 0xf0f2f8 : kind === 'taxi' ? 0xf2b21b : color;
  const L = spec.len, W = spec.wid;

  const body = box(W, 0.55, L, paint, 0, 0.55, 0);
  g.add(body);
  const nose = box(W * 0.92, 0.34, L * 0.22, paint, 0, 0.42, L * 0.36);
  g.add(nose);
  if (kind === 'van') {
    g.add(box(W, 1.5, L * 0.78, 0x9aa2b5, 0, 1.25, -L * 0.06));
    g.add(box(W * 0.9, 0.5, 0.3, 0x39415a, 0, 1.1, L * 0.42));
  } else if (kind === 'limo') {
    g.add(box(W * 0.9, 0.55, L * 0.62, 0x14151f, 0, 1.05, -0.2));
  } else {
    const cabin = box(W * 0.84, 0.5, L * 0.44, 0x12141f, 0, 1.05, kind === 'sport' ? -0.25 : -0.1);
    g.add(cabin);
  }
  // lights: headlights forward (+z is the car's nose), tail red
  g.add(box(0.34, 0.14, 0.06, 0xfff2c0, -W * 0.3, 0.52, L / 2 + 0.01, 0xffedb5));
  g.add(box(0.34, 0.14, 0.06, 0xfff2c0, W * 0.3, 0.52, L / 2 + 0.01, 0xffedb5));
  g.add(box(0.34, 0.12, 0.06, 0xff2244, -W * 0.3, 0.58, -L / 2 - 0.01, 0xaa0022));
  g.add(box(0.34, 0.12, 0.06, 0xff2244, W * 0.3, 0.58, -L / 2 - 0.01, 0xaa0022));
  if (kind === 'cop') {
    const bar = new THREE.Group();
    const red = box(0.55, 0.16, 0.3, 0xff2244, -0.3, 0, 0, 0xff2244);
    const blue = box(0.55, 0.16, 0.3, 0x2266ff, 0.3, 0, 0, 0x2266ff);
    bar.add(red, blue);
    bar.position.set(0, 1.42, -0.1);
    bar.name = 'lightbar';
    g.add(bar);
    g.add(box(W + 0.02, 0.3, L * 0.3, 0x14151f, 0, 0.56, -0.2)); // black band
  }
  if (kind === 'taxi') g.add(box(0.7, 0.18, 0.3, 0xfff2c0, 0, 1.36, -0.1, 0xffe9a0));

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0e });
  const wheels = [];
  for (const [wx, wz] of [[-W / 2, L * 0.32], [W / 2, L * 0.32], [-W / 2, -L * 0.32], [W / 2, -L * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

let carSeq = 0;
export function makeCar(scene, kind, x, z, heading, color, role = 'parked') {
  const mesh = makeCarMesh(kind, color ?? PAINTS[(Math.random() * PAINTS.length) | 0]);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    id: ++carSeq, kind, mesh, heading, speed: 0, role,
    stolen: false, health: 100, driverName: null,
    get pos() { return mesh.position; },
  };
}

// Shared arcade step. input: {throttle -1..1, steer -1..1, boost, brake}
export function stepCar(car, input, dt, colliders) {
  const spec = CAR_SPECS[car.kind];
  const top = spec.top * (input.boost ? 1.25 : 1);
  if (input.throttle > 0) car.speed += spec.accel * input.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  else if (input.throttle < 0) car.speed += spec.accel * 0.7 * input.throttle * dt * (car.speed > 0 ? 2.4 : 1);
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt); // engine drag
  if (input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed -= car.speed * 0.35 * dt; // rolling resistance
  car.speed = Math.max(-11, Math.min(top, car.speed));

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 9) * (Math.abs(car.speed) > 22 ? 0.55 : 1);
  car.heading -= input.steer * 1.65 * steerAuthority * dt * Math.sign(car.speed || 1);

  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const before = Math.abs(car.speed);
  car.pos.x = nx; car.pos.z = nz;
  collideCircle(car.pos, 2.1, colliders);
  // if the push-out moved us a lot, we hit something: bleed speed
  const moved = Math.hypot(car.pos.x - nx, car.pos.z - nz);
  if (moved > 0.4) {
    if (before > 12) car.health -= (before - 12) * 0.7;
    car.speed *= 0.35;
  }
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt / 0.36;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  return moved > 0.4 && before > 8; // hard crash flag
}

// Steer a car toward a world point (traffic waypoints, police chase).
export function steerToward(car, tx, tz, dt, colliders, cruise, boost = false) {
  const dx = tx - car.pos.x, dz = tz - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  const throttle = dist > 4 ? 1 : 0.2;
  const spec = CAR_SPECS[car.kind];
  const savedTop = spec.top;
  const input = { throttle, steer, boost, brake: Math.abs(diff) > 2.4 && car.speed > 10 };
  // temporarily cap by cruise by scaling throttle when above it
  if (car.speed > cruise) input.throttle = 0;
  const crashed = stepCar(car, input, dt, colliders);
  spec.top = savedTop;
  return { dist, crashed };
}

// --- traffic ------------------------------------------------------------
export class Traffic {
  constructor(scene, rng, colliders, count = 15) {
    this.cars = [];
    this.colliders = colliders;
    for (let i = 0; i < count; i++) {
      const onX = rng() < 0.5;
      const road = ROADS[(rng() * ROADS.length) | 0];
      const along = -190 + rng() * 380;
      const dirSign = rng() < 0.5 ? 1 : -1;
      let x, z, heading;
      if (onX) { // travelling along X on a Z-road
        z = road + (dirSign > 0 ? 3.5 : -3.5);
        x = along; heading = dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        x = road + (dirSign > 0 ? -3.5 : 3.5);
        z = along; heading = dirSign > 0 ? 0 : Math.PI;
      }
      const kinds = ['sedan', 'hatch', 'sedan', 'taxi', 'sport'];
      const car = makeCar(scene, kinds[(rng() * kinds.length) | 0], x, z, heading,
        PAINTS[(rng() * PAINTS.length) | 0], 'traffic');
      car.cruise = 9 + rng() * 4;
      car.dirSign = dirSign;
      car.onX = onX;
      this.cars.push(car);
    }
  }

  update(dt, blockers) {
    for (const car of this.cars) {
      if (car.role !== 'traffic') continue;
      // pick a target far ahead in the travel direction; at an
      // intersection, sometimes swing onto the crossing road.
      const ahead = 26;
      let tx = car.pos.x, tz = car.pos.z;
      if (car.onX) tx += car.dirSign * ahead; else tz += car.dirSign * ahead;
      // slow for anything ahead (player car, other traffic, cops)
      let blocked = false;
      for (const b of blockers) {
        if (b === car) continue;
        const p = b.pos || b;
        const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
        const fwd = car.onX ? dx * car.dirSign : dz * car.dirSign;
        const lat = car.onX ? Math.abs(dz) : Math.abs(dx);
        if (fwd > 0 && fwd < 10 && lat < 2.4) { blocked = true; break; }
      }
      const nearCross = ROADS.some((r) => Math.abs((car.onX ? car.pos.x : car.pos.z) - r) < 2.2);
      if (nearCross && Math.random() < 0.006) {
        // swing onto the crossing road in a random direction; the
        // lane-gluing below settles the car into its new lane
        car.onX = !car.onX;
        car.dirSign = Math.random() < 0.5 ? 1 : -1;
      }
      steerToward(car, tx, tz, dt, this.colliders, blocked ? 0 : car.cruise);
      // keep the car glued to its lane axis so drift never compounds
      if (car.onX) car.pos.z += ((Math.round(car.pos.z / 52) * 52) + (car.dirSign > 0 ? 3.5 : -3.5) - car.pos.z) * Math.min(1, dt * 0.6);
      else car.pos.x += ((Math.round(car.pos.x / 52) * 52) + (car.dirSign > 0 ? -3.5 : 3.5) - car.pos.x) * Math.min(1, dt * 0.6);
      // wrap at the shore / edges instead of leaving the world
      if (car.pos.x > 205) car.pos.x = -205; if (car.pos.x < -205) car.pos.x = 205;
      if (car.pos.z > 205) car.pos.z = -205; if (car.pos.z < -205) car.pos.z = 205;
    }
  }

  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const car of this.cars) {
      const d = car.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }
}
