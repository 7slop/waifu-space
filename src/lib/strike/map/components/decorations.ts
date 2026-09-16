import { MeshBuilder, Vector3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/**
 * Configurable natural rock, 10 variants. The `variant` param selects the
 * silhouette: round, tall, split, slab, pyramid, cluster, egg, spire, mossy, block.
 */
export function createRock(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  variant = 0,
  scale = 1.0
): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const v = ((Math.round(variant) % 10) + 10) % 10;
  const s = Math.max(0.4, Math.min(3.0, scale));
  b.beginComponent('rock', prefix, pos, { variant: v, scale: s });

  const addStone = (
    name: string,
    height: number,
    topD: number,
    botD: number,
    ox: number,
    oy: number,
    oz: number,
    tess = 10,
    rotation?: Vector3
  ): AbstractMesh => {
    const m = MeshBuilder.CreateCylinder(name, { height: height * s, diameterTop: topD * s, diameterBottom: botD * s, tessellation: tess }, scene);
    m.position = new Vector3(pos.x + ox * s, pos.y + (height * s) / 2 + oy * s, pos.z + oz * s);
    m.material = mats.stone;
    m.checkCollisions = true;
    m.receiveShadows = true;
    if (rotation) m.rotation = rotation;
    b.colliders.push(m);
    b.addShadowCaster(m);
    meshes.push(m);
    return m;
  };

  switch (v) {
    case 0: // round boulder
      addStone(`${prefix}_B`, 1.2, 1.5, 1.8, 0, 0, 0);
      break;
    case 1: // tall standing stone
      addStone(`${prefix}_T`, 2.2, 0.5, 0.9, 0, 0, 0.15, 10, new Vector3(0, 0.12, 0.1));
      break;
    case 2: // split rock — two angular chunks
      addStone(`${prefix}_S1`, 0.9, 0.9, 1.1, -0.2, 0, -0.1, 7);
      addStone(`${prefix}_S2`, 0.7, 0.7, 0.9, 0.35, 0, 0.25, 7);
      break;
    case 3: // flat slab
      addStone(`${prefix}_Sl`, 0.35, 1.5, 1.55, 0, 0, 0.1, 8);
      break;
    case 4: // pyramid-ish monolith
      addStone(`${prefix}_Py`, 1.6, 0.35, 1.3, 0, 0, -0.05, 8);
      break;
    case 5: // cluster of three small stones
      addStone(`${prefix}_C1`, 0.55, 0.5, 0.75, -0.3, 0, 0.1, 8);
      addStone(`${prefix}_C2`, 0.4, 0.4, 0.6, 0.25, 0, 0.2, 8);
      addStone(`${prefix}_C3`, 0.3, 0.3, 0.45, 0.05, 0, -0.3, 8);
      break;
    case 6: // elongated egg (scaled sphere-ish cone)
      addStone(`${prefix}_E`, 1.3, 0.8, 0.9, 0, 0, 0, 10);
      meshes[meshes.length - 1].scaling.set(0.85, 1, 1.25);
      break;
    case 7: // jagged spire
      addStone(`${prefix}_Sp`, 2.6, 0.08, 0.7, 0, 0.05, 0, 6);
      break;
    case 8: // mossy boulder
      addStone(`${prefix}_Mb`, 1.0, 1.2, 1.4, 0, 0, 0, 10);
      for (let i = 0; i < 3; i++) {
        const mx = (i - 1) * 0.35;
        const mz = i % 2 === 0 ? 0.3 : -0.3;
        const moss = MeshBuilder.CreateCylinder(`${prefix}_Ms${i}`, { height: 0.12 * s, diameterTop: 0.45 * s, diameterBottom: 0.45 * s, tessellation: 8 }, scene);
        moss.position = new Vector3(pos.x + mx * s, pos.y + 0.55 * s, pos.z + mz * s);
        moss.material = mats.moss;
        moss.isPickable = false;
        meshes.push(moss);
      }
      break;
    case 9: // blocky step stone with flat top
      addStone(`${prefix}_Bl`, 0.8, 1.05, 1.1, 0, 0, 0.05, 6);
      break;
  }

  b.endComponent();
  return meshes;
}

