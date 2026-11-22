// shots.js — staged scenes for the four hand-in screenshots.
//
// Each scene is posed, not played: actors are placed, the wanted
// level and HUD are set, and main.js freezes the world's logic
// (traffic and crowds still drift for life) while the camera holds.
// That is what makes the frames deterministic — seed 1 always
// composes the same cover.

import * as THREE from 'three';

export function stageShot(game, name) {
  const L = game.landmarks;
  const P = game.player;
  game.state.money = 5825;

  if (name === 'cover') {
    // Four-star chase down the central avenue: hero Comet fleeing
    // north, an interceptor glued to its tail, lightbar mid-flash.
    const hero = game.spawnCar('sport', 3.5, 26, Math.PI, 0xc23b4e, 'parked');
    hero.speed = 26;
    P.enterCar(hero);
    P.camYaw = Math.PI;
    const cop = game.spawnCar('cop', 3.2, 39, Math.PI, 0xffffff, 'parked');
    cop.speed = 27;
    const cop2 = game.spawnCar('cop', -3.4, 48, Math.PI, 0xffffff, 'parked');
    cop2.speed = 25;
    game.police.wanted = 4;
    return {
      // high chase cam behind the Comet: hero mid-frame, both
      // cruisers stacked between camera and quarry down the avenue
      camPos: new THREE.Vector3(hero.pos.x - 6, 7.5, hero.pos.z + 24),
      lookAt: new THREE.Vector3(hero.pos.x, 0.8, hero.pos.z - 4),
      hud: { wanted: 4, speed: 26, vehicleName: 'Comet GT', zone: 'CENTRAL AVENUE' },
      beam: null,
    };
  }

  if (name === 'street') {
    // On foot at Mona's Garage: the signed face, the neon strip, and
    // the gold job beam on the door — the game's whole loop in one
    // frame. Rico stands clear of the wall, on the kerb.
    const door = L.garage.door;
    P.spawnAt(door.x - 3.5, door.z + 6.5, Math.PI * 0.92);
    game.state.money = 415;
    return {
      camPos: new THREE.Vector3(door.x - 13, 3.4, door.z + 17),
      lookAt: new THREE.Vector3(door.x + 2, 3.2, door.z - 6),
      hud: { wanted: 0, speed: 0, vehicleName: '', zone: "MONA'S GARAGE" },
      beam: door,
      objective: { title: 'JOB 1 — FIRST WHEELS', text: 'Mona is waiting. Reach the beam to start.' },
    };
  }

  if (name === 'mission') {
    // Alley Cats, mid-shootout: Rico's pistol is up, four Vultures
    // are in the alley, health already dented — a fight, not a pose.
    const a = L.alley;
    // down the alley gap itself: Rico in the mouth, the crew spread
    // along the slot between the two slabs, walls framing both sides
    P.spawnAt(a.pos.x, -64, Math.PI);
    P.aiming = true;
    P.camYaw = Math.PI;
    P.health = 65;
    const gang = game.spawnGang(a.pos.x, -78, 4);
    gang[0].mesh.position.set(a.pos.x - 1.2, 0, -73);
    gang[1].mesh.position.set(a.pos.x + 1.3, 0, -77);
    gang[2].mesh.position.set(a.pos.x - 1.4, 0, -81);
    gang[3].mesh.position.set(a.pos.x + 1.1, 0, -85);
    for (const m of gang) m.state = 'combat';
    game.state.money = 670;
    return {
      camPos: new THREE.Vector3(a.pos.x - 1.5, 2.5, -55),
      lookAt: new THREE.Vector3(a.pos.x + 0.5, 1.2, -79),
      hud: { wanted: 1, speed: 0, vehicleName: '', zone: 'THE ALLEY OFF 5TH' },
      beam: null,
      objective: { title: 'JOB 3 — ALLEY CATS', text: 'Clear the Vultures' },
    };
  }

  // city: the whole grid from the air — tower crown in the
  // foreground, avenues running to the beach and the pier.
  P.spawnAt(0, 150, 0);
  game.state.money = 5825;
  return {
    camPos: new THREE.Vector3(-96, 88, 168),
    lookAt: new THREE.Vector3(60, 0, -60),
    hud: { wanted: 0, speed: 0, vehicleName: '', zone: 'SOLMAR CITY' },
    beam: null,
  };
}
