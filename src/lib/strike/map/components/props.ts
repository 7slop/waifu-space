import { MeshBuilder, Vector3, Mesh, AbstractMesh, DynamicTexture, StandardMaterial, Color3, Scene } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/** Tactical crate cluster (single + adjacent + optional stacked) */
export function createCrateCluster(b: MapBuilder, prefix: string, pos: Vector3, withStack = true): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('crateCluster', prefix, pos, { withStack });
  meshes.push(b.addBox(`${prefix}_1`, 2.2, 1.7, 2.2, new Vector3(pos.x, 0.85, pos.z), mats.crate));
  meshes.push(b.addBox(`${prefix}_2`, 1.8, 1.7, 1.8, new Vector3(pos.x + 1.6, 0.85, pos.z - 0.3), mats.crate));
  if (withStack)
    meshes.push(b.addBox(`${prefix}_T`, 1.6, 1.3, 1.6, new Vector3(pos.x + 0.7, 2.35, pos.z - 0.15), mats.crate));
  b.endComponent();
  return meshes;
}

/** Merchant stall with counter, pillars, and overhanging roof */
export function createMerchantStall(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  w: number,
  d: number,
  openSide: 'north' | 'south' | 'east' | 'west' = 'south'
): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('merchantStall', prefix, pos, { w, d, openSide });
  const h = 3.2;
  if (openSide === 'south' || openSide === 'north') {
    const cZ = openSide === 'south' ? pos.z + d / 2 - 0.4 : pos.z - d / 2 + 0.4;
    meshes.push(b.addBox(`${prefix}_Ctr`, w * 0.8, 1.1, 0.6, new Vector3(pos.x, 0.55, cZ), mats.darkWood));
  }
  const bwZ = openSide === 'south' ? pos.z - d / 2 + 0.2 : pos.z + d / 2 - 0.2;
  meshes.push(b.addBox(`${prefix}_BW`, w, h, 0.4, new Vector3(pos.x, h / 2, bwZ), mats.plaster));
  meshes.push(b.addBox(`${prefix}_SWL`, 0.35, h, d * 0.7, new Vector3(pos.x - w / 2 + 0.2, h / 2, pos.z + (openSide === 'south' ? -d * 0.15 : d * 0.15)), mats.plaster));
  meshes.push(b.addBox(`${prefix}_SWR`, 0.35, h, d * 0.7, new Vector3(pos.x + w / 2 - 0.2, h / 2, pos.z + (openSide === 'south' ? -d * 0.15 : d * 0.15)), mats.plaster));
  meshes.push(b.addBox(`${prefix}_Rf`, w + 1.2, 0.4, d + 1.0, new Vector3(pos.x, h + 0.2, pos.z), mats.tileRoof));
  b.endComponent();
  return meshes;
}

/**
 * Stack of traditional Kyoto sake barrels (Komodaru)
 * Straw wrapped barrel pyramid with bamboo rope bands and shrine seal.
 */
export function createSakeBarrelStack(b: MapBuilder, prefix: string, pos: Vector3, isLarge = false): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('sakeBarrels', prefix, pos, { isLarge });
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
    meshes.push(barrel);
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

  b.endComponent();
  return meshes;
}

