// Rounds: a first-to-7 match of up to 12 rounds. Each round opens with a
// 15-second buy phase (the attackers pick a plan, the defenders take their
// holds), then 100 seconds of live play, then a short end banner. The bomb
// fuses for 35 seconds once planted; a defuse takes 5 seconds, or 2.5 with
// a defuse kit. The economy pays $400 a win, a $200/$300/$400 loss bonus
// that grows with the losing streak, $50 a kill and $50 for the plant — the
// same numbers for the player and the bots, so a bot that keeps dying stays
// poor and buys an SMG next round.
import * as THREE from 'three';
import { createPlans, STAGING } from './plans.js';
import { MAP } from './map.js';

export const WIN_ROUNDS = 7;
export const MAX_ROUNDS = 12;
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 4;
export const DEFUSE_SECONDS = 5;

const DEFEND_HOLDS = {
  A: [{ x: 20, z: -13 }, { x: 28, z: -10 }],
  B: [{ x: -20, z: -13 }, { x: -28, z: -10 }],
  // The roamer holds north of the Control building: from the south side it
  // would have a straight sightline down the Service Road to the attack
  // spawn and could snipe the attackers before the round starts.
  mid: [{ x: 0, z: -18 }],
};

export function createRounds(bots, hooks, getPlayerMoney, setPlayerMoney) {
  const state = {
    phase: 'buy',
    round: 1,
    wins: { attack: 0, defend: 0 },
    lossStreak: { attack: 0, defend: 0 },
    timeLeft: BUY_SECONDS,
    plan: null,
    site: { x: 22, z: -16, radius: 2.6, name: 'Panel Field' },
    bomb: new THREE.Vector3(0, 0, 19),
    bombCarrier: null,
    bombDropped: false,
    planted: false,
    fuseLeft: FUSE_SECONDS,
    mvp: null,
    endReason: null,
    endTimer: 0,
  };
  let seed = 1;

  function living(team) {
    return bots.state.filter((b) => b.alive && b.team === team);
  }

  function startRound() {
    seed += 1;
    const plans = createPlans(seed * 7919 + state.round * 131);
    state.plan = plans.plan;
    state.site = { ...plans.site, radius: 2.6 };
    state.phase = 'buy';
    state.timeLeft = BUY_SECONDS;
    state.planted = false;
    state.bombDropped = false;
    state.fuseLeft = FUSE_SECONDS;
    state.mvp = null;
    state.endReason = null;
    // Spawns: attackers at the gate, defenders at their holds.
    const attackers = bots.state.filter((b) => b.team === 'attack');
    const defenders = bots.state.filter((b) => b.team === 'defend');
    attackers.forEach((bot, i) => {
      const s = MAP.attackSpawns[i % MAP.attackSpawns.length];
      bots.spawn(bot, s.x, s.z, 0);
      bots.botLoadout(bot, state.round);
      bot.roundKills = 0;
      // One lane approach per attacker, on the plan's site side.
      bot.stagingNode = STAGING[state.plan.site][i % STAGING[state.plan.site].length];
    });
    const aHolds = DEFEND_HOLDS.A;
    const bHolds = DEFEND_HOLDS.B;
    const midHold = DEFEND_HOLDS.mid[0];
    defenders.forEach((bot, i) => {
      let hold;
      if (i < 2) hold = aHolds[i];
      else if (i < 4) hold = bHolds[i - 2];
      else hold = midHold;
      bots.spawn(bot, hold.x, hold.z, Math.PI);
      bots.botLoadout(bot, state.round);
      bot.roundKills = 0;
      bot.holdPos.set(hold.x, 0, hold.z);
    });
    // The bomb goes to the first living attacker, the entry fragger.
    const carrier = attackers[0];
    state.bombCarrier = carrier;
    carrier.hasBomb = true;
    state.bomb.set(carrier.pos.x, 0, carrier.pos.z);
    hooks.onRoundStart(state.round, state.plan);
  }

  function startMatch(matchSeed) {
    seed = matchSeed || 1;
    state.round = 1;
    state.wins.attack = 0;
    state.wins.defend = 0;
    state.lossStreak.attack = 0;
    state.lossStreak.defend = 0;
    startRound();
  }

  function applyEconomy(winner, playerKills) {
    const loser = winner === 'attack' ? 'defend' : 'attack';
    state.lossStreak[winner] = 0;
    state.lossStreak[loser] += 1;
    // First loss $200, second $300, third and on $400.
    const lossBonus = Math.min(400, 100 + state.lossStreak[loser] * 100);
    for (const bot of bots.state) {
      const won = bot.team === winner;
      bot.money += won ? 400 : lossBonus;
      bot.money += (bot.roundKills || 0) * 50;
    }
    let money = getPlayerMoney();
    money += winner === 'attack' ? 400 : lossBonus;
    money += playerKills * 50;
    setPlayerMoney(money);
  }

  function mvpLine(playerKills, playerName) {
    let best = { name: playerName, kills: playerKills, team: 'attack' };
    for (const bot of bots.state) {
      if ((bot.roundKills || 0) > best.kills) {
        best = { name: bot.name, kills: bot.roundKills, team: bot.team };
      }
    }
    return best.kills > 0 ? best : null;
  }

  function endRound(winner, reason, playerKills) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.wins[winner] += 1;
    state.phase = 'end';
    state.endReason = reason;
    state.endTimer = 4.5;
    state.mvp = mvpLine(playerKills || 0, 'YOU');
    applyEconomy(winner, playerKills || 0);
    hooks.onRoundEnd(winner, reason, state.mvp);
    if (state.wins[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      hooks.onMatchEnd(winner, state.wins);
    }
  }

  function plantBomb(bot) {
    if (state.planted || state.phase !== 'live') return;
    state.planted = true;
    state.fuseLeft = FUSE_SECONDS;
    state.bomb.set(state.site.x, 0, state.site.z);
    state.bombCarrier = null;
    bot.hasBomb = false;
    hooks.onPlant(bot);
  }

  function defuseBomb(bot) {
    if (!state.planted || state.phase !== 'live') return;
    hooks.onDefuse(bot);
    endRound('defend', 'defused', hooks.playerKills());
  }

  function dropBomb(pos) {
    if (state.planted) return;
    state.bombDropped = true;
    state.bombCarrier = null;
    state.bomb.set(pos.x, 0, pos.z);
    hooks.onBombDrop();
  }

  function update(dt, playerAlive) {
    if (state.phase === 'buy') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.phase = 'live';
        state.timeLeft = ROUND_SECONDS;
        hooks.onLive();
      }
      return;
    }
    if (state.phase === 'live') {
      state.timeLeft -= dt;
      if (state.planted) {
        state.fuseLeft -= dt;
        if (state.fuseLeft <= 0) {
          endRound('attack', 'detonated', hooks.playerKills());
          return;
        }
      }
      const attackAlive = living('attack').length + (playerAlive ? 1 : 0);
      const defendAlive = living('defend').length;
      if (attackAlive === 0) {
        endRound('defend', 'eliminated', hooks.playerKills());
        return;
      }
      if (defendAlive === 0) {
        endRound('attack', 'eliminated', hooks.playerKills());
        return;
      }
      if (state.timeLeft <= 0) {
        endRound(state.planted ? 'attack' : 'defend', 'time', hooks.playerKills());
      }
      return;
    }
    if (state.phase === 'end') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) {
        state.round += 1;
        startRound();
      }
    }
  }

  return {
    state,
    startMatch,
    startRound,
    update,
    endRound,
    plantBomb,
    defuseBomb,
    dropBomb,
    living,
  };
}
