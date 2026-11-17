// SANDLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. The simulation (player, bots, grenades, bomb, match) runs in step();
// the render only syncs the camera and the weapon view model. No simulation code lives
// in the frame callback, and no object is allocated inside the hot loop.
//
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, pushFeed } from './state.js';
import { createWorld, FALCON_SPAWN } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenade.js';
import { createMatch } from './rounds.js';
import { createHud } from './hud.js';
import { audio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8c890');
scene.fog = new THREE.Fog(new THREE.Color('#e8c890'), 40, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const bots = createBots(scene, world);
const bomb = createBomb(scene);
const grenades = createGrenades(scene, world);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders, FALCON_SPAWN);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 130;

const deps = {
  state,
  player,
  weapon,
  bots,
  bomb,
  grenades,
  hud,
  ownedWeapons: new Set(['pistol']),
  currentWeapon: 'pistol',
  nearestFalconToBomb: null,
  clearGrenades() {
    // Grenades are module-private; clearing is done by stepping with a flag.
    grenades.clear();
  },
};
const match = createMatch(deps);

const body = player.state;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepSoundTimer = 0;

hud.setAmmo(0, 0, 'Sidewinder P9', 0);
hud.setHealth(100, 0);
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.setTimer(12, 'buy');
hud.setFeed([]);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu') {
    match.startMatch();
    started = true;
  } else if (state.phase === 'matchEnd') {
    match.startMatch();
  }
  input.requestLock();
});
hud.onBuy((itemId) => {
  match.buy(itemId);
});
hud.onBuyStart(() => {
  match.endBuy();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === 'live' && started) {
    // Losing the lock mid-round pauses; during buy phase the cursor stays free so
    // the player can click the buy menu instead.
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// The player's shot: one ray from the camera, spread by movement, resolved against the
// world first and then the bots' body parts. Headshots pay triple.
function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  weapon.pullTrigger();
  player.recoil(weapon.current.kick * (0.8 + random() * 0.4), (random() * 2 - 1) * weapon.current.kick * 0.45);
  audio.shot(weapon.current.id, 0);
  bots.hear(body.position, 32, state.time);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name, body.grenades);
  if (!hit) return true;
  const bot = hit.object.userData.bot;
  if (bot && bot.alive) {
    const part = hit.object.userData.part || 'torso';
    const headshot = part === 'head';
    const damage = Math.round(weapon.current.damage * (headshot ? weapon.current.headMult : part === 'legs' ? 0.75 : 1));
    const killed = bots.damage(bot, damage, part);
    hud.hitMarker(killed);
    audio.hit();
    if (killed) match.onPlayerKill(bot, headshot);
    return true;
  }
  return true;
}

function throwGrenade() {
  if (body.grenades <= 0 || state.phase !== 'live') return;
  body.grenades -= 1;
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.1;
  grenades.throwGrenade(muzzle, direction, 15);
  audio.shot('pistol', 0);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name, body.grenades);
}

