import { MeshBuilder, Vector3, AbstractMesh, StandardMaterial } from '@babylonjs/core';
import type { MapBuilder, MapMaterials } from '../types';

export type WallStyle = 'plaster' | 'timber' | 'stone' | 'shoji';
export type FloorStyle = 'woodDeck' | 'tatami' | 'stone' | 'sand';
export type RoofStyle = 'tileRoof' | 'straw' | 'shrineRed' | 'metal';

function matFor(mats: MapMaterials, key: string): StandardMaterial {
  return mats[key as keyof MapMaterials] as unknown as StandardMaterial;
}

/** Configurable solid wall pane (plaster / timber / stone / shoji). */
export function createWall(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { width?: number; height?: number; style?: WallStyle } = {}
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  const w = Math.max(1, Math.min(12, opts.width ?? 4));
  const h = Math.max(1, Math.min(6, opts.height ?? 3));
  const style: WallStyle = opts.style ?? 'plaster';
  b.beginComponent('wall', prefix, pos, { width: w, height: h, style });

  const core = style === 'timber' ? 'timber' : style === 'shoji' ? 'shoji' : style;
  const panel = b.addBox(`${prefix}_Pane`, w, h, 0.22, new Vector3(pos.x, pos.y + h / 2, pos.z), matFor(b.mats, core), true, true);
  meshes.push(panel);

  if (style === 'timber' || style === 'shoji') {
    // Timber frame posts/beams over the face
    const t = 0.12;
    meshes.push(b.addBox(`${prefix}_PostL`, t, h, 0.26, new Vector3(pos.x - w / 2 + t / 2, pos.y + h / 2, pos.z), b.mats.darkWood, false, false));
    meshes.push(b.addBox(`${prefix}_PostR`, t, h, 0.26, new Vector3(pos.x + w / 2 - t / 2, pos.y + h / 2, pos.z), b.mats.darkWood, false, false));
    meshes.push(b.addBox(`${prefix}_RailT`, w, t, 0.26, new Vector3(pos.x, pos.y + h - t / 2, pos.z), b.mats.darkWood, false, false));
    meshes.push(b.addBox(`${prefix}_RailB`, w, t, 0.26, new Vector3(pos.x, pos.y + t / 2, pos.z), b.mats.darkWood, false, false));
  }

  b.endComponent();
  return meshes;
}

/** Configurable floor pane (wood deck / tatami / stone / sand). */
export function createFloor(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { width?: number; depth?: number; style?: FloorStyle } = {}
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  const w = Math.max(1, Math.min(12, opts.width ?? 4));
  const d = Math.max(1, Math.min(12, opts.depth ?? 4));
  const style: FloorStyle = opts.style ?? 'woodDeck';
  b.beginComponent('floor', prefix, pos, { width: w, depth: d, style });

  const mat = style === 'tatami' ? b.mats.straw : style === 'stone' ? b.mats.stone : style === 'sand' ? b.mats.zenSand : b.mats.woodDeck;
  meshes.push(b.addBox(`${prefix}_Pane`, w, 0.18, d, new Vector3(pos.x, pos.y + 0.09, pos.z), mat, true, false));

  b.endComponent();
  return meshes;
}

/** Configurable flat roof pane (kawara tile / thatch / shrine red / metal). */
export function createRoof(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { width?: number; depth?: number; style?: RoofStyle } = {}
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  const w = Math.max(1, Math.min(12, opts.width ?? 4));
  const d = Math.max(1, Math.min(12, opts.depth ?? 4));
  const style: RoofStyle = opts.style ?? 'tileRoof';
  b.beginComponent('roof', prefix, pos, { width: w, depth: d, style });

  const mat = style === 'straw' ? b.mats.straw : style === 'shrineRed' ? b.mats.shrineRed : style === 'metal' ? b.mats.metal : b.mats.tileRoof;
  meshes.push(b.addBox(`${prefix}_Pane`, w, 0.2, d, new Vector3(pos.x, pos.y + 0.1, pos.z), mat, true, true));

  // Slight overhang lip on the eaves
  meshes.push(b.addBox(`${prefix}_LipA`, w + 0.18, 0.05, 0.08, new Vector3(pos.x, pos.y + 0.16, pos.z + d / 2 + 0.02), mat, false, false));
  meshes.push(b.addBox(`${prefix}_LipB`, w + 0.18, 0.05, 0.08, new Vector3(pos.x, pos.y + 0.16, pos.z - d / 2 - 0.02), mat, false, false));

  b.endComponent();
  return meshes;
}

