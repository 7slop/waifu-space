import { MeshBuilder, Vector3, Mesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/** Tactical crate cluster (single + adjacent + optional stacked) */
export function createCrateCluster(b: MapBuilder, prefix: string, pos: Vector3, withStack = true) {
  const { mats } = b;
  b.addBox(`${prefix}_1`, 2.2, 1.7, 2.2, new Vector3(pos.x, 0.85, pos.z), mats.crate);
  b.addBox(`${prefix}_2`, 1.8, 1.7, 1.8, new Vector3(pos.x + 1.6, 0.85, pos.z - 0.3), mats.crate);
  if (withStack)
    b.addBox(`${prefix}_T`, 1.6, 1.3, 1.6, new Vector3(pos.x + 0.7, 2.35, pos.z - 0.15), mats.crate);
}

/** Merchant stall with counter, pillars, and overhanging roof */
export function createMerchantStall(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  w: number,
  d: number,
  openSide: 'north' | 'south' | 'east' | 'west' = 'south'
) {
  const { mats } = b;
  const h = 3.2;
  if (openSide === 'south' || openSide === 'north') {
    const cZ = openSide === 'south' ? pos.z + d / 2 - 0.4 : pos.z - d / 2 + 0.4;
    b.addBox(`${prefix}_Ctr`, w * 0.8, 1.1, 0.6, new Vector3(pos.x, 0.55, cZ), mats.darkWood);
  }
  const bwZ = openSide === 'south' ? pos.z - d / 2 + 0.2 : pos.z + d / 2 - 0.2;
  b.addBox(`${prefix}_BW`, w, h, 0.4, new Vector3(pos.x, h / 2, bwZ), mats.plaster);
  b.addBox(`${prefix}_SWL`, 0.35, h, d * 0.7, new Vector3(pos.x - w / 2 + 0.2, h / 2, pos.z + (openSide === 'south' ? -d * 0.15 : d * 0.15)), mats.plaster);
  b.addBox(`${prefix}_SWR`, 0.35, h, d * 0.7, new Vector3(pos.x + w / 2 - 0.2, h / 2, pos.z + (openSide === 'south' ? -d * 0.15 : d * 0.15)), mats.plaster);
  b.addBox(`${prefix}_Rf`, w + 1.2, 0.4, d + 1.0, new Vector3(pos.x, h + 0.2, pos.z), mats.tileRoof);
}

/**
 * Stack of traditional Kyoto sake barrels (Komodaru)
 * Straw wrapped barrel pyramid with bamboo rope bands and shrine seal.
 */
export function createSakeBarrelStack(b: MapBuilder, prefix: string, pos: Vector3, isLarge = false) {
  const { mats, scene } = b;
  const r = 0.55;
  const h = 1.1;

  const makeBarrel = (suffix: string, x: number, y: number, z: number): Mesh => {
    const barrel = MeshBuilder.CreateCylinder(`${prefix}_${suffix}`, { height: h, diameter: r * 2, tessellation: 16 }, scene);
    barrel.position = new Vector3(x, y, z);
    barrel.material = mats.straw;
    barrel.checkCollisions = true;
    barrel.receiveShadows = true;
    b.colliders.push(barrel);
    b.addShadowCaster(barrel);
    return barrel;
  };

  // Bottom tier
  makeBarrel('b1', pos.x - r * 0.95, pos.y + h / 2, pos.z);
  makeBarrel('b2', pos.x + r * 0.95, pos.y + h / 2, pos.z);

  // Top tier
  makeBarrel('top', pos.x, pos.y + h + h / 2 - 0.1, pos.z);

  if (isLarge) {
    makeBarrel('b3', pos.x, pos.y + h / 2, pos.z + r * 1.6);
  }
}

/** Traditional Kyoto two-wheeled wooden cart (Daisan) */
export function createWoodenCart(b: MapBuilder, prefix: string, pos: Vector3, yaw = 0) {
  const { mats, scene } = b;
  const cart = MeshBuilder.CreateBox(`${prefix}_bed`, { width: 1.8, height: 0.35, depth: 2.8 }, scene);
  cart.position = new Vector3(pos.x, pos.y + 0.65, pos.z);
  cart.rotation.y = yaw;
  cart.material = mats.darkWood;
  cart.checkCollisions = true;
  cart.receiveShadows = true;
  b.colliders.push(cart);

  // Side railings
  b.addBox(`${prefix}_railL`, 0.12, 0.5, 2.8, new Vector3(pos.x - 0.85, pos.y + 1.0, pos.z), mats.darkWood);
  b.addBox(`${prefix}_railR`, 0.12, 0.5, 2.8, new Vector3(pos.x + 0.85, pos.y + 1.0, pos.z), mats.darkWood);

  // Wooden wheels
  const w1 = MeshBuilder.CreateCylinder(`${prefix}_w1`, { height: 0.2, diameter: 1.2, tessellation: 16 }, scene);
  w1.rotation.z = Math.PI / 2;
  w1.position = new Vector3(pos.x - 1.05, pos.y + 0.6, pos.z);
  w1.material = mats.timber;
  b.colliders.push(w1);

  const w2 = MeshBuilder.CreateCylinder(`${prefix}_w2`, { height: 0.2, diameter: 1.2, tessellation: 16 }, scene);
  w2.rotation.z = Math.PI / 2;
  w2.position = new Vector3(pos.x + 1.05, pos.y + 0.6, pos.z);
  w2.material = mats.timber;
  b.colliders.push(w2);

  b.addShadowCaster(cart);
  b.addShadowCaster(w1);
  b.addShadowCaster(w2);
}