/** Multi-tiered circular fountain with water basin and central spout */
export function createFountain(b: MapBuilder, prefix: string, pos: Vector3, tiers = 3): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('fountain', prefix, pos, { tiers });

  const t = Math.max(1, Math.min(4, tiers));

  // Base pool (large stone basin)
  const baseR = 2.8;
  const base = MeshBuilder.CreateCylinder(`${prefix}_Base`, { height: 0.6, diameterTop: baseR * 2, diameterBottom: baseR * 2.2, tessellation: 24 }, scene);
  base.position = new Vector3(pos.x, pos.y + 0.3, pos.z);
  base.material = mats.stone;
  base.checkCollisions = true;
  base.receiveShadows = true;
  b.colliders.push(base);
  b.addShadowCaster(base);
  meshes.push(base);

  // Water in the base pool
  const water = MeshBuilder.CreateCylinder(`${prefix}_Water`, { height: 0.35, diameterTop: baseR * 1.85, diameterBottom: baseR * 1.85, tessellation: 20 }, scene);
  water.position = new Vector3(pos.x, pos.y + 0.55, pos.z);
  water.material = mats.water;
  water.checkCollisions = false;
  meshes.push(water);

  // Stacked tiers
  let stackY = pos.y + 0.6;
  for (let i = 0; i < t; i++) {
    const r = baseR * (0.7 - i * 0.15);
    const tierH = 0.8;
    const tier = MeshBuilder.CreateCylinder(`${prefix}_T${i}`, { height: tierH, diameterTop: r * 1.6, diameterBottom: r * 2, tessellation: 20 }, scene);
    tier.position = new Vector3(pos.x, stackY + tierH / 2, pos.z);
    tier.material = mats.stone;
    tier.checkCollisions = true;
    tier.receiveShadows = true;
    b.colliders.push(tier);
    b.addShadowCaster(tier);
    meshes.push(tier);

    // Water in each tier
    const tw = MeshBuilder.CreateCylinder(`${prefix}_TW${i}`, { height: 0.2, diameterTop: r * 1.4, diameterBottom: r * 1.4, tessellation: 16 }, scene);
    tw.position = new Vector3(pos.x, stackY + tierH - 0.15, pos.z);
    tw.material = mats.water;
    tw.checkCollisions = false;
    meshes.push(tw);

    stackY += tierH;
  }

  // Central spout pillar
  const spoutH = 0.6 + t * 0.3;
  const spout = MeshBuilder.CreateCylinder(`${prefix}_Spout`, { height: spoutH, diameterTop: 0.15, diameterBottom: 0.25, tessellation: 8 }, scene);
  spout.position = new Vector3(pos.x, stackY + spoutH / 2, pos.z);
  spout.material = mats.stone;
  spout.checkCollisions = false;
  b.addShadowCaster(spout);
  meshes.push(spout);

  b.endComponent();
  return meshes;
}

/** Decorative flower pot with soil and plant */
export function createFlowerPot(b: MapBuilder, prefix: string, pos: Vector3, size = 1.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('flowerPot', prefix, pos, { size });

  const s = Math.max(0.5, Math.min(2.0, size));
  const potH = 0.7 * s;
  const potR = 0.5 * s;

  // Pot body (tapered cylinder)
  const pot = MeshBuilder.CreateCylinder(`${prefix}_Pot`, { height: potH, diameterTop: potR * 2, diameterBottom: potR * 1.5, tessellation: 16 }, scene);
  pot.position = new Vector3(pos.x, pos.y + potH / 2, pos.z);
  pot.material = mats.ceramic;
  pot.checkCollisions = true;
  pot.receiveShadows = true;
  b.colliders.push(pot);
  b.addShadowCaster(pot);
  meshes.push(pot);

  // Pot rim
  const rim = MeshBuilder.CreateCylinder(`${prefix}_Rim`, { height: 0.08 * s, diameterTop: potR * 2.15, diameterBottom: potR * 2.1, tessellation: 16 }, scene);
  rim.position = new Vector3(pos.x, pos.y + potH + 0.04 * s, pos.z);
  rim.material = mats.ceramic;
  rim.checkCollisions = false;
  meshes.push(rim);

  // Soil
  const soil = MeshBuilder.CreateCylinder(`${prefix}_Soil`, { height: 0.12 * s, diameterTop: potR * 1.7, diameterBottom: potR * 1.7, tessellation: 12 }, scene);
  soil.position = new Vector3(pos.x, pos.y + potH - 0.06 * s, pos.z);
  soil.material = mats.bark;
  soil.checkCollisions = false;
  meshes.push(soil);

  // Plant bush
  const bushR = 0.6 * s;
  const plant = MeshBuilder.CreateSphere(`${prefix}_Plant`, { diameterX: bushR * 2, diameterY: bushR * 1.8, diameterZ: bushR * 2, segments: 8 }, scene);
  plant.position = new Vector3(pos.x, pos.y + potH + bushR * 0.7, pos.z);
  plant.material = mats.bush;
  plant.isPickable = false;
  plant.receiveShadows = true;
  meshes.push(plant);

  // Small flower accents
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const fx = pos.x + Math.cos(angle) * bushR * 0.6;
    const fz = pos.z + Math.sin(angle) * bushR * 0.6;
    const fy = pos.y + potH + bushR * 0.4 + Math.sin(i * 1.3) * 0.15;
    const flower = MeshBuilder.CreateSphere(`${prefix}_Fl${i}`, { diameter: 0.18 * s, segments: 6 }, scene);
    flower.position = new Vector3(fx, fy, fz);
    flower.material = mats.sakura;
    flower.isPickable = false;
    meshes.push(flower);
  }

  b.addShadowCaster(plant);
  b.endComponent();
  return meshes;
}

