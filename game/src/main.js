// HELIODROME — 5v5 tactical FPS in a desert solar array at golden dusk.
// HELIO attacks, SABLE defends; first to 7 rounds, max 12. One fixed-step
// simulation (60 Hz) owns the whole match; rendering only draws it. The
// player is always an attacker; the nine bots play both sides, follow the
// round plan, buy their own loadouts, rotate on sound, plant and defuse.
import * as THREE from 'three';
import { createMap, MAP } from './map.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, WIN_ROUNDS, MAX_ROUNDS, BUY_SECONDS, ROUND_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { mulberry32, pick } from './rng.js';
import { PALETTE } from './palette.js';

const FIXED_STEP = 1 / 60;
const TRACER_COUNT = 24;
const PUFF_COUNT = 14;

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);

const G = {
  started: false,
  staged: false,
  seed: SEED,
  rng: mulberry32(SEED),
  money: 800,
  kevlar: false,
  grenades: { smoke: 0, flash: 0, molotov: 0 },
  hp: 100,
  alive: true,
  playerKills: 0,
  roundKills: 0,
  spectateIdx: 0,
  time: 0,
  lastBeep: 0,
  flashLeft: 0,
  prevFiring: false,
  buyOpen: false,
  primary: 'sunburst',
};

// --- renderer / scene ----------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const input = createInput(canvas, (locked) => {
  if (!locked && G.started && !G.staged && !G.buyOpen) hud.showStart(startGame);
});
const player = createPlayer(map.colliders);
const weaponSet = createWeaponSet(camera, scene);
const hud = createHud();
const minimap = createMinimap(hud.el.minimap);
const raycaster = new THREE.Raycaster();
raycaster.far = 120;

// Flash overlay for the player (a flashbang whites the screen).
const flashDiv = document.createElement('div');
flashDiv.id = 'flash';
document.getElementById('hud').appendChild(flashDiv);

// --- tracers and impact puffs (pooled, no hot-loop allocation) -------------------
const tracers = [];
for (let i = 0; i < TRACER_COUNT; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0,
  }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIdx = 0;
function fireTracer(from, to) {
  const t = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % TRACER_COUNT;
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.material.opacity = 0.9;
  t.life = 0.12;
}

const puffTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(230, 200, 150, 0.9)');
  grad.addColorStop(1, 'rgba(230, 200, 150, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = [];
for (let i = 0; i < PUFF_COUNT; i += 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: puffTex, transparent: true, opacity: 0, depthWrite: false,
  }));
  sprite.scale.set(0.4, 0.4, 1);
  scene.add(sprite);
  puffs.push({ sprite, life: 0 });
}
let puffIdx = 0;
function spawnPuff(at) {
  const p = puffs[puffIdx];
  puffIdx = (puffIdx + 1) % PUFF_COUNT;
  p.sprite.position.copy(at);
  p.sprite.scale.set(0.4, 0.4, 1);
  p.sprite.material.opacity = 0.85;
  p.life = 0.45;
}

// --- bots and rounds -------------------------------------------------------------
const hooks = {
  playerKills: () => G.roundKills,
  onRoundStart(round, plan) {
    resetPlayerForRound();
    hud.setScore(rounds.state.wins.attack, rounds.state.wins.defend, round, MAX_ROUNDS);
    hud.banner(`ROUND ${round} — ${plan.label}`, plan.desc, 3200);
    const caller = pick(G.rng, bots.state.filter((b) => b.team === 'attack'));
    if (caller) hud.callout(caller.name, plan.site === 'A' ? 'going A — Panel Field' : 'going B — Inverter Yard');
    audio.round();
  },
  onLive() {
    hud.banner('GO — PLANT THE SPIKE', '', 1600);
  },
  onRoundEnd(winner, reason, mvp) {
    const won = winner === 'attack';
    hud.banner(won ? 'HELIO TAKES THE ROUND' : 'SABLE TAKES THE ROUND', reasonText(reason), 3800);
    if (won) audio.win(); else audio.lose();
    hud.setScore(rounds.state.wins.attack, rounds.state.wins.defend, rounds.state.round, MAX_ROUNDS);
    hud.setMoney(G.money, G.kevlar, false);
    if (mvp) hud.callout('MVP', `${mvp.name} — ${mvp.kills} eliminations`);
  },
  onMatchEnd(winner, wins) {
    hud.showEnd(winner, wins, rounds.state.mvp, () => {
      hud.hideEnd();
      startMatch();
    });
  },
  onPlant(bot) {
    hud.banner('SPIKE PLANTED', `${bot.name} planted at ${rounds.state.site.name} — 35 seconds`, 2800);
    hud.callout(bot.name, 'spike planted — hold the site');
    audio.plant();
  },
  onPlanted(bot) {
    rounds.plantBomb(bot);
  },
  onDefuse(bot) {
    hud.banner('SPIKE DEFUSED', `${bot.name} defused it`, 2800);
    hud.callout(bot.name, 'spike defused — site clear');
  },
  onDefused(bot) {
    rounds.defuseBomb(bot);
  },
  onBombDrop() {
    hud.callout('TEAM', 'bomb down — pick it up');
  },
  onBombPickup(bot) {
    hud.callout(bot.name, 'I have the bomb — going to plant');
  },
  onContact(bot, targetName) {
    const site = bot.pos.x > 0 ? 'A' : 'B';
    hud.callout(bot.name, targetName === 'player' ? `contact ${site} — one on me` : `contact ${site} — ${targetName}`);
  },
  onRotate(bot, siteName) {
    hud.callout(bot.name, `rotating to ${siteName}`);
  },
};
function reasonText(reason) {
  return {
    eliminated: 'Enemy team eliminated',
    detonated: 'The spike detonated',
    defused: 'The spike was defused',
    time: 'Time expired',
  }[reason] || reason;
}

