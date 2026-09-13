import { Vector3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/** Stone lantern (base + glow cap + stone roof cap + warm emitted point light) */
export function createStoneLantern(b: MapBuilder, name: string, pos: Vector3): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('stoneLantern', name, pos, {});
  meshes.push(b.addBox(`${name}_B`, 0.7, 1.7, 0.7, new Vector3(pos.x, pos.y + 0.85, pos.z), mats.stone));
  meshes.push(b.addBox(`${name}_G`, 0.52, 0.52, 0.52, new Vector3(pos.x, pos.y + 1.95, pos.z), mats.lanternGlow, false, false));
  meshes.push(b.addBox(`${name}_Cap`, 0.85, 0.25, 0.85, new Vector3(pos.x, pos.y + 2.3, pos.z), mats.tileRoof, false, false));

  // Warm golden lantern light emission illuminating ground and surroundings
  const pl = b.addLanternLight(`${name}_PL`, new Vector3(pos.x, pos.y + 2.05, pos.z), {
    intensity: 1.35,
    range: 14
  });
  pl.specular.set(0.25, 0.18, 0.1);

  b.endComponent();
  return meshes;
}

/** Hanging paper lantern (Chochin) under eaves, stalls, or shrine gates */
export function createHangingLantern(b: MapBuilder, name: string, pos: Vector3): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('hangingLantern', name, pos, {});
  meshes.push(b.addBox(`${name}_Hook`, 0.08, 0.22, 0.08, new Vector3(pos.x, pos.y + 0.35, pos.z), mats.darkWood, false, false));
  meshes.push(b.addBox(`${name}_Glow`, 0.44, 0.58, 0.44, new Vector3(pos.x, pos.y, pos.z), mats.lanternGlow, false, false));

  const pl = b.addLanternLight(`${name}_PL`, new Vector3(pos.x, pos.y, pos.z), {
    intensity: 1.2,
    range: 12
  });
  pl.specular.set(0.2, 0.15, 0.08);

  b.endComponent();
  return meshes;
}