/** Stone archway gate with mossy pillars and lintel */
export function createStoneArch(b: MapBuilder, prefix: string, pos: Vector3, scale = 1.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('stoneArch', prefix, pos, { scale });

  const s = Math.max(0.5, Math.min(2.0, scale));
  const pH = 3.5 * s;
  const span = 2.0 * s;
  const pW = 0.55 * s;

  // Left pillar
  const left = MeshBuilder.CreateCylinder(`${prefix}_L`, { height: pH, diameterTop: pW, diameterBottom: pW * 1.15, tessellation: 12 }, scene);
  left.position = new Vector3(pos.x - span, pos.y + pH / 2, pos.z);
  left.material = mats.stone;
  left.checkCollisions = true;
  left.receiveShadows = true;
  b.colliders.push(left);
  b.addShadowCaster(left);
  meshes.push(left);

  // Right pillar
  const right = MeshBuilder.CreateCylinder(`${prefix}_R`, { height: pH, diameterTop: pW, diameterBottom: pW * 1.15, tessellation: 12 }, scene);
  right.position = new Vector3(pos.x + span, pos.y + pH / 2, pos.z);
  right.material = mats.stone;
  right.checkCollisions = true;
  right.receiveShadows = true;
  b.colliders.push(right);
  b.addShadowCaster(right);
  meshes.push(right);

  // Lintel (arched top beam)
  const lintel = b.addBox(`${prefix}_Lintel`, span * 2 + pW * 2, 0.45 * s, pW * 1.2, new Vector3(pos.x, pos.y + pH - 0.1 * s, pos.z), mats.stone, true, true);

  // Capstones
  meshes.push(b.addBox(`${prefix}_CapL`, pW * 1.4, 0.25 * s, pW * 1.4, new Vector3(pos.x - span, pos.y + pH + 0.15 * s, pos.z), mats.stone, false, false));
  meshes.push(b.addBox(`${prefix}_CapR`, pW * 1.4, 0.25 * s, pW * 1.4, new Vector3(pos.x + span, pos.y + pH + 0.15 * s, pos.z), mats.stone, false, false));

  // Moss patches on pillars
  for (let i = 0; i < 3; i++) {
    const my = pos.y + 0.3 + i * 0.8 * s;
    const side = i % 2 === 0 ? -1 : 1;
    const moss = MeshBuilder.CreateCylinder(`${prefix}_Ms${i}`, { height: 0.2, diameterTop: 0.35 * s, diameterBottom: 0.35 * s, tessellation: 8 }, scene);
    moss.position = new Vector3(pos.x + side * span, my, pos.z + pW * 0.6);
    moss.material = mats.moss;
    moss.isPickable = false;
    meshes.push(moss);
  }

  b.endComponent();
  return meshes;
}

/** Small stone pagoda lantern (tōrō) — 3-tier */
export function createPagoda(b: MapBuilder, prefix: string, pos: Vector3, tiers = 3): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('pagoda', prefix, pos, { tiers });

  const t = Math.max(2, Math.min(5, tiers));
  let stackY = pos.y;

  // Foundation base
  const base = MeshBuilder.CreateCylinder(`${prefix}_Base`, { height: 0.3, diameterTop: 1.4, diameterBottom: 1.6, tessellation: 16 }, scene);
  base.position = new Vector3(pos.x, stackY + 0.15, pos.z);
  base.material = mats.stone;
  base.checkCollisions = true;
  base.receiveShadows = true;
  b.colliders.push(base);
  b.addShadowCaster(base);
  meshes.push(base);
  stackY += 0.3;

  for (let i = 0; i < t; i++) {
    const s = 1.0 - i * 0.15;
    const tierH = 0.7 * s;

    // Pillar body
    const pillar = MeshBuilder.CreateCylinder(`${prefix}_P${i}`, { height: tierH, diameterTop: 0.45 * s, diameterBottom: 0.5 * s, tessellation: 10 }, scene);
    pillar.position = new Vector3(pos.x, stackY + tierH / 2, pos.z);
    pillar.material = mats.stone;
    pillar.checkCollisions = i === 0;
    pillar.receiveShadows = true;
    if (i === 0) b.colliders.push(pillar);
    b.addShadowCaster(pillar);
    meshes.push(pillar);

    // Tier roof overhang
    const roof = MeshBuilder.CreateCylinder(`${prefix}_R${i}`, { height: 0.12 * s, diameterTop: 1.2 * s, diameterBottom: 1.3 * s, tessellation: 12 }, scene);
    roof.position = new Vector3(pos.x, stackY + tierH + 0.06 * s, pos.z);
    roof.material = mats.tileRoof;
    roof.checkCollisions = false;
    meshes.push(roof);

    stackY += tierH + 0.12 * s;
  }

  // Top finial
  const finial = MeshBuilder.CreateCylinder(`${prefix}_Fin`, { height: 0.3, diameterTop: 0.05, diameterBottom: 0.15, tessellation: 8 }, scene);
  finial.position = new Vector3(pos.x, stackY + 0.15, pos.z);
  finial.material = mats.gold;
  finial.isPickable = false;
  meshes.push(finial);

  b.endComponent();
  return meshes;
}

