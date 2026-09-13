import { MeshBuilder, Vector3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/** Sakura tree with stone planter, trunk cylinder, and blossom spheres */
export function createSakuraTree(b: MapBuilder, name: string, pos: Vector3): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('sakura', name, pos, {});

  meshes.push(b.addBox(`${name}_Pl`, 2.8, 0.6, 2.8, new Vector3(pos.x, 0.3, pos.z), mats.stone));
  const trunk = MeshBuilder.CreateCylinder(`${name}_Tr`, { height: 3.8, diameter: 0.55 }, scene);
  trunk.position = new Vector3(pos.x, 2.2, pos.z);
  trunk.material = mats.bark;
  trunk.checkCollisions = true;
  trunk.receiveShadows = true;
  b.colliders.push(trunk);
  meshes.push(trunk);

  const bl1 = MeshBuilder.CreateSphere(`${name}_Bl1`, { diameter: 4.2, segments: 10 }, scene);
  bl1.position = new Vector3(pos.x, 4.4, pos.z);
  bl1.material = mats.sakura;
  bl1.isPickable = false;
  bl1.receiveShadows = true;
  meshes.push(bl1);

  const bl2 = MeshBuilder.CreateSphere(`${name}_Bl2`, { diameter: 3.2, segments: 10 }, scene);
  bl2.position = new Vector3(pos.x + 0.8, 5.1, pos.z + 0.6);
  bl2.material = mats.sakura;
  bl2.isPickable = false;
  bl2.receiveShadows = true;
  meshes.push(bl2);

  b.addShadowCaster(trunk);
  b.addShadowCaster(bl1);
  b.addShadowCaster(bl2);

  b.endComponent();
  return meshes;
}

/** Sculpted Japanese garden bush mound (Tamamono) */
export function createGardenBush(b: MapBuilder, name: string, pos: Vector3, radius = 1.0): AbstractMesh[] {
  b.beginComponent('bush', name, pos, { radius });
  const bush = MeshBuilder.CreateSphere(name, { diameterX: radius * 2, diameterY: radius * 1.5, diameterZ: radius * 2, segments: 8 }, b.scene);
  bush.position = new Vector3(pos.x, pos.y + radius * 0.75, pos.z);
  bush.material = b.mats.bush;
  bush.checkCollisions = true;
  bush.receiveShadows = true;
  b.colliders.push(bush);
  b.addShadowCaster(bush);
  b.endComponent();
  return [bush];
}

/** Bamboo fence segment */
export function createBambooFence(b: MapBuilder, prefix: string, pos: Vector3, length: number, alongZ = true): AbstractMesh[] {
  const w = alongZ ? 0.35 : length;
  const d = alongZ ? length : 0.35;
  b.beginComponent('bamboo', prefix, pos, { length, alongZ });
  const fence = b.addBox(`${prefix}_Fn`, w, 2.4, d, new Vector3(pos.x, 1.2, pos.z), b.mats.bamboo);
  b.endComponent();
  return [fence];
}