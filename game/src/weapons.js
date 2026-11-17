// Weapons: the catalogue and one view model per weapon in hand. A weapon owns its numbers
// (damage, magazine, fire gap, reload, spread) and its low-poly model; main.js owns the
// ray and the damage, bots read the same catalogue. Names are original, no real trademarks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Sidewinder P9', price: 0, damage: 26, headMult: 3,
    mag: 12, reserve: 48, gap: 0.16, reload: 1.4, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, kick: 0.008, range: 60,
  },
  smg: {
    id: 'smg', name: 'Dustjack K7', price: 1500, damage: 22, headMult: 3,
    mag: 28, reserve: 84, gap: 0.085, reload: 1.7, auto: true,
    spreadStill: 0.006, spreadMove: 0.034, kick: 0.006, range: 55,
  },
  rifle: {
    id: 'rifle', name: 'Sandline AR-9', price: 2700, damage: 33, headMult: 3.2,
    mag: 30, reserve: 90, gap: 0.096, reload: 1.9, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, range: 80,
  },
  sniper: {
    id: 'sniper', name: 'Longhorn .50', price: 4750, damage: 95, headMult: 2.5,
    mag: 5, reserve: 15, gap: 1.1, reload: 2.6, auto: false,
    spreadStill: 0.001, spreadMove: 0.06, kick: 0.035, range: 120,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const ARMOR_MAX = 100;

// One small box-built view model per weapon; the shape, length and sight differ so the
// player can tell at a glance which gun is in hand.
function buildModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (def.id === 'pistol') {
    add(0.07, 0.09, 0.24, 0, 0, -0.1, light);
    add(0.06, 0.12, 0.08, 0, -0.09, 0.02, dark);
    add(0.02, 0.03, 0.02, 0, 0.06, -0.2, accent);
  } else if (def.id === 'smg') {
    add(0.08, 0.1, 0.4, 0, 0, -0.12, light);
    add(0.05, 0.05, 0.2, 0, 0.02, -0.4, dark);
    add(0.06, 0.14, 0.07, 0, -0.1, 0.02, dark);
    add(0.07, 0.04, 0.12, 0, -0.06, -0.14, accent);
  } else if (def.id === 'sniper') {
    add(0.08, 0.09, 0.55, 0, 0, -0.2, dark);
    add(0.045, 0.045, 0.5, 0, 0.03, -0.5, light);
    add(0.06, 0.06, 0.22, 0, 0.07, -0.18, accent);
    add(0.07, 0.08, 0.2, 0, -0.02, 0.28, dark);
    add(0.05, 0.05, 0.06, 0, 0.06, -0.42, light);
  } else {
    add(0.09, 0.1, 0.42, 0, 0, -0.12, light);
    add(0.045, 0.045, 0.4, 0, 0.025, -0.5, dark);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.26, dark);
    add(0.05, 0.03, 0.16, 0, 0.06, -0.14, accent);
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createWeapon(camera) {
  const models = {};
  for (const id of WEAPON_ORDER) {
    models[id] = buildModel(WEAPONS[id]);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = null;
  const state = { mag: 0, reserve: 0, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, reloading: false };

  function equip(id) {
    if (current) models[current.id].visible = false;
    current = WEAPONS[id];
    models[id].visible = true;
    state.mag = current.mag;
    state.reserve = current.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.reloading = false;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (current) {
      const model = models[current.id];
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) {
        model.rotation.x = -0.55 * Math.min(1, (current.reload - state.reloadLeft) * 2);
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0 && current) {
        const need = current.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        state.reloading = false;
      }
    }
  }

  return {
    state,
    get current() {
      return current;
    },
    equip,
    step,
    ready() {
      return current !== null && state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (!current || state.reloadLeft > 0 || state.mag === current.mag || state.reserve === 0) return false;
      state.reloadLeft = current.reload;
      state.reloading = true;
      return true;
    },
    spread(speed) {
      if (!current) return 0.01;
      const moving = Math.min(1, speed / 5.2);
      return current.spreadStill + moving * current.spreadMove;
    },
    // Buying a weapon the player already owns only refills its reserve.
    refillReserve() {
      if (current) state.reserve = current.reserve;
    },
  };
}
