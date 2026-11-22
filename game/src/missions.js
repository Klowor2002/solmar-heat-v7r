// missions.js — the Neon Run story: ten jobs, plus the side economy.
//
// A MissionDirector owns the objective at all times. Story jobs run
// as step lists (reach / steal / kill / ram / checkpoints / escape)
// against door points from city.js — never building centres. Side
// work (taxi fares, courier runs, a street race, Chop Shop fencing)
// fills the gaps between story starts, so the city always offers a
// way to earn. Failing a timed step restarts the current job, never
// the whole story.

import * as THREE from 'three';
import { steerToward } from './vehicles.js';

export const TOKEN_SPOTS = [
  { x: 26, z: -2 }, { x: -49, z: -130 }, { x: 101, z: 78 }, { x: -104, z: 49 },
  { x: 156, z: 130 }, { x: -156, z: -49 }, { x: 49, z: 156 }, { x: 130, z: -130 },
  { x: -2, z: 52 }, { x: 78, z: -101 }, { x: 205, z: -40 }, { x: -78, z: 101 },
];

const V3 = (x, z) => new THREE.Vector3(x, 0, z);

// The harbour loop, shared by the Harbour Heat story race and the
// pier time trial — one course, so a time set in one means the
// same thing in the other.
const HARBOUR_LOOP = [[156, 52], [104, 104], [52, 52], [52, 0], [104, -52], [156, -104]];

// What the Chop Shop pays per kind. Kinds it will not touch at all
// are worth the generic fallback at the call site, same as kinds
// it has never heard of.
const FENCE_VALUES = { sport: 300, sedan: 150, hatch: 110, limo: 420, taxi: 130, van: 350, cop: 0 };

export class Director {
  constructor(game) {
    this.game = game;
    this.phase = 'idle';            // idle | to-start | steps | done
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.step = null;
    this.stepTime = 0;
    this.missionCars = [];
    this.missionPeds = [];
    this.sideJob = null;            // active side job record
    this.sideOffers = [];           // live side-job markers
    this.checkpoints = null;
    this.race = null;
    this.van = null;
    this.vanHits = 0;
    this.offerCd = 0;
  }

  get state() { return this.game.state; }
  get L() { return this.game.landmarks; }

