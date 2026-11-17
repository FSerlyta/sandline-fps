// SANDLINE: a desert outpost, built from boxes. Two bomb sites (A west, B east), a mid
// plaza, a long sightline down the middle and a connector lane behind the sites. Every
// box is a collider for bodies and a surface a bullet stops on. The waypoint graph at
// the bottom is what the bots navigate on; every node sits in open ground.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { x: -20, z: -14, r: 4.5, label: 'A' },
  B: { x: 20, z: -14, r: 4.5, label: 'B' },
};
export const FALCON_SPAWN = { x: 0, z: 18, yaw: 0 };
export const VIPER_SPAWN = { x: 0, z: -18, yaw: Math.PI };

// Waypoints: id -> [x, z]; edges are bidirectional.
const WAYPOINTS = {
  fSpawn: [0, 18], fMid: [0, 12], fWest: [-12, 14], fEast: [12, 14],
  midS: [0, 6], mid: [0, 0], midN: [0, -6],
  aApp: [-12, 4], aMid: [-14, -4], aSite: [-20, -14], aBack: [-22, 6],
  bApp: [12, 4], bMid: [14, -4], bSite: [20, -14], bBack: [22, 6],
  conW: [-8, -12], conMid: [0, -12], conE: [8, -12],
  vMid: [0, -14], vSpawn: [0, -18], vWest: [-12, -16], vEast: [12, -16],
};
const EDGES = {
  fSpawn: ['fMid', 'fWest', 'fEast'],
  fMid: ['fSpawn', 'midS', 'fWest', 'fEast'],
  fWest: ['fSpawn', 'fMid', 'aBack'],
  fEast: ['fSpawn', 'fMid', 'bBack'],
  midS: ['fMid', 'mid', 'aApp', 'bApp'],
  mid: ['midS', 'midN', 'aApp', 'bApp'],
  midN: ['mid', 'vMid', 'conMid'],
  aApp: ['midS', 'mid', 'aMid', 'aBack'],
  aMid: ['aApp', 'aSite', 'conW'],
  aSite: ['aMid', 'conW'],
  aBack: ['fWest', 'aApp', 'aSite'],
  bApp: ['midS', 'mid', 'bMid', 'bBack'],
  bMid: ['bApp', 'bSite', 'conE'],
  bSite: ['bMid', 'conE'],
  bBack: ['fEast', 'bApp', 'bSite'],
  conW: ['aMid', 'aSite', 'conMid'],
  conMid: ['conW', 'conE', 'midN', 'vMid'],
  conE: ['bMid', 'bSite', 'conMid'],
  vMid: ['midN', 'conMid', 'vSpawn', 'vWest', 'vEast'],
  vSpawn: ['vMid'],
  vWest: ['vMid', 'aSite'],
  vEast: ['vMid', 'bSite'],
};

