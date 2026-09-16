import { MeshBuilder, Vector3, AbstractMesh, StandardMaterial, Color3, Scene } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { registerRuntimeEffects, swayRotation } from './runtime-effects';

const memoMats = new WeakMap<Scene, Map<string, StandardMaterial>>();

/**
 * Per-scene shared cache for simple solid-colour materials (manga covers etc.).
 * Each scene owns one cache so disposal stays clean and draw calls stay low.
 */
export function memoMaterial(scene: Scene, key: string, make: () => StandardMaterial): StandardMaterial {
  let cache = memoMats.get(scene);
  if (!cache) {
    cache = new Map<string, StandardMaterial>();
    memoMats.set(scene, cache);
  }
  let mat = cache.get(key);
  if (!mat) {
    mat = make();
    cache.set(key, mat);
  }
  return mat;
}

function solidMat(scene: Scene, key: string, hex: string, emissive?: string): StandardMaterial {
  return memoMaterial(scene, key, () => {
    const m = new StandardMaterial(key, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.1, 0.1, 0.1);
    if (emissive) {
      m.emissiveColor = Color3.FromHexString(emissive);
      m.disableLighting = true;
    }
    m.maxSimultaneousLights = 4;
    return m;
  });
}

/**
 * Timber pivoting door with a physical panel that swings on a side hinge.
 * Registered as a player interactable so the game engine can open/close it
 * with the interact key (animating the hinge pivot + playing a sound).
 */