const bots = createBots(scene, map, G.rng, hooks);
const rounds = createRounds(bots, hooks, () => G.money, (m) => { G.money = m; });

function resetPlayerForRound() {
  const spawn = MAP.attackSpawns[2];
  player.reset(spawn.x, spawn.z, 0);
  G.hp = 100;
  G.alive = true;
  G.roundKills = 0;
  G.spectateIdx = 0;
  weaponSet.refillAmmo();
  hud.spectate(null);
  hud.channel(null);
  hud.setHealth(100);
  hud.setMoney(G.money, G.kevlar, false);
}

function startMatch() {
  G.started = true;
  G.money = 800;
  G.kevlar = false;
  G.grenades = { smoke: 0, flash: 0, molotov: 0 };
  G.playerKills = 0;
  rounds.startMatch(G.seed);
  resetPlayerForRound();
  hud.hideEnd();
  hud.setScore(0, 0, 1, MAX_ROUNDS);
}

function startGame() {
  audio.unlock();
  hud.hideStart();
  input.requestLock();
  if (!G.started) {
    G.started = true;
    startMatch();
  }
}

// --- damage -----------------------------------------------------------------------
function damagePlayer(amount, attacker) {
  if (!G.alive || rounds.state.phase !== 'live') return;
  const final = G.kevlar ? amount * 0.5 : amount;
  G.hp -= final;
  audio.hurt();
  if (attacker) {
    // Damage direction: rotate the indicator by the angle between where the
    // player looks and where the shot came from.
    const dx = attacker.pos.x - player.state.position.x;
    const dz = attacker.pos.z - player.state.position.z;
    const rel = Math.atan2(dx, dz) - (player.state.yaw + Math.PI);
    hud.damageFlash((-rel * 180) / Math.PI);
  }
  if (G.hp <= 0) playerDies(attacker ? attacker.name : 'the array', attacker ? WEAPONS[attacker.weapon].name : '—');
  hud.setHealth(G.hp);
}

function playerDies(killerName, weaponName) {
  if (!G.alive) return;
  G.hp = 0;
  G.alive = false;
  G.kevlar = false;
  hud.feed(killerName, 'YOU', weaponName);
  hud.banner('YOU ARE DOWN', 'Spectating a teammate', 2200);
  spectateNext();
  hud.setHealth(0);
}

function damageBot(bot, amount, isHead, attacker) {
  if (!bot.alive) return;
  bot.hp -= amount;
  if (attacker === 'player') hud.hitmark(false);
  if (bot.hp > 0) return;
  bot.hp = 0;
  bot.alive = false;
  bot.deaths += 1;
  bot.mesh.visible = false;
  if (bot.hasBomb) {
    bot.hasBomb = false;
    rounds.dropBomb(bot.pos);
  }
  if (attacker === 'player') {
    G.playerKills += 1;
    G.roundKills += 1;
    G.money += 50;
    hud.hitmark(true);
    hud.feed('YOU', bot.name, WEAPONS[weaponSet.state.key].name);
    hud.setMoney(G.money, G.kevlar, false);
    audio.kill();
  } else if (attacker) {
    attacker.kills += 1;
    attacker.roundKills = (attacker.roundKills || 0) + 1;
    hud.feed(attacker.name, bot.name, WEAPONS[attacker.weapon].name);
  } else {
    hud.feed('FIRE', bot.name, 'Molotov');
  }
}