  // ------------------------------------------------------------ story
  missions() {
    const L = this.L;
    return [
      { title: 'First Wheels', from: 'Mona', start: L.safehouse.door, reward: 150,
        intro: 'Mona left a Comet running at the Vista Hotel kerb. Take it, bring it home.',
        steps: [
          { kind: 'reach', at: L.hotel.door, r: 7, label: 'Reach the Vista Hotel kerb' },
          { kind: 'steal', spawn: ['sport', -14, 96, Math.PI / 2, 0xc23b4e], label: 'Steal the Comet GT' },
          { kind: 'deliver', at: L.garage.door, r: 8, label: "Bring the Comet to Mona's Garage" },
        ] },
      { title: 'Package Deal', from: 'Mona', start: L.garage.door, reward: 220,
        intro: 'A parcel waits at the pier. The Bank wants it before the tide turns.',
        steps: [
          { kind: 'reach', at: L.pier.door, r: 9, label: 'Pick up the parcel at the pier', crime: 1 },
          { kind: 'reach', at: L.bank.door, r: 8, time: 150, label: 'Deliver to the Bank of Solmar' },
        ] },
      { title: 'Alley Cats', from: 'Mona', start: L.garage.door, reward: 300,
        intro: 'Vultures are squatting in the alley off 5th. Clear them out.',
        steps: [
          { kind: 'reach', at: L.alley.door, r: 9, label: 'Enter the alley off 5th' },
          { kind: 'kill', at: L.alley.pos, count: 4, label: 'Clear the Vultures' },
        ] },
      { title: 'Hot Metal', from: 'Felix', start: L.bank.door, reward: 380,
        intro: 'A collector Comet sits unwatched downtown. The Chop Shop pays cash.',
        steps: [
          { kind: 'steal', spawn: ['sport', 49, -30, 0, 0x2e6fd8], label: 'Steal the collector Comet', crime: 2 },
          { kind: 'deliver', at: L.chopshop.door, r: 9, label: 'Fence it at the Chop Shop' },
        ] },
      { title: 'Neon Run', from: 'Felix', start: L.tower.door, reward: 450,
        intro: 'Seven lights, one tank of nerve. Run the Neon Run before the clock dies.',
        steps: [
          { kind: 'checkpoints', points: [[52, -52], [104, -104], [156, -52], [104, 52], [52, 104], [0, 52], [-52, 0]],
            time: 165, label: 'Run the Neon Run checkpoints' },
        ] },
      { title: 'Armoured Van', from: 'Mona', start: L.chopshop.door, reward: 600,
        intro: 'A bank van does a slow loop with a weak rear door. Ram it open.',
        steps: [
          { kind: 'ram', hits: 3, label: 'Ram the armoured van (0/3)' },
          { kind: 'reachDyn', r: 6, onFoot: true, label: 'Grab the cash from the van' },
          { kind: 'loseCops', label: 'Lose the heat' },
          { kind: 'reach', at: L.safehouse.door, r: 8, label: 'Lie low at the Safehouse' },
        ] },
      { title: 'Fare Play', from: 'Mona', start: L.garage.door, reward: 260,
        intro: 'A hotel guest with deep pockets needs a ride. Any wheels will do.',
        steps: [
          { kind: 'pickup', at: L.tower.door, label: 'Pick up the guest at Solmar Tower' },
          { kind: 'reach', at: L.hotel.door, r: 9, label: 'Drop her at the Vista Hotel' },
        ] },
      { title: 'Harbour Heat', from: 'Felix', start: L.pier.door, reward: 500,
        intro: 'Rico, a rival crew runs the harbour loop at dusk. Beat their car home.',
        steps: [
          { kind: 'race', points: HARBOUR_LOOP,
            rivalPace: 15.2, label: 'Win the harbour loop' },
        ] },
      { title: 'High Roller', from: 'Felix', start: L.tower.door, reward: 700,
        intro: 'The Vista limo idles at the Tower. Felix wants it — the heat will want you.',
        steps: [
          { kind: 'steal', spawn: ['limo', 38, -8, Math.PI, 0x14151f], label: 'Steal the Vista Limo', setWanted: 3 },
          { kind: 'deliver', at: L.chopshop.door, r: 9, label: 'Deliver the limo to the Chop Shop' },
        ] },
      { title: 'Last Light', from: 'Mona', start: L.safehouse.door, reward: 1000,
        intro: 'The Vultures are taking the pier tonight. End it, then come home.',
        steps: [
          { kind: 'reach', at: L.pier.door, r: 10, label: 'Reach the pier' },
          { kind: 'kill', at: V3(232, 0), count: 5, label: 'Drop the Vulture crew' },
          { kind: 'reach', at: L.safehouse.door, r: 9, label: 'Make it home to the Safehouse' },
        ] },
    ];
  }

  startStory(index) {
    this.cleanupMission();
    this.missionIndex = index;
    const m = this.missions()[index];
    if (!m) { this.phase = 'done'; return; }
    this.phase = 'to-start';
    this.refreshSideOffers();
    this.game.toast(m.title, `${m.from}: reach the gold beam to start`);
  }

  beginMission() {
    const m = this.missions()[this.missionIndex];
    this.phase = 'steps';
    this.stepIndex = 0;
    this.sideJob = null;
    this.sideOffers = [];
    this.game.toast(m.title, m.intro);
    this.enterStep();
  }

