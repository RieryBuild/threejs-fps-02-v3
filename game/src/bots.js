// Bots: nine teammates and opponents with names, roles and skill tiers.
// Attackers follow the round plan to a site, plant, and hold; defenders
// hold their sites, rotate on the sound of gunfire, and defuse. Each bot
// keeps its own path (BFS over the map graph), its own loadout and money,
// and its own radio discipline: a bot calls contact once per round, and a
// rotating defender calls it once per rotation. Bots fight the player and
// each other with the same hitscan rules, the same spread growth while
// moving, and the same headshot multiplier.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { makeNameSprite } from './labels.js';
import { PALETTE } from './palette.js';

const SKILLS = {
  recruit: { react: 0.55, spread: 1.5, damage: 0.8, speed: 3.6 },
  veteran: { react: 0.38, spread: 1.1, damage: 1.0, speed: 4.2 },
  elite: { react: 0.26, spread: 0.8, damage: 1.15, speed: 4.7 },
};

const BOT_DEFS = [
  { name: 'Sol', team: 'attack', skill: 'elite', role: 'entry' },
  { name: 'Dune', team: 'attack', skill: 'veteran', role: 'entry' },
  { name: 'Rook', team: 'attack', skill: 'veteran', role: 'support' },
  { name: 'Mira', team: 'attack', skill: 'recruit', role: 'support' },
  { name: 'Voss', team: 'defend', skill: 'elite', role: 'anchor' },
  { name: 'Ilya', team: 'defend', skill: 'veteran', role: 'anchor' },
  { name: 'Wren', team: 'defend', skill: 'veteran', role: 'anchor' },
  { name: 'Kade', team: 'defend', skill: 'recruit', role: 'roamer' },
  { name: 'Sable', team: 'defend', skill: 'recruit', role: 'anchor' },
];

const EYE = 1.5;
const BOT_HEIGHT = 1.7;
const BOT_RADIUS = 0.36;
const SIGHT_RANGE = 42;