/** Traditional bamboo water feature (Shishi-odoshi / deer scarer) */
export function createBambooWaterFeature(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('bambooWaterFeature', prefix, pos, {});

  // Stone basin (tsukubai)
  const basin = MeshBuilder.CreateCylinder(`${prefix}_Basin`, { height: 0.5, diameterTop: 1.4, diameterBottom: 1.2, tessellation: 16 }, scene);
  basin.position = new Vector3(pos.x, pos.y + 0.25, pos.z);
  basin.material = mats.stone;
  basin.checkCollisions = true;
  basin.receiveShadows = true;
  b.colliders.push(basin);
  b.addShadowCaster(basin);
  meshes.push(basin);

  // Water in basin
  const water = MeshBuilder.CreateCylinder(`${prefix}_Water`, { height: 0.25, diameterTop: 1.2, diameterBottom: 1.2, tessellation: 12 }, scene);
  water.position = new Vector3(pos.x, pos.y + 0.42, pos.z);
  water.material = mats.water;
  water.checkCollisions = false;
  meshes.push(water);

  // Bamboo spout (angled pipe)
  const spout = MeshBuilder.CreateCylinder(`${prefix}_Spout`, { height: 1.2, diameterTop: 0.08, diameterBottom: 0.08, tessellation: 8 }, scene);
  spout.position = new Vector3(pos.x + 0.3, pos.y + 1.0, pos.z + 0.3);
  spout.rotation = new Vector3(0, 0, Math.PI / 5);
  spout.material = mats.bamboo;
  spout.checkCollisions = false;
  b.addShadowCaster(spout);
  meshes.push(spout);

  // Support post
  const post = MeshBuilder.CreateCylinder(`${prefix}_Post`, { height: 0.9, diameterTop: 0.06, diameterBottom: 0.06, tessellation: 8 }, scene);
  post.position = new Vector3(pos.x + 0.6, pos.y + 0.45, pos.z + 0.1);
  post.material = mats.bamboo;
  post.checkCollisions = false;
  meshes.push(post);

  // Pivot rocker (the tippling tube)
  const rocker = MeshBuilder.CreateCylinder(`${prefix}_Rocker`, { height: 0.7, diameterTop: 0.1, diameterBottom: 0.1, tessellation: 8 }, scene);
  rocker.position = new Vector3(pos.x + 0.35, pos.y + 0.95, pos.z + 0.15);
  rocker.rotation = new Vector3(0, 0, -Math.PI / 4);
  rocker.material = mats.bamboo;
  rocker.checkCollisions = false;
  meshes.push(rocker);

  b.endComponent();
  return meshes;
}

