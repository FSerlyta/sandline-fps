// Bots: 4 Falcon allies and 5 Viper enemies. Each bot is a capsule of boxes with a team
// colour, a hitbox per body part, a weapon from the same catalogue as the player, and a
// small brain: follow the waypoint graph to its objective, hold an angle, peek between
// hold points, rotate toward gunfire it hears, plant the bomb when it carries it, and
// defuse when the bomb is down. Reaction time and accuracy are its difficulty.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { createMover } from './mover.js';
import { nearestWaypoint, findPath, SITES } from './world.js';
import { audio } from './audio.js';

const BOT_SPEED = 4.2;
const EYE_HEIGHT = 1.55;
const REACTION_BASE = 0.45;
const ACCURACY_BASE = 0.42;
const PLANT_TIME = 4;
const DEFUSE_TIME = 5;

const FALCON_NAMES = ['Rook', 'Heron', 'Kestrel', 'Osprey'];
const VIPER_NAMES = ['Asp', 'Cobra', 'Mamba', 'Taipan', 'Adder'];
const FALCON_SITES = ['A', 'A', 'B', 'B'];
const VIPER_POSTS = ['A', 'B', 'mid', 'A', 'B'];

const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

export function createBots(scene, world) {
  const mover = createMover(world.colliders);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const bots = [];
  const hitMeshes = [];

  // Tracer pool: thin stretched boxes, reused, never allocated in the hot loop.
  const tracers = [];
  const tracerGeometry = new THREE.BoxGeometry(0.03, 0.03, 1);
  for (let index = 0; index < 8; index += 1) {
    const mesh = new THREE.Mesh(
      tracerGeometry,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;

  function spawnTracer(from, to) {
    const tracer = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const mesh = tracer.mesh;
    _to.copy(to).sub(from);
    const length = _to.length();
    if (length < 0.1) return;
    mesh.position.copy(from).addScaledVector(_to, 0.5);
    mesh.lookAt(to);
    mesh.scale.set(1, 1, length);
    mesh.material.opacity = 0.85;
    mesh.visible = true;
    tracer.life = 0.09;
  }

  function makeBot(team, index, spawn) {
    const isFalcon = team === 'falcon';
    const name = isFalcon ? FALCON_NAMES[index] : VIPER_NAMES[index];
    const teamColor = new THREE.Color(PALETTE[isFalcon ? 'falcon' : 'viper']);
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.65, metalness: 0.05 });
    const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a186'), roughness: 0.7 });
    const group = new THREE.Group();
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.7, 0.2), dark);
    legL.position.set(-0.13, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.75, 0.32), bodyMat);
    torso.position.y = 1.08;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
    head.position.y = 1.58;
    head.userData.part = 'head';
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), bodyMat);
    helmet.position.y = 1.68;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.55), dark);
    gun.position.set(0.2, 1.2, -0.25);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), dark);
    legs.position.y = 0.35;
    legs.userData.part = 'legs';
    group.add(legL, legR, torso, head, helmet, gun, legs);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);

    const weaponId = isFalcon
      ? index === 3 ? 'smg' : 'rifle'
      : index === 3 ? 'sniper' : index === 4 ? 'smg' : 'rifle';
    const bot = {
      id: `${team}-${index}`,
      team,
      name,
      group,
      torso,
      head,
      legs,
      weapon: WEAPONS[weaponId],
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: isFalcon ? 0 : Math.PI,
      health: 100,
      armor: 0,
      alive: true,
      spawn: { x: spawn.x, z: spawn.z },
      site: isFalcon ? FALCON_SITES[index] : null,
      post: isFalcon ? null : VIPER_POSTS[index],
      path: [],
      holdPoint: null,
      holdUntil: 0,
      state: 'move',
      reaction: REACTION_BASE + Math.random() * 0.3,
      accuracy: ACCURACY_BASE + (Math.random() * 0.12 - 0.06),
      reactAt: 0,
      seesPlayer: false,
      burstLeft: 0,
      burstTimer: 0,
      fireTimer: 0,
      scanTimer: Math.random() * 0.3,
      targetBot: null,
      alertPos: null,
      alertUntil: 0,
      plantProgress: 0,
      defuseProgress: 0,
      fall: 0,
      kills: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    legs.userData.bot = bot;
    hitMeshes.push(torso, head, legs);
    bots.push(bot);
    return bot;
  }

  for (let index = 0; index < 4; index += 1) {
    makeBot('falcon', index, { x: -6 + index * 4, z: 18 });
  }
  for (let index = 0; index < 5; index += 1) {
    makeBot('viper', index, { x: -8 + index * 4, z: -18 });
  }

  function setPath(bot, toId) {
    const fromId = nearestWaypoint(bot.position.x, bot.position.z);
    bot.path = findPath(fromId, toId);
  }

  // Steers toward the next waypoint and sets velocity + yaw; the caller moves the body
  // once, so gravity and collision are applied exactly once per step.
  function moveAlongPath(bot, dt) {
    if (bot.path.length === 0) return true;
    const [tx, tz] = bot.path[0];
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.path.shift();
      return bot.path.length === 0;
    }
    bot.velocity.x = (dx / dist) * BOT_SPEED;
    bot.velocity.z = (dz / dist) * BOT_SPEED;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.group.rotation.y = bot.yaw;
    return false;
  }

  function canSeePlayer(bot, playerState) {
    if (!playerState.alive) return false;
    _eye.set(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z);
    _target.set(playerState.position.x, playerState.position.y + 1.2, playerState.position.z);
    _dir.copy(_target).sub(_eye);
    const distance = _dir.length();
    if (distance > 55) return false;
    // A bot only notices what is roughly in front of it, unless it already reacted.
    const facingX = -Math.sin(bot.yaw);
    const facingZ = -Math.cos(bot.yaw);
    const dot = (_dir.x / distance) * facingX + (_dir.z / distance) * facingZ;
    if (dot < 0.15 && bot.reactAt === 0) return false;
    _dir.divideScalar(distance);
    raycaster.set(_eye, _dir);
    raycaster.far = distance;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function fireBurst(bot, ctx, dt, targetPos, targetBot) {
    bot.fireTimer -= dt;
    if (bot.fireTimer > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.fireTimer = 0.55 + Math.random() * 0.45;
      return;
    }
    bot.burstLeft -= 1;
    bot.fireTimer = bot.weapon.id === 'sniper' ? 0.9 : 0.12;
    _eye.set(bot.position.x, bot.position.y + 1.35, bot.position.z);
    _target.copy(targetPos);
    const distance = _eye.distanceTo(_target);
    const playerState = ctx.player;
    let chance = bot.accuracy * Math.max(0.25, 1 - distance / 70);
    if (targetBot) {
      // Bot duels are deliberately less lethal than bot-vs-player fire, so a round
      // is decided by play, not by the bots wiping each other out in seconds.
      chance *= 0.55;
    } else {
      const playerSpeed = Math.hypot(playerState.velocity.x, playerState.velocity.z);
      if (playerSpeed > 3) chance *= 0.65;
      if (playerState.crouching) chance *= 0.85;
    }
    if (bot.weapon.id === 'sniper') chance *= 1.15;
    const hit = Math.random() < Math.min(0.85, chance);
    _dir.copy(_target).sub(_eye).normalize();
    if (!hit) {
      _target.x += (Math.random() * 2 - 1) * 1.6;
      _target.y += (Math.random() * 2 - 1) * 1.2;
      _target.z += (Math.random() * 2 - 1) * 1.6;
    }
    spawnTracer(_eye, _target);
    const distToPlayer = Math.hypot(playerState.position.x - bot.position.x, playerState.position.z - bot.position.z);
    audio.shot(bot.weapon.id, distToPlayer);
    if (!hit) return;
    const headshot = Math.random() < 0.12;
    const amount = Math.round(bot.weapon.damage * (headshot ? bot.weapon.headMult : 1) * (0.85 + Math.random() * 0.3));
    if (targetBot) {
      const killed = damage(targetBot, amount, headshot ? 'head' : 'torso');
      if (killed && ctx.onBotKill) ctx.onBotKill(bot, targetBot);
    } else {
      ctx.onDamagePlayer(amount, bot, headshot);
    }
  }

  // Nearest living enemy bot this bot can actually see (line of sight, 40 m).
  function nearestVisibleEnemy(bot) {
    let best = null;
    let bestD = Infinity;
    for (const other of bots) {
      if (other.team === bot.team || !other.alive) continue;
      _eye.set(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z);
      _target.set(other.position.x, other.position.y + 1.2, other.position.z);
      _dir.copy(_target).sub(_eye);
      const distance = _dir.length();
      if (distance > 40 || distance >= bestD) continue;
      _dir.divideScalar(distance);
      raycaster.set(_eye, _dir);
      raycaster.far = distance;
      if (raycaster.intersectObjects(world.shootables, false).length > 0) continue;
      best = other;
      bestD = distance;
    }
    return best;
  }

  function objectiveFor(bot, ctx) {
    // Returns a waypoint id the bot should head for, or null to hold position.
    if (bot.team === 'falcon') {
      if (ctx.bombPlanted) return null; // hold and guard the planted bomb
      if (bot.carriesBomb) return bot.site === 'A' ? 'aSite' : 'bSite';
      return bot.site === 'A' ? 'aSite' : 'bSite';
    }
    if (ctx.bombPlanted) return ctx.plantedSite === 'A' ? 'aSite' : 'bSite';
    if (bot.alertPos && ctx.time < bot.alertUntil) return nearestWaypoint(bot.alertPos.x, bot.alertPos.z);
    if (bot.post === 'mid') return 'midN';
    return bot.post === 'A' ? 'aMid' : 'bMid';
  }

  function step(dt, ctx) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) {
        tracer.mesh.visible = false;
        tracer.mesh.material.opacity = 0;
      }
    }
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.45;
        }
        continue;
      }
      const playerState = ctx.player;
      const sees = canSeePlayer(bot, playerState);
      if (sees && !bot.seesPlayer) bot.reactAt = ctx.time + bot.reaction;
      bot.seesPlayer = sees;

      if (sees && ctx.time >= bot.reactAt && ctx.phase === 'live') {
        // Face the player and shoot in bursts.
        _dir.set(playerState.position.x - bot.position.x, 0, playerState.position.z - bot.position.z);
        bot.yaw = Math.atan2(-_dir.x, -_dir.z);
        bot.group.rotation.y = bot.yaw;
        bot.velocity.set(0, bot.velocity.y, 0);
        _target.set(playerState.position.x, playerState.position.y + 1.2, playerState.position.z);
        fireBurst(bot, ctx, dt, _target, null);
        bot.velocity.y -= 20 * dt;
        mover.move(bot.position, bot.velocity, dt, 1.72);
        continue;
      }

      // Bomb duties outrank roaming.
      if (bot.carriesBomb && ctx.phase === 'live' && !ctx.bombPlanted) {
        const site = SITES[bot.site];
        const dist = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
        if (dist < site.r * 0.7) {
          bot.plantProgress += dt;
          bot.velocity.set(0, 0, 0);
          if (bot.plantProgress >= PLANT_TIME) {
            bot.plantProgress = 0;
            ctx.onPlant(bot, site);
          }
          continue;
        }
      }
      if (bot.team === 'viper' && ctx.bombPlanted && ctx.phase === 'live') {
        const dist = Math.hypot(ctx.plantedPos.x - bot.position.x, ctx.plantedPos.z - bot.position.z);
        if (dist < 2.5) {
          bot.defuseProgress += dt;
          bot.velocity.set(0, 0, 0);
          if (bot.defuseProgress >= DEFUSE_TIME) {
            bot.defuseProgress = 0;
            ctx.onDefuse(bot);
          }
          continue;
        }
      }

      // Bot-vs-bot: with no bomb duty and the player out of sight, fight the nearest
      // visible enemy bot instead of standing around, so rounds resolve even after
      // the player dies.
      if (ctx.phase === 'live' && !sees) {
        bot.scanTimer -= dt;
        if (bot.scanTimer <= 0) {
          bot.scanTimer = 0.25 + Math.random() * 0.15;
          bot.targetBot = nearestVisibleEnemy(bot);
        }
        const enemy = bot.targetBot;
        if (enemy && enemy.alive) {
          _dir.set(enemy.position.x - bot.position.x, 0, enemy.position.z - bot.position.z);
          bot.yaw = Math.atan2(-_dir.x, -_dir.z);
          bot.group.rotation.y = bot.yaw;
          bot.velocity.set(0, bot.velocity.y, 0);
          _target.set(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
          fireBurst(bot, ctx, dt, _target, enemy);
          bot.velocity.y -= 20 * dt;
          mover.move(bot.position, bot.velocity, dt, 1.72);
          continue;
        }
      }

      // A dropped bomb is recovered by the nearest living Falcon: steer straight at it,
      // not via waypoints, so the pickup radius is actually reached.
      if (ctx.bombDropped && bot.team === 'falcon' && bot === ctx.nearestFalconToBomb) {
        const dx = ctx.bombPos.x - bot.position.x;
        const dz = ctx.bombPos.z - bot.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.2) {
          bot.velocity.x = (dx / dist) * BOT_SPEED;
          bot.velocity.z = (dz / dist) * BOT_SPEED;
          bot.yaw = Math.atan2(-dx, -dz);
          bot.group.rotation.y = bot.yaw;
        } else {
          bot.velocity.x = 0;
          bot.velocity.z = 0;
        }
        bot.velocity.y -= 20 * dt;
        mover.move(bot.position, bot.velocity, dt, 1.72);
        bot.velocity.x = 0;
        bot.velocity.z = 0;
        continue;
      }

      // Move toward the objective, then hold and peek around it.
      const targetId = objectiveFor(bot, ctx);
      if (targetId) {
        const atTarget = nearestWaypoint(bot.position.x, bot.position.z) === targetId && bot.path.length === 0;
        if (!atTarget) {
          if (bot.path.length === 0) setPath(bot, targetId);
          if (moveAlongPath(bot, dt)) bot.path = [];
        } else if (ctx.time >= bot.holdUntil) {
          // Peek: step to a nearby waypoint and back, so holds are not statues.
          const options = bot.team === 'falcon'
            ? [bot.site === 'A' ? 'aMid' : 'bMid', bot.site === 'A' ? 'conW' : 'conE']
            : [bot.post === 'A' ? 'aSite' : bot.post === 'B' ? 'bSite' : 'mid', 'conMid'];
          const pick = options[Math.floor(Math.random() * options.length)];
          if (pick !== targetId) setPath(bot, pick);
          bot.holdUntil = ctx.time + 4 + Math.random() * 4;
        }
      } else {
        // Holding: slow scan of the surroundings.
        bot.group.rotation.y += dt * 0.25;
        bot.yaw = bot.group.rotation.y;
        bot.velocity.set(0, 0, 0);
      }
      bot.velocity.y -= 20 * dt;
      mover.move(bot.position, bot.velocity, dt, 1.72);
      bot.velocity.x = 0;
      bot.velocity.z = 0;
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    const mult = part === 'head' ? 3 : part === 'legs' ? 0.75 : 1;
    let rest = Math.round(amount * mult);
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.health -= rest;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      return true;
    }
    return false;
  }

  function hear(position, radius, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const dist = Math.hypot(bot.position.x - position.x, bot.position.z - position.z);
      if (dist < radius) {
        bot.alertPos = { x: position.x, z: position.z };
        bot.alertUntil = time + 6;
        bot.path = [];
      }
    }
  }

  function resetRound() {
    for (const bot of bots) {
      bot.position.set(bot.spawn.x, 0, bot.spawn.z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'falcon' ? 0 : Math.PI;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.position);
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.path = [];
      bot.holdUntil = 0;
      bot.seesPlayer = false;
      bot.reactAt = 0;
      bot.burstLeft = 0;
      bot.fireTimer = 0;
      bot.scanTimer = 0;
      bot.targetBot = null;
      bot.alertPos = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.fall = 0;
      bot.carriesBomb = false;
      bot.group.visible = true;
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    hear,
    resetRound,
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
  };
}
