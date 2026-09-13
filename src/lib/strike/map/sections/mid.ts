import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { createTorii, createSakuraTree, createGardenBush, createCrateCluster, createStoneLantern } from '../components';

/** Mid — "Torii Avenue" Central Plaza (X = -8..+8, Z = -18..+18). High-risk central lane. */
export function buildMid(b: MapBuilder) {
  const { mats } = b;

  // --- Grand Torii Gate (centerpiece) ---
  createTorii(b, 'toriiMid', new Vector3(0, 0, 0), 1.15);

  // --- Central Sakura Tree & garden foliage ---
  createSakuraTree(b, 'sakuraMid', new Vector3(0, 0, 8));
  createGardenBush(b, 'bushMid1', new Vector3(-7, 0, 6), 0.95);
  createGardenBush(b, 'bushMid2', new Vector3(7, 0, 6), 0.95);
  createGardenBush(b, 'bushMid3', new Vector3(-7, 0, -6), 0.95);
  createGardenBush(b, 'bushMid4', new Vector3(7, 0, -6), 0.95);

  // --- Waist-high stone benches (key peek positions) ---
  b.addBox('benchMidL', 3, 1.1, 1.2, new Vector3(-5, 0.55, 4), mats.stone);   // A-connector peek
  b.addBox('benchMidR', 3, 1.1, 1.2, new Vector3(5, 0.55, -4), mats.stone);   // B-connector peek

  // --- Full-body crate stack (key mid hold position) ---
  createCrateCluster(b, 'crateMidA', new Vector3(-3, 0, -7), true);

  // --- Crouch cover crate (south mid) ---
  b.addBox('crateMidS', 2, 1.3, 2, new Vector3(4, 0.65, 12), mats.crate);

  // --- Stone lanterns (orientation + thin cover) ---
  createStoneLantern(b, 'lanMidL', new Vector3(-6, 0, 0));
  createStoneLantern(b, 'lanMidR', new Vector3(6, 0, 0));
  createStoneLantern(b, 'lanMid_S', new Vector3(-5, 0, 14));
  createStoneLantern(b, 'lanMid_S2', new Vector3(5, 0, 14));
  createStoneLantern(b, 'lanMid_N', new Vector3(-4, 0, -12));
  createStoneLantern(b, 'lanMid_N2', new Vector3(4, 0, -12));

  // --- Mid flanking walls (channel players, separate from lanes) ---
  // These walls define the west and east edges of Mid
  // West: gap at Z = -14..-18 for Mid-to-A connector, gap at Z = 16..20 for south approach
  b.addBox('midWallW1', 0.8, 4, 12, new Vector3(-8, 2, -8), mats.plaster);   // West upper segment
  b.addBox('midWallW2', 0.8, 4, 10, new Vector3(-8, 2, 10), mats.plaster);   // West lower segment

  // East: gap at Z = -14..-18 for Mid-to-B connector, gap at Z = 16..20 for south approach
  b.addBox('midWallE1', 0.8, 4, 12, new Vector3(8, 2, -8), mats.plaster);    // East upper segment
  b.addBox('midWallE2', 0.8, 4, 10, new Vector3(8, 2, 10), mats.plaster);    // East lower segment

  // North: wall closing off mid from sites area (gap at center for passage)
  b.addBox('midWallNL', 5, 4, 0.8, new Vector3(-5.5, 2, -14), mats.plaster);
  b.addBox('midWallNR', 5, 4, 0.8, new Vector3(5.5, 2, -14), mats.plaster);
  // 3m gap at X = -3..+3 for mid north exit
}