/** Traditional Kyoto two-wheeled wooden cart (Daisan) */
export function createWoodenCart(b: MapBuilder, prefix: string, pos: Vector3, yaw = 0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  // The cart's orientation is captured as the component rotation (root-level)
  // so the whole cart rotates as one object.
  b.beginComponent('woodenCart', prefix, pos, {}, new Vector3(0, yaw, 0));

  const cart = MeshBuilder.CreateBox(`${prefix}_bed`, { width: 1.8, height: 0.35, depth: 2.8 }, scene);
  cart.position = new Vector3(pos.x, pos.y + 0.65, pos.z);
  cart.material = mats.darkWood;
  cart.checkCollisions = true;
  cart.receiveShadows = true;
  b.colliders.push(cart);
  meshes.push(cart);

  // Side railings
  meshes.push(b.addBox(`${prefix}_railL`, 0.12, 0.5, 2.8, new Vector3(pos.x - 0.85, pos.y + 1.0, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_railR`, 0.12, 0.5, 2.8, new Vector3(pos.x + 0.85, pos.y + 1.0, pos.z), mats.darkWood));

  // Wooden wheels
  const w1 = MeshBuilder.CreateCylinder(`${prefix}_w1`, { height: 0.2, diameter: 1.2, tessellation: 16 }, scene);
  w1.rotation.z = Math.PI / 2;
  w1.position = new Vector3(pos.x - 1.05, pos.y + 0.6, pos.z);
  w1.material = mats.timber;
  b.colliders.push(w1);
  meshes.push(w1);

  const w2 = MeshBuilder.CreateCylinder(`${prefix}_w2`, { height: 0.2, diameter: 1.2, tessellation: 16 }, scene);
  w2.rotation.z = Math.PI / 2;
  w2.position = new Vector3(pos.x + 1.05, pos.y + 0.6, pos.z);
  w2.material = mats.timber;
  b.colliders.push(w2);
  meshes.push(w2);

  b.addShadowCaster(cart);
  b.addShadowCaster(w1);
  b.addShadowCaster(w2);

  b.endComponent();
  return meshes;
}

/** Timber lamppost with a hanging paper lantern and warm point light */
export function createLamppost(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  height = 3.6,
  lightOn = true
): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const h = Math.max(2.2, height);
  b.beginComponent('lamppost', prefix, pos, { height: h, lightOn });

  const post = MeshBuilder.CreateCylinder(
    `${prefix}_Post`,
    { height: h - 1.0, diameterTop: 0.13, diameterBottom: 0.24, tessellation: 12 },
    scene
  );
  post.position = new Vector3(pos.x, pos.y + (h - 1.0) / 2, pos.z);
  post.material = mats.darkWood;
  post.checkCollisions = true;
  post.receiveShadows = true;
  b.colliders.push(post);
  b.addShadowCaster(post);
  meshes.push(post);

  meshes.push(b.addBox(`${prefix}_Arm`, 0.9, 0.12, 0.12, new Vector3(pos.x + 0.45, pos.y + h - 1.15, pos.z), mats.darkWood, false, true));
  meshes.push(b.addBox(`${prefix}_Glow`, 0.52, 0.62, 0.52, new Vector3(pos.x + 0.82, pos.y + h - 1.5, pos.z), mats.lanternGlow, false, false));

  if (lightOn) {
    const pl = b.addLanternLight(`${prefix}_PL`, new Vector3(pos.x + 0.82, pos.y + h - 1.5, pos.z), {
      intensity: 1.7,
      range: 16
    });
    pl.specular.set(0.22, 0.17, 0.09);
  }

  b.endComponent();
  return meshes;
}

/** Stone ring well with a timber roof (Ido) */
export function createWell(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('well', prefix, pos, {});

  const ring = MeshBuilder.CreateCylinder(
    `${prefix}_Ring`,
    { height: 0.9, diameterTop: 1.8, diameterBottom: 2.1, tessellation: 20 },
    scene
  );
  ring.position = new Vector3(pos.x, pos.y + 0.45, pos.z);
  ring.material = mats.stone;
  ring.checkCollisions = true;
  ring.receiveShadows = true;
  b.colliders.push(ring);
  b.addShadowCaster(ring);
  meshes.push(ring);

  const water = MeshBuilder.CreateCylinder(
    `${prefix}_Water`,
    { height: 0.9, diameterTop: 1.2, diameterBottom: 1.45, tessellation: 16 },
    scene
  );
  water.position = new Vector3(pos.x, pos.y + 0.42, pos.z);
  water.material = mats.darkWood;
  water.checkCollisions = false;
  meshes.push(water);

  meshes.push(b.addBox(`${prefix}_PostL`, 0.16, 1.4, 0.16, new Vector3(pos.x - 0.9, pos.y + 1.25, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_PostR`, 0.16, 1.4, 0.16, new Vector3(pos.x + 0.9, pos.y + 1.25, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_Beam`, 2.1, 0.14, 0.16, new Vector3(pos.x, pos.y + 2.0, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_Roof`, 2.3, 0.22, 2.3, new Vector3(pos.x, pos.y + 2.15, pos.z), mats.tileRoof, false, true));

  b.endComponent();
  return meshes;
}

/** Wooden park/street bench (Bēchi) with backrest */
export function createParkBench(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('parkBench', prefix, pos, {});

  meshes.push(b.addBox(`${prefix}_Seat`, 1.6, 0.1, 0.5, new Vector3(pos.x, pos.y + 0.45, pos.z), mats.woodDeck));
  meshes.push(b.addBox(`${prefix}_Back`, 1.6, 0.55, 0.09, new Vector3(pos.x, pos.y + 0.95, pos.z - 0.2), mats.woodDeck, true, true, new Vector3(0.12, 0, 0)));
  meshes.push(b.addBox(`${prefix}_LegL`, 0.09, 0.42, 0.42, new Vector3(pos.x - 0.68, pos.y + 0.25, pos.z + 0.05), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegR`, 0.09, 0.42, 0.42, new Vector3(pos.x + 0.68, pos.y + 0.25, pos.z + 0.05), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_ArmL`, 0.06, 0.06, 0.5, new Vector3(pos.x - 0.74, pos.y + 0.72, pos.z + 0.02), mats.darkWood, false, false));
  meshes.push(b.addBox(`${prefix}_ArmR`, 0.06, 0.06, 0.5, new Vector3(pos.x + 0.74, pos.y + 0.72, pos.z + 0.02), mats.darkWood, false, false));

  b.endComponent();
  return meshes;
}

const SIGN_GLYPHS = ['茶', '酒', '食', '花', '店', '石'] as const;

function storeSignMaterial(scene: Scene, glyph: string): StandardMaterial {
  const safe = SIGN_GLYPHS.includes(glyph as (typeof SIGN_GLYPHS)[number]) ? glyph : '店';
  const tex = new DynamicTexture(`storeSignTex_${safe}`, { width: 256, height: 128 }, scene, true);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#241610';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#e8c98a';
  (ctx as any).lineWidth = 7;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = '#f5e9cc';
  (ctx as any).font = 'bold 24px "Yu Mincho", "Hiragino Mincho ProN", serif';
  (ctx as any).textAlign = 'center';
  (ctx as any).textBaseline = 'middle';
  ctx.fillText('京 都', 128, 30);
  (ctx as any).font = 'bold 84px "Yu Mincho", "Hiragino Mincho ProN", serif';
  ctx.fillText(safe, 128, 92);
  tex.update(false);

  const mat = new StandardMaterial(`storeSignMat_${safe}`, scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0.12, 0.09, 0.06);
  return mat;
}

/** Freestanding shop banner with a kanji signboard */
export function createStoreSign(b: MapBuilder, prefix: string, pos: Vector3, glyph = '茶'): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('storeSign', prefix, pos, { glyph });

  meshes.push(b.addBox(`${prefix}_PostL`, 0.18, 2.4, 0.18, new Vector3(pos.x - 0.85, pos.y + 1.2, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_PostR`, 0.18, 2.4, 0.18, new Vector3(pos.x + 0.85, pos.y + 1.2, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_Top`, 0.18, 0.18, 2.05, new Vector3(pos.x, pos.y + 2.42, pos.z), mats.darkWood, false, false));

  const face = MeshBuilder.CreatePlane(`${prefix}_Face`, { width: 1.9, height: 1.0 }, scene);
  face.position = new Vector3(pos.x, pos.y + 1.85, pos.z);
  face.material = storeSignMaterial(scene, glyph);
  face.checkCollisions = false;
  meshes.push(face);

  b.endComponent();
  return meshes;
}