export function createBots(scene, map, rng, hooks) {
  const bots = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  const losClosest = new THREE.Vector3();
  const fireEnd = new THREE.Vector3();
  const tracerTo = new THREE.Vector3();

  function makeMesh(bot) {
    const group = new THREE.Group();
    const teamColor = bot.team === 'attack' ? PALETTE.attack : PALETTE.defend;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x23262b), roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.86, 0.3), bodyMat);
    body.position.y = 0.95;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), darkMat);
    head.position.y = 1.55;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }));
    visor.position.set(0, 1.58, 0.18);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.26), darkMat);
    legs.position.y = 0.27;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
    gun.position.set(0.2, 1.12, -0.28);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.14), bodyMat);
    pack.position.set(0, 1.0, -0.22);
    group.add(body, head, visor, legs, gun, pack);
    // A nameplate floats over the head, in the bot's team colour, so the
    // player can read who is who at a glance. It is occluded by walls.
    const sprite = makeNameSprite(bot.name, teamColor);
    sprite.position.y = 2.05;
    group.add(sprite);
    group.traverse((m) => { if (m.isMesh) m.userData.bot = bot; });
    group.userData.head = head;
    group.userData.body = body;
    scene.add(group);
    return group;
  }

  for (let i = 0; i < BOT_DEFS.length; i += 1) {
    const def = BOT_DEFS[i];
    const bot = {
      id: i,
      ...def,
      skillDef: SKILLS[def.skill],
      pos: new THREE.Vector3(0, 0, 19),
      vel: new THREE.Vector3(),
      yaw: 0,
      hp: 100,
      alive: true,
      weapon: 'sidearm',
      mag: 12,
      reserve: 36,
      cooldown: 0,
      reloadLeft: 0,
      state: 'idle',
      target: null,
      targetIsPlayer: false,
      lastSeen: null,
      reactLeft: 0,
      path: [],
      pathIdx: 0,
      holdNode: -1,
      holdPos: new THREE.Vector3(),
      heardAt: 0,
      heardPos: new THREE.Vector3(),
      rotating: false,
      rotateSite: null,
      contactCalled: false,
      rotateCalled: false,
      executed: false,
      hasBomb: false,
      hasKit: false,
      flashes: 0,
      smokes: 0,
      molos: 0,
      money: 800,
      kills: 0,
      deaths: 0,
      channel: null,
      defuseLeft: 0,
      plantLeft: 0,
      flashLeft: 0,
      visible: true,
      stage: 0,
      stagingNode: 0,
      lastPos: new THREE.Vector3(),
      stuckSince: 0,
      movedSince: 0,
      // Preallocated scratch vectors: the per-step sight scan must not
      // allocate in the hot loop.
      _eye: new THREE.Vector3(),
      _tpos: new THREE.Vector3(),
      _seen: new THREE.Vector3(),
      _target: { isPlayer: false, bot: null, pos: null, dist: 0 },
      mesh: null,
    };
    bot._target.pos = bot._tpos;
    bot.mesh = makeMesh(bot);
    bots.push(bot);
  }

  function nearestNode(pos) {
    // The nearest node whose straight line from the bot is clear — a bot
    // re-pathing from against a wall must not be sent through that wall.
    const order = map.waypoints.map((_, i) => i).sort((a, b) => {
      const da = (map.waypoints[a][0] - pos.x) ** 2 + (map.waypoints[a][1] - pos.z) ** 2;
      const db = (map.waypoints[b][0] - pos.x) ** 2 + (map.waypoints[b][1] - pos.z) ** 2;
      return da - db;
    });
    for (const i of order.slice(0, 4)) {
      const [x, z] = map.waypoints[i];
      if (clearLine(pos.x, pos.z, x, z)) return i;
    }
    return order[0];
  }

  function clearLine(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (blockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  function findPath(fromNode, toNode) {
    if (fromNode === toNode) return [toNode];
    const prev = new Array(map.waypoints.length).fill(-1);
    const queue = [fromNode];
    prev[fromNode] = fromNode;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toNode) break;
      for (const next of map.adjacency[cur]) {
        if (prev[next] === -1) {
          prev[next] = cur;
          queue.push(next);
        }
      }
    }
    if (prev[toNode] === -1) return [toNode];
    const path = [];
    let cur = toNode;
    while (cur !== fromNode) {
      path.unshift(cur);
      cur = prev[cur];
    }
    return path;
  }

  function setPath(bot, node) {
    const from = nearestNode(bot.pos);
    // Walk to the nearest node first: the bot is not standing on it, and
    // the straight line from the bot to the first path node is the leg the
    // BFS never checked.
    bot.path = [from, ...findPath(from, node)];
    bot.pathIdx = 0;
  }

  // --- loadouts ---------------------------------------------------------------
  function botLoadout(bot, round) {
    // Bots buy like the player — and keep what they buy. A primary weapon
    // persists across rounds (only the ammo refills, free), so a losing bot
    // can save for a rifle instead of re-buying a sidearm every round and
    // staying broke forever.
    const primaries = ['sunburst', 'dustline', 'breacher', 'longshot'];
    if (!primaries.includes(bot.weapon)) {
      // Only a sidearm: buy the best primary the bot can afford, or save.
      let weapon = 'sidearm';
      if (bot.money >= 2700) weapon = 'sunburst';
      else if (bot.money >= 1500) weapon = 'dustline';
      else if (bot.money >= 1200) weapon = 'breacher';
      if (bot.role === 'entry' && bot.money >= 3200 && rng() < 0.3) weapon = 'longshot';
      if (weapon !== 'sidearm') {
        bot.money = Math.max(0, bot.money - WEAPONS[weapon].price);
        bot.weapon = weapon;
      }
    }
    bot.mag = WEAPONS[bot.weapon].mag;
    bot.reserve = WEAPONS[bot.weapon].reserve;
    // Utilities only once the bot owns a primary — a saving bot keeps its
    // rifle fund intact instead of burning it on smokes.
    const hasPrimary = primaries.includes(bot.weapon);
    bot.flashes = bot.team === 'attack' && hasPrimary && bot.money >= 800 ? 1 : 0;
    bot.smokes = bot.team === 'attack' && hasPrimary && bot.money >= 800 ? 1 : 0;
    bot.molos = bot.team === 'attack' && hasPrimary && bot.money >= 1200 && rng() < 0.4 ? 1 : 0;
    bot.hasKit = bot.team === 'defend' && bot.money >= 3350;
    if (bot.hasKit) bot.money -= 400;
  }

  function spawn(bot, x, z, yaw) {
    bot.pos.set(x, 0, z);
    bot.vel.set(0, 0, 0);
    bot.yaw = yaw;
    bot.hp = 100;
    bot.alive = true;
    bot.cooldown = 0;
    bot.reloadLeft = 0;
    bot.state = 'idle';
    bot.target = null;
    bot.targetIsPlayer = false;
    bot.lastSeen = null;
    bot.reactLeft = 0;
    bot.path = [];
    bot.pathIdx = 0;
    bot.heardAt = 0;
    bot.rotating = false;
    bot.rotateSite = null;
    bot.contactCalled = false;
    bot.rotateCalled = false;
    bot.executed = false;
    bot.hasBomb = false;
    bot.channel = null;
    bot.defuseLeft = 0;
    bot.plantLeft = 0;
    bot.flashLeft = 0;
    bot.visible = true;
    bot.stage = 0;
    bot.lastPos.copy(bot.pos);
    bot.stuckSince = 0;
    bot.movedSince = 0;
    bot.mesh.visible = true;
    bot.mesh.position.copy(bot.pos);
    bot.mesh.rotation.y = yaw;
  }

  // --- sight --------------------------------------------------------------------
  function siteClear(round) {
    // No living defender within 12 m of the site: the carrier can walk in.
    for (const b of bots) {
      if (!b.alive || b.team !== 'defend') continue;
      if (Math.hypot(b.pos.x - round.site.x, b.pos.z - round.site.z) < 12) return false;
    }
    return true;
  }

  function los(from, to, raycaster, shootables, smokes) {
    losDir.copy(to).sub(from);
    const dist = losDir.length();
    if (dist > SIGHT_RANGE) return false;
    raycaster.set(from, losDir.normalize());
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(shootables, false);
    if (hits.length > 0) return false;
    for (const smoke of smokes) {
      // A smoke cloud between the eyes blocks the line.
      const c = smoke.center;
      const d = tmp2.subVectors(c, from);
      const t = Math.max(0, Math.min(1, d.dot(losDir) / dist));
      losClosest.copy(from).addScaledVector(losDir, t * dist);
      if (losClosest.distanceTo(c) < 3.4) return false;
    }
    return true;
  }

  function eyePos(bot, out) {
    return out.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
  }

  function findTarget(bot, ctx) {
    // The player first, then the nearest living enemy bot. A target counts
    // only while the line is clear and the bot has had its reaction time.
    // The descriptor lives on the bot, so the scan allocates nothing.
    const eye = eyePos(bot, bot._eye);
    const out = bot._target;
    out.bot = null;
    out.dist = Infinity;
    if (ctx.playerAlive) {
      tmp.set(ctx.player.position.x, ctx.player.position.y + ctx.player.eye, ctx.player.position.z);
      const d = tmp.distanceTo(eye);
      if (d < out.dist && los(eye, tmp, ctx.raycaster, ctx.shootables, ctx.smokes)) {
        out.isPlayer = true;
        out.pos.copy(tmp);
        out.dist = d;
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      tmp.set(other.pos.x, other.pos.y + EYE, other.pos.z);
      const d = tmp.distanceTo(eye);
      if (d < out.dist && los(eye, tmp, ctx.raycaster, ctx.shootables, ctx.smokes)) {
        out.isPlayer = false;
        out.bot = other;
        out.pos.copy(tmp);
        out.dist = d;
      }
    }
    return out.dist === Infinity ? null : out;
  }

  // --- movement ------------------------------------------------------------------
  const probe = new THREE.Box3();
  function blockedAt(x, z) {
    probe.min.set(x - BOT_RADIUS, 0.04, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, BOT_HEIGHT - 0.04, z + BOT_RADIUS);
    for (const c of map.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function moveToward(bot, dt, tx, tz) {
    const ox = bot.pos.x;
    const oz = bot.pos.z;
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      bot.vel.set(0, 0, 0);
      return true;
    }
    const speed = bot.skillDef.speed * (bot.state === 'pursue' ? 1.08 : 1);
    const stepLen = Math.min(dist, speed * dt);
    const nx = bot.pos.x + (dx / dist) * stepLen;
    const nz = bot.pos.z + (dz / dist) * stepLen;
    const wantYaw = Math.atan2(-dx, -dz);
    let dy = wantYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 8);
    if (!blockedAt(nx, bot.pos.z)) bot.pos.x = nx;
    if (!blockedAt(bot.pos.x, nz)) bot.pos.z = nz;
    // Fire zones hurt, so a bot never stands in one on purpose.
    for (const fire of ctxFires) {
      if (bot.pos.distanceTo(fire.center) < fire.radius + 0.4) {
        const away = new THREE.Vector3(bot.pos.x - fire.center.x, 0, bot.pos.z - fire.center.z).normalize();
        bot.pos.x += away.x * speed * dt * 0.8;
        bot.pos.z += away.z * speed * dt * 0.8;
      }
    }
    bot.vel.set((bot.pos.x - ox) / dt, 0, (bot.pos.z - oz) / dt);
    return dist < 0.4;
  }

  let ctxFires = [];

  function followPath(bot, dt) {
    if (bot.pathIdx >= bot.path.length) return true;
    const node = bot.path[bot.pathIdx];
    const [x, z] = map.waypoints[node];
    if (moveToward(bot, dt, x, z)) bot.pathIdx += 1;
    return bot.pathIdx >= bot.path.length;
  }

  // --- combat ---------------------------------------------------------------------
  function fireAt(bot, ctx, target) {
    const def = WEAPONS[bot.weapon];
    if (bot.cooldown > 0 || bot.reloadLeft > 0) return;
    if (bot.mag <= 0) {
      bot.reloadLeft = def.reload;
      return;
    }
    bot.cooldown = def.rate * 1.35;
    bot.mag -= 1;
    const moving = bot.vel.length() > 0.5;
    const spread = def.spreadStill * bot.skillDef.spread * (1 + target.dist / 30) * (moving ? 2.2 : 1);
    const eye = eyePos(bot, bot._eye);
    const dir = tmp2.subVectors(target.pos, eye).normalize();
    dir.x += (rng() - 0.5) * spread * 2;
    dir.y += (rng() - 0.5) * spread * 2;
    dir.z += (rng() - 0.5) * spread * 2;
    dir.normalize();
    const hitChance = Math.max(0.12, 0.85 - target.dist / 55 - (moving ? 0.25 : 0));
    if (rng() < hitChance) {
      const head = rng() < (bot.skillDef === SKILLS.elite ? 0.18 : 0.11);
      const dmg = (head ? def.headDamage : def.damage) * bot.skillDef.damage;
      if (target.isPlayer) ctx.damagePlayer(dmg, bot);
      else ctx.damageBot(target.bot, dmg, head, bot);
      tracerTo.copy(target.pos);
      ctx.fireTracer(eye, tracerTo);
    } else {
      fireEnd.copy(eye).addScaledVector(dir, 60);
      ctx.fireTracer(eye, fireEnd);
    }
    ctx.shotSound(bot.pos);
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    bot.vel.set(0, 0, 0);
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.reactLeft = Math.max(0, bot.reactLeft - dt);
    bot.flashLeft = Math.max(0, bot.flashLeft - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const def = WEAPONS[bot.weapon];
        const need = def.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }

    // Flash blindness: a flashed bot stands still and sees nothing.
    if (bot.flashLeft > 0) {
      bot.target = null;
      return;
    }

    // Buy phase: hold at spawn and never fight early — the round starts
    // when the buy phase ends, not before.
    if (ctx.state.phase === 'buy') {
      bot.state = 'hold';
      return;
    }

    // The bomb is the objective: the nearest living attacker sprints for a
    // dropped bomb even while in a fight, and picks it up on arrival.
    if (bot.team === 'attack' && ctx.state.bombDropped && !ctx.state.bombCarrier) {
      let nearest = bot;
      let nearestDist = bot.pos.distanceTo(ctx.state.bomb);
      for (const other of bots) {
        if (!other.alive || other.team !== 'attack') continue;
        const d = other.pos.distanceTo(ctx.state.bomb);
        if (d < nearestDist) { nearestDist = d; nearest = other; }
      }
      if (nearest === bot) {
        if (bot.state !== 'fetch') {
          bot.state = 'fetch';
          setPath(bot, nearestNode(ctx.state.bomb));
        }
        const arrived = followPath(bot, dt);
        if (bot.pos.distanceTo(ctx.state.bomb) < 1.2) {
          ctx.state.bombCarrier = bot;
          bot.hasBomb = true;
          ctx.state.bombDropped = false;
          bot.state = 'push';
          bot.stage = 0;
          setPath(bot, bot.stagingNode);
          if (hooks.onBombPickup) hooks.onBombPickup(bot);
          return;
        }
        if (arrived) moveToward(bot, dt, ctx.state.bomb.x, ctx.state.bomb.z);
        return;
      }
    }

    // A defender standing on a planted bomb defuses it instead of fighting
    // — the fuse does not wait for the firefight to end.
    if (bot.team === 'defend' && ctx.state.planted) {
      const bd = Math.hypot(bot.pos.x - ctx.state.bomb.x, bot.pos.z - ctx.state.bomb.z);
      if (bd < 2.4) {
        bot.channel = 'defuse';
        const need = bot.hasKit ? 2.5 : 5;
        bot.defuseLeft = bot.defuseLeft || need;
        bot.defuseLeft -= dt;
        if (bot.defuseLeft <= 0) {
          bot.channel = null;
          hooks.onDefused(bot);
        }
        return;
      }
      if (bot.channel === 'defuse') bot.channel = null;
    }

    const target = findTarget(bot, ctx);
    if (target) {
      if (!bot.target) {
        // First sighting: start the reaction timer and call the contact.
        // The timer is armed only here — re-arming it on the frame it
        // expires would loop forever and the bot would never shoot.
        bot.reactLeft = bot.skillDef.react;
        if (!bot.contactCalled) {
          bot.contactCalled = true;
          hooks.onContact(bot, target.isPlayer ? 'player' : target.bot.name);
        }
      }
      bot.target = target;
      bot._seen.copy(target.pos);
      bot.lastSeen = bot._seen;
      if (bot.reactLeft === 0) {
        bot.state = 'combat';
        const dx = target.pos.x - bot.pos.x;
        const dz = target.pos.z - bot.pos.z;
        bot.yaw = Math.atan2(-dx, -dz);
        fireAt(bot, ctx, target);
        if (bot.mag <= 0 && bot.reserve > 0) bot.reloadLeft = WEAPONS[bot.weapon].reload;
      }
      return;
    }
    bot.target = null;

    // No target: follow the round's orders.
    const round = ctx.state;
    if (bot.team === 'attack') {
      if (round.planted) {
        // Guard the planted bomb from the site.
        if (bot.state !== 'guard') {
          bot.state = 'guard';
          setPath(bot, nearestNode(new THREE.Vector3(round.bomb.x, 0, round.bomb.z)));
        }
        if (followPath(bot, dt)) {
          bot.state = 'hold';
          bot.holdPos.set(round.bomb.x, 0, round.bomb.z);
        }
        return;
      }
      if (round.bombDropped && !round.bombCarrier) {
        // Fetch the dropped bomb.
        if (bot.state !== 'fetch') {
          bot.state = 'fetch';
          setPath(bot, nearestNode(round.bomb));
        }
        if (followPath(bot, dt)) {
          round.bombCarrier = bot;
          bot.hasBomb = true;
          bot.state = 'push';
          bot.stage = 0;
          setPath(bot, bot.stagingNode);
        }
        return;
      }
      if (bot.hasBomb) {
        // The carrier pushes via its staging lane, then to the site, and
        // plants when it reaches the site and the site is clear. setPath
        // runs once on entering the push: re-pathing every frame would
        // reset the path and freeze the carrier at its spawn.
        if (bot.state !== 'push') {
          bot.state = 'push';
          bot.stage = 0;
          setPath(bot, bot.stagingNode);
        }
        const siteDist = Math.hypot(bot.pos.x - round.site.x, bot.pos.z - round.site.z);
        if (siteDist < round.site.radius && !bot.target) {
          if (bot.channel !== 'plant') {
            bot.channel = 'plant';
            bot.plantLeft = 4;
          }
          bot.plantLeft = Math.max(0, bot.plantLeft - dt);
          if (bot.plantLeft === 0) {
            bot.channel = null;
            hooks.onPlanted(bot);
          }
          return;
        }
        if (bot.channel === 'plant') bot.channel = null;
        if (bot.stage === 0) {
          if (followPath(bot, dt)) {
            // Wait at the staging lane until the escorts clear the site —
            // the carrier walks in to plant, it does not entry-frag. Push
            // in regardless when the escorts are all dead (no one left to
            // clear it) or when time is short.
            const escortsAlive = bots.some((b) => b.alive && b.team === 'attack' && b !== bot);
            if (siteClear(round) || !escortsAlive || round.timeLeft < 35) {
              bot.stage = 1;
              setPath(bot, nearestNode(new THREE.Vector3(round.site.x, 0, round.site.z)));
            }
          }
        } else {
          followPath(bot, dt);
        }
        // Throw the execute grenades on arrival at the site approach.
        if (!bot.executed && bot.stage === 1 && bot.pathIdx >= bot.path.length - 1) {
          bot.executed = true;
          if (bot.smokes > 0) {
            bot.smokes -= 1;
            ctx.throwGrenade('smoke', eyePos(bot, new THREE.Vector3()), new THREE.Vector3(round.site.x - bot.pos.x, 0.4, round.site.z - bot.pos.z).normalize());
          } else if (bot.flashes > 0) {
            bot.flashes -= 1;
            ctx.throwGrenade('flash', eyePos(bot, new THREE.Vector3()), new THREE.Vector3(round.site.x - bot.pos.x, 0.4, round.site.z - bot.pos.z).normalize());
          } else if (bot.molos > 0) {
            bot.molos -= 1;
            ctx.throwGrenade('molotov', eyePos(bot, new THREE.Vector3()), new THREE.Vector3(round.site.x - bot.pos.x, 0.4, round.site.z - bot.pos.z).normalize());
          }
        }
        return;
      }
      // Escort: follow the plan to the site, via the staging lane.
      if (bot.state !== 'push' && bot.state !== 'pursue') {
        bot.state = 'push';
        bot.stage = 0;
        setPath(bot, bot.stagingNode);
      }
      if (bot.lastSeen) {
        if (bot.state !== 'pursue') {
          bot.state = 'pursue';
          setPath(bot, nearestNode(bot.lastSeen));
        }
        if (followPath(bot, dt)) bot.lastSeen = null;
      } else if (bot.stage === 0) {
        if (followPath(bot, dt)) {
          bot.stage = 1;
          setPath(bot, nearestNode(new THREE.Vector3(round.site.x, 0, round.site.z)));
        }
      } else {
        followPath(bot, dt);
      }
      return;
    }

    // Defenders.
    if (round.planted) {
      // Converge on the planted site. The defuse channel itself runs before
      // the combat check, so a defender on the bomb defuses rather than
      // trading fire.
      if (bot.state !== 'defuse') {
        bot.state = 'defuse';
        setPath(bot, nearestNode(new THREE.Vector3(round.bomb.x, 0, round.bomb.z)));
      }
      followPath(bot, dt);
      return;
    }
    if (bot.rotating && bot.rotateSite) {
      if (bot.state !== 'rotate') {
        bot.state = 'rotate';
        setPath(bot, nearestNode(new THREE.Vector3(bot.rotateSite.x, 0, bot.rotateSite.z)));
        if (!bot.rotateCalled) {
          bot.rotateCalled = true;
          hooks.onRotate(bot, bot.rotateSite.name);
        }
      }
      if (followPath(bot, dt)) {
        bot.rotating = false;
        bot.state = 'hold';
        bot.holdPos.set(bot.rotateSite.x, 0, bot.rotateSite.z);
      }
      return;
    }
    // Hold the assigned position.
    if (bot.state !== 'hold') {
      bot.state = 'hold';
      setPath(bot, nearestNode(bot.holdPos));
    }
    if (followPath(bot, dt)) {
      // Face south, toward the approach the attackers come down.
      let dy = Math.PI - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += dy * Math.min(1, dt * 4);
    }
  }

  // --- public API ------------------------------------------------------------------
  function hear(pos, loud) {
    const range = loud ? 40 : 26;
    for (const bot of bots) {
      if (!bot.alive || bot.team !== 'defend') continue;
      const d = bot.pos.distanceTo(pos);
      if (d > range) continue;
      bot.heardAt = 1;
      bot.heardPos.copy(pos);
      // A defender far from the sound rotates toward the site it came from.
      // Sounds near the middle of the map belong to no site and rotate no
      // one — otherwise a mid firefight drags both anchors off their sites.
      if (Math.abs(pos.x) < 6) continue;
      const site = pos.x > 0 ? { x: 22, z: -16, name: 'A' } : { x: -22, z: -16, name: 'B' };
      const ownDist = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z);
      if (ownDist > 9 && !bot.rotating) {
        bot.rotating = true;
        bot.rotateSite = site;
        bot.rotateCalled = false;
      }
    }
  }

  function applyFlash(at, radius = 14) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = bot.pos.distanceTo(at);
      if (d > radius) continue;
      // A bot is blinded only if it is looking at the pop.
      const toFlash = new THREE.Vector3(at.x - bot.pos.x, 0, at.z - bot.pos.z).normalize();
      const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      if (facing.dot(toFlash) > -0.2) bot.flashLeft = Math.max(bot.flashLeft, 2.2 - d * 0.08);
    }
  }

  return {
    state: bots,
    botLoadout,
    spawn,
    hear,
    applyFlash,
    step(dt, ctx) {
      ctxFires = ctx.fires || [];
      for (const bot of bots) stepBot(bot, dt, ctx);
      // Sync meshes, death fall-over, and the stuck watcher.
      for (const bot of bots) {
        bot.mesh.position.copy(bot.pos);
        bot.mesh.rotation.y = bot.yaw;
        if (!bot.alive) {
          bot.mesh.rotation.x = -Math.PI / 2 * 0.9;
          bot.mesh.position.y = 0.25;
        } else {
          bot.mesh.rotation.x = 0;
        }
        if (bot.alive && bot.state !== 'hold' && bot.state !== 'combat') {
          const moved = bot.pos.distanceTo(bot.lastPos);
          if (moved < 0.02) {
            bot.stuckSince += dt;
            if (bot.stuckSince > 2.5) {
              // Re-path from the current node; a waypoint edge can stall a
              // bot that was pushed off its line by a fire zone.
              bot.stuckSince = 0;
              bot.path = [];
              bot.pathIdx = 0;
              bot.state = 'idle';
            }
          } else {
            bot.stuckSince = 0;
          }
          bot.lastPos.copy(bot.pos);
        }
      }
    },
  };
}
