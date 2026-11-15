// Weapons: five hitscan guns with their own fire rate, damage, spread and
// recoil, plus smoke, flash and molotov grenades. Each weapon owns its
// numbers, its view model and its timers; main.js owns the ray and the
// damage. Grenades fly as small physics arcs and resolve on landing: smoke
// blocks sight, flash blinds anyone looking at it, molotov burns a patch of
// floor that hurts anyone standing in it. A molotov's fire is a zone main.js
// reads every step, so bots can path around it too. Aiming down sights
// centres the view model and tightens the spread the caller passes in.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sunburst: {
    name: 'Sunburst', kind: 'rifle', price: 2700, auto: true, rate: 0.1,
    damage: 34, headDamage: 102, mag: 25, reserve: 75, reload: 2.1,
    spreadStill: 0.0022, spreadMoving: 0.03, pellets: 1, kick: 0.011,
  },
  dustline: {
    name: 'Dustline', kind: 'smg', price: 1500, auto: true, rate: 0.066,
    damage: 22, headDamage: 66, mag: 32, reserve: 96, reload: 1.7,
    spreadStill: 0.004, spreadMoving: 0.034, pellets: 1, kick: 0.007,
  },
  breacher: {
    name: 'Breacher', kind: 'shotgun', price: 1200, auto: false, rate: 0.85,
    damage: 12, headDamage: 30, mag: 6, reserve: 24, reload: 2.6,
    spreadStill: 0.045, spreadMoving: 0.06, pellets: 8, kick: 0.03,
  },
  longshot: {
    name: 'Longshot', kind: 'dmr', price: 3200, auto: false, rate: 0.45,
    damage: 68, headDamage: 170, mag: 10, reserve: 30, reload: 2.4,
    spreadStill: 0.0012, spreadMoving: 0.05, pellets: 1, kick: 0.02,
  },
  sidearm: {
    name: 'Sidearm', kind: 'pistol', price: 300, auto: false, rate: 0.16,
    damage: 26, headDamage: 78, mag: 12, reserve: 36, reload: 1.4,
    spreadStill: 0.003, spreadMoving: 0.026, pellets: 1, kick: 0.008,
  },
};

const MOVE_REFERENCE = 5.4;
const FIRE_SECONDS = 6;
const FIRE_RADIUS = 2.6;
const FIRE_DPS = 25;