/** Wooden offering table for shrines */
export function createShrineTable(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('shrineTable', prefix, pos, {});

  // Tabletop
  meshes.push(b.addBox(`${prefix}_Top`, 1.4, 0.1, 0.8, new Vector3(pos.x, pos.y + 0.75, pos.z), mats.darkWood, true, true));

  // Legs
  meshes.push(b.addBox(`${prefix}_LegFL`, 0.08, 0.7, 0.08, new Vector3(pos.x - 0.58, pos.y + 0.35, pos.z + 0.32), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegFR`, 0.08, 0.7, 0.08, new Vector3(pos.x + 0.58, pos.y + 0.35, pos.z + 0.32), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBL`, 0.08, 0.7, 0.08, new Vector3(pos.x - 0.58, pos.y + 0.35, pos.z - 0.32), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBR`, 0.08, 0.7, 0.08, new Vector3(pos.x + 0.58, pos.y + 0.35, pos.z - 0.32), mats.darkWood));

  // Cross braces
  meshes.push(b.addBox(`${prefix}_BrF`, 1.0, 0.06, 0.06, new Vector3(pos.x, pos.y + 0.25, pos.z + 0.32), mats.darkWood, false, false));
  meshes.push(b.addBox(`${prefix}_BrB`, 1.0, 0.06, 0.06, new Vector3(pos.x, pos.y + 0.25, pos.z - 0.32), mats.darkWood, false, false));

  // Rice/sake offering bowls on top
  const bowl1 = b.addBox(`${prefix}_Bwl1`, 0.2, 0.12, 0.2, new Vector3(pos.x - 0.3, pos.y + 0.86, pos.z), mats.ceramic, false, false);
  const bowl2 = b.addBox(`${prefix}_Bwl2`, 0.2, 0.12, 0.2, new Vector3(pos.x + 0.3, pos.y + 0.86, pos.z), mats.ceramic, false, false);

  meshes.push(bowl1, bowl2);

  b.endComponent();
  return meshes;
}

/** Tall flag/banner pole with flowing war banner */
export function createBannerPole(b: MapBuilder, prefix: string, pos: Vector3, color: 'red' | 'white' = 'red'): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('bannerPole', prefix, pos, { color });

  const poleH = 5.0;

  // Pole
  const pole = MeshBuilder.CreateCylinder(`${prefix}_Pole`, { height: poleH, diameterTop: 0.08, diameterBottom: 0.12, tessellation: 8 }, scene);
  pole.position = new Vector3(pos.x, pos.y + poleH / 2, pos.z);
  pole.material = mats.darkWood;
  pole.checkCollisions = true;
  pole.receiveShadows = true;
  b.colliders.push(pole);
  b.addShadowCaster(pole);
  meshes.push(pole);

  // Base stone
  const base = MeshBuilder.CreateCylinder(`${prefix}_Base`, { height: 0.35, diameterTop: 0.6, diameterBottom: 0.7, tessellation: 10 }, scene);
  base.position = new Vector3(pos.x, pos.y + 0.175, pos.z);
  base.material = mats.stone;
  base.checkCollisions = true;
  b.colliders.push(base);
  meshes.push(base);

  // Banner fabric (vertical plane)
  const banner = MeshBuilder.CreatePlane(`${prefix}_Banner`, { width: 0.8, height: 2.2 }, scene);
  banner.position = new Vector3(pos.x + 0.45, pos.y + poleH - 1.5, pos.z);
  banner.material = color === 'red' ? mats.shrineRed : mats.plaster;
  banner.isPickable = false;
  meshes.push(banner);

  // Top ornament
  const ornament = MeshBuilder.CreateSphere(`${prefix}_Orn`, { diameter: 0.18, segments: 6 }, scene);
  ornament.position = new Vector3(pos.x, pos.y + poleH + 0.1, pos.z);
  ornament.material = mats.gold;
  ornament.isPickable = false;
  meshes.push(ornament);

  b.endComponent();
  return meshes;
}

/** Stone torii path marker — small ground-level torii for marking paths */
export function createPathMarker(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('pathMarker', prefix, pos, {});

  const pH = 1.0;
  const span = 0.6;

  // Mini pillars
  meshes.push(b.addBox(`${prefix}_PL`, 0.1, pH, 0.1, new Vector3(pos.x - span, pos.y + pH / 2, pos.z), mats.shrineRed));
  meshes.push(b.addBox(`${prefix}_PR`, 0.1, pH, 0.1, new Vector3(pos.x + span, pos.y + pH / 2, pos.z), mats.shrineRed));

  // Top beam
  meshes.push(b.addBox(`${prefix}_Top`, span * 2 + 0.3, 0.08, 0.12, new Vector3(pos.x, pos.y + pH - 0.02, pos.z), mats.shrineRed));

  // Sub beam
  meshes.push(b.addBox(`${prefix}_Sub`, span * 2 + 0.1, 0.05, 0.08, new Vector3(pos.x, pos.y + pH * 0.7, pos.z), mats.shrineRed));

  b.endComponent();
  return meshes;
}

/** Ornamental bridge over water or dry garden */
export function createOrnamentalBridge(b: MapBuilder, prefix: string, pos: Vector3, span = 4.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('ornamentalBridge', prefix, pos, { span });

  const s = Math.max(2.0, Math.min(8.0, span));
  const archH = 0.6;

  // Deck planks
  const deck = MeshBuilder.CreateBox(`${prefix}_Deck`, { width: 1.2, height: 0.15, depth: s }, scene);
  deck.position = new Vector3(pos.x, pos.y + archH + 0.075, pos.z);
  deck.material = mats.woodDeck;
  deck.checkCollisions = true;
  deck.receiveShadows = true;
  b.colliders.push(deck);
  b.addShadowCaster(deck);
  meshes.push(deck);

  // Arched underside (fake with a cylinder cut)
  const arch = MeshBuilder.CreateCylinder(`${prefix}_Arch`, { height: 1.2, diameterTop: s * 0.9, diameterBottom: s * 0.9, tessellation: 16, arc: 0.5 }, scene);
  arch.position = new Vector3(pos.x, pos.y + 0.1, pos.z);
  arch.rotation.x = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.material = mats.darkWood;
  arch.isPickable = false;
  meshes.push(arch);

  // Railings
  const railH = 0.5;
  const railOff = 0.55;
  for (const side of [-1, 1]) {
    // Posts
    for (let i = 0; i < 3; i++) {
      const pz = pos.z + (i - 1) * (s * 0.35);
      const postY = pos.y + archH + 0.15 + railH / 2;
      const post = MeshBuilder.CreateCylinder(`${prefix}_RP${side}_${i}`, { height: railH, diameterTop: 0.06, diameterBottom: 0.06, tessellation: 6 }, scene);
      post.position = new Vector3(pos.x + side * railOff, postY, pz);
      post.material = mats.darkWood;
      post.isPickable = false;
      meshes.push(post);
    }
    // Rail bar
    const rail = MeshBuilder.CreateCylinder(`${prefix}_RB${side}`, { height: s * 0.75, diameterTop: 0.05, diameterBottom: 0.05, tessellation: 6 }, scene);
    rail.position = new Vector3(pos.x + side * railOff, pos.y + archH + 0.15 + railH, pos.z);
    rail.rotation.x = Math.PI / 2;
    rail.material = mats.darkWood;
    rail.isPickable = false;
    meshes.push(rail);
  }

  b.endComponent();
  return meshes;
}
