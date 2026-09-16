import { MeshBuilder, Vector3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { registerRuntimeEffects, swayRotation } from './runtime-effects';

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
  const fence = b.addBox(`${prefix}_Fn`, w, 2.4, d, new Vector3(pos.x, 1.2 + pos.y, pos.z), b.mats.bamboo);
  b.endComponent();
  return [fence];
}

/**
 * Single bamboo plant that sways gently. One tapered culm with node rings
 * and leaves at the top — the whole culm tips side to side in the wind.
 */
export function createBambooPlant(b: MapBuilder, prefix: string, pos: Vector3, height = 4.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const totalH = Math.max(1.5, Math.min(6, height));
  b.beginComponent('bambooPlant', prefix, pos, { height: totalH });

  const culm = MeshBuilder.CreateCylinder(`${prefix}_Culm`, {
    height: totalH,
    diameterTop: 0.05,
    diameterBottom: 0.09,
    tessellation: 8
  }, scene);
  culm.position = new Vector3(pos.x, pos.y + totalH / 2, pos.z);
  culm.material = mats.bamboo;
  culm.checkCollisions = true;
  culm.receiveShadows = true;
  b.addShadowCaster(culm);
  meshes.push(culm);

  // Node rings
  const nodes = Math.max(3, Math.floor(totalH / 0.8));
  for (let i = 1; i <= nodes; i++) {
    const ny = (i / nodes) * totalH;
    const ring = MeshBuilder.CreateCylinder(`${prefix}_Node${i}`, { height: 0.05, diameterTop: 0.1, diameterBottom: 0.1, tessellation: 8 }, scene);
    ring.position = new Vector3(pos.x, pos.y + ny, pos.z);
    ring.material = mats.bamboo;
    ring.isPickable = false;
    ring.parent = culm;
    meshes.push(ring);
  }

  // Leaves near the top
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const leaf = MeshBuilder.CreatePlane(`${prefix}_Leaf${i}`, { width: 0.55, height: 0.14 }, scene);
    leaf.position = new Vector3(pos.x + Math.cos(ang) * 0.3, pos.y + totalH - 0.2, pos.z + Math.sin(ang) * 0.3);
    leaf.rotation = new Vector3((Math.random() - 0.5) * 0.5, ang, (Math.random() - 0.5) * 0.6);
    leaf.material = mats.bush;
    leaf.isPickable = false;
    leaf.parent = culm;
    meshes.push(leaf);
  }

  registerRuntimeEffects(b, [swayRotation(culm, 0.05, 0.25, 0, 1)]);

  b.endComponent();
  return meshes;
}

/** Large detailed sakura tree with a thick trunk, branches and lush canopy. */
export function createBigSakuraTree(b: MapBuilder, prefix: string, pos: Vector3, scale = 1.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const s = Math.max(0.6, Math.min(2.0, scale));
  b.beginComponent('sakuraBig', prefix, pos, { scale: s });

  // Main trunk (collidable, but not registered so it is never frozen —
  // the canopy sway below rotates it every frame).
  const trunk = MeshBuilder.CreateCylinder(`${prefix}_Trunk`, { height: 5.0 * s, diameterTop: 0.45 * s, diameterBottom: 0.9 * s, tessellation: 12 }, scene);
  trunk.position = new Vector3(pos.x, pos.y + 2.5 * s, pos.z);
  trunk.material = mats.bark;
  trunk.checkCollisions = true;
  trunk.receiveShadows = true;
  b.addShadowCaster(trunk);
  meshes.push(trunk);

  // Root flare
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    const root = MeshBuilder.CreateCylinder(`${prefix}_Root${i}`, { height: 0.9 * s, diameterTop: 0.18 * s, diameterBottom: 0.4 * s, tessellation: 7 }, scene);
    root.position = new Vector3(Math.cos(ang) * 0.45 * s, -1.9 * s, Math.sin(ang) * 0.45 * s);
    root.rotation = new Vector3(0, ang, Math.PI / 2 - 0.55);
    root.material = mats.bark;
    root.isPickable = false;
    root.parent = trunk;
    meshes.push(root);
  }

  // Branches
  const branchSpecs = [
    { y: 3.6, ang: 0.6, len: 1.6, dia: 0.16 },
    { y: 3.9, ang: 2.4, len: 1.9, dia: 0.18 },
    { y: 4.2, ang: 4.1, len: 1.5, dia: 0.14 },
    { y: 4.6, ang: 5.4, len: 1.1, dia: 0.11 }
  ];
  for (const br of branchSpecs) {
    const branch = MeshBuilder.CreateCylinder(`${prefix}_Br${br.ang}`, { height: br.len * s, diameterTop: br.dia * 0.5 * s, diameterBottom: br.dia * s, tessellation: 8 }, scene);
    branch.position = new Vector3(Math.sin(br.ang) * br.len * 0.35 * s, (br.y - 2.5) * s, Math.cos(br.ang) * br.len * 0.35 * s);
    branch.rotation = new Vector3(Math.cos(br.ang) * 0.9, 0, -Math.sin(br.ang) * 0.9);
    branch.material = mats.bark;
    branch.isPickable = false;
    branch.parent = trunk;
    b.addShadowCaster(branch);
    meshes.push(branch);
  }

  // Canopy blobs (blossom + leaf mix), parented to the trunk so they sway
  const canopy = [
    { x: 0, y: 0.7, z: 0, r: 2.6, mat: 'sakura' },
    { x: 1.4, y: 0.6, z: 0.6, r: 1.7, mat: 'sakura' },
    { x: -1.2, y: 0.8, z: -0.7, r: 1.8, mat: 'sakura' },
    { x: 0.4, y: 1.5, z: -1.2, r: 1.5, mat: 'sakura' },
    { x: -0.5, y: 1.2, z: 1.1, r: 1.4, mat: 'sakura' },
    { x: 1.6, y: 1.3, z: -0.4, r: 1.1, mat: 'bush' },
    { x: -1.4, y: 1.5, z: 0.5, r: 1.0, mat: 'bush' }
  ];
  for (let i = 0; i < canopy.length; i++) {
    const c = canopy[i];
    const blob = MeshBuilder.CreateSphere(`${prefix}_Cn${i}`, { diameter: c.r * 2 * s, segments: 10 }, scene);
    blob.position = new Vector3(c.x * s, (c.y) * s, c.z * s);
    blob.material = c.mat === 'sakura' ? mats.sakura : mats.bush;
    blob.isPickable = false;
    blob.receiveShadows = true;
    blob.parent = trunk;
    b.addShadowCaster(blob);
    meshes.push(blob);
  }

  // Gentle canopy sway
  registerRuntimeEffects(b, [swayRotation(trunk, 0.02, 0.2, 1.3, 1)]);

  b.endComponent();
  return meshes;
}

