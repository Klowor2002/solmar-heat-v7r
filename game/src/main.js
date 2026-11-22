// main.js — Solmar Heat: Neon Run, the conductor.
//
// Builds the city, wires every system into one game facade, and
// runs the loop: input → player → traffic → police → combat →
// missions → effects → HUD. Also owns the title screen, the
// wasted/busted resets, car theft and collisions, and the staged
// screenshot mode (?shot=cover|street|mission|city&seed=1) that the
// hand-in's screenshots are captured from.

import * as THREE from 'three';
import { buildCity, collideCircle, ROADS } from './city.js';
import { makeCar, Traffic } from './vehicles.js';
import { Ped, spawnCrowd } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat, driveGang } from './combat.js';
import { Director, TOKEN_SPOTS } from './missions.js';
import { Effects, Tokens } from './effects.js';
import { Hud } from './hud.js';
import { AudioBench } from './audio.js';
import { loadSave, storeSave, wipeSave } from './save.js';
import { stageShot } from './shots.js';

// deterministic city dressing from the seed
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotName = params.get('shot');
const rng = mulberry32(seed * 7919 + 13);

// ------------------------------------------------------------ state
const state = {
  money: 250, missionIndex: 0, storyDone: false,
  tokens: new Set(), earned: 0, fences: 0, fares: 0,
  clockMinutes: 18 * 60 + 5, errors: [], started: false, over: false,
};
window.addEventListener('error', (e) => { state.errors.push(String(e.message || e.error)); });

// ------------------------------------------------------------ three
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.domElement.className = 'webgl';
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(0, 6, 14);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------ world
const { colliders, landmarks, waterMat } = buildCity(scene, rng);
const effects = new Effects(scene);
const audio = new AudioBench();
const hud = new Hud();
const player = new Player(scene);
const police = new Police(scene, colliders);
const traffic = new Traffic(scene, rng, colliders, 15);
const crowd = spawnCrowd(scene, rng, 26);
const tokens = new Tokens(scene, TOKEN_SPOTS);
player.spawnAt(landmarks.safehouse.door.x + 2, landmarks.safehouse.door.z - 2, Math.PI);

const cars = [];       // every non-traffic car (parked, mission, cop…)
const extraPeds = [];  // fare passengers and other one-off people
let gang = [];         // the active shootout group, if any

const combat = new Combat({
  effects, audio, colliders,
  onPlayerHit: (dmg) => {
    player.health -= dmg;
    effects.shake(0.25);
    if (player.health <= 0 && !state.over) doWasted();
  },
  onKill: (ped) => {
    police.crime(1);
    director.onKill(ped);
    effects.burst(ped.pos, 10, 0xffd94d, 2.5, 2.5);
  },
  onShotFired: () => {
    police.crime(1);
    for (const p of crowd) if (p.pos.distanceTo(player.pos) < 16) p.scare(player.pos);
  },
});

// ------------------------------------------------------------ facade
const game = {
  scene, state, hud, effects, audio, police, player, colliders, landmarks,
  traffic, cars,
  errors: state.errors,
  playerPos: () => player.pos,
  playerCar: () => player.car,
  playerInCar: () => !!player.car,
  spawnCar(kind, x, z, heading, color, role) {
    const car = makeCar(scene, kind, x, z, heading, color, role);
    cars.push(car);
    return car;
  },
  removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car); if (i >= 0) cars.splice(i, 1);
    const j = police.cars.indexOf(car); if (j >= 0) police.cars.splice(j, 1);
  },
  spawnGang(x, z, count) {
    gang = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const m = new Ped(scene, x + Math.sin(a) * (3 + i), z + Math.cos(a) * (3 + i),
        { gang: true, shirt: 0x3a3f4a });
      // a spawn ring can land inside a wall (the alley slabs, say) —
      // push every member out into open ground before they act
      collideCircle(m.pos, 0.6, colliders);
      m.state = 'stand';
      gang.push(m);
      extraPeds.push(m);
    }
    return gang;
  },
  spawnFarePed(x, z) {
    const ped = new Ped(scene, x, z, { shirt: 0xe8e8f0 });
    ped.fare = true;
    ped.state = 'stand';
    extraPeds.push(ped);
    return ped;
  },
  removePed(ped) {
    scene.remove(ped.mesh);
    const i = extraPeds.indexOf(ped); if (i >= 0) extraPeds.splice(i, 1);
    gang = gang.filter((m) => m !== ped);
  },
  addMoney(n) { state.money += n; if (n > 0) state.earned += n; },
  toast: (t, s) => hud.notify(t, s),
  banner(title, sub, secs = 3) {
    hud.banner(title, sub, true);
    setTimeout(() => hud.banner('', '', false), secs * 1000);
  },
  exitCar: () => player.exitCar(colliders),
  saveGame() {
    storeSave({
      money: state.money, missionIndex: state.missionIndex, storyDone: state.storyDone,
      tokens: [...state.tokens], earned: state.earned, fences: state.fences, fares: state.fares,
    });
  },
};
const director = new Director(game);
game.director = director;
window.SOLMAR = game;