/** Small rock garden arrangement with raked sand */
export function createRockGarden(b: MapBuilder, prefix: string, pos: Vector3, scale = 1.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('rockGarden', prefix, pos, { scale });

  const s = Math.max(0.5, Math.min(3.0, scale));

  // Sand base
  const sand = b.addBox(`${prefix}_Sand`, 3.5 * s, 0.12, 3.0 * s, new Vector3(pos.x, pos.y + 0.06, pos.z), mats.zenSand, false, true);

  // Arrangement of rocks
  const rocks = [
    { x: -0.5, z: -0.3, r: 0.4, h: 0.55 },
    { x: 0.4, z: 0.2, r: 0.3, h: 0.4 },
    { x: -0.1, z: 0.5, r: 0.25, h: 0.35 },
    { x: 0.8, z: -0.5, r: 0.2, h: 0.3 }
  ];

  for (let i = 0; i < rocks.length; i++) {
    const rk = rocks[i];
    const rock = MeshBuilder.CreateCylinder(`${prefix}_Rk${i}`, { height: rk.h * s, diameterTop: rk.r * 1.4 * s, diameterBottom: rk.r * 2 * s, tessellation: 8 }, scene);
    rock.position = new Vector3(pos.x + rk.x * s, pos.y + rk.h * s * 0.5 + 0.12, pos.z + rk.z * s);
    rock.rotation = new Vector3((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, 0);
    rock.material = mats.stone;
    rock.checkCollisions = true;
    rock.receiveShadows = true;
    b.colliders.push(rock);
    b.addShadowCaster(rock);
    meshes.push(rock);
  }

  // Small moss patches around rocks
  for (let i = 0; i < 3; i++) {
    const mx = pos.x + (Math.random() - 0.5) * 1.5 * s;
    const mz = pos.z + (Math.random() - 0.5) * 1.2 * s;
    const moss = MeshBuilder.CreateCylinder(`${prefix}_Ms${i}`, { height: 0.04, diameterTop: 0.4 * s, diameterBottom: 0.4 * s, tessellation: 8 }, scene);
    moss.position = new Vector3(mx, pos.y + 0.14, mz);
    moss.material = mats.moss;
    moss.checkCollisions = false;
    meshes.push(moss);
  }

  b.endComponent();
  return meshes;
}

/** Stone path stepping stone cluster */
export function createStonePath(b: MapBuilder, prefix: string, pos: Vector3, length = 5): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('stonePath', prefix, pos, { length });

  const count = Math.max(3, Math.min(12, Math.round(length)));
  const spacing = 1.2;

  for (let i = 0; i < count; i++) {
    const sx = pos.x + (Math.random() - 0.5) * 0.3;
    const sz = pos.z + i * spacing;
    const stone = MeshBuilder.CreateCylinder(`${prefix}_S${i}`, { height: 0.12, diameterTop: 0.7 + Math.random() * 0.3, diameterBottom: 0.8 + Math.random() * 0.3, tessellation: 12 }, scene);
    stone.position = new Vector3(sx, pos.y + 0.06, sz);
    stone.material = mats.stone;
    stone.checkCollisions = false;
    stone.receiveShadows = true;
    meshes.push(stone);
  }

  b.endComponent();
  return meshes;
}

/** Hanging wind chime (Furin) — glass/ceramic bell with paper strip */
export function createWindChime(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('windChime', prefix, pos, {});

  // Mount hook
  meshes.push(b.addBox(`${prefix}_Hook`, 0.06, 0.2, 0.06, new Vector3(pos.x, pos.y + 0.4, pos.z), mats.metal, false, false));

  // String
  const string = MeshBuilder.CreateCylinder(`${prefix}_Str`, { height: 0.5, diameter: 0.015, tessellation: 6 }, scene);
  string.position = new Vector3(pos.x, pos.y + 0.05, pos.z);
  string.material = mats.straw;
  string.isPickable = false;
  meshes.push(string);

  // Bell body (ceramic dome)
  const bell = MeshBuilder.CreateSphere(`${prefix}_Bell`, { diameter: 0.35, segments: 10 }, scene);
  bell.position = new Vector3(pos.x, pos.y - 0.2, pos.z);
  bell.material = mats.ceramic;
  bell.isPickable = false;
  meshes.push(bell);

  // Clapper
  const clapper = MeshBuilder.CreateCylinder(`${prefix}_Clap`, { height: 0.15, diameterTop: 0.03, diameterBottom: 0.03, tessellation: 6 }, scene);
  clapper.position = new Vector3(pos.x, pos.y - 0.35, pos.z);
  clapper.material = mats.metal;
  clapper.isPickable = false;
  meshes.push(clapper);

  // Paper strip (tanzaku)
  const tanzaku = MeshBuilder.CreatePlane(`${prefix}_Tan`, { width: 0.12, height: 0.3 }, scene);
  tanzaku.position = new Vector3(pos.x, pos.y - 0.55, pos.z);
  tanzaku.material = mats.shoji;
  tanzaku.isPickable = false;
  meshes.push(tanzaku);

  b.endComponent();
  return meshes;
}