function onGrenadeDetonate(position) {
  audio.explosion();
  // The player and every bot in the open take falloff damage.
  if (body.alive) {
    const damage = grenades.damageAt(position, tmpTarget.set(body.position.x, body.position.y + 1.1, body.position.z));
    if (damage > 0) {
      const died = player.damage(damage);
      hud.damage();
      hud.setHealth(body.health, body.armor);
      audio.hurt();
      if (died) match.onPlayerDeath(null);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const damage = grenades.damageAt(position, tmpTarget.set(bot.position.x, bot.position.y + 1.1, bot.position.z));
    if (damage <= 0) continue;
    const killed = bots.damage(bot, damage, 'torso');
    if (killed) match.onPlayerKill(bot, false);
  }
}

// One fixed simulation step. Nothing here allocates; temps live at module scope.
function step(dt) {
  elapsed += dt;
  state.time = elapsed;
  const live = state.phase === 'live';
  const frozenPhase = state.phase === 'menu' || state.phase === 'buy' || state.phase === 'roundEnd' || state.phase === 'matchEnd';

  if (!frozenPhase) {
    player.step(dt, input.state.keys);
    // Footsteps, timed by speed so they match the stride.
    const speed = player.groundSpeed();
    if (player.state.onGround && speed > 1.5) {
      stepSoundTimer -= dt;
      if (stepSoundTimer <= 0) {
        audio.step(body.sprinting);
        stepSoundTimer = speed > 6 ? 0.34 : 0.46;
      }
    }
  }
  weapon.step(dt);

  if (live && input.state.firing && weapon.ready()) {
    shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
  }
  if (live && input.takePress('KeyR') && weapon.reload()) audio.reload();
  if (live && input.takePress('KeyG')) throwGrenade();
  // Number keys 1-4 switch owned weapons during live play (buy keys are handled in rounds).
  if (live) {
    const slots = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (let index = 0; index < slots.length; index += 1) {
      if (input.takePress(slots[index])) {
        const id = ['pistol', 'smg', 'rifle', 'sniper'][index];
        if (deps.ownedWeapons.has(id) && weapon.current.id !== id) {
          weapon.equip(id);
          deps.currentWeapon = id;
          hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name, body.grenades);
          audio.reload();
        }
      }
    }
  }

  grenades.step(dt, onGrenadeDetonate);

  const botCtx = {
    player: body,
    time: elapsed,
    phase: state.phase,
    bombPlanted: bomb.state.status === 'planted',
    plantedSite: bomb.state.site,
    plantedPos: bomb.state.position,
    bombDropped: bomb.state.status === 'dropped',
    bombPos: bomb.state.position,
    nearestFalconToBomb: deps.nearestFalconToBomb,
    onDamagePlayer(damage, bot, headshot) {
      if (!body.alive) return;
      const died = player.damage(damage);
      hud.damage();
      hud.setHealth(body.health, body.armor);
      audio.hurt();
      if (died) match.onPlayerDeath(bot);
    },
    onPlant(botObj, site) {
      match.onBotPlant(botObj);
    },
    onDefuse(botObj) {
      match.onBotDefuse(botObj);
    },
    onBotKill(killer, victim) {
      pushFeed(state, `${killer.name} ▸ ${victim.name}`, killer.team);
      hud.setFeed(state.feed);
    },
  };
  // Bots only act once the round is live; during buy phase and the menu they hold
  // their spawn, and during roundEnd their fall animations still play out.
  if (state.phase === 'live' || state.phase === 'roundEnd') bots.step(dt, botCtx);
  match.step(dt, input);

  // HUD sync, cheap because every setter ignores unchanged values.
  hud.setHealth(body.health, body.armor);
  hud.setTimer(state.phase === 'buy' ? state.roundTime : Math.max(0, state.roundTime), state.phase);
  hud.setScore(state.score.falcon, state.score.viper, state.round);
  hud.setBomb(
    bomb.state.status,
    bomb.state.fuse,
    bomb.state.status === 'carried' && bomb.state.carrier === 'player' ? bomb.state.plantProgress / 4 : 0,
    state.bombThreat,
  );
  const spreadPx = 2 + weapon.spread(player.groundSpeed()) * 900;
  hud.setCrosshairSpread(Math.min(26, spreadPx));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  match.startMatch();
  body.pitch = 0;
  if (name === 'start') {
    body.position.set(0, 0, 18);
    body.yaw = 0;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'play') {
    // Round live, mid-map, aiming down the long sightline at a Viper.
    state.phase = 'live';
    state.roundTime = 100;
    hud.hideBuy();
    body.position.set(0, 0, 10);
    body.yaw = 0;
    settle(30);
    const viper = bots.bots.find((bot) => bot.team === 'viper');
    if (viper) {
      aimAt(tmpTarget.set(viper.position.x, 1.4, viper.position.z));
      shoot(0);
      settle(2);
    }
    hud.setFeed([{ text: 'You ▸ Asp (headshot)  +$300', side: 'falcon', time: 0 }]);
  } else {
    // End: a won round, banner up, scoreboard visible.
    state.phase = 'roundEnd';
    state.score.falcon = 3;
    state.score.viper = 2;
    body.position.set(-14, 0, -6);
    body.yaw = -0.9;
    settle(20);
    hud.showBanner('ROUND WON', 'Bomb detonated  ·  Falcons 3 — 2 Vipers', 60000);
  }
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name, body.grenades);
  hud.setMoney(body.money);
  hud.setScore(state.score.falcon, state.score.viper, state.round);
  hud.setTimer(state.roundTime, state.phase);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