export function createWeaponSet(camera, scene) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a4632'), roughness: 0.7, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a8f8c'), roughness: 0.4, metalness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), roughness: 0.4, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262b'), roughness: 0.6, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    if (def.kind === 'rifle') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.46), steel);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.44), grip);
      barrel.position.set(0, 0.03, -0.42);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.24), grip);
      stock.position.set(0, -0.02, 0.32);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.12), brass);
      sight.position.set(0, 0.09, -0.05);
      const accent = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), brass);
      accent.position.set(0, -0.045, -0.1);
      model.add(receiver, barrel, stock, sight, accent);
    } else if (def.kind === 'smg') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.36), steel);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
      mag.position.set(0, -0.12, -0.02);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
      barrel.position.set(0, 0.02, -0.32);
      model.add(receiver, mag, barrel);
    } else if (def.kind === 'shotgun') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), steel);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.02, -0.3);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.2), grip);
      pump.position.set(0, -0.03, -0.28);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.26), grip);
      stock.position.set(0, -0.02, 0.3);
      model.add(tube, pump, stock);
    } else if (def.kind === 'dmr') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), dark);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), steel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, -0.5);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), steel);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.1, -0.05);
      const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), dark);
      bipod.position.set(0, -0.1, -0.35);
      model.add(receiver, barrel, scope, bipod);
    } else {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.24), steel);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), grip);
      handle.position.set(0, -0.08, 0.08);
      model.add(slide, handle);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = false; });
    return model;
  }

  const models = {};
  for (const [key, def] of Object.entries(WEAPONS)) models[key] = buildModel(def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const current = {
    key: 'sidearm',
    mag: WEAPONS.sidearm.mag,
    reserve: WEAPONS.sidearm.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    aimBlend: 0,
  };
  let shown = null;
  function showModel() {
    if (shown) camera.remove(shown);
    shown = models[current.key];
    camera.add(shown);
  }
  showModel();

  // --- grenades ------------------------------------------------------------
  const smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfd6cf'), transparent: true, opacity: 0.55, depthWrite: false });
  const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a'), transparent: true, opacity: 0.6, depthWrite: false });
  const smokes = [];
  const fires = [];
  const thrown = [];
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);
  const fireGeo = new THREE.CylinderGeometry(FIRE_RADIUS, FIRE_RADIUS * 0.8, 0.5, 14);

  function throwGrenade(kind, origin, dir) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), kind === 'smoke' ? smokeMat : kind === 'molotov' ? fireMat : brass);
    mesh.position.copy(origin);
    scene.add(mesh);
    thrown.push({
      kind, mesh,
      vel: dir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.2, 0)),
      life: 0,
    });
  }

  function stepGrenades(dt, onLand) {
    for (let i = thrown.length - 1; i >= 0; i -= 1) {
      const g = thrown[i];
      g.life += dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y <= 0.08 || g.life > 2.2) {
        g.mesh.position.y = Math.max(0.08, g.mesh.position.y);
        scene.remove(g.mesh);
        thrown.splice(i, 1);
        onLand(g.kind, g.mesh.position.clone());
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.left -= dt;
      s.mesh.scale.setScalar(Math.min(4, s.mesh.scale.x + dt * 3));
      s.mesh.material.opacity = Math.max(0, Math.min(0.55, s.left / 4));
      if (s.left <= 0) {
        scene.remove(s.mesh);
        smokes.splice(i, 1);
      }
    }
    for (let i = fires.length - 1; i >= 0; i -= 1) {
      const f = fires[i];
      f.left -= dt;
      f.mesh.material.opacity = Math.max(0, Math.min(0.6, f.left / 2));
      f.mesh.scale.set(1 + Math.sin(f.left * 9) * 0.06, 1, 1 + Math.cos(f.left * 7) * 0.06);
      if (f.left <= 0) {
        scene.remove(f.mesh);
        fires.splice(i, 1);
      }
    }
  }

  function addSmoke(at) {
    const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
    mesh.position.set(at.x, 1.1, at.z);
    mesh.scale.setScalar(0.6);
    scene.add(mesh);
    smokes.push({ mesh, left: 12, center: at.clone() });
  }

  function addFire(at) {
    const mesh = new THREE.Mesh(fireGeo, fireMat.clone());
    mesh.position.set(at.x, 0.25, at.z);
    scene.add(mesh);
    fires.push({ mesh, left: FIRE_SECONDS, center: at.clone(), radius: FIRE_RADIUS, dps: FIRE_DPS });
  }

  function clearZones() {
    for (const s of smokes) scene.remove(s.mesh);
    for (const f of fires) scene.remove(f.mesh);
    smokes.length = 0;
    fires.length = 0;
    for (const g of thrown) scene.remove(g.mesh);
    thrown.length = 0;
  }

  function step(dt, aiming) {
    current.cooldown = Math.max(0, current.cooldown - dt);
    current.flash = Math.max(0, current.flash - dt);
    current.kick += (0 - current.kick) * Math.min(1, dt * 14);
    // Aim blend eases the view model from hip to shoulder in ~120 ms.
    const target = aiming ? 1 : 0;
    current.aimBlend += (target - current.aimBlend) * Math.min(1, dt * 18);
    if (shown) {
      const b = current.aimBlend;
      shown.position.set(0.24 * (1 - b), -0.2 + 0.045 * b, -0.42 - 0.08 * b);
      shown.position.z += current.kick;
      shown.rotation.x = current.kick * 2.2;
    }
    flash.visible = current.flash > 0;
    flash.rotation.z = current.flash * 8;
    flashLight.intensity = current.flash > 0 ? 18 : 0;
    if (current.reloadLeft > 0) {
      const def = WEAPONS[current.key];
      current.reloadLeft = Math.max(0, current.reloadLeft - dt);
      if (shown) shown.rotation.x = -0.55 * Math.min(1, (def.reload - current.reloadLeft) * 2);
      if (current.reloadLeft === 0) {
        const need = def.mag - current.mag;
        const take = Math.min(need, current.reserve);
        current.mag += take;
        current.reserve -= take;
      }
    }
  }

  return {
    state: current,
    def() { return WEAPONS[current.key]; },
    step,
    stepGrenades,
    addSmoke,
    addFire,
    clearZones,
    throwGrenade,
    smokes,
    fires,
    forceFlash() {
      // Staged screenshots keep the muzzle flash in the frame — bigger
      // than the live flash so it reads in a still.
      current.flash = 0.06;
      flash.scale.setScalar(1.5);
      flash.visible = true;
      flashLight.intensity = 18;
    },
    ready() {
      return current.mag > 0 && current.cooldown === 0 && current.reloadLeft === 0;
    },
    pullTrigger() {
      current.cooldown = WEAPONS[current.key].rate;
      current.flash = 0.06;
      current.kick = 0.055;
    },
    takeRound() {
      if (current.mag <= 0) return false;
      current.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[current.key];
      if (current.reloadLeft > 0 || current.mag === def.mag || current.reserve === 0) return false;
      current.reloadLeft = def.reload;
      return true;
    },
    spread(speed) {
      const def = WEAPONS[current.key];
      const base = def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
      return base * (1 - current.aimBlend * 0.55);
    },
    equip(key, keepAmmo) {
      if (!WEAPONS[key] || current.key === key) return;
      const def = WEAPONS[key];
      current.key = key;
      if (!keepAmmo || current.mag === 0) {
        current.mag = def.mag;
        current.reserve = def.reserve;
      }
      current.cooldown = 0;
      current.reloadLeft = 0;
      showModel();
    },
    refillAmmo() {
      const def = WEAPONS[current.key];
      current.mag = def.mag;
      current.reserve = def.reserve;
      current.cooldown = 0;
      current.reloadLeft = 0;
    },
  };
}
