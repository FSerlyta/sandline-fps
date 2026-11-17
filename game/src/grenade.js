// Thrown HE grenades: a small sphere with an arc, a bounce off the world's boxes and a
// fuse. On detonation it hurts through open air only — a wall between the blast and a
// body blocks it, checked with a line-of-sight ray.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 18;
const FUSE = 1.8;
const BLAST_RADIUS = 6.5;
const MAX_DAMAGE = 95;

export function createGrenades(scene, world) {
  const items = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = BLAST_RADIUS + 1;
  const from = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const flashGeometry = new THREE.SphereGeometry(1, 16, 12);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false,
  });

  function throwGrenade(origin, direction, speed = 15) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a332a, roughness: 0.6, metalness: 0.4 }));
    mesh.castShadow = true;
    mesh.position.copy(origin);
    scene.add(mesh);
    items.push({
      mesh,
      velocity: new THREE.Vector3(direction.x * speed, direction.y * speed + 3.2, direction.z * speed),
      fuse: FUSE,
      dead: false,
    });
  }

  // Step all live grenades; onDetonate(pos) is called once per blast with the blast centre.
  function step(dt, onDetonate) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.dead) continue;
      item.fuse -= dt;
      item.velocity.y -= GRAVITY * dt;
      const pos = item.mesh.position;
      pos.x += item.velocity.x * dt;
      pos.y += item.velocity.y * dt;
      pos.z += item.velocity.z * dt;
      // Simple bounce: if the sphere is inside a collider, push it out along the axis it
      // entered and reflect that velocity component, damped.
      for (const box of world.colliders) {
        if (pos.x > box.min.x - 0.11 && pos.x < box.max.x + 0.11 && pos.y > box.min.y - 0.11 && pos.y < box.max.y + 0.11 && pos.z > box.min.z - 0.11 && pos.z < box.max.z + 0.11) {
          const dxMin = pos.x - (box.min.x - 0.11);
          const dxMax = box.max.x + 0.11 - pos.x;
          const dyMin = pos.y - (box.min.y - 0.11);
          const dyMax = box.max.y + 0.11 - pos.y;
          const dzMin = pos.z - (box.min.z - 0.11);
          const dzMax = box.max.z + 0.11 - pos.z;
          const smallest = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
          if (smallest === dxMin) { pos.x = box.min.x - 0.11; item.velocity.x = -Math.abs(item.velocity.x) * 0.45; }
          else if (smallest === dxMax) { pos.x = box.max.x + 0.11; item.velocity.x = Math.abs(item.velocity.x) * 0.45; }
          else if (smallest === dyMin) { pos.y = box.min.y - 0.11; item.velocity.y = -Math.abs(item.velocity.y) * 0.45; }
          else if (smallest === dyMax) { pos.y = box.max.y + 0.11; item.velocity.y = Math.abs(item.velocity.y) * 0.45; }
          else if (smallest === dzMin) { pos.z = box.min.z - 0.11; item.velocity.z = -Math.abs(item.velocity.z) * 0.45; }
          else { pos.z = box.max.z + 0.11; item.velocity.z = Math.abs(item.velocity.z) * 0.45; }
        }
      }
      if (pos.y < 0.11) {
        pos.y = 0.11;
        item.velocity.y = Math.abs(item.velocity.y) * 0.45;
        item.velocity.x *= 0.7;
        item.velocity.z *= 0.7;
      }
      if (item.fuse <= 0) {
        item.dead = true;
        const blast = new THREE.Mesh(flashGeometry, flashMaterial.clone());
        blast.position.copy(pos);
        blast.scale.setScalar(0.5);
        scene.add(blast);
        // The flash grows and fades in the render loop's step via userData.
        blast.userData.flashAge = 0;
        flashes.push(blast);
        onDetonate(pos.clone());
        scene.remove(item.mesh);
        items.splice(index, 1);
      }
    }
    for (let index = flashes.length - 1; index >= 0; index -= 1) {
      const flash = flashes[index];
      flash.userData.flashAge += dt;
      const age = flash.userData.flashAge;
      flash.scale.setScalar(0.5 + age * 14);
      flash.material.opacity = Math.max(0, 0.85 - age * 2.4);
      if (age > 0.36) {
        scene.remove(flash);
        flash.material.dispose();
        flashes.splice(index, 1);
      }
    }
  }

  const flashes = [];

  // Damage falloff for one body at `point`, blocked by walls between blast and body.
  function damageAt(blastPos, point) {
    const distance = blastPos.distanceTo(point);
    if (distance > BLAST_RADIUS) return 0;
    from.copy(blastPos);
    dir.copy(point).sub(blastPos);
    const length = dir.length();
    if (length < 0.001) return MAX_DAMAGE;
    dir.divideScalar(length);
    raycaster.set(from, dir);
    raycaster.far = length;
    if (raycaster.intersectObjects(world.shootables, false).length > 0) return 0;
    return Math.round(MAX_DAMAGE * (1 - distance / BLAST_RADIUS) + 10);
  }

  // Between rounds every live grenade and blast flash disappears.
  function clear() {
    for (const item of items) scene.remove(item.mesh);
    items.length = 0;
    for (const flash of flashes) {
      scene.remove(flash);
      flash.material.dispose();
    }
    flashes.length = 0;
  }

  return {
    throwGrenade, step, damageAt, clear,
    get active() { return items.length; },
  };
}
