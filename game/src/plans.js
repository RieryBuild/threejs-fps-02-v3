// Team plans: at every buy phase the attackers pick a site and a shape, the
// defenders split across the sites, and the plan is announced so the player
// can play with the team instead of guessing. The plans are data: the bots
// and the HUD both read the same object, so the callout line always matches
// what the bots actually do. Zone names are the same strings the HUD shows
// as the player's location, so a callout like "going A — Panel Field" and
// the location label agree.
import { mulberry32, pick } from './rng.js';

export const PLANS = [
  { id: 'a-rush', site: 'A', label: 'Rush A — Panel Field', desc: 'Five through A Row, smoke the line, plant fast.' },
  { id: 'b-rush', site: 'B', label: 'Rush B — Inverter Yard', desc: 'Five through B Row, molotov the crates, plant fast.' },
  { id: 'a-split', site: 'A', label: 'Split A — Panel Field', desc: 'Three A Row, two swing through Service Road.' },
  { id: 'b-split', site: 'B', label: 'Split B — Inverter Yard', desc: 'Three B Row, two swing through Service Road.' },
  { id: 'mid-fake', site: 'A', label: 'Mid fake — Service Road', desc: 'Noise down Mid, then commit A.' },
  { id: 'mid-fake-b', site: 'B', label: 'Mid fake — Service Road', desc: 'Noise down Mid, then commit B.' },
];

export const SITE_ZONES = {
  A: { name: 'Panel Field', x: 22, z: -16 },
  B: { name: 'Inverter Yard', x: -22, z: -16 },
};

// Staging nodes: one lane approach per attacker, so the push spreads across
// the lanes on the site's side instead of clumping up the Service Road,
// where every defender can crossfire it. Waypoint indices into map.js.
export const STAGING = {
  A: [13, 12, 16, 15],
  B: [31, 30, 34, 33],
};

export const ZONE_NAMES = [  { name: 'PANEL FIELD', x0: 14, x1: 32, z0: -23, z1: -10 },
  { name: 'INVERTER YARD', x0: -32, x1: -14, z0: -23, z1: -10 },
  { name: 'SERVICE ROAD', x0: -4, x1: 4, z0: -18, z1: 12 },
  { name: 'CONTROL', x0: -8, x1: 8, z0: -18, z1: -8 },
  { name: 'PANEL ROWS', x0: 10, x1: 32, z0: -10, z1: 12 },
  { name: 'PANEL ROWS', x0: -32, x1: -10, z0: -10, z1: 12 },
  { name: 'ARRAY GATE', x0: -32, x1: 32, z0: 12, z1: 23 },
];

export function zoneAt(x, z) {
  for (const zone of ZONE_NAMES) {
    if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone.name;
  }
  return 'HELIODROME';
}

export function createPlans(seed) {
  const rng = mulberry32(seed);
  const plan = pick(rng, PLANS);
  const site = SITE_ZONES[plan.site];
  return {
    plan,
    site,
    // Defenders: 2 hold A, 2 hold B, 1 roams Mid.
    defense: { A: 2, B: 2, mid: 1 },
    announce() {
      return `${plan.label} — ${plan.desc}`;
    },
  };
}