  enterStep() {
    const m = this.missions()[this.missionIndex];
    const step = m.steps[this.stepIndex];
    this.step = step;
    this.stepTime = step.time || 0;
    const g = this.game;
    if (step.kind === 'steal') {
      const [kind, x, z, heading, color] = step.spawn;
      const car = g.spawnCar(kind, x, z, heading, color, 'mission');
      car.missionTarget = true;
      this.missionCars.push(car);
      step.carId = car.id;
    }
    if (step.kind === 'kill') {
      const gang = g.spawnGang(step.at.x, step.at.z, step.count);
      this.missionPeds.push(...gang);
      step.remaining = step.count;
    }
    if (step.kind === 'checkpoints' || step.kind === 'race') {
      this.checkpoints = { points: step.points.map(([x, z]) => V3(x, z)), idx: 0 };
      if (step.kind === 'race') {
        const rival = g.spawnCar('sport', step.points[0][0], step.points[0][1], 0, 0x35b06f, 'rival');
        this.missionCars.push(rival);
        this.race = { rival, idx: 0, pace: step.rivalPace };
      }
    }
    if (step.kind === 'ram') {
      const van = g.spawnCar('van', 104, 104, 0, 0x9aa2b5, 'van');
      van.armoured = true;
      this.missionCars.push(van);
      this.van = van;
      this.vanRoute = { points: [[104, 104], [104, -104], [-104, -104], [-104, 104]].map(([x, z]) => V3(x, z)), idx: 1 };
      this.vanHits = 0;
    }
    if (step.kind === 'pickup') {
      const ped = g.spawnFarePed(step.at.x + 2, step.at.z + 1);
      this.missionPeds.push(ped);
      step.pedId = ped.id;
    }
  }

  completeStep() {
    const g = this.game;
    this.stepIndex += 1;
    const m = this.missions()[this.missionIndex];
    if (this.stepIndex >= m.steps.length) {
      g.addMoney(m.reward, 'job complete');
      g.audio.sting(true);
      g.toast('JOB COMPLETE', `${m.title} — $${m.reward}`);
      this.state.missionIndex = this.missionIndex + 1;
      if (this.missionIndex + 1 >= this.missions().length) {
        this.state.storyDone = true;
        g.toast('STORY COMPLETE', 'Neon Run is yours. Side work and tokens remain.');
        g.banner('NEON RUN COMPLETE', 'The city is yours, Rico. Keep earning.', 4);
      }
      g.saveGame();
      this.startStory(this.missionIndex + 1);
    } else {
      g.audio.blip(980, 0.1, 0.1);
      this.enterStep();
    }
  }

  failStep(reason) {
    const g = this.game;
    g.toast('JOB FAILED', reason + ' — restarting the job');
    g.audio.sting(false);
    this.cleanupMission();
    this.phase = 'steps';
    this.stepIndex = 0;
    this.enterStep();
  }

  cleanupMission() {
    const g = this.game;
    for (const car of this.missionCars) if (car.role !== 'player') g.removeCar(car);
    for (const ped of this.missionPeds) if (!ped.dead) g.removePed(ped);
    this.missionCars = [];
    this.missionPeds = [];
    this.checkpoints = null;
    this.race = null;
    this.van = null;
  }

  // ------------------------------------------------------------ hooks
  onEnterCar(car) {
    if (this.phase !== 'steps' || !this.step) return;
    if (this.step.kind === 'steal' && car.id === this.step.carId) {
      car.stolen = true;
      if (this.step.setWanted) this.game.police.wanted = Math.max(this.game.police.wanted, this.step.setWanted);
      if (this.step.crime) this.game.police.crime(this.step.crime);
      this.completeStep();
    }
  }

  onKill(ped) {
    // only the job's own targets count — a bystander or a cop must
    // never advance a clear-out step
    if (this.phase === 'steps' && this.step?.kind === 'kill' && this.missionPeds.includes(ped)) {
      this.step.remaining -= 1;
      if (this.step.remaining <= 0) this.completeStep();
    }
  }

  onRam(targetCar, byPlayer) {
    if (!byPlayer || this.phase !== 'steps' || this.step?.kind !== 'ram') return;
    if (this.van && targetCar === this.van) {
      this.vanHits += 1;
      this.game.effects.shake(0.5);
      if (this.vanHits >= this.step.hits) {
        this.van.disabled = true;
        this.game.toast('VAN CRACKED', 'Grab the cash — on foot, quick');
        this.completeStep();
      }
    }
  }

