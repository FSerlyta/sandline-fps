// Shared AABB collision: move a vertical box (feet position, radius, height) against the
// world's colliders one axis at a time, so a wall never swallows a body and a body can
// stand on a crate. Player and bots both move through here; it owns no input.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, radius, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (let index = 0; index < colliders.length; index += 1) {
      if (probe.intersectsBox(colliders[index])) return colliders[index];
    }
    return null;
  }

  // pos/vel are Vector3s mutated in place. Returns true when standing on something.
  function move(pos, vel, dt, height, radius = RADIUS) {
    const nextX = pos.x + vel.x * dt;
    if (!overlaps(nextX, pos.y, pos.z, height, radius, 0.04)) pos.x = nextX;
    else vel.x = 0;
    const nextZ = pos.z + vel.z * dt;
    if (!overlaps(pos.x, pos.y, nextZ, height, radius, 0.04)) pos.z = nextZ;
    else vel.z = 0;

    pos.y += vel.y * dt;
    let onGround = false;
    const hit = overlaps(pos.x, pos.y, pos.z, height, radius, 0);
    if (hit && vel.y <= 0) {
      pos.y = hit.max.y;
      vel.y = 0;
      onGround = true;
    } else if (hit) {
      pos.y = hit.min.y - height;
      vel.y = 0;
    }
    if (pos.y < 0) {
      pos.y = 0;
      vel.y = 0;
      onGround = true;
    }
    return onGround;
  }

  // A horizontal-only probe: is there a wall at this spot (used by bots to avoid stuck paths)?
  function blockedAt(x, y, z, height, radius = RADIUS) {
    return overlaps(x, y, z, height, radius, 0.04) !== null;
  }

  return { move, blockedAt, overlaps };
}