function spectateNext() {
  const alive = bots.state.filter((b) => b.alive && b.team === 'attack');
  if (!alive.length) {
    hud.spectate(null);
    return;
  }
  G.spectateIdx = (G.spectateIdx + 1) % alive.length;
  hud.spectate(alive[G.spectateIdx].name);
}

// --- shooting -----------------------------------------------------------------------
const shootDir = new THREE.Vector3();
const shootOrigin = new THREE.Vector3();
const shootTarget = new THREE.Vector3();

function playerShoot() {
  const def = weaponSet.def();
  if (!weaponSet.ready()) return;
  if (!weaponSet.takeRound()) {
    audio.dry();
    return;
  }
  weaponSet.pullTrigger();
  audio.shot(def.kind);
  const speed = player.groundSpeed();
  const spread = weaponSet.spread(speed);
  const pellets = def.pellets;
  const eye = shootOrigin.set(
    player.state.position.x,
    player.state.position.y + player.state.eye,
    player.state.position.z,
  );
  const baseYaw = player.state.yaw;
  const basePitch = player.state.pitch;
  for (let p = 0; p < pellets; p += 1) {
    const yaw = baseYaw + (G.rng() - 0.5) * spread * 2;
    const pitch = basePitch + (G.rng() - 0.5) * spread * 2;
    shootDir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
    raycaster.set(eye, shootDir);
    const botMeshes = bots.state.filter((b) => b.alive).map((b) => b.mesh);
    const hits = raycaster.intersectObjects([...map.shootables, ...botMeshes], true);
    const end = shootTarget.copy(eye).addScaledVector(shootDir, 120);
    if (hits.length) {
      const hit = hits[0];
      end.copy(hit.point);
      const hitBot = hit.object.userData.bot;
      if (hitBot && hitBot.alive) {
        const isHead = hit.object === hitBot.mesh.userData.head || hit.object === hitBot.mesh.userData.visor;
        damageBot(hitBot, isHead ? def.headDamage : def.damage, isHead, 'player');
      } else {
        spawnPuff(hit.point);
      }
    }
    fireTracer(eye, end);
  }
  player.recoil(def.kick * (player.state.aiming ? 0.6 : 1), (G.rng() - 0.5) * def.kick * 0.7);
  bots.hear(player.state.position, false);
}

function botCtx() {
  return ctx;
}

const ctx = {
  player: player.state,
  playerAlive: true,
  state: rounds.state,
  raycaster,
  shootables: map.shootables,
  smokes: weaponSet.smokes,
  fires: weaponSet.fires,
  damagePlayer,
  damageBot,
  fireTracer,
  throwGrenade: (kind, origin, dir) => weaponSet.throwGrenade(kind, origin, dir),
  shotSound: (pos) => bots.hear(pos, false),
};

// --- buy menu ----------------------------------------------------------------------
const BUY_ITEMS = [
  { key: '1', id: 'sunburst', label: 'Sunburst Rifle', desc: 'Accurate, hard-hitting, 25 rounds', price: 2700 },
  { key: '2', id: 'dustline', label: 'Dustline SMG', desc: 'Fast, close-range, 32 rounds', price: 1500 },
  { key: '3', id: 'breacher', label: 'Breacher Shotgun', desc: 'Eight pellets up close', price: 1200 },
  { key: '4', id: 'longshot', label: 'Longshot DMR', desc: 'One tap at range, 10 rounds', price: 3200 },
  { key: '5', id: 'kevlar', label: 'Kevlar Vest', desc: 'Halves damage until you die', price: 650 },
  { key: '6', id: 'smoke', label: 'Smoke Grenade', desc: 'Blocks sight for 12s', price: 300 },
  { key: '7', id: 'flash', label: 'Flash Grenade', desc: 'Blinds anyone looking at it', price: 200 },
  { key: '8', id: 'molotov', label: 'Molotov', desc: 'Burns a patch of floor for 6s', price: 400 },
  { key: '9', id: 'sidearm', label: 'Sidearm', desc: 'Backup pistol, 12 rounds', price: 300 },
];

function openBuyMenu() {
  if (rounds.state.phase !== 'buy' || !G.alive) return;
  G.buyOpen = true;
  hud.showBuyMenu(BUY_ITEMS, G.money, rounds.state.plan ? rounds.state.plan.label : '', buyItem);
  document.exitPointerLock?.();
}