  // ------------------------------------------------------------ side jobs
  refreshSideOffers() {
    if (this.phase !== 'to-start' && this.phase !== 'done') return;
    const g = this.game, L = this.L;
    const spots = [L.tower, L.bank, L.hotel, L.garage, L.pier, L.chopshop];
    const pick = () => spots[(Math.random() * spots.length) | 0];
    this.sideOffers = [];
    const a = pick(); let b = pick(); if (b === a) b = pick();
    this.sideOffers.push({ kind: 'taxi', at: a.door, label: `Fare waiting at ${a.name}`, dest: b });
    const c = pick(); let d = pick(); if (d === c) d = pick();
    this.sideOffers.push({ kind: 'courier', at: c.door, label: `Parcel at ${c.name}`, dest: d });
    this.sideOffers.push({ kind: 'race', at: L.pier.door, label: 'Harbour loop time trial', dest: null });
  }

  startSideJob(offer) {
    const g = this.game;
    this.sideOffers = [];
    if (offer.kind === 'taxi') {
      const ped = g.spawnFarePed(offer.at.x + 1.5, offer.at.z + 1);
      this.sideJob = { kind: 'taxi', phase: 'pickup', ped, dest: offer.dest, pay: 70 + ((Math.random() * 70) | 0) };
      g.toast('TAXI FARE', `Pick up the fare — bound for ${offer.dest.name}`);
    } else if (offer.kind === 'courier') {
      this.sideJob = { kind: 'courier', phase: 'pickup', at: offer.at, dest: offer.dest, pay: 90 + ((Math.random() * 70) | 0), time: 120 };
      g.toast('COURIER RUN', `Parcel waits at the marker — deliver to ${offer.dest.name}`);
    } else if (offer.kind === 'race') {
      this.sideJob = { kind: 'race', phase: 'run', pay: 200, time: 125,
        points: HARBOUR_LOOP.map(([x, z]) => V3(x, z)), idx: 0 };
      g.toast('TIME TRIAL', 'Beat 2:05 around the harbour loop');
    }
  }

  finishSideJob() {
    const g = this.game, job = this.sideJob;
    g.addMoney(job.pay, 'side job');
    g.audio.cash();
    if (job.kind === 'taxi') this.state.fares += 1;
    g.toast('PAID', `$${job.pay} — nice work`);
    this.sideJob = null;
    g.saveGame();
    if (this.phase === 'to-start' || this.phase === 'done') this.refreshSideOffers();
  }

  failSideJob(reason) {
    this.game.toast('JOB LOST', reason);
    if (this.sideJob?.ped) this.game.removePed(this.sideJob.ped);
    this.sideJob = null;
    if (this.phase === 'to-start' || this.phase === 'done') this.refreshSideOffers();
  }