export function createDoor(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { width?: number; height?: number; swing?: 1 | -1 } = {}
): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const width = Math.max(0.9, Math.min(2.4, opts.width ?? 1.2));
  const height = Math.max(1.8, Math.min(3.0, opts.height ?? 2.4));
  const swing: 1 | -1 = opts.swing === -1 ? -1 : 1;
  b.beginComponent('door', prefix, pos, { width, height, swing });

  const frameH = 0.14;
  const frameD = 0.18;

  // Timber frame
  meshes.push(b.addBox(`${prefix}_JambL`, frameH, height, frameD, new Vector3(pos.x - width / 2, pos.y + height / 2, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_JambR`, frameH, height, frameD, new Vector3(pos.x + width / 2, pos.y + height / 2, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_Header`, width + frameH * 2, frameH, frameD, new Vector3(pos.x, pos.y + height + frameH / 2, pos.z), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_Sill`, width + frameH * 2, 0.05, frameD, new Vector3(pos.x, pos.y + 0.025, pos.z), mats.darkWood, false, false));

  // Hinge pivot: an invisible axis the panel swings around.
  const hingeX = swing === 1 ? -1 : 1;
  const pivot = MeshBuilder.CreateBox(`${prefix}_Hinge`, { width: 0.02, height, depth: 0.02 }, scene);
  pivot.position = new Vector3(pos.x + (hingeX * width) / 2, pos.y + height / 2, pos.z);
  pivot.material = mats.darkWood;
  pivot.isVisible = false;
  pivot.isPickable = false;
  meshes.push(pivot);

  // Panel: collidable (never pushed into b.colliders so it stays unfrozen
  // and follows the pivot rotation every frame).
  const panel = MeshBuilder.CreateBox(`${prefix}_Panel`, { width, height: height - 0.08, depth: 0.12 }, scene);
  panel.position = new Vector3(-(hingeX * width) / 2, 0, 0);
  panel.material = mats.timber;
  panel.receiveShadows = true;
  panel.checkCollisions = true;
  panel.parent = pivot;
  meshes.push(panel);

  // Timber lattice details on the panel face
  const railT = MeshBuilder.CreateBox(`${prefix}_RailT`, { width: width * 0.86, height: 0.1, depth: 0.02 }, scene);
  railT.position = new Vector3(0, height / 2 - 0.24, 0.07);
  railT.material = mats.darkWood;
  railT.isPickable = false;
  railT.parent = panel;
  meshes.push(railT);

  const railB = MeshBuilder.CreateBox(`${prefix}_RailB`, { width: width * 0.86, height: 0.1, depth: 0.02 }, scene);
  railB.position = new Vector3(0, -height / 2 + 0.22, 0.07);
  railB.material = mats.darkWood;
  railB.isPickable = false;
  railB.parent = panel;
  meshes.push(railB);

  // Metal handle near the swinging edge
  const handle = MeshBuilder.CreateBox(`${prefix}_Handle`, { width: 0.32, height: 0.05, depth: 0.05 }, scene);
  handle.position = new Vector3(-hingeX * width * 0.32, height * 0.45, 0.085);
  handle.material = mats.metal;
  handle.isPickable = false;
  handle.parent = panel;
  meshes.push(handle);

  if (!b.editor) {
    b.registerInteractable({
      type: 'door',
      id: `${prefix}_Door`,
      mesh: pivot,
      swing,
      open: false
    });
  }

  b.endComponent();
  return meshes;
}

/** Traditional sleeping futon: mattress, folded sheet, blanket and pillow. */
export function createFuton(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { width?: number } = {}
): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  const w = Math.max(1.4, Math.min(2.4, opts.width ?? 1.9));
  const len = 2.2;
  b.beginComponent('futon', prefix, pos, { width: w });

  // Mattress pad (soft, walk-over-able)
  meshes.push(b.addBox(`${prefix}_Mattress`, w, 0.2, len, new Vector3(pos.x, pos.y + 0.1, pos.z), mats.fabric, false, true));

  // Folded sheet near the head
  meshes.push(b.addBox(`${prefix}_Sheet`, w, 0.05, 0.3, new Vector3(pos.x, pos.y + 0.22, pos.z + len * 0.32), mats.fabric, false, false));

  // Indigo blanket over the lower half
  meshes.push(b.addBox(`${prefix}_Blanket`, w, 0.05, len * 0.56, new Vector3(pos.x, pos.y + 0.23, pos.z - len * 0.2), mats.blanket, false, false));

  // Pillow at the head
  meshes.push(b.addBox(`${prefix}_Pillow`, w * 0.32, 0.08, 0.36, new Vector3(pos.x, pos.y + 0.25, pos.z + len * 0.42), mats.plaster, false, false));

  b.endComponent();
  return meshes;
}

/** Simple wooden dining table. */
export function createTable(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { width?: number; depth?: number } = {}
): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  const w = Math.max(0.8, Math.min(2.4, opts.width ?? 1.8));
  const d = Math.max(0.5, Math.min(1.4, opts.depth ?? 1.0));
  const h = 0.75;
  b.beginComponent('table', prefix, pos, { width: w, depth: d });

  // Top
  meshes.push(b.addBox(`${prefix}_Top`, w, 0.08, d, new Vector3(pos.x, pos.y + h, pos.z), mats.woodDeck, true, true));

  // Legs
  const lw = 0.07;
  meshes.push(b.addBox(`${prefix}_LegFL`, lw, h, lw, new Vector3(pos.x - w / 2 + 0.06, pos.y + h / 2, pos.z + d / 2 - 0.06), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegFR`, lw, h, lw, new Vector3(pos.x + w / 2 - 0.06, pos.y + h / 2, pos.z + d / 2 - 0.06), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBL`, lw, h, lw, new Vector3(pos.x - w / 2 + 0.06, pos.y + h / 2, pos.z - d / 2 + 0.06), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBR`, lw, h, lw, new Vector3(pos.x + w / 2 - 0.06, pos.y + h / 2, pos.z - d / 2 + 0.06), mats.darkWood));

  // Cross braces
  meshes.push(b.addBox(`${prefix}_Br`, w - 0.3, 0.05, 0.05, new Vector3(pos.x, pos.y + 0.28, pos.z + d / 2 - 0.04), mats.darkWood, false, false));
  meshes.push(b.addBox(`${prefix}_BrB`, w - 0.3, 0.05, 0.05, new Vector3(pos.x, pos.y + 0.28, pos.z - d / 2 + 0.04), mats.darkWood, false, false));

  b.endComponent();
  return meshes;
}