// ------------------------------------------------------------ input
const keys = new Set();
let mouseDX = 0, mouseDY = 0, mouseDown = false, interactEdge = false, fenceEdge = false;
let pointerLocked = false;
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE' && !e.repeat) interactEdge = true;
  if (e.code === 'KeyF' && !e.repeat) fenceEdge = true;
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => {
  if (state.started && !shotName && !pointerLocked) {
    // Chrome returns a promise here and rejects if the lock was
    // released a moment ago — that is not a game error
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerElement === renderer.domElement;
});
addEventListener('mousemove', (e) => {
  if (pointerLocked) { mouseDX += e.movementX; mouseDY += e.movementY; }
});
addEventListener('mousedown', (e) => { if (state.started && !shotName) mouseDown = true; });
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------ flow
function startRun(fromSave) {
  audio.unlock();
  if (fromSave) {
    const s = loadSave();
    if (s) {
      state.money = s.money; state.missionIndex = s.missionIndex;
      state.storyDone = s.storyDone; state.tokens = new Set(s.tokens);
      state.earned = s.earned; state.fences = s.fences; state.fares = s.fares;
    }
  } else {
    wipeSave();
    state.money = 250; state.missionIndex = 0; state.storyDone = false;
    state.tokens = new Set(); state.earned = 0; state.fences = 0; state.fares = 0;
  }
  player.health = 100;
  player.spawnAt(landmarks.safehouse.door.x + 2, landmarks.safehouse.door.z - 2, Math.PI);
  document.getElementById('title').style.display = 'none';
  hud.show();
  state.started = true;
  state.over = false;
  director.startStory(state.storyDone ? 99 : state.missionIndex);
  if (state.storyDone) director.phase = 'done';
  hud.notify('SOLMAR CITY', state.storyDone ? 'Free roam — fares, fences and tokens pay' : 'Follow the gold beam');
}

function doWasted() {
  state.over = true;
  const fine = Math.min(state.money, 150);
  state.money -= fine;
  game.banner('WASTED', `The city spits you back out — $${fine} in hospital bills`, 3.2);
  audio.sting(false);
  setTimeout(() => resetAfterFall(), 1800);
}
function doBusted() {
  state.over = true;
  const fine = Math.min(state.money, 100 + police.wanted * 60);
  state.money -= fine;
  game.banner('BUSTED', `The SCPD takes $${fine} and your afternoon`, 3.2);
  audio.sting(false);
  setTimeout(() => resetAfterFall(), 1800);
}
function resetAfterFall() {
  if (player.car) player.exitCar(colliders);
  police.clear();
  player.health = 100;
  player.spawnAt(landmarks.safehouse.door.x + 2, landmarks.safehouse.door.z - 2, Math.PI);
  state.over = false;
  game.saveGame();
}

document.getElementById('btn-new').addEventListener('click', () => startRun(false));
document.getElementById('btn-continue').addEventListener('click', () => startRun(true));
document.getElementById('btn-how').addEventListener('click', () => {
  const el = document.getElementById('how-text');
  el.style.display = el.style.display === 'none' ? '' : 'none';
});
if (loadSave()) document.getElementById('btn-continue').style.display = '';

// ------------------------------------------------------------ shot mode
let shotSpec = null;
let shotFrames = 0;
if (shotName) {
  document.getElementById('title').style.display = 'none';
  hud.show();
  state.started = true;
  shotSpec = stageShot(game, shotName);
  if (shotSpec.objective) hud.setObjective(shotSpec.objective.title, shotSpec.objective.text);
  if (shotSpec.beam) effects.setBeam(shotSpec.beam);
}