  // ------------------------------------------------------------ per-frame
  objective() {
    const g = this.game;
    if (this.sideJob) {
      const j = this.sideJob;
      if (j.kind === 'taxi') return j.phase === 'pickup'
        ? { title: 'TAXI', text: 'Pick up your fare (be in a car)', pos: j.ped.pos }
        : { title: 'TAXI', text: `Drop off at ${j.dest.name}`, pos: j.dest.door };
      if (j.kind === 'courier') return j.phase === 'pickup'
        ? { title: 'COURIER', text: 'Collect the parcel', pos: j.at }
        : { title: 'COURIER', text: `Deliver to ${j.dest.name} — ${Math.ceil(j.time)}s`, pos: j.dest.door };
      return { title: 'TIME TRIAL', text: `Checkpoint ${j.idx + 1}/${j.points.length} — ${Math.ceil(j.time)}s`, pos: j.points[j.idx] };
    }
    if (this.phase === 'to-start') {
      const m = this.missions()[this.missionIndex];
      return { title: `JOB ${this.missionIndex + 1} — ${m.title}`, text: `${m.from} is waiting. Reach the beam to start.`, pos: m.start };
    }
    if (this.phase === 'steps' && this.step) {
      let pos = this.step.at || null;
      let text = this.step.label;
      if (this.step.kind === 'steal') {
        const car = this.missionCars.find((c) => c.id === this.step.carId);
        pos = car ? car.pos : null;
      }
      if (this.step.kind === 'kill') pos = this.step.at;
      if (this.step.kind === 'ram') pos = this.van ? this.van.pos : null;
      if (this.step.kind === 'reachDyn') pos = this.van ? this.van.pos : null;
      if (this.step.kind === 'loseCops') { pos = null; text = `Lose the heat — break line of sight (${this.game.police.wanted}★)`; }
      if (this.checkpoints && (this.step.kind === 'checkpoints' || this.step.kind === 'race')) {
        pos = this.checkpoints.points[this.checkpoints.idx];
        text = `${this.step.label} — ${this.checkpoints.idx + 1}/${this.checkpoints.points.length}`;
      }
      if (this.stepTime > 0 && this.step.time) text += ` — ${Math.ceil(this.stepTime)}s`;
      return { title: `JOB ${this.missionIndex + 1} — ${this.missions()[this.missionIndex].title}`, text, pos };
    }
    if (this.phase === 'done') return { title: 'FREE ROAM', text: 'Story complete. Fares, fences, races and tokens still pay.', pos: null };
    return { title: '', text: '', pos: null };
  }

