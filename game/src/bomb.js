// The bomb: one device, one carrier, two sites. States: carried (by the player or a
// Falcon bot), dropped (a Falcon bot walks over to pick it up), planted (a 40 s fuse
// with a beep that quickens), defused, exploded. Planting takes 4 s holding E in a
// site; a Viper standing at the planted bomb defuses in 5 s. rounds.js owns the
// consequences; this module owns the device, its mesh and its timers.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';
import { audio } from './audio.js';

export const PLANT_TIME = 4;
export const BOMB_TIME = 40;

export function createBomb(scene) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.5 }),
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 0.08),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.4 }),
  );
  light.position.set(0.1, 0.12, 0);
  mesh.add(body, light);
  mesh.visible = false;
  scene.add(mesh);

  const state = {
    status: 'carried', // carried | dropped | planted | defused | exploded
    carrier: 'player', // 'player' | bot object | null
    site: null,
    position: new THREE.Vector3(),
    plantProgress: 0,
    defuseProgress: 0,
    fuse: 0,
    beepTimer: 0,
  };

  function resetRound(carrier) {
    state.status = 'carried';
    state.carrier = carrier;
    state.site = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.fuse = 0;
    state.beepTimer = 0;
    mesh.visible = false;
  }

  function siteAt(position) {
    for (const key of ['A', 'B']) {
      const site = SITES[key];
      if (Math.hypot(site.x - position.x, site.z - position.z) < site.r) return key;
    }
    return null;
  }

  // Player holds E inside a site: returns the site key while planting, else null.
  function playerPlantTick(dt, playerPosition, holding) {
    if (state.status !== 'carried' || state.carrier !== 'player') return null;
    const site = siteAt(playerPosition);
    if (!site || !holding) {
      state.plantProgress = 0;
      return null;
    }
    state.plantProgress += dt;
    if (state.plantProgress >= PLANT_TIME) {
      state.status = 'planted';
      state.site = site;
      state.position.set(SITES[site].x, 0.15, SITES[site].z);
      state.fuse = BOMB_TIME;
      state.plantProgress = 0;
      mesh.position.copy(state.position);
      mesh.visible = true;
      audio.plant();
      return site;
    }
    return null;
  }

  function plantByBot(site) {
    if (state.status !== 'carried') return;
    state.status = 'planted';
    state.site = site;
    state.position.set(SITES[site].x, 0.15, SITES[site].z);
    state.fuse = BOMB_TIME;
    mesh.position.copy(state.position);
    mesh.visible = true;
    audio.plant();
  }

  function dropAt(position) {
    if (state.status !== 'carried') return;
    state.status = 'dropped';
    state.carrier = null;
    state.position.set(position.x, 0.15, position.z);
    mesh.position.copy(state.position);
    mesh.visible = true;
  }

  function pickUp(bot) {
    if (state.status !== 'dropped') return false;
    state.status = 'carried';
    state.carrier = bot;
    bot.carriesBomb = true;
    mesh.visible = false;
    return true;
  }

  function step(dt) {
    if (state.status !== 'planted') return 'planted';
    state.fuse -= dt;
    state.beepTimer -= dt;
    if (state.beepTimer <= 0) {
      audio.beep(state.fuse < 10);
      state.beepTimer = state.fuse < 10 ? 0.5 : 1;
    }
    if (state.fuse <= 0) {
      state.status = 'exploded';
      mesh.visible = false;
      audio.explosion();
      return 'exploded';
    }
    return 'planted';
  }

  return {
    state,
    mesh,
    resetRound,
    siteAt,
    playerPlantTick,
    plantByBot,
    dropAt,
    pickUp,
    step,
  };
}
