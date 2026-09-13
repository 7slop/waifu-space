import { MeshBuilder, Vector3, Color3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createCrateCluster, createSakuraTree, createGardenBush,
  createStoneLantern, createHangingLantern, createBambooFence
} from '../components';

/** A-Site — "Tea House Courtyard" (NW, X = -38..-16, Z = -36..-22). Three entry points. */
export function buildSiteA(b: MapBuilder) {
  const { mats, scene } = b;

  // --- Raised wooden platform (site floor, distinct footstep sound) ---
  b.addBox('aSiteFloor', 20, 0.4, 12, new Vector3(-27, 0.2, -29), mats.woodDeck);

  // --- Zen sand garden visual overlay ---
  const zenGrd = MeshBuilder.CreateGround('zenGrdA', { width: 14, height: 10, subdivisions: 2 }, scene);
  zenGrd.position = new Vector3(-24, 0.42, -29);
  zenGrd.material = mats.zenSand;
  zenGrd.checkCollisions = false;

  // --- Tea House main building (anchor structure, no entry) ---
  b.addBox('teaBody', 10, 5, 8, new Vector3(-33, 2.5, -29), mats.plaster);
  // Tea house timber frame (proud of walls to eliminate flickering)
  b.addBox('teaPFL', 0.62, 5, 0.62, new Vector3(-38.04, 2.5, -24.96), mats.timber, false);
  b.addBox('teaPFR', 0.62, 5, 0.62, new Vector3(-27.96, 2.5, -24.96), mats.timber, false);
  b.addBox('teaPBL', 0.62, 5, 0.62, new Vector3(-38.04, 2.5, -33.04), mats.timber, false);
  b.addBox('teaPBR', 0.62, 5, 0.62, new Vector3(-27.96, 2.5, -33.04), mats.timber, false);
  // Tea house roof
  b.addBox('teaRoof', 12.5, 0.55, 10.5, new Vector3(-33, 5.3, -29), mats.tileRoof);
  b.addBox('teaRoofPk', 8, 0.5, 7, new Vector3(-33, 5.85, -29), mats.tileRoof);
  // Tea house south veranda (elevated peek position, height 0.4m)
  b.addBox('teaVeranda', 10, 0.4, 2, new Vector3(-33, 0.6, -24.5), mats.woodDeck);

  // Tea house lit windows spilling warm light into the arena
  b.addBox('teaWinL', 1.9, 1.6, 0.12, new Vector3(-36, 3.3, -24.88), mats.windowGlow, false);
  b.addBox('teaWinR', 1.9, 1.6, 0.12, new Vector3(-30, 3.3, -24.88), mats.windowGlow, false);

  const teaWinPL1 = b.addLanternLight('teaWinPL1', new Vector3(-36, 2.8, -24.2), { intensity: 1.2, range: 11 });
  teaWinPL1.specular = new Color3(0.4, 0.3, 0.15);
  const teaWinPL2 = b.addLanternLight('teaWinPL2', new Vector3(-30, 2.8, -24.2), { intensity: 1.2, range: 11 });
  teaWinPL2.specular = new Color3(0.4, 0.3, 0.15);

  // --- Waist-high stone planter (default position cover) ---
  b.addBox('aPlanter', 3.5, 1.25, 1.2, new Vector3(-23, 0.825, -29), mats.stone);

  // --- Defense crate stack (post-plant cover behind altar area) ---
  createCrateCluster(b, 'crateASite', new Vector3(-27, 0, -34), false);
  createSakuraTree(b, 'sakuraASite', new Vector3(-20, 0, -34));
  createGardenBush(b, 'bushA1', new Vector3(-24, 0, -25), 1.15);
  createGardenBush(b, 'bushA2', new Vector3(-32, 0, -34), 0.95);

  // --- Stone lanterns & Hanging Veranda Lanterns ---
  createStoneLantern(b, 'lanAL', new Vector3(-20, 0, -26));
  createStoneLantern(b, 'lanAR', new Vector3(-35, 0, -33));
  createHangingLantern(b, 'lanTeaHang1', new Vector3(-30, 2.6, -24.5));
  createHangingLantern(b, 'lanTeaHang2', new Vector3(-36, 2.6, -24.5));

  // --- Bamboo privacy screen at A-Short entry (east edge of site) ---
  createBambooFence(b, 'bambooAShort', new Vector3(-17, 0, -29), 5, true);

  // --- A-Site boundary walls (prevent flanking from outside the defined entries) ---
  // North wall (connects to perimeter approach)
  b.addBox('aWallN', 22, 4.5, 0.8, new Vector3(-27, 2.25, -36), mats.wall);
  // West wall (tea house acts as wall on west, just need gap closure)
  b.addBox('aWallW', 0.8, 4.5, 8, new Vector3(-38, 2.25, -25), mats.wall);
  // Partial south wall with opening for A-Long entry (3m gap at X=-28)
  b.addBox('aWallSL', 7, 4.5, 0.8, new Vector3(-34.5, 2.25, -22), mats.wall);
  b.addBox('aWallSR', 6, 4.5, 0.8, new Vector3(-20, 2.25, -22), mats.wall);
  // Gap at X ≈ -30..-27 for A-Long north entry
}
