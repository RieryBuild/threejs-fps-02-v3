// HELIODROME — a desert solar array at golden dusk. Two sites, north: A
// "Panel Field" in the east panel rows, B "Inverter Yard" in the west. Three
// pushes: A Row through the east panels, B Row through the west panels, and
// the Service Road straight up the middle past the transmission pylon and
// through the gap in the Control building. Panels are low tilted cover —
// they block movement and crouched sight, but a standing player shoots
// over them; the tall blockers are the Control building, the inverter
// cabinets and the water tank. Waypoints sit in the lanes between panel
// columns and in the gaps between panels, so every edge is walkable.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  minX: -32,
  maxX: 32,
  minZ: -23,
  maxZ: 23,
  siteA: { x: 22, z: -16, radius: 2.6 },
  siteB: { x: -22, z: -16, radius: 2.6 },
  attackSpawns: [
    { x: -6, z: 19 }, { x: -3, z: 20 }, { x: 0, z: 20 }, { x: 3, z: 20 }, { x: 6, z: 19 },
  ],
  defendSpawns: {
    A: [{ x: 20, z: -13 }, { x: 28, z: -10 }],
    B: [{ x: -20, z: -13 }, { x: -28, z: -10 }],
    mid: [{ x: 0, z: -19.5 }],
  },
};

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e2148');
  grad.addColorStop(0.45, '#8a4a3c');
  grad.addColorStop(0.72, '#f2a541');
  grad.addColorStop(1, '#e08a4a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMap(scene) {
  const colliders = [];
  const shootables = [];
  const box3 = new THREE.Box3();
  const animated = { beacon: null, motes: null, beams: [] };

  function material(color, rough = 0.9, metal = 0) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal });
  }
  const sandMat = material(PALETTE.sand, 1);
  const roadMat = material(PALETTE.road, 1);
  const padMat = material(PALETTE.pad, 0.95);
  const panelMat = material(PALETTE.panel, 0.35, 0.55);
  const panelDarkMat = material(PALETTE.panelDark, 0.4, 0.5);
  const frameMat = material(PALETTE.panelFrame, 0.5, 0.7);
  const buildMat = material(PALETTE.building, 0.85);
  const buildDarkMat = material(PALETTE.buildingDark, 0.9);
  const steelMat = material(PALETTE.steel, 0.55, 0.6);
  const steelDarkMat = material(PALETTE.steelDark, 0.6, 0.5);
  const crateMat = material(PALETTE.crate, 0.9);
  const bagMat = material(PALETTE.sandbag, 1);
  const cabinetMat = material(PALETTE.inverter, 0.6, 0.3);
  const mesaMat = material(0x8a5a3c, 1);
  const amberGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.85, side: THREE.DoubleSide });

  function addBox(mat, x, y, z, w, h, d, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = !!opts.shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (opts.collide !== false) {
      box3.setFromObject(mesh);
      colliders.push(box3.clone());
    }
    if (opts.shoot !== false) shootables.push(mesh);
    return mesh;
  }

  function addCylinder(mat, x, y, z, rTop, rBottom, h, segments = 14, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !!opts.shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (opts.collide !== false) {
      box3.setFromObject(mesh);
      colliders.push(box3.clone());
    }
    if (opts.shoot !== false) shootables.push(mesh);
    return mesh;
  }

  // --- sky, sun, light -----------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sun), fog: false }),
  );
  sun.position.set(-85, 15, -48);
  sun.lookAt(0, 8, 0);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(new THREE.Color(0x8a7bb8), new THREE.Color(PALETTE.sandDark), 1.15);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(new THREE.Color(0xffb45e), 2.4);
  sunLight.position.set(-30, 26, 18);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40;
  sunLight.shadow.camera.bottom = -40;
  sunLight.shadow.camera.far = 120;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // --- ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), sandMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);
  // Service road: the dark strip up the middle.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 42), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, 0);
  road.receiveShadow = true;
  scene.add(road);
  // Concrete pads under the sites and the spawn.
  for (const [px, pz] of [[22, -16], [-22, -16], [0, 19]]) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(px, 0.02, pz);
    pad.receiveShadow = true;
    scene.add(pad);
  }

  // --- perimeter -------------------------------------------------------------
  addBox(buildDarkMat, 0, 2, -23.5, 66, 4, 1, { shadow: true });
  addBox(buildDarkMat, 0, 2, 23.5, 66, 4, 1, { shadow: true });
  addBox(buildDarkMat, -32.5, 2, 0, 1, 4, 48, { shadow: true });
  addBox(buildDarkMat, 32.5, 2, 0, 1, 4, 48, { shadow: true });

  // --- control building: two blocks with a 3 m gap (the mid choke) ----------
  addBox(buildMat, -4.25, 1.7, -13, 5.5, 3.4, 6, { shadow: true });
  addBox(buildMat, 4.25, 1.7, -13, 5.5, 3.4, 6, { shadow: true });
  addBox(buildDarkMat, -4.25, 3.5, -13, 5.9, 0.25, 6.4, { collide: false });
  addBox(buildDarkMat, 4.25, 3.5, -13, 5.9, 0.25, 6.4, { collide: false });
  // Amber window strips on the south faces, facing the attackers.
  for (const bx of [-4.25, 4.25]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }));
    strip.position.set(bx, 2.2, -9.95);
    scene.add(strip);
  }

  // --- transmission pylon east of the service road ------------------------------
  // It stands clear of the mid waypoint line, so bots walking the road never
  // have to squeeze around its legs.
  for (const [lx, lz] of [[-0.63, -0.63], [0.63, -0.63], [-0.63, 0.63], [0.63, 0.63]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.4, 0.18), steelDarkMat);
    leg.position.set(5 + lx, 3.2, -2 + lz);
    leg.rotation.z = -Math.sign(lx) * 0.09;
    leg.rotation.x = Math.sign(lz) * 0.09;
    leg.castShadow = true;
    scene.add(leg);
    shootables.push(leg);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 0.18), steelMat);
  arm.position.set(5, 6.1, -2);
  arm.castShadow = true;
  scene.add(arm);
  shootables.push(arm);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.16), steelMat);
  arm2.position.set(5, 5.4, -2);
  arm2.castShadow = true;
  scene.add(arm2);
  shootables.push(arm2);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.red) }),
  );
  beacon.position.set(5, 6.5, -2);
  scene.add(beacon);
  animated.beacon = beacon;
  box3.set(3.9, 0, -3.1, 6.1, 6, -0.9);
  colliders.push(box3.clone());

  // --- solar panel columns ----------------------------------------------------
  // Two columns per side, five tilted panels each. The lanes between columns
  // (x = ±12, ±20, ±28) and the gaps between panels (z = -11, -5, 1, 7)
  // are where the waypoints run; a panel's collider is the axis-aligned box
  // of its tilted mesh, so movement and bullets agree with what you see.
  function addPanel(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 1.15, z);
    group.rotation.x = -0.35;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 2.2), panelMat);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    const grid = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.02, 2.1), panelDarkMat);
    grid.position.y = 0.07;
    group.add(grid);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.06, 2.3), frameMat);
    frame.position.y = -0.05;
    group.add(frame);
    scene.add(group);
    group.updateMatrixWorld(true);
    box3.setFromObject(group);
    colliders.push(box3.clone());
    shootables.push(slab);
    // Two short legs hold the panel up; they sit inside the collider.
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), steelDarkMat);
    leg1.position.set(x - 1.4, 0.4, z + 0.7);
    scene.add(leg1);
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), steelDarkMat);
    leg2.position.set(x + 1.4, 0.4, z + 0.7);
    scene.add(leg2);
  }
  for (const colX of [16, 24, -16, -24]) {
    for (const pz of [-14, -8, -2, 4, 10]) addPanel(colX, pz);
  }

  // --- inverter cabinets at B -------------------------------------------------
  for (const [cx, cz] of [[-26, -19.5], [-22, -19.5], [-18, -19.5]]) {
    addBox(cabinetMat, cx, 1.2, cz, 2, 2.4, 1.2, { shadow: true });
    const vent = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), steelDarkMat);
    vent.position.set(cx, 1.6, cz + 0.62);
    scene.add(vent);
  }

  // --- crates and sandbags: low cover in the lanes and at the sites -----------
  for (const [cx, cz, s] of [
    [5, 4, 1.2], [-5, 4, 1.2], [8, 10, 1.1], [-8, 10, 1.1],
    [10, -6, 1.2], [-10, -6, 1.2], [26, -12, 1.2], [18, -12, 1.2],
    [-26, -12, 1.2], [-18, -12, 1.2], [30, -8, 1.1], [-30, -8, 1.1],
  ]) {
    addBox(crateMat, cx, s / 2, cz, s, s, s, { shadow: true, ry: (cx + cz) % 2 === 0 ? 0.2 : -0.15 });
  }
  for (const [bx, bz] of [[5, -6], [-5, -6], [16, -12], [-16, -12]]) {
    addBox(bagMat, bx, 0.45, bz, 2.2, 0.9, 0.9, { shadow: true });
  }

  // --- water tank, west edge -----------------------------------------------------
  addCylinder(steelMat, -29, 2, 17, 1.8, 1.8, 4, 18, { shadow: true });
  addCylinder(steelDarkMat, -29, 4.1, 17, 1.9, 1.9, 0.25, 18, { shadow: true });

  // --- distant mesas: silhouettes beyond the walls, for depth -------------------
  for (const [mx, mz, w, h, d] of [
    [0, -58, 34, 15, 9], [-58, -32, 22, 11, 9], [58, -36, 26, 13, 9],
    [62, 32, 22, 10, 9], [-62, 28, 20, 9, 9], [30, 62, 30, 8, 9],
  ]) {
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mesaMat);
    mesa.position.set(mx, h / 2 - 0.5, mz);
    scene.add(mesa);
  }

  // --- site markers: a ring on the pad and a faint amber beam --------------------
  for (const site of [MAP.siteA, MAP.siteB]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.4, site.radius, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.04, site.z);
    scene.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(site.x, 4.5, site.z);
    scene.add(beam);
    animated.beams.push(beam);
  }

  // --- dust motes: a slow golden drift over the array -----------------------------
  const moteCount = 260;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) {
    motePos[i * 3] = (Math.random() * 2 - 1) * 30;
    motePos[i * 3 + 1] = 0.4 + Math.random() * 5.5;
    motePos[i * 3 + 2] = (Math.random() * 2 - 1) * 21;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: new THREE.Color(0xffd9a0), size: 0.09, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  scene.add(motes);
  animated.motes = motes;

  // --- waypoints ------------------------------------------------------------------
  // Nodes sit in the lanes (x = ±12, ±20, ±28, service road x = 0) and in the
  // gaps between panels; edges run along lanes and across gap rows only, so
  // no edge crosses a panel, a crate or the Control building. Edge 10–11
  // runs through the 3 m gap in the building.
  const waypoints = [
    [0, 19], [-6, 16], [6, 16], [0, 12], [-4, 8], [4, 8], [0, 4],
    [-3, 0], [3, 0], [0, -6], [0, -9], [0, -19.5],
    [12, 14], [20, 14], [28, 14], [12, 8], [20, 8], [28, 8],
    [12, 2], [20, 2], [28, 2], [12, -4], [20, -4], [28, -4],
    [12, -10], [20, -10], [28, -10], [12, -13], [20, -13], [22, -16],
    [-12, 14], [-20, 14], [-28, 14], [-12, 8], [-20, 8], [-28, 8],
    [-12, 2], [-20, 2], [-28, 2], [-12, -4], [-20, -4], [-28, -4],
    [-12, -10], [-20, -10], [-28, -10], [-12, -13], [-20, -13], [-22, -16],
  ];
  const edges = [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6],
    [6, 7], [6, 8], [7, 9], [8, 9], [9, 10], [10, 11],
    [3, 12], [3, 30], [4, 33], [5, 15], [6, 18], [6, 36],
    [9, 24], [9, 42], [10, 24], [10, 42],
    [11, 28], [11, 46], [11, 29], [11, 47],
    [12, 13], [13, 14], [15, 16], [16, 17], [18, 19], [19, 20],
    [21, 22], [22, 23], [24, 25], [25, 26],
    [12, 15], [15, 18], [18, 21], [21, 24],
    [13, 16], [16, 19], [19, 22], [22, 25],
    [14, 17], [17, 20], [20, 23], [23, 26],
    [24, 27], [25, 28], [28, 29],
    [30, 31], [31, 32], [33, 34], [34, 35], [36, 37], [37, 38],
    [39, 40], [40, 41], [42, 43], [43, 44],
    [30, 33], [33, 36], [36, 39], [39, 42],
    [31, 34], [34, 37], [37, 40], [40, 43],
    [32, 35], [35, 38], [38, 41], [41, 44],
    [42, 45], [43, 46], [44, 46], [46, 47],
  ];
  const adjacency = waypoints.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function step(dt, time) {
    if (animated.beacon) animated.beacon.visible = (time % 1.4) < 0.9;
    if (animated.motes) {
      animated.motes.rotation.y = time * 0.004;
      animated.motes.position.y = Math.sin(time * 0.25) * 0.15;
    }
    for (const beam of animated.beams) {
      beam.material.opacity = 0.13 + Math.sin(time * 1.6) * 0.05;
    }
  }

  return { colliders, shootables, waypoints, adjacency, step };
}
