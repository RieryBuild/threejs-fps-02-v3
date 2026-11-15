// HUD: a bold top bar with team names and scores, a kill feed, a radio
// callout feed, a location label, a dynamic crosshair, a damage-direction
// indicator and a channel bar — the same information the top entries show,
// so a screenshot reads as a tactical FPS at a glance. All of it is DOM
// over the canvas; the 3D scene never draws text.
import { zoneAt } from './plans.js';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="topbar">
      <span class="team atk">HELIO</span><span class="score" id="scoreA">0</span>
      <span class="mid"><span id="roundLabel">ROUND 1/12</span><span id="timer">01:40</span><span id="phaseLabel">BUY</span></span>
      <span class="score" id="scoreB">0</span><span class="team def">SABLE</span>
    </div>
    <div id="bombTimer" class="hidden">BOMB <span id="bombTime">00:35</span></div>
    <div id="minimapWrap"><canvas id="minimap" width="180" height="180"></canvas></div>
    <div id="killfeed"></div>
    <div id="callouts"></div>
    <div id="healthWrap">
      <div id="healthBar"><div id="healthFill"></div><span id="healthNum">100</span></div>
      <div id="moneyLine">$<span id="money">800</span><span id="kevlarTag" class="hidden"> · KEVLAR</span><span id="kitTag" class="hidden"> · KIT</span></div>
    </div>
    <div id="ammoWrap">
      <div id="ammoBig"><span id="ammoMag">12</span><span id="ammoRes">/ 36</span></div>
      <div id="weaponName">Sidearm</div>
      <div id="grenades"></div>
    </div>
    <div id="location">ARRAY GATE</div>
    <div id="crosshair"><span class="ch t"></span><span class="ch b"></span><span class="ch l"></span><span class="ch r"></span><span class="ch dot"></span></div>
    <div id="hitmarker"></div>
    <div id="dmgdir"></div>
    <div id="banner" class="hidden"><div id="bannerTitle"></div><div id="bannerSub"></div></div>
    <div id="channel" class="hidden"><div id="channelLabel"></div><div id="channelBar"><div id="channelFill"></div></div></div>
    <div id="spectate" class="hidden">SPECTATING <span id="spectateName"></span> — press R for next round</div>
    <div id="vignette"></div>
    <div id="buymenu" class="hidden"></div>
    <div id="startmenu"></div>
    <div id="endscreen" class="hidden"></div>
  `;
  const $ = (id) => document.getElementById(id);
  const el = {
    scoreA: $('scoreA'), scoreB: $('scoreB'), roundLabel: $('roundLabel'),
    timer: $('timer'), phaseLabel: $('phaseLabel'), bombTimer: $('bombTimer'),
    bombTime: $('bombTime'), killfeed: $('killfeed'), callouts: $('callouts'),
    healthFill: $('healthFill'), healthNum: $('healthNum'), money: $('money'),
    kevlarTag: $('kevlarTag'), kitTag: $('kitTag'), ammoMag: $('ammoMag'),
    ammoRes: $('ammoRes'), weaponName: $('weaponName'), grenades: $('grenades'),
    location: $('location'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    dmgdir: $('dmgdir'), banner: $('banner'), bannerTitle: $('bannerTitle'),
    bannerSub: $('bannerSub'), channel: $('channel'), channelLabel: $('channelLabel'),
    channelFill: $('channelFill'), spectate: $('spectate'), spectateName: $('spectateName'),
    vignette: $('vignette'), buymenu: $('buymenu'), startmenu: $('startmenu'),
    endscreen: $('endscreen'), minimap: $('minimap'),
  };
  let bannerTimer = null;
  let hitTimer = null;
  let dmgTimer = null;

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    el,
    setScore(a, b, round, maxRounds) {
      el.scoreA.textContent = a;
      el.scoreB.textContent = b;
      el.roundLabel.textContent = `ROUND ${round}/${maxRounds}`;
    },
    setTimer(seconds, phase) {
      el.timer.textContent = fmtTime(seconds);
      el.phaseLabel.textContent = phase === 'buy' ? 'BUY' : phase === 'live' ? 'LIVE' : phase === 'end' ? 'ROUND OVER' : 'MATCH';
    },
    setBombTimer(seconds) {
      if (seconds == null) {
        el.bombTimer.classList.add('hidden');
        return;
      }
      el.bombTimer.classList.remove('hidden');
      el.bombTime.textContent = fmtTime(seconds);
      el.bombTimer.classList.toggle('urgent', seconds <= 10);
    },
    setHealth(hp, max = 100) {
      const frac = Math.max(0, hp) / max;
      el.healthFill.style.width = `${frac * 100}%`;
      el.healthFill.classList.toggle('low', frac < 0.35);
      el.healthNum.textContent = Math.ceil(Math.max(0, hp));
    },
    setMoney(money, hasKevlar, hasKit) {
      el.money.textContent = money;
      el.kevlarTag.classList.toggle('hidden', !hasKevlar);
      el.kitTag.classList.toggle('hidden', !hasKit);
    },
    setAmmo(mag, reserve, weaponName, grenades) {
      el.ammoMag.textContent = mag;
      el.ammoRes.textContent = `/ ${reserve}`;
      el.ammoMag.classList.toggle('empty', mag === 0);
      el.weaponName.textContent = weaponName;
      el.grenades.textContent = grenades.map((g) => `${g.icon}×${g.count}`).join('  ');
    },
    setLocation(x, z) {
      el.location.textContent = zoneAt(x, z);
    },
    setCrosshair(spreadPx, aiming) {
      const gap = Math.round(spreadPx);
      el.crosshair.style.setProperty('--gap', `${gap}px`);
      el.crosshair.classList.toggle('aiming', !!aiming);
    },
    hitmark(kill) {
      el.hitmarker.classList.remove('show', 'kill');
      void el.hitmarker.offsetWidth;
      el.hitmarker.classList.add('show');
      if (kill) el.hitmarker.classList.add('kill');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('show', 'kill'), 220);
    },
    damageFlash(fromAngleDeg) {
      el.vignette.classList.add('hurt');
      setTimeout(() => el.vignette.classList.remove('hurt'), 160);
      el.dmgdir.style.transform = `translate(-50%, -50%) rotate(${fromAngleDeg}deg)`;
      el.dmgdir.classList.add('show');
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => el.dmgdir.classList.remove('show'), 700);
    },
    clearFeed() {
      // Staged screenshots start from a clean feed — the fast-forward may
      // have logged a kill (often the player) that the staged frame does
      // not show.
      el.killfeed.innerHTML = '';
      el.callouts.innerHTML = '';
    },
    feed(killer, victim, weapon) {
      const line = document.createElement('div');
      line.className = 'feedLine';
      line.innerHTML = `<b class="atk">${killer}</b> <span class="w">${weapon}</span> <b class="def">${victim}</b>`;
      el.killfeed.prepend(line);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    callout(name, text) {
      const line = document.createElement('div');
      line.className = 'callLine';
      line.innerHTML = `<b>${name}:</b> ${text}`;
      el.callouts.appendChild(line);
      while (el.callouts.children.length > 4) el.callouts.firstChild.remove();
      setTimeout(() => line.classList.add('fade'), 4000);
      setTimeout(() => line.remove(), 4800);
    },
    banner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.add('hidden'), ms);
    },
    channel(label, frac) {
      if (label == null) {
        el.channel.classList.add('hidden');
        return;
      }
      el.channel.classList.remove('hidden');
      el.channelLabel.textContent = label;
      el.channelFill.style.width = `${Math.round(frac * 100)}%`;
    },
    spectate(name) {
      if (!name) {
        el.spectate.classList.add('hidden');
        return;
      }
      el.spectateName.textContent = name;
      el.spectate.classList.remove('hidden');
    },
    showBuyMenu(items, money, planLabel, onBuy) {
      el.buymenu.classList.remove('hidden');
      el.buymenu.innerHTML = `
        <div class="buyPanel">
          <div class="buyHead">BUY MENU <span class="buyPlan">${planLabel}</span></div>
          <div class="buyMoney">$${money} — press 1–9 to buy, B to close</div>
          <div class="buyGrid">${items.map((it) => `
            <button class="buyItem ${money < it.price ? 'poor' : ''}" data-key="${it.key}">
              <span class="buyKey">${it.key}</span>
              <span class="buyName">${it.label}</span>
              <span class="buyDesc">${it.desc}</span>
              <span class="buyPrice">$${it.price}</span>
            </button>`).join('')}
          </div>
        </div>`;
      el.buymenu.querySelectorAll('.buyItem').forEach((btn) => {
        btn.addEventListener('click', () => onBuy(btn.dataset.key));
      });
    },
    hideBuyMenu() {
      el.buymenu.classList.add('hidden');
      el.buymenu.innerHTML = '';
    },
    showStart(onStart) {
      el.startmenu.classList.remove('hidden');
      el.startmenu.innerHTML = `
        <div class="startPanel">
          <div class="startKicker">5V5 · PLANT / DEFUSE · BUY ECONOMY</div>
          <div class="startTitle">HELIODROME</div>
          <div class="startSub">A tactical FPS in a desert solar array at golden dusk.<br>
          HELIO attacks — plant the spike at Panel Field or Inverter Yard.<br>
          SABLE defends — hold the sites, defuse before the fuse blows.</div>
          <div class="startControls">WASD move · Mouse aim · Click fire · Right-click aim down sights<br>
          R reload · B buy menu · 1–9 buy · Shift walk · Ctrl/C crouch · Space jump</div>
          <button class="startBtn">CLICK TO PLAY</button>
          <div class="startNote">First to 7 rounds, max 12 · $800 start · Win $400 · Loss bonus $200–$400</div>
        </div>`;
      el.startmenu.querySelector('.startBtn').addEventListener('click', onStart);
    },
    hideStart() {
      el.startmenu.classList.add('hidden');
      el.startmenu.innerHTML = '';
    },
    showEnd(winner, score, mvp, onAgain) {
      el.endscreen.classList.remove('hidden');
      const title = winner === 'attack' ? 'HELIO WINS' : winner === 'defend' ? 'SABLE WINS' : 'DRAW';
      el.endscreen.innerHTML = `
        <div class="endPanel">
          <div class="endTitle">${title}</div>
          <div class="endScore">HELIO ${score.attack} — ${score.defend} SABLE</div>
          <div class="endMvp">${mvp ? `MVP — ${mvp.name} · ${mvp.kills} eliminations` : ''}</div>
          <button class="startBtn">PLAY AGAIN</button>
        </div>`;
      el.endscreen.querySelector('.startBtn').addEventListener('click', onAgain);
    },
    hideEnd() {
      el.endscreen.classList.add('hidden');
      el.endscreen.innerHTML = '';
    },
  };
}