/** Oak fence: posts, two rails and pickets with air between the wood. */
export function createOakFence(b: MapBuilder, prefix: string, pos: Vector3, length = 4.0, alongZ = true): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  const len = Math.max(1.5, Math.min(8, length));
  b.beginComponent('oakFence', prefix, pos, { length: len, alongZ });

  const x = (v: number, o: number): Vector3 => (alongZ ? new Vector3(pos.x, v, pos.z + o) : new Vector3(pos.x + o, v, pos.z));

  // Posts at both ends
  const postD = 0.14;
  const postH = 1.5;
  meshes.push(b.addBox(`${prefix}_PostA`, postD, postH, postD, x(pos.y + postH / 2, 0), mats.darkWood, true, true));
  meshes.push(b.addBox(`${prefix}_PostB`, postD, postH, postD, x(pos.y + postH / 2, len), mats.darkWood, true, true));

  // Rails
  const railTh = 0.07;
  const railDims = (): [number, number, number] => (alongZ ? [postD, railTh, len] : [len, railTh, postD]);
  meshes.push(b.addBox(`${prefix}_RailA`, ...railDims(), x(pos.y + 1.15, len / 2), mats.darkWood, true, false));
  meshes.push(b.addBox(`${prefix}_RailB`, ...railDims(), x(pos.y + 0.7, len / 2), mats.darkWood, true, false));

  // Pickets with air between wood
  const picketW = 0.1;
  const picketGap = 0.12;
  const step = picketW + picketGap;
  const picketDims = (): [number, number, number] => (alongZ ? [picketW, postH - 0.12, 0.05] : [0.05, postH - 0.12, picketW]);
  for (let o = step / 2; o < len; o += step) {
    const picket = b.addBox(`${prefix}_Pk${o.toFixed(2)}`, ...picketDims(), x(pos.y + postH / 2 - 0.06, o), mats.timber, false, true);
    meshes.push(picket);
  }

  b.endComponent();
  return meshes;
}

/** Fallen wood: a bark log lying on the ground with exposed end + a branch. */
export function createFallenWood(b: MapBuilder, prefix: string, pos: Vector3, length = 1.6, alongZ = true): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const len = Math.max(0.8, Math.min(3, length));
  b.beginComponent('fallenWood', prefix, pos, { length: len, alongZ });

  // Log lying on its side (cylinder axis runs along the chosen axis)
  const log = MeshBuilder.CreateCylinder(`${prefix}_Log`, { height: len, diameterTop: 0.34, diameterBottom: 0.34, tessellation: 10 }, scene);
  const rest = pos.y + 0.17;
  if (alongZ) {
    log.position = new Vector3(pos.x, rest, pos.z);
    log.rotation.x = Math.PI / 2;
  } else {
    log.position = new Vector3(pos.x, rest, pos.z);
    log.rotation.z = Math.PI / 2;
  }
  log.material = mats.bark;
  log.checkCollisions = true;
  log.receiveShadows = true;
  b.colliders.push(log);
  b.addShadowCaster(log);
  meshes.push(log);

  // Exposed cross-section at one end (light wood disc)
  const end = MeshBuilder.CreateCylinder(`${prefix}_End`, { height: 0.04, diameterTop: 0.3, diameterBottom: 0.3, tessellation: 10 }, scene);
  const endOffset = (len / 2 - 0.02) * (alongZ ? 1 : 1);
  if (alongZ) {
    end.position = new Vector3(pos.x, rest, pos.z + endOffset);
  } else {
    end.position = new Vector3(pos.x + endOffset, rest, pos.z);
  }
  end.material = mats.timber;
  end.isPickable = false;
  meshes.push(end);

  // A short snapped branch sticking up
  const branch = MeshBuilder.CreateCylinder(`${prefix}_Branch`, { height: 0.55, diameterTop: 0.06, diameterBottom: 0.1, tessellation: 7 }, scene);
  branch.position = new Vector3(pos.x + 0.15, rest + 0.3, pos.z + (alongZ ? 0.2 : 0.1));
  branch.rotation.z = -0.7;
  branch.material = mats.bark;
  branch.isPickable = false;
  meshes.push(branch);

  b.endComponent();
  return meshes;
}