/** Simple wooden chair with a slightly reclined backrest. */
export function createChair(b: MapBuilder, prefix: string, pos: Vector3): AbstractMesh[] {
  const { mats } = b;
  const meshes: AbstractMesh[] = [];
  b.beginComponent('chair', prefix, pos, {});

  const seatY = 0.46;
  // Seat
  meshes.push(b.addBox(`${prefix}_Seat`, 0.46, 0.06, 0.46, new Vector3(pos.x, pos.y + seatY, pos.z), mats.woodDeck, true, true));

  // Backrest (slight recline)
  meshes.push(b.addBox(`${prefix}_Back`, 0.46, 0.52, 0.05, new Vector3(pos.x, pos.y + seatY + 0.26, pos.z - 0.2), mats.woodDeck, false, false, new Vector3(-0.1, 0, 0)));

  // Legs
  const lw = 0.045;
  const push = 0.17;
  meshes.push(b.addBox(`${prefix}_LegFL`, lw, seatY, lw, new Vector3(pos.x - push, pos.y + seatY / 2, pos.z + push), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegFR`, lw, seatY, lw, new Vector3(pos.x + push, pos.y + seatY / 2, pos.z + push), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBL`, lw, seatY, lw, new Vector3(pos.x - push, pos.y + seatY / 2, pos.z - push - 0.05), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBR`, lw, seatY, lw, new Vector3(pos.x + push, pos.y + seatY / 2, pos.z - push - 0.05), mats.darkWood));

  b.endComponent();
  return meshes;
}

const MANGA_COVERS = ['#ff7eb6', '#52c7ff', '#ffd23f', '#ff8c42', '#9b5de5', '#2ec4b6', '#ef476f', '#06d6a0'];

/** Pile of manga volumes with vivid cover spines, good for a waifu nook. */
export function createMangaPile(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { count?: number } = {}
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  const count = Math.max(3, Math.min(12, Math.round(opts.count ?? 6)));
  b.beginComponent('mangaPile', prefix, pos, { count });

  const bookLen = 0.5;
  const bookThick = 0.055;
  const bookDepth = 0.34;
  const colX = [-0.26, 0.26];
  let placed = 0;

  // Two flat stacks of volumes
  for (let col = 0; col < 2 && placed < count; col++) {
    const inThis = Math.min(count - placed, Math.ceil(count / 2));
    let y = pos.y + bookThick / 2;
    for (let i = 0; i < inThis; i++) {
      const mat = solidMat(b.scene, `${prefix}_cov${placed}`, MANGA_COVERS[(placed + col) % MANGA_COVERS.length]);
      const rotY = i % 2 === 0 ? 0 : Math.PI / 2;
      const book = b.addBox(
        `${prefix}_B${placed}`,
        bookLen,
        bookThick,
        bookDepth,
        new Vector3(pos.x + colX[col], y, pos.z),
        mat,
        false,
        false,
        new Vector3(0, rotY, 0)
      );
      meshes.push(book);
      y += bookThick;
      placed++;
    }
  }

  // One leaning volume for character
  if (placed < count + 1) {
    const mat = solidMat(b.scene, `${prefix}_covLean`, MANGA_COVERS[(placed + 1) % MANGA_COVERS.length]);
    const lean = b.addBox(
      `${prefix}_Lean`,
      bookDepth,
      bookThick,
      bookLen,
      new Vector3(pos.x - 0.2, pos.y + 0.12, pos.z - 0.28),
      mat,
      false,
      false,
      new Vector3(0.5, 0, 0)
    );
    meshes.push(lean);
  }

  b.endComponent();
  return meshes;
}