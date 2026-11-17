// The match: rounds, economy, the bomb's consequences and the win conditions. One round
// is a 12 s buy phase (frozen, buy menu open), then 115 s live. Falcons win a round by
// planting and detonating the bomb or eliminating the Vipers; Vipers win by defusing,
// running the clock out, or eliminating the Falcons. First to 8 rounds takes the match.
import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE, ARMOR_PRICE, ARMOR_MAX } from './weapons.js';
import { FALCON_SPAWN, VIPER_SPAWN, SITES } from './world.js';
import { pushFeed } from './state.js';
import { audio } from './audio.js';

const BUY_SECONDS = 12;
const ROUND_SECONDS = 115;
const ROUND_END_SECONDS = 4;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_BASE = 1900;
const LOSS_STEP = 500;
const LOSS_MAX = 3400;
const START_MONEY = 800;

export function createMatch(deps) {
  const { state, player, weapon, bots, bomb, grenades, hud } = deps;

  function buyItems() {
    const money = player.state.money;
    return [
      { id: 'smg', key: '1', name: 'Dustjack K7 — SMG', desc: 'Fast, close quarters', price: WEAPONS.smg.price, disabled: money < WEAPONS.smg.price },
      { id: 'rifle', key: '2', name: 'Sandline AR-9 — Rifle', desc: 'The all-rounder', price: WEAPONS.rifle.price, disabled: money < WEAPONS.rifle.price },
      { id: 'sniper', key: '3', name: 'Longhorn .50 — Sniper', desc: 'One shot, long lane', price: WEAPONS.sniper.price, disabled: money < WEAPONS.sniper.price },
      { id: 'pistol', key: '4', name: 'Sidewinder P9 — Pistol', desc: 'Always in the holster', price: 0, disabled: false },
      { id: 'grenade', key: '5', name: 'Sandburst HE Grenade', desc: `Blast radius, max 2 (have ${player.state.grenades})`, price: GRENADE_PRICE, disabled: money < GRENADE_PRICE || player.state.grenades >= 2 },
      { id: 'armor', key: '6', name: 'Sandplate Vest', desc: 'Absorbs half of every hit', price: ARMOR_PRICE, disabled: money < ARMOR_PRICE || player.state.armor >= ARMOR_MAX },
    ];
  }

  function refreshBuy() {
    hud.setBuyItems(buyItems());
    hud.setMoney(player.state.money);
  }

  function buy(itemId) {
    if (state.phase !== 'buy') return;
    const p = player.state;
    if (itemId === 'grenade') {
      if (p.money < GRENADE_PRICE || p.grenades >= 2) return;
      p.money -= GRENADE_PRICE;
      p.grenades += 1;
    } else if (itemId === 'armor') {
      if (p.money < ARMOR_PRICE || p.armor >= ARMOR_MAX) return;
      p.money -= ARMOR_PRICE;
      p.armor = ARMOR_MAX;
    } else if (WEAPONS[itemId]) {
      const def = WEAPONS[itemId];
      if (itemId !== 'pistol' && !deps.ownedWeapons.has(itemId)) {
        if (p.money < def.price) return;
        p.money -= def.price;
        deps.ownedWeapons.add(itemId);
      }
      weapon.equip(itemId);
      deps.currentWeapon = itemId;
    } else {
      return;
    }
    audio.buy();
    refreshBuy();
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name, p.grenades);
  }

  function startMatch() {
    state.phase = 'buy';
    state.phaseTime = 0;
    state.round = 1;
    state.score.falcon = 0;
    state.score.viper = 0;
    state.lossStreak = 0;
    state.kills = 0;
    state.feed = [];
    state.matchWinner = null;
    player.state.money = START_MONEY;
    deps.ownedWeapons.clear();
    deps.ownedWeapons.add('pistol');
    deps.currentWeapon = 'pistol';
    startRound();
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseTime = 0;
    state.roundTime = BUY_SECONDS;
    state.roundWinner = null;
    state.roundReason = '';
    state.bombThreat = false;
    player.respawn(FALCON_SPAWN, FALCON_SPAWN.yaw);
    player.state.hasBomb = true;
    player.state.grenades = 0;
    bots.resetRound();
    bomb.resetRound('player');
    grenadesReset();
    weapon.equip(deps.currentWeapon);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name, 0);
    hud.setHealth(player.state.health, player.state.armor);
    hud.setMoney(player.state.money);
    hud.setScore(state.score.falcon, state.score.viper, state.round);
    hud.setBomb('carried', 0, 0, false);
    hud.showBuy();
    refreshBuy();
    hud.showBanner(`ROUND ${state.round}`, 'Buy phase — B to close, 1–6 to buy. You carry the bomb.', 3200);
  }

  function grenadesReset() {
    // Grenades in flight vanish between rounds; the module owns its own list.
    deps.clearGrenades();
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live' && state.phase !== 'buy') return;
    state.phase = 'roundEnd';
    state.phaseTime = 0;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    const playerWon = winner === 'falcon';
    if (playerWon) {
      player.state.money += WIN_REWARD;
      state.lossStreak = 0;
      audio.roundWin();
    } else {
      const bonus = Math.min(LOSS_MAX, LOSS_BASE + LOSS_STEP * state.lossStreak);
      player.state.money += bonus;
      state.lossStreak += 1;
      audio.roundLose();
    }
    hud.hideBuy();
    hud.setScore(state.score.falcon, state.score.viper, state.round);
    hud.setMoney(player.state.money);
    hud.showBanner(
      playerWon ? 'ROUND WON' : 'ROUND LOST',
      `${reason}  ·  Falcons ${state.score.falcon} — ${state.score.viper} Vipers`,
      3400,
    );
    pushFeed(state, `${playerWon ? 'Falcons' : 'Vipers'} take round ${state.round} — ${reason}`, winner);
    hud.setFeed(state.feed);
    if (state.score[winner] >= state.roundsToWin) {
      state.matchWinner = winner;
    }
  }

  function nextAfterRoundEnd() {
    if (state.matchWinner) {
      state.phase = 'matchEnd';
      const won = state.matchWinner === 'falcon';
      hud.showBanner(won ? 'FALCONS TAKE THE OUTPOST' : 'VIPERS HOLD THE OUTPOST', `Final: Falcons ${state.score.falcon} — ${state.score.viper} Vipers`, 6000);
      hud.showOverlay('end', won
        ? `You took the outpost ${state.score.falcon}–${state.score.viper}. ${state.kills} eliminations. Click to play again.`
        : `The Vipers held the outpost ${state.score.viper}–${state.score.falcon}. Click to try again.`);
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    state.round += 1;
    startRound();
  }

  function onPlayerKill(bot, headshot) {
    state.kills += 1;
    player.state.kills += 1;
    player.state.money += KILL_REWARD;
    pushFeed(state, `You ▸ ${bot.name}${headshot ? ' (headshot)' : ''}  +$${KILL_REWARD}`, 'falcon');
    hud.setFeed(state.feed);
    hud.setMoney(player.state.money);
    audio.kill();
  }

  function onPlayerDeath(killer) {
    player.state.deaths += 1;
    pushFeed(state, `${killer ? killer.name : 'A Viper'} ▸ You`, 'viper');
    hud.setFeed(state.feed);
    if (player.state.hasBomb) {
      player.state.hasBomb = false;
      bomb.dropAt(player.state.position);
      pushFeed(state, 'Bomb dropped — a Falcon will recover it', 'info');
      hud.setFeed(state.feed);
    }
    hud.setHealth(0, player.state.armor);
  }

  function onBotPlant(bot) {
    bomb.plantByBot(bot.site);
    pushFeed(state, `${bot.name} planted the bomb at Site ${bot.site}`, 'falcon');
    hud.setFeed(state.feed);
    hud.showBanner('BOMB PLANTED', `Site ${bot.site} — 40 seconds to detonation`, 3000);
  }

  function onBotDefuse(bot) {
    bomb.state.status = 'defused';
    pushFeed(state, `${bot.name} defused the bomb`, 'viper');
    hud.setFeed(state.feed);
    endRound('viper', 'Bomb defused');
  }

  function endBuyPhase() {
    hud.hideBuy();
    state.phase = 'live';
    state.phaseTime = 0;
    state.roundTime = ROUND_SECONDS;
    hud.showBanner(`ROUND ${state.round}`, 'Go — plant the bomb at A or B.', 2200);
  }

  function step(dt, input) {
    state.time += dt;
    if (state.phase === 'buy') {
      state.phaseTime += dt;
      state.roundTime -= dt;
      if (input.takePress('KeyB')) {
        endBuyPhase();
      } else if (state.roundTime <= 0) {
        endBuyPhase();
      }
      // Buy keys work while the menu is open.
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']) {
        if (input.takePress(code)) {
          const map = { Digit1: 'smg', Digit2: 'rifle', Digit3: 'sniper', Digit4: 'pistol', Digit5: 'grenade', Digit6: 'armor' };
          buy(map[code]);
        }
      }
      return;
    }
    if (state.phase === 'live') {
      state.phaseTime += dt;
      state.roundTime -= dt;

      // The bomb's fuse and the player's plant attempt.
      const bombResult = bomb.step(dt);
      if (bombResult === 'exploded') {
        endRound('falcon', 'Bomb detonated');
        return;
      }
      if (player.state.alive && player.state.hasBomb) {
        const site = bomb.playerPlantTick(dt, player.state.position, input.state.keys.has('KeyE'));
        if (site) {
          player.state.hasBomb = false;
          pushFeed(state, `You planted the bomb at Site ${site}`, 'falcon');
          hud.setFeed(state.feed);
          hud.showBanner('BOMB PLANTED', `Site ${site} — 40 seconds to detonation`, 3000);
        }
      }
      // A dropped bomb is recovered by the nearest living Falcon bot.
      if (bomb.state.status === 'dropped') {
        let best = null;
        let bestD = Infinity;
        for (const bot of bots.bots) {
          if (bot.team !== 'falcon' || !bot.alive) continue;
          const d = Math.hypot(bot.position.x - bomb.state.position.x, bot.position.z - bomb.state.position.z);
          if (d < bestD) {
            bestD = d;
            best = bot;
          }
        }
        if (best && bestD < 1.6) {
          bomb.pickUp(best);
          best.site = Math.abs(SITES.A.x - best.position.x) < Math.abs(SITES.B.x - best.position.x) ? 'A' : 'B';
          pushFeed(state, `${best.name} recovered the bomb`, 'falcon');
          hud.setFeed(state.feed);
        }
        deps.nearestFalconToBomb = best;
      }

      // A Viper standing on the planted bomb is defusing — warn the player.
      state.bombThreat = false;
      if (bomb.state.status === 'planted') {
        for (const bot of bots.bots) {
          if (bot.team === 'viper' && bot.alive && Math.hypot(bot.position.x - bomb.state.position.x, bot.position.z - bomb.state.position.z) < 2.5) {
            state.bombThreat = true;
            break;
          }
        }
      }

      // Win conditions, checked in the order the round would really end.
      if (bomb.state.status === 'defused') {
        endRound('viper', 'Bomb defused');
        return;
      }
      const falconsAlive = bots.aliveCount('falcon') + (player.state.alive ? 1 : 0);
      const vipersAlive = bots.aliveCount('viper');
      if (vipersAlive === 0 && bomb.state.status !== 'planted') {
        endRound('falcon', 'Vipers eliminated');
        return;
      }
      if (falconsAlive === 0 && bomb.state.status !== 'planted') {
        endRound('viper', 'Falcons eliminated');
        return;
      }
      if (falconsAlive === 0 && bomb.state.status === 'planted' && vipersAlive > 0) {
        // The bomb still ticks; the Vipers must defuse it before it blows.
      }
      if (state.roundTime <= 0 && bomb.state.status !== 'planted') {
        endRound('viper', 'Time expired — bomb not planted');
        return;
      }
      if (state.roundTime <= 0 && bomb.state.status === 'planted') {
        // Planted bombs ignore the round clock; the fuse decides.
        state.roundTime = 0;
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.phaseTime += dt;
      if (state.phaseTime >= ROUND_END_SECONDS) nextAfterRoundEnd();
    }
  }

  return {
    startMatch,
    startRound,
    endRound,
    endBuy() {
      if (state.phase === 'buy') endBuyPhase();
    },
    buy,
    refreshBuy,
    step,
    onPlayerKill,
    onPlayerDeath,
    onBotPlant,
    onBotDefuse,
  };
}