function closeBuyMenu() {
  G.buyOpen = false;
  hud.hideBuyMenu();
  if (G.started && !G.staged) input.requestLock();
}

function buyItem(key) {
  const item = BUY_ITEMS.find((i) => i.key === key);
  if (!item || G.money < item.price) return;
  if (item.id === 'kevlar') {
    if (G.kevlar) return;
    G.kevlar = true;
  } else if (item.id === 'smoke' || item.id === 'flash' || item.id === 'molotov') {
    if (G.grenades[item.id] >= 2) return;
    G.grenades[item.id] += 1;
  } else {
    G.primary = item.id;
    weaponSet.equip(item.id);
  }
  G.money -= item.price;
  audio.buy();
  hud.setMoney(G.money, G.kevlar, false);
  hud.showBuyMenu(BUY_ITEMS, G.money, rounds.state.plan ? rounds.state.plan.label : '', buyItem);
}

// --- grenades -------------------------------------------------------------------------
function throwPlayerGrenade(kind) {
  if (!G.alive || rounds.state.phase !== 'live' || G.grenades[kind] <= 0) return;
  G.grenades[kind] -= 1;
  const eye = new THREE.Vector3(
    player.state.position.x,
    player.state.position.y + player.state.eye,
    player.state.position.z,
  );
  const dir = new THREE.Vector3(
    -Math.sin(player.state.yaw) * Math.cos(player.state.pitch),
    Math.sin(player.state.pitch) + 0.15,
    -Math.cos(player.state.yaw) * Math.cos(player.state.pitch),
  ).normalize();
  weaponSet.throwGrenade(kind, eye, dir);
  audio.shot('pistol');
}

function onGrenadeLand(kind, pos) {
  if (kind === 'smoke') {
    weaponSet.addSmoke(pos);
  } else if (kind === 'molotov') {
    weaponSet.addFire(pos);
    audio.fire();
    bots.hear(pos, true);
  } else if (kind === 'flash') {
    bots.applyFlash(pos);
    // The player is blinded only if the pop is in front of them.
    const d = pos.distanceTo(player.state.position);
    if (G.alive && d < 16) {
      const toFlash = new THREE.Vector3(pos.x - player.state.position.x, 0, pos.z - player.state.position.z).normalize();
      const facing = new THREE.Vector3(-Math.sin(player.state.yaw), 0, -Math.cos(player.state.yaw));
      if (facing.dot(toFlash) > -0.2) G.flashLeft = Math.max(G.flashLeft, 2.2 - d * 0.08);
    }
  }
}

// --- the fixed step ----------------------------------------------------------------------
function step(dt) {
  if (!G.started) return;
  G.time += dt;
  const phase = rounds.state.phase;
  input.syncFiring();
  const look = input.takeLook();
  const pressed = input.takePressed();
  const keys = input.state.keys;

  if (G.started && !G.staged) {
    if (pressed.has('KeyB') && phase === 'buy') {
      if (G.buyOpen) closeBuyMenu(); else openBuyMenu();
    }
    if (G.buyOpen && phase === 'buy') {
      for (const item of BUY_ITEMS) {
        if (pressed.has(`Digit${item.key}`)) buyItem(item.key);
      }
      if (pressed.has('Escape')) closeBuyMenu();
    } else if (G.alive) {
      if (pressed.has('Digit1')) weaponSet.equip(G.primary, true);
      if (pressed.has('Digit2')) weaponSet.equip('sidearm', true);
      if (pressed.has('KeyR')) {
        if (weaponSet.reload()) audio.reload();
      }
      if (pressed.has('KeyQ')) throwPlayerGrenade('smoke');
      if (pressed.has('KeyE')) throwPlayerGrenade('flash');
      if (pressed.has('KeyF')) throwPlayerGrenade('molotov');
    }
  }

  if (G.alive && G.started) {
    player.look(look.x, look.y);
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    player.step(dt, keys, input.state.aiming, slow);
    // Footsteps: one soft step per stride.
    if (player.state.stepAccum > 2.4) {
      player.state.stepAccum = 0;
      audio.step();
    }
    // Molotov fire hurts the player standing in it.
    for (const fire of weaponSet.fires) {
      if (player.state.position.distanceTo(fire.center) < fire.radius) {
        G.hp -= fire.dps * dt;
        if (G.hp <= 0) playerDies('FIRE', 'Molotov');
      }
    }
    // Firing: automatic weapons hold, the rest fire on the press edge.
    const def = weaponSet.def();
    if (input.state.firing && phase === 'live') {
      if (def.auto) playerShoot();
      else if (!G.prevFiring) playerShoot();
    }
    G.prevFiring = input.state.firing;
  }

  weaponSet.step(dt, input.state.aiming && G.alive);
  weaponSet.stepGrenades(dt, onGrenadeLand);

  const ctx = botCtx();
  ctx.playerAlive = G.alive;
  bots.step(dt, ctx);
  // Molotov fire hurts bots standing in it.
  for (const bot of bots.state) {
    if (!bot.alive) continue;
    for (const fire of weaponSet.fires) {
      if (bot.pos.distanceTo(fire.center) < fire.radius) {
        damageBot(bot, fire.dps * dt, false, null);
      }
    }
  }

  // The bomb rides with its carrier; a dropped bomb waits where it fell.
  if (rounds.state.bombCarrier) {
    rounds.state.bomb.copy(rounds.state.bombCarrier.pos);
  }

  rounds.update(dt, G.alive);
  if (rounds.state.phase === 'buy' && G.buyOpen && rounds.state.timeLeft <= 0) closeBuyMenu();

  // The plant fuse beeps once a second.
  if (rounds.state.planted && rounds.state.phase === 'live') {
    if (G.time - G.lastBeep >= 1) {
      G.lastBeep = G.time;
      audio.beep();
    }
  }

  // Tracers and puffs fade.
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
    }
  }
  for (const p of puffs) {
    if (p.life > 0) {
      p.life -= dt;
      p.sprite.material.opacity = Math.max(0, p.life / 0.45) * 0.85;
      p.sprite.scale.multiplyScalar(1 + dt * 2);
    }
  }
  G.flashLeft = Math.max(0, G.flashLeft - dt);
  map.step(dt, G.time);
}

