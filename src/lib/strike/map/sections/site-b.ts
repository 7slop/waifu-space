import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createTorii, createSakuraTree, createGardenBush, createCrateCluster,
  createSakeBarrelStack, createStoneLantern, createHangingLantern, createBambooFence
} from '../components';

/** B-Site — "Temple Gate / Shrine" (NE, X = +16..+38, Z = -36..-22). Three entry points. */
export function buildSiteB(b: MapBuilder) {
  const { mats } = b;

  // ═══════════════════════════════════════════════════════════════════
  // QUARTER SEALS — SE background block & T1 spawn-east boundary
  // ═══════════════════════════════════════════════════════════════════

  // --- South-East corner block (fills the void behind Team 1 spawn east) ---
  b.addBox('seBlock', 29.4, 7.5, 16.5, new Vector3(37.3, 3.75, 44), mats.plaster);
  b.addBox('seBlockRoof', 30.4, 0.6, 17.5, new Vector3(37.3, 7.8, 44), mats.tileRoof, false);
  // Continuous spawn-east boundary wall (extends the T1 flank wall to the perimeter)
  b.addBox('t1SpawnEastWall', 1.2, 5.5, 16, new Vector3(22, 2.75, 44), mats.wall);

  // --- Elevated stone platform (defenders have height advantage) ---
  b.addBox('bPlatform', 20, 0.9, 12, new Vector3(27, 0.45, -29), mats.ground);

  // --- Stone steps (south face, 2 steps leading up to platform) ---
  b.addBox('bStep1', 10, 0.45, 2, new Vector3(27, 0.225, -22.5), mats.ground);
  b.addBox('bStep2', 10, 0.45, 2, new Vector3(27, 0.675, -24), mats.ground);

  // --- Main Torii Gate (iconic entry from south) ---
  createTorii(b, 'toriiBSite', new Vector3(27, 0, -22), 1.0);

  // --- Bell Tower (vertical landmark, not accessible inside) ---
  b.addBox('bellBody', 4, 6.5, 4, new Vector3(35, 3.7, -32), mats.timber);
  b.addBox('bellRoof', 6, 0.55, 6, new Vector3(35, 7.2, -32), mats.tileRoof);
  b.addBox('bellRoofPk', 4, 0.5, 4, new Vector3(35, 7.75, -32), mats.tileRoof);
  // Gold bell (decorative)
  b.addBox('bellGold', 1.2, 1.5, 1.2, new Vector3(35, 5.5, -32), mats.gold, false);

  // --- Sacred altar / plant zone (objective centerpiece) ---
  b.addBox('bAltar', 3, 1.2, 2, new Vector3(27, 1.5, -30), mats.gold);

  // --- Stone barriers (waist-high cover for site defenders) ---
  b.addBox('bBarrierL', 3.5, 1.25, 0.8, new Vector3(21, 1.075, -29), mats.stone);
  b.addBox('bBarrierR', 3.5, 1.25, 0.8, new Vector3(33, 1.075, -29), mats.stone);
  createSakuraTree(b, 'sakuraBSite', new Vector3(34, 0, -25));
  createGardenBush(b, 'bushB1', new Vector3(21, 0, -25), 1.15);
  createGardenBush(b, 'bushB2', new Vector3(31, 0, -34), 0.95);

  // --- Elevated crate stack on platform ---
  createCrateCluster(b, 'crateBSite', new Vector3(30, 0.9, -26), false);

  // --- Traditional Sake Barrel Offerings ---
  createSakeBarrelStack(b, 'sakeBSiteAltar', new Vector3(23, 0.9, -27), true);
  createSakeBarrelStack(b, 'sakeBSiteSouth', new Vector3(23, 0, -22.5), false);

  // --- Stone lanterns & Shrine Illuminations ---
  createStoneLantern(b, 'lanBL', new Vector3(20, 0, -26));
  createStoneLantern(b, 'lanBR', new Vector3(34, 0, -26));
  createStoneLantern(b, 'lanShrineHondoL', new Vector3(20, 0, -37));
  createStoneLantern(b, 'lanShrineHondoR', new Vector3(34, 0, -37));
  createHangingLantern(b, 'lanHondoHangL', new Vector3(23, 4.2, -37.5));
  createHangingLantern(b, 'lanHondoHangR', new Vector3(31, 4.2, -37.5));

  // --- GRAND KYOTO SHRINE SANCTUARY (HONDO) — Majestic North Backdrop ---
  // Seals the massive north void between Z=-36 and the perimeter wall Z=-52
  b.addBox('shrineHondoBody', 24, 7.5, 12, new Vector3(27, 3.75, -44), mats.plaster);

  // Massive timber facade pillars
  b.addBox('shrineCol1', 0.8, 7.5, 0.8, new Vector3(17, 3.75, -38), mats.timber);
  b.addBox('shrineCol2', 0.8, 7.5, 0.8, new Vector3(23, 3.75, -38), mats.timber);
  b.addBox('shrineCol3', 0.8, 7.5, 0.8, new Vector3(31, 3.75, -38), mats.timber);
  b.addBox('shrineCol4', 0.8, 7.5, 0.8, new Vector3(37, 3.75, -38), mats.timber);

  // Grand Shinto entrance Shoji screens & gold trim
  b.addBox('shrineShoji', 10, 4.5, 0.2, new Vector3(27, 2.25, -37.9), mats.shoji, false);
  b.addBox('shrineGoldTrim', 10.4, 0.3, 0.3, new Vector3(27, 4.6, -37.8), mats.gold, false);

  // Sacred Shimenawa (woven straw rope)
  b.addBox('shrineShimenawa', 12, 0.45, 0.45, new Vector3(27, 6.2, -37.8), mats.straw, false);

  // Sweeping Multi-Tiered Kawara Tile Roof
  b.addBox('shrineEaves', 28, 0.8, 15, new Vector3(27, 7.8, -44), mats.tileRoof);
  b.addBox('shrineRidge', 20, 0.9, 10, new Vector3(27, 8.6, -44), mats.tileRoof);
  b.addBox('shrineRidgePeak', 14, 0.6, 6, new Vector3(27, 9.3, -44), mats.timber);

  // Flanking Sanctuary Enclosure Walls (connect Hondo to north-west and north-east;
  // the east flank extends south to fuse with the Kura district cap wall)
  b.addBox('shrineFlankW', 0.8, 7.5, 12, new Vector3(15, 3.75, -44), mats.wall);
  b.addBox('shrineFlankE', 0.8, 7.5, 16, new Vector3(39, 3.75, -42), mats.wall);

  // --- B-Site Enclosure & Approach Walls ---
  // North boundary wall in front of Hondo
  b.addBox('bWallN', 22, 4.5, 0.8, new Vector3(27, 2.25, -36), mats.wall);

  // East wall with gap for Secret Passage entry (~3m gap at Z=-29)
  b.addBox('bWallE1', 0.8, 4.5, 4, new Vector3(38, 2.25, -34), mats.wall);
  b.addBox('bWallE2', 0.8, 4.5, 3, new Vector3(38, 2.25, -23.5), mats.wall);

  // West enclosing walls (clean entrance from B-Short)
  b.addBox('bWallW_South', 0.8, 4.5, 6, new Vector3(16.5, 2.25, -25), mats.wall);
  b.addBox('bWallW_North', 0.8, 4.5, 6, new Vector3(16.5, 2.25, -33), mats.wall);

  // Sacred Torii approach gate from Secret Passage
  createTorii(b, 'toriiSecApproach', new Vector3(39, 0, -26), 0.85);
  createStoneLantern(b, 'lanSecApproach1', new Vector3(38, 0, -22));
  createStoneLantern(b, 'lanSecApproach2', new Vector3(41, 0, -28));
  createBambooFence(b, 'bambooBSiteFlank', new Vector3(43, 0, -28), 8, true);
}
