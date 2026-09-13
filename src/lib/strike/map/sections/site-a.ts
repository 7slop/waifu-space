import { MeshBuilder, Vector3, Color3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createMachiyaHouse, createCrateCluster, createSakuraTree, createGardenBush,
  createStoneLantern, createHangingLantern, createBambooFence
} from '../components';

/**
 * A-Site — "Tea House Courtyard" (NW, X = -38..-16, Z = -36..-22).
 * Three entry points: A-Long north, A-Short, elevated drop.
 *
 * Rework: the whole north-west quarter is now sealed — the NW and SW corners
 * behind the spawns are filled with solid background blocks, the site north
 * wall reaches the west street wall, and no gap remains that lets players
 * slip behind buildings out to the map edge.
 */
export function buildSiteA(b: MapBuilder) {
  const { mats, scene } = b;

  // ═══════════════════════════════════════════════════════════════════
  // QUARTER SEALS — NW & SW background blocks (behind spawn walls)
  // ═══════════════════════════════════════════════════════════════════

  // --- North-West corner block (fills the void behind Team 2 spawn west) ---
  b.addBox('nwBlock', 29.4, 7.5, 16.5, new Vector3(-37.3, 3.75, -44), mats.plaster);
  b.addBox('nwBlockRoof', 30.4, 0.6, 17.5, new Vector3(-37.3, 7.8, -44), mats.tileRoof, false);
  // Continuous spawn-west boundary wall (extends the T2 flank wall to the
  // perimeter, removing the old gap that let players reach the map edge)
  b.addBox('t2SpawnWestWall', 1.2, 5.5, 16, new Vector3(-22, 2.75, -44), mats.wall);

  // --- South-West corner block (fills the void behind Team 1 spawn west) ---
  b.addBox('swBlock', 29.4, 7.5, 16.5, new Vector3(-37.3, 3.75, 44), mats.plaster);
  b.addBox('swBlockRoof', 30.4, 0.6, 17.5, new Vector3(-37.3, 7.8, 44), mats.tileRoof, false);
  // Continuous spawn-west boundary wall (extends the T1 flank wall)
  b.addBox('t1SpawnWestWall', 1.2, 5.5, 16, new Vector3(-22, 2.75, 44), mats.wall);

  // ═══════════════════════════════════════════════════════════════════
  // SITE FLOOR & ZEN GARDEN
  // ═══════════════════════════════════════════════════════════════════

  // --- Raised wooden platform (site floor, distinct footstep sound) ---
  b.addBox('aSiteFloor', 20, 0.4, 12, new Vector3(-27, 0.2, -29), mats.woodDeck);

  // --- Zen sand garden visual overlay ---
  const zenGrd = MeshBuilder.CreateGround('zenGrdA', { width: 14, height: 10, subdivisions: 2 }, scene);
  zenGrd.position = new Vector3(-24, 0.42, -29);
  zenGrd.material = mats.zenSand;
  zenGrd.checkCollisions = false;

  // ═══════════════════════════════════════════════════════════════════
  // TEA HOUSE (anchor structure, no entry)
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  // SITE COVER & DECOR
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  // SITE BOUNDARY WALLS (fully sealed entries)
  // ═══════════════════════════════════════════════════════════════════

  // North wall (thick enough to fuse with the NW corner block behind it)
  b.addBox('aWallN', 30, 4.5, 2.4, new Vector3(-31, 2.25, -36), mats.wall);
  // West wall (extends north to seal the alley behind the tea house)
  b.addBox('aWallW', 0.8, 4.5, 12, new Vector3(-38, 2.25, -27), mats.wall);
  // Partial south wall with opening for A-Long entry (gap at X ≈ -31..-23)
  b.addBox('aWallSL', 11, 4.5, 0.8, new Vector3(-36.5, 2.25, -22), mats.wall);
  b.addBox('aWallSR', 6, 4.5, 0.8, new Vector3(-20, 2.25, -22), mats.wall);
}