// --- camera and HUD sync ------------------------------------------------------------
function syncCamera(dt) {
  if (!G.alive) {
    // Spectate a living attacker from their eyes.
    const alive = bots.state.filter((b) => b.alive && b.team === 'attack');
    if (alive.length) {
      const target = alive[G.spectateIdx % alive.length];
      camera.position.set(target.pos.x, target.pos.y + 1.5, target.pos.z);
      camera.rotation.set(0, target.yaw, 0);
    }
  } else {
    camera.position.set(
      player.state.position.x,
      player.state.position.y + player.state.eye,
      player.state.position.z,
    );
    camera.rotation.set(player.state.pitch, player.state.yaw, 0);
  }
  const targetFov = player.state.aiming && G.alive ? 58 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
}

function syncHud() {
  const r = rounds.state;
  hud.setTimer(r.phase === 'live' || r.phase === 'buy' ? r.timeLeft : 0, r.phase);
  hud.setScore(r.wins.attack, r.wins.defend, r.round, MAX_ROUNDS);
  hud.setBombTimer(r.planted && r.phase === 'live' ? r.fuseLeft : null);
  hud.setLocation(player.state.position.x, player.state.position.z);
  const def = weaponSet.def();
  hud.setAmmo(
    weaponSet.state.mag, weaponSet.state.reserve, def.name,
    [
      { icon: '◐', count: G.grenades.smoke },
      { icon: '✦', count: G.grenades.flash },
      { icon: '🔥', count: G.grenades.molotov },
    ],
  );
  // Dynamic crosshair: the gap follows the live spread, in pixels.
  const spreadPx = 4 + weaponSet.spread(player.groundSpeed()) * 900;
  hud.setCrosshair(spreadPx, player.state.aiming);
  flashDiv.style.opacity = G.flashLeft > 0 ? Math.min(1, G.flashLeft) : 0;
  // Channel bar: the nearest bot currently planting or defusing.
  let channelBot = null;
  for (const bot of bots.state) {
    if (bot.alive && bot.channel) { channelBot = bot; break; }
  }
  if (channelBot) {
    if (channelBot.channel === 'plant') {
      hud.channel(`${channelBot.name} is planting…`, 1 - channelBot.plantLeft / 4);
    } else {
      const need = channelBot.hasKit ? 2.5 : 5;
      hud.channel(`${channelBot.name} is defusing…`, 1 - channelBot.defuseLeft / need);
    }
  } else {
    hud.channel(null);
  }
  minimap.draw({
    player: player.state,
    bots: bots.state,
    bomb: rounds.state.bomb,
    bombPlanted: rounds.state.planted,
    time: G.time,
  });
}