  update(dt, input) {
    const g = this.game;
    const pPos = g.playerPos();
    const pCar = g.playerCar();

    // fencing: a stolen car at the Chop Shop door sells on interact
    this.fencePrompt = false;
    if (pCar && pCar.stolen && pCar.pos.distanceTo(this.L.chopshop.door) < 9) {
      this.fencePrompt = true;
      if (input.fence) {
        const value = FENCE_VALUES[pCar.kind] || 120;
        if (value > 0) {
          g.exitCar();
          g.removeCar(pCar);
          g.addMoney(value, 'fenced');
          this.state.fences += 1;
          g.toast('FENCED', `$${value} for the ${pCar.kind} — no questions asked`);
          g.audio.cash();
          g.saveGame();
          return;
        }
      }
    }

    // The story start is checked BEFORE side-job offers: the
    // harbour time trial is offered at the pier door, and two story
    // jobs also start at the pier — with offers first, those jobs
    // could never begin, the trial re-arming at the same door
    // forever. Side work still ambushes at every other door.
    if (this.phase === 'to-start' && !this.sideJob) {
      const m = this.missions()[this.missionIndex];
      if (m && pPos.distanceTo(m.start) < 7) { this.beginMission(); return; }
    }

    // side-job offers while between story jobs
    if ((this.phase === 'to-start' || this.phase === 'done') && !this.sideJob) {
      for (const offer of this.sideOffers) {
        if (pPos.distanceTo(offer.at) < 7) { this.startSideJob(offer); break; }
      }
    }
    if (this.sideJob) { this.updateSideJob(dt, pPos, pCar); return; }

    if (this.phase === 'to-start') return;
    if (this.phase !== 'steps' || !this.step) return;

    const step = this.step;
    if (step.time) {
      this.stepTime -= dt;
      if (this.stepTime <= 0) { this.failStep('Out of time'); return; }
    }

    switch (step.kind) {
      case 'reach':
      case 'deliver': {
        const needCar = step.kind === 'deliver';
        if (pPos.distanceTo(step.at) < step.r && (!needCar || pCar)) {
          if (step.crime) g.police.crime(step.crime);
          this.completeStep();
        }
        break;
      }
      case 'pickup': {
        if (pCar && pPos.distanceTo(step.at) < 9) {
          const ped = this.missionPeds.find((p) => p.id === step.pedId);
          if (ped) { g.removePed(ped); this.missionPeds = this.missionPeds.filter((p) => p !== ped); }
          g.toast('FARE ABOARD', 'Drive smooth — she tips for speed');
          this.completeStep();
        }
        break;
      }
      case 'checkpoints': {
        const cp = this.checkpoints.points[this.checkpoints.idx];
        if (pCar && pPos.distanceTo(cp) < 11) {
          this.checkpoints.idx += 1;
          g.audio.blip(1180, 0.08, 0.09);
          if (this.checkpoints.idx >= this.checkpoints.points.length) this.completeStep();
        }
        break;
      }
      case 'race': {
        // rival progress — paced through the cruise cap so the
        // player's car, not the clock, decides the race
        const r = this.race;
        const rp = this.checkpoints.points[r.idx];
        if (rp) {
          const { dist } = steerToward(r.rival, rp.x, rp.z, dt, g.colliders, r.pace);
          if (dist < 12) {
            r.idx += 1;
            if (r.idx >= this.checkpoints.points.length) { this.failStep('The rival crew got home first'); return; }
          }
        }
        const cp = this.checkpoints.points[this.checkpoints.idx];
        if (pCar && cp && pPos.distanceTo(cp) < 11) {
          this.checkpoints.idx += 1;
          g.audio.blip(1180, 0.08, 0.09);
          if (this.checkpoints.idx >= this.checkpoints.points.length) this.completeStep();
        }
        break;
      }
      case 'ram': {
        if (this.van && !this.van.disabled) {
          const target = this.vanRoute.points[this.vanRoute.idx];
          const { dist } = steerToward(this.van, target.x, target.z, dt, g.colliders, 10);
          if (dist < 10) this.vanRoute.idx = (this.vanRoute.idx + 1) % this.vanRoute.points.length;
        }
        break;
      }
      case 'reachDyn': {
        if (this.van && !pCar && pPos.distanceTo(this.van.pos) < step.r) {
          g.police.crime(2);
          g.toast('CASH GRABBED', 'Now lose the heat');
          this.completeStep();
        }
        break;
      }
      case 'loseCops': {
        if (g.police.wanted === 0) this.completeStep();
        break;
      }
      case 'kill': {
        // Authoritative recount, not just the gunplay hook: a
        // target run down by the player's own coasting car (or any
        // other damage path) is just as dead, and a step that only
        // counted bullet kills could stall with the whole crew
        // already down.
        const alive = this.missionPeds.filter((p) => !p.dead).length;
        step.remaining = alive;
        if (alive <= 0) this.completeStep();
        break;
      }
      default: break; // steal resolves through its hook
    }
  }

  updateSideJob(dt, pPos, pCar) {
    const g = this.game, j = this.sideJob;
    if (j.time) {
      j.time -= dt;
      if (j.time <= 0) { this.failSideJob('Out of time'); return; }
    }
    if (j.kind === 'taxi') {
      if (j.phase === 'pickup' && pCar && pPos.distanceTo(j.ped.pos) < 8) {
        g.removePed(j.ped);
        j.phase = 'dropoff';
        g.toast('FARE ABOARD', `Bound for ${j.dest.name}`);
      } else if (j.phase === 'dropoff' && pCar && pPos.distanceTo(j.dest.door) < 9) this.finishSideJob();
    } else if (j.kind === 'courier') {
      if (j.phase === 'pickup' && pPos.distanceTo(j.at) < 7) {
        j.phase = 'dropoff';
        g.audio.blip(1050, 0.09, 0.1);
        g.toast('PARCEL ABOARD', `Deliver to ${j.dest.name}`);
      } else if (j.phase === 'dropoff' && pPos.distanceTo(j.dest.door) < 8) this.finishSideJob();
    } else if (j.kind === 'race') {
      const cp = j.points[j.idx];
      if (pCar && cp && pPos.distanceTo(cp) < 11) {
        j.idx += 1;
        g.audio.blip(1180, 0.08, 0.09);
        if (j.idx >= j.points.length) this.finishSideJob();
      }
    }
  }
}
