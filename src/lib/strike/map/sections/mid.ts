import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createTorii, createSakuraTree, createGardenBush, createCrateCluster,
  createStoneLantern, createHangingLantern, createBambooFence
} from '../components';

/**
 * Mid — "Torii Avenue" Central Plaza (X = -8..+8, Z = -18..+18).
 *
 * Rework: dense staggered cover so teams spawning on opposite sides can
 * never see each other in a straight line — a central stone altar under the
 * Torii plus two full-height planter walls break every spawn-to-spawn
 * sightline, while zigzag lanes keep mid fast and contestable.
 */
export function buildMid(b: MapBuilder) {
  const { mats } = b;

  // --- Grand Torii Gate (centerpiece) ---
  createTorii(b, 'toriiMid', new Vector3(0, 0, 0), 1.15);

  // --- Central stone altar (full-height blocker under the Torii) ---
  // Kills the straight spawn-to-spawn sightline through the middle.
  b.addBox('midAltar', 4.4, 2.8, 4.4, new Vector3(0, 1.4, 0), mats.stone);
  b.addBox('midAltarOrn', 1.2, 1.1, 1.2, new Vector3(0, 3.35, 0), mats.gold, false);

  // --- Staggered full-height planter walls (diagonal cover line) ---
  // West wall guards the north half, east wall guards the south half.
  b.addBox('midPlanterN', 6, 2.6, 1.4, new Vector3(-4.5, 1.3, 7), mats.stone);
  b.addBox('midPlanterS', 6, 2.6, 1.4, new Vector3(4.5, 1.3, -7), mats.stone);
  // Sculpted bushes crowning the planters
  createGardenBush(b, 'bushPlanterN', new Vector3(-4.5, 2.6, 7), 1.2);
  createGardenBush(b, 'bushPlanterS', new Vector3(4.5, 2.6, -7), 1.2);

  // --- Central Sakura Tree & garden foliage ---
  createSakuraTree(b, 'sakuraMid', new Vector3(0, 0, 9.5));
  createGardenBush(b, 'bushMid1', new Vector3(-7, 0, 3), 0.95);
  createGardenBush(b, 'bushMid2', new Vector3(7, 0, -3), 0.95);
  createGardenBush(b, 'bushMid3', new Vector3(-7, 0, -11), 0.95);
  createGardenBush(b, 'bushMid4', new Vector3(7, 0, 11), 0.95);

  // --- Bamboo groves flanking the plaza corners ---
  createBambooFence(b, 'bambooMidW', new Vector3(-6.8, 0, -10.5), 4, true);
  createBambooFence(b, 'bambooMidE', new Vector3(6.8, 0, 10.5), 4, true);

  // --- Waist-high stone benches (key peek positions) ---
  b.addBox('benchMidL', 3, 1.1, 1.2, new Vector3(-5, 0.55, -4), mats.stone);   // A-connector peek
  b.addBox('benchMidR', 3, 1.1, 1.2, new Vector3(5, 0.55, 4), mats.stone);     // B-connector peek

  // --- Crate cover positions (mirrored for competitive balance) ---
  createCrateCluster(b, 'crateMidA', new Vector3(-3, 0, -7), true);
  createCrateCluster(b, 'crateMidB', new Vector3(3, 0, 7), false);
  b.addBox('crateMidS', 2, 1.3, 2, new Vector3(4, 0.65, 12), mats.crate);
  b.addBox('crateMidN', 2, 1.3, 2, new Vector3(-4, 0.65, -12), mats.crate);

  // --- Stone lanterns (orientation + thin cover) ---
  createStoneLantern(b, 'lanMidL', new Vector3(-6, 0, 0));
  createStoneLantern(b, 'lanMidR', new Vector3(6, 0, 0));
  createStoneLantern(b, 'lanMid_S', new Vector3(-5, 0, 14));
  createStoneLantern(b, 'lanMid_S2', new Vector3(5, 0, 14));
  createStoneLantern(b, 'lanMid_N', new Vector3(-4, 0, -12));
  createStoneLantern(b, 'lanMid_N2', new Vector3(4, 0, -12));

  // --- Chochin lanterns hanging from the Torii crossbeam ---
  createHangingLantern(b, 'lanToriiL', new Vector3(-2.8, 7.0, 0));
  createHangingLantern(b, 'lanToriiR', new Vector3(2.8, 7.0, 0));

  // --- Mid flanking walls (channel players, separate from lanes) ---
  // West: gap at Z = -18..-14 for the Mid-to-A passage mouth; sealed below
  b.addBox('midWallW1', 0.8, 4, 12, new Vector3(-8, 2, -8), mats.plaster);   // West upper segment
  b.addBox('midWallW2', 0.8, 4, 10, new Vector3(-8, 2, 10), mats.plaster);   // West lower segment
  b.addBox('midWallWFill', 0.8, 4, 7.4, new Vector3(-8, 2, 1.5), mats.plaster); // Seals the old side gap

  // East: mirror of the west side
  b.addBox('midWallE1', 0.8, 4, 12, new Vector3(8, 2, -8), mats.plaster);    // East upper segment
  b.addBox('midWallE2', 0.8, 4, 10, new Vector3(8, 2, 10), mats.plaster);    // East lower segment
  b.addBox('midWallEFill', 0.8, 4, 7.4, new Vector3(8, 2, 1.5), mats.plaster); // Seals the old side gap

  // North: wall closing off mid from sites area (gap at center for passage)
  b.addBox('midWallNL', 5, 4, 0.8, new Vector3(-5.5, 2, -14), mats.plaster);
  b.addBox('midWallNR', 5, 4, 0.8, new Vector3(5.5, 2, -14), mats.plaster);
  // 3m gap at X = -3..+3 for mid north exit
}