// ------------------------------------------------------------ helpers
function zoneName(pos) {
  if (pos.x > 214) return 'SOLMAR PIER';
  if (pos.x > 182) return 'THE SHORE';
  let best = null, bd = 34;
  for (const k of Object.keys(landmarks)) {
    const d = landmarks[k].pos.distanceTo(pos);
    if (d < bd) { bd = d; best = landmarks[k].name; }
  }
  return best ? best.toUpperCase() : 'SOLMAR CITY';
}

function nearestEnterableCar() {
  let best = null, bd = 3.6;
  const all = [...traffic.cars, ...cars];
  for (const car of all) {
    if (car.role === 'player') continue;
    const d = car.pos.distanceTo(player.pos);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function carCollisions(dt) {
  const pc = player.car;
  if (!pc) return;
  const all = [...traffic.cars, ...cars, ...police.cars];
  for (const other of all) {
    if (other === pc) continue;
    const dx = pc.pos.x - other.pos.x, dz = pc.pos.z - other.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 16 && d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = (4 - d) / 2;
      const nx = dx / d, nz = dz / d;
      pc.pos.x += nx * push; pc.pos.z += nz * push;
      if (other.role === 'traffic' || other.role === 'parked') {
        other.pos.x -= nx * push * 0.5; other.pos.z -= nz * push * 0.5;
      }
      const closing = Math.abs(pc.speed) + Math.abs(other.speed || 0);
      if (closing > 7) {
        effects.burst(pc.pos, 8, 0xffc46b, 3, 2.5);
        effects.shake(0.35);
        audio.blip(120, 0.15, 0.16, 'sawtooth');
        pc.health -= 2;
        if (other.armoured) director.onRam(other, true);
        if (other.role === 'traffic') police.crime(1);
      }
    }
  }
  // pedestrians vs the player's car
  if (Math.abs(pc.speed) > 3.5) {
    for (const p of [...crowd, ...extraPeds]) {
      if (p.dead || p.fare) continue;
      if (p.pos.distanceTo(pc.pos) < 1.9) {
        p.hurt(999);
        police.crime(2);
        effects.burst(p.pos, 8, 0xff5d5d, 2.5, 2);
        hud.notify('PEDESTRIAN DOWN', 'The city saw that');
      } else if (p.pos.distanceTo(pc.pos) < 6) p.scare(pc.pos);
    }
  }
}

// ------------------------------------------------------------ loop
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  // clamp dt into [0, 50ms]: a stalled first frame must never run
  // the world backwards or teleport anyone
  const dt = Math.min(0.05, Math.max(0, clock.getDelta()));
  elapsed += dt;
  state.clockMinutes += dt * 2;
  waterMat.emissive.setHSL(0.58, 0.65, 0.10 + Math.sin(elapsed * 0.8) * 0.03);

  if (shotName) {
    // frozen logic, living picture: traffic and crowds drift, the
    // staged actors hold their pose, lightbars flash
    traffic.update(dt, []);
    const ctx = { playerPos: player.pos, roads: ROADS, colliders };
    for (const p of crowd) p.update(dt, ctx);
    effects.update(dt, elapsed);
    for (const car of cars) {
      const bar = car.mesh.getObjectByName('lightbar');
      if (bar) {
        const on = Math.sin(elapsed * 7) > 0;
        bar.children[0].material.emissive.setHex(on ? 0xff2244 : 0x330008);
        bar.children[1].material.emissive.setHex(on ? 0x330088 : 0x2266ff);
      }
    }
    camera.position.copy(shotSpec.camPos);
    camera.lookAt(shotSpec.lookAt);
    const h = shotSpec.hud;
    hud.update(dt, {
      money: state.money, health: player.health, wanted: h.wanted, clockMinutes: state.clockMinutes,
      speed: h.speed / 2.24, vehicleName: h.vehicleName, zone: h.zone, aiming: shotName === 'mission',
      busted01: 0, playerPos: player.pos, playerHeading: player.heading,
      cops: [], tokens: [], objectivePos: shotSpec.beam,
    });
    renderer.render(scene, camera);
    shotFrames += 1;
    if (shotFrames === 50) document.title = `SHOT-READY errors=${state.errors.length}`;
    return;
  }

  if (!state.started) {
    // title screen: slow orbit over the city
    const t = elapsed * 0.05;
    camera.position.set(Math.sin(t) * 120, 42, Math.cos(t) * 120);
    camera.lookAt(20, 0, -20);
    renderer.render(scene, camera);
    return;
  }

  if (!state.over) {
    // --- player + shooting
    player.aiming = !player.car && (mouseDown || keys.has('KeyQ'));
    const crashed = player.update(dt, keys, colliders, mouseDX, mouseDY, pointerLocked);
    if (crashed) { effects.shake(0.4); police.crime(0); }
    mouseDX = 0; mouseDY = 0;
    combat.update(dt);
    if (mouseDown && !player.car && state.started) {
      const origin = new THREE.Vector3(player.pos.x, 1.45, player.pos.z);
      const dir = player.aimDirection();
      const targets = [...gang.filter((m) => !m.dead), ...police.cops.filter((c) => !c.dead)];
      combat.playerShoot(origin, dir, targets);
    }

    // --- enter / exit cars (lesson: taking a car sets stolen, always)
    if (interactEdge) {
      if (player.car) {
        player.exitCar(colliders);
      } else {
        const car = nearestEnterableCar();
        if (car) {
          const wasRole = car.role;
          player.enterCar(car);
          if (!car.stolen && !car.everOwned) {
            car.stolen = true;
            if (!car.missionTarget && wasRole !== 'player') police.crime(1);
          }
          car.everOwned = true;
          audio.blip(520, 0.06, 0.07);
          director.onEnterCar(car);
        }
      }
    }

    // --- world systems
    const blockers = [...traffic.cars, ...cars, ...police.cars, ...(player.car ? [player.car] : [])];
    traffic.update(dt, blockers);
    const pedCtx = { playerPos: player.pos, roads: ROADS, colliders };
    for (const p of crowd) p.update(dt, pedCtx);
    for (const p of extraPeds) if (!p.dead && p.state !== 'combat') p.update(dt, pedCtx);
    if (gang.length && gang.some((m) => !m.dead)) {
      driveGang(dt, gang, { playerPos: player.pos, playerInCar: !!player.car, time: elapsed, combat, colliders });
      if (gang.every((m) => m.dead)) gang = [];
    }
    carCollisions(dt);

    const policeResult = police.update(dt, {
      playerPos: player.pos, playerSpeed: player.speed, playerInCar: !!player.car,
      playerCar: player.car, colliders,
      onCopShoot: (cop) => combat.npcShoot(cop, player.pos, !!player.car),
      onRamPlayer: () => { effects.shake(0.3); player.health -= 1.5; },
      onWantedDrop: (w) => { if (w === 0) hud.notify('HEAT LOST', 'The city forgets — for now'); },
    });
    if (policeResult.busted && !state.over) doBusted();

    director.update(dt, { fence: fenceEdge });
    tokens.update(dt, elapsed, player.pos, state.tokens, (idx, pos) => {
      state.tokens.add(idx);
      game.addMoney(25);
      audio.cash();
      effects.burst(pos, 12, 0xffd94d, 2.5, 3);
      hud.notify('GOLD TOKEN', `${state.tokens.size}/12 — +$25`);
      game.saveGame();
    });

    // health creeps back when the city leaves you alone
    if (player.health > 0 && player.health < 100 && policeResult.nearestCop > 30) {
      player.health = Math.min(100, player.health + dt * 1.6);
    }
    audio.update(dt, Math.abs(player.speed) / 30, !!player.car, policeResult.nearestCop);
  }

  interactEdge = false;
  fenceEdge = false;

  // --- camera + HUD
  if (!state.over) player.applyCamera(camera);
  effects.applyShake(camera);
  effects.update(dt, elapsed);
  const obj = director.objective();
  effects.setBeam(obj.pos);
  hud.setObjective(obj.title, obj.text);
  hud.setPrompt(
    director.fencePrompt ? '<b>F</b>Sell the stolen car at the Chop Shop'
      : (!player.car && nearestEnterableCar() ? '<b>E</b>Steal / drive car'
        : (player.car ? '<b>E</b>Exit car' : '')));
  hud.update(dt, {
    money: state.money, health: player.health, wanted: police.wanted,
    clockMinutes: state.clockMinutes, speed: player.speed,
    vehicleName: player.car ? player.car.kind.toUpperCase() : '',
    zone: zoneName(player.pos), aiming: player.aiming && !player.car,
    busted01: police.busted01, playerPos: player.pos,
    playerHeading: player.car ? player.car.heading : player.heading,
    cops: [...police.cars, ...police.cops].map((c) => c.pos),
    tokens: TOKEN_SPOTS.filter((_, i) => !state.tokens.has(i)),
    objectivePos: obj.pos,
  });
  renderer.render(scene, camera);
}
frame();
