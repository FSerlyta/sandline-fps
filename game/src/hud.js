// The DOM HUD: health, armour, ammo, money, timer, score, kill feed, crosshair spread,
// round banner, bomb status, buy menu and the start/pause/end overlays. It never touches
// the simulation; main.js and rounds.js push numbers in and read callbacks out.
const COPY = {
  start: {
    title: 'SANDLINE',
    copy: 'A desert outpost, two bomb sites, five against five. Plant the bomb or wipe the Vipers out — first to 8 rounds takes the outpost.',
    action: 'Click to play',
  },
  paused: {
    title: 'SANDLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthFill = $('health-fill');
  const healthText = $('health-text');
  const armorText = $('armor-text');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyText = $('money');
  const timerText = $('timer');
  const scoreText = $('score');
  const roundText = $('round');
  const feed = $('feed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const bombBar = $('bomb-bar');
  const bombText = $('bomb-text');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const damageFlash = $('damage-flash');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyItems = $('buy-items');
  const buyStart = $('buy-start');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastAmmo = '';
  let lastHealth = '';
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastBomb = '';

  function renderFeed(items) {
    feed.innerHTML = '';
    for (const item of items) {
      const line = document.createElement('div');
      line.className = `feed-line ${item.side}`;
      line.textContent = item.text;
      feed.appendChild(line);
    }
  }

  return {
    setHealth(health, armor) {
      const key = `${health}|${armor}`;
      if (key === lastHealth) return;
      lastHealth = key;
      healthFill.style.width = `${Math.max(0, health)}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthText.textContent = String(Math.ceil(health));
      armorText.textContent = armor > 0 ? `ARMOR ${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, name, grenades) {
      const key = `${mag}|${reserve}|${name}|${grenades}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = `${name}${grenades > 0 ? `  ·  ${grenades}× HE` : ''}`;
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyText.textContent = `$${money}`;
      buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const shown = phase === 'buy' ? `BUY ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (shown === lastTimer) return;
      lastTimer = shown;
      timerText.textContent = shown;
      timerText.classList.toggle('buy', phase === 'buy');
    },
    setScore(falcon, viper, round) {
      const key = `${falcon}|${viper}|${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreText.textContent = `FALCONS ${falcon} — ${viper} VIPERS`;
      roundText.textContent = `ROUND ${round}`;
    },
    setFeed(items) {
      renderFeed(items);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    showBanner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
    },
    hideBanner() {
      banner.classList.add('hidden');
    },
    setBomb(status, fuse, plantProgress, defuseThreat) {
      const key = `${status}|${Math.ceil(fuse)}|${Math.round(plantProgress * 100)}|${defuseThreat}`;
      if (key === lastBomb) return;
      lastBomb = key;
      if (status === 'planted') {
        bombBar.classList.remove('hidden');
        bombText.textContent = defuseThreat ? `BOMB PLANTED — ${Math.ceil(fuse)}s — VIPER DEFUSING!` : `BOMB PLANTED — ${Math.ceil(fuse)}s`;
        bombText.classList.toggle('danger', defuseThreat);
      } else {
        bombBar.classList.add('hidden');
      }
      if (plantProgress > 0) {
        plantBar.classList.remove('hidden');
        plantFill.style.width = `${Math.min(100, plantProgress * 100)}%`;
      } else {
        plantBar.classList.add('hidden');
      }
    },
    showBuy() {
      buyMenu.classList.remove('hidden');
    },
    hideBuy() {
      buyMenu.classList.add('hidden');
    },
    setBuyItems(items) {
      buyItems.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.dataset.buy = item.id;
        row.disabled = item.disabled;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${item.price === 0 ? 'OWNED' : '$' + item.price}</span>`;
        buyItems.appendChild(row);
      }
    },
    onBuy(handler) {
      buyItems.addEventListener('click', (event) => {
        const row = event.target.closest('[data-buy]');
        if (row) handler(row.dataset.buy);
      });
    },
    onBuyStart(handler) {
      buyStart.addEventListener('click', handler);
    },
    showOverlay(mode, detail = '') {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? detail || text.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