// --- render loop ---------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!G.staged) {
    acc += dt;
    let guard = 0;
    while (acc >= FIXED_STEP && guard < 8) {
      step(FIXED_STEP);
      acc -= FIXED_STEP;
      guard += 1;
    }
    if (guard >= 8) acc = 0;
  }
  syncCamera(dt);
  syncHud();
  renderer.render(scene, camera);
}

// --- staged screenshots -----------------------------------------------------------------
// ?shot=start|play|fight|buy|plant&seed=N renders one frozen frame for the
// dossier. The sim runs forward to the right phase, the scene is staged,
// then the sim freezes and window.__shotReady tells the capture script the
// frame is ready. The play shot keeps its tracer and muzzle flash alive by
// re-firing them every frame while staged.
function stageShot(kind) {
  G.started = true;
  if (kind === 'start') {
    player.reset(0, 19, 0);
    G.staged = true;
    window.__shotReady = true;
    return;
  }
  hud.hideStart();
  startMatch();
  if (kind === 'buy') {
    ff(2);
    openBuyMenu();
    G.staged = true;
    window.__shotReady = true;
    return;
  }
  ff(17);
  // The player may have died standing at spawn during the fast-forward;
  // revive them for the staged frame.
  G.alive = true;
  G.hp = 100;
  hud.setHealth(100);
  hud.spectate(null);
  hud.clearFeed();
  if (kind === 'play') {
    // The player stands in A Row itself (x=20, the lane between the panel
    // columns) so the bots down the lane are visible — from inside the
    // panel field the panels block the sightline.
    player.reset(20, 8, 0);
    player.state.pitch = -0.02;
    const d1 = bots.state.find((b) => b.name === 'Voss');
    const d2 = bots.state.find((b) => b.name === 'Ilya');
    if (d1) { d1.pos.set(20, 0, -8); d1.yaw = Math.PI; }
    if (d2) { d2.pos.set(21, 0, -12); d2.yaw = Math.PI * 0.8; }
    weaponSet.equip('sunburst');
    G.staged = true;
    window.__shotReady = true;
    // One tracer and a lit muzzle flash, held in the frozen frame.
    fireTracer(new THREE.Vector3(20, 1.6, 8), new THREE.Vector3(20, 1.4, -8));
    weaponSet.forceFlash();
    return;
  }
  if (kind === 'fight') {
    // B Row lane (x=-20): the molotov fire burns in the foreground of the
    // lane (close and unoccluded), the smoke cloud sits past it on the
    // left, both defenders visible beyond.
    player.reset(-20, 6, 0);
    player.state.pitch = -0.01;
    weaponSet.addSmoke(new THREE.Vector3(-22, 1.1, -8));
    if (weaponSet.smokes.length) weaponSet.smokes[weaponSet.smokes.length - 1].mesh.scale.setScalar(2.5);
    weaponSet.addFire(new THREE.Vector3(-20, 0.25, -2));
    if (weaponSet.fires.length) weaponSet.fires[weaponSet.fires.length - 1].mesh.scale.set(1, 3, 1);
    const d1 = bots.state.find((b) => b.name === 'Wren');
    const d2 = bots.state.find((b) => b.name === 'Kade');
    if (d1) { d1.pos.set(-20, 0, -12); d1.yaw = Math.PI * 0.6; }
    if (d2) { d2.pos.set(-17, 0, -9); d2.yaw = Math.PI * 0.9; }
    weaponSet.equip('dustline');
    G.staged = true;
    window.__shotReady = true;
    return;
  }
  if (kind === 'plant') {
    player.reset(18, -8, -0.5);
    player.state.pitch = -0.02;
    rounds.state.planted = true;
    rounds.state.fuseLeft = 20;
    rounds.state.bomb.set(22, 0, -16);
    const d = bots.state.find((b) => b.name === 'Voss');
    if (d) {
      d.pos.set(22.8, 0, -14.5);
      d.yaw = Math.PI;
      d.channel = 'defuse';
      d.defuseLeft = 2.5;
      d.hasKit = true;
    }
    weaponSet.equip('sunburst');
    G.staged = true;
    window.__shotReady = true;
  }
}

// Fast-forward the simulation without rendering, for headless smoke tests.
function ff(seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

// --- boot ------------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.showStart(startGame);
requestAnimationFrame(frame);
if (SHOT) stageShot(SHOT);

window.__lt = {
  G,
  rounds,
  bots,
  player,
  map,
  weaponSet,
  raycaster,
  ff,
  startMatch,
  stageShot,
};