// Breadth-first search over the graph; returns an array of [x, z] steps, start excluded.
export function findPath(fromId, toId) {
  if (fromId === toId) return [];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const next of EDGES[id] || []) {
      if (prev[next] !== undefined) continue;
      prev[next] = id;
      if (next === toId) {
        const path = [];
        let at = next;
        while (at !== fromId) {
          path.unshift(WAYPOINTS[at]);
          at = prev[at];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

export function nearestWaypoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const id of Object.keys(WAYPOINTS)) {
    const [wx, wz] = WAYPOINTS[id];
    const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of ['canvas', 'surface', 'hairline', 'sand', 'ink', 'muted', 'accent', 'falcon', 'viper']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.95,
      metalness: 0.02,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: pale sand, 52 x 44 m. Perimeter walls 5 m high, open sky above.
  box(52.4, 0.4, 44.4, 0, -0.2, 0, 'sand');
  box(0.5, 5, 44.4, -26.2, 2.5, 0, 'surface');
  box(0.5, 5, 44.4, 26.2, 2.5, 0, 'surface');
  box(52.4, 5, 0.5, 0, 2.5, -22.2, 'surface');
  box(52.4, 5, 0.5, 0, 2.5, 22.2, 'surface');

  // Mid plaza: low sandstone blocks and two pillars frame the long sightline.
  box(4, 1.1, 4, 0, 0.55, 0, 'surface');
  box(1.2, 3.4, 1.2, -3.2, 1.7, -3.2, 'hairline');
  box(1.2, 3.4, 1.2, 3.2, 1.7, 3.2, 'hairline');
  box(2.2, 0.9, 2.2, -7, 0.45, 8, 'hairline');
  box(2.2, 0.9, 2.2, 7, 0.45, 8, 'hairline');

  // Spawn cover: low walls both teams start behind.
  box(6, 1.2, 0.8, -6, 0.6, 15.5, 'hairline');
  box(6, 1.2, 0.8, 6, 0.6, 15.5, 'hairline');
  box(6, 1.2, 0.8, -6, 0.6, -15.5, 'hairline');
  box(6, 1.2, 0.8, 6, 0.6, -15.5, 'hairline');

  // Site A (west): crates, a hut wall with a doorway gap, a tall container.
  box(3.4, 1.1, 1.4, -20, 0.55, -9.5, 'hairline');
  box(1.4, 1.1, 3.4, -16, 0.55, -14, 'hairline');
  box(2.4, 2.4, 2.4, -23.5, 1.2, -18.5, 'surface');
  box(1.2, 1.1, 1.2, -17.5, 0.55, -18, 'hairline');
  box(0.6, 3.2, 5, -14.2, 1.6, -18.5, 'surface');
  // Site B (east): mirrored in spirit, different arrangement.
  box(1.4, 1.1, 3.4, 16, 0.55, -14, 'hairline');
  box(3.4, 1.1, 1.4, 20, 0.55, -9.5, 'hairline');
  box(2.4, 2.4, 2.4, 23.5, 1.2, -18.5, 'surface');
  box(1.2, 1.1, 1.2, 17.5, 0.55, -18, 'hairline');
  box(0.6, 3.2, 5, 14.2, 1.6, -18.5, 'surface');

  // Connector lane (z = -12): two crates force a peek, not a spray.
  box(1.6, 1.2, 1.6, -4, 0.6, -12, 'hairline');
  box(1.6, 1.2, 1.6, 4, 0.6, -12, 'hairline');

  // Flanks: tall containers near each approach, a raised platform south-west.
  box(2.6, 2.6, 2.6, -22, 1.3, 6, 'surface');
  box(2.6, 2.6, 2.6, 22, 1.3, 6, 'surface');
  box(4.4, 0.9, 4.4, -9, 0.45, 10, 'surface');
  box(4.4, 0.9, 4.4, 9, 0.45, 10, 'surface');

  // Distant dunes outside the walls, for the skyline (not colliders: beyond the walls).
  const duneMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 1 });
  for (let index = 0; index < 7; index += 1) {
    const dune = new THREE.Mesh(new THREE.ConeGeometry(9 + index * 2, 4 + index, 5), duneMaterial);
    const angle = (index / 7) * Math.PI * 2;
    dune.position.set(Math.cos(angle) * 46, 0.4, Math.sin(angle) * 40);
    dune.rotation.y = angle;
    scene.add(dune);
  }

  // Bomb-site markers: a coloured floor plate and a pole with a flag box.
  const siteMarkers = [];
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(site.r * 2, 0.06, site.r * 2),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.7, transparent: true, opacity: 0.35, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 }),
    );
    plate.position.set(site.x, 0.03, site.z);
    plate.receiveShadow = true;
    scene.add(plate);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4.4, 0.15), materials.hairline);
    pole.position.set(site.x + site.r - 0.4, 2.2, site.z - site.r + 0.4);
    pole.castShadow = true;
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.06), materials.accent);
    flag.position.set(site.x + site.r - 1.1, 3.9, site.z - site.r + 0.4);
    flag.castShadow = true;
    scene.add(flag);
    siteMarkers.push(plate);
  }

  // Light: low golden sun, warm sky, cool fill — a desert outpost at golden hour.
  const sky = new THREE.HemisphereLight(new THREE.Color('#f2e3c2'), new THREE.Color('#7a5c3e'), 1.05);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.4);
  sun.position.set(18, 22, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-14, 10, 16);
  scene.add(fill);

  return { colliders, shootables, group, siteMarkers };
}
