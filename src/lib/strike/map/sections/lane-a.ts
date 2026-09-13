import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { createMachiyaHouse, createCrateCluster, createStoneLantern } from '../components';

/** Lane A — "A-Long" West Machiya Street (X = -34..-22). Long-range lane with stone gate at Z=0. */
export function buildLaneA(b: MapBuilder) {
  const { mats } = b;

  // --- West Machiya Row (solid lane boundary, 4 houses) ---
  createMachiyaHouse(b, 'mchAW1', new Vector3(-38, 0, -26), 9, 6.2, 10, { hasVeranda: true, verandaSide: 'east' });
  createMachiyaHouse(b, 'mchAW2', new Vector3(-38, 0, -10), 9, 6.5, 10, { hasVeranda: true, verandaSide: 'east' });
  createMachiyaHouse(b, 'mchAW3', new Vector3(-38, 0, 10), 9, 6.2, 10, { hasVeranda: true, verandaSide: 'east' });
  createMachiyaHouse(b, 'mchAW4', new Vector3(-38, 0, 26), 9, 6.2, 10, { hasVeranda: true, verandaSide: 'east' });

  // --- East Machiya Row (staggered for corner-peeking, 4 houses) ---
  // Offset Z positions to create alcoves players can duck into
  createMachiyaHouse(b, 'mchAE1', new Vector3(-22, 0, -24), 7, 6, 8, { hasShoji: true });
  createMachiyaHouse(b, 'mchAE2', new Vector3(-22, 0, -8), 7, 6, 8, { hasShoji: true });
  createMachiyaHouse(b, 'mchAE3', new Vector3(-22, 0, 8), 7, 6, 8, { hasShoji: true });
  createMachiyaHouse(b, 'mchAE4', new Vector3(-22, 0, 24), 7, 6, 8, { hasShoji: true });

  // --- Stone Gate "Ishimon" — CRITICAL sightline break at Z=0 ---
  // Splits A-Long into two ~30m halves. 3m gap in center for passage.
  b.addBox('ishimonL', 4.5, 4.5, 1.8, new Vector3(-32.5, 2.25, 0), mats.stone);  // Left pillar+wall
  b.addBox('ishimonR', 4.5, 4.5, 1.8, new Vector3(-24.5, 2.25, 0), mats.stone);  // Right pillar+wall
  b.addBox('ishimonTop', 13, 1.0, 2.2, new Vector3(-28.5, 5.0, 0), mats.tileRoof); // Roof beam over gate
  // Note: 3m gap between X=-30.25 and X=-26.75 for player passage

  // --- Wooden merchant carts (waist-high cover, break micro-sightlines) ---
  b.addBox('cartA1', 2.8, 1.3, 1.6, new Vector3(-28, 0.65, -16), mats.darkWood);
  b.addBox('cartA2', 2.8, 1.3, 1.6, new Vector3(-28, 0.65, 16), mats.darkWood);

  // --- Crate stack near T1 approach ---
  createCrateCluster(b, 'crateALong1', new Vector3(-30, 0, 28), true);

  // --- Crate stack near T2 approach ---
  createCrateCluster(b, 'crateALong2', new Vector3(-30, 0, -28), false);

  // --- Engawa veranda protrusion (subtle angle break, east side) ---
  b.addBox('engawaA', 2, 0.45, 5, new Vector3(-25.5, 0.22, -16), mats.woodDeck);

  // --- Stone Lanterns for Machiya Street Illumination ---
  createStoneLantern(b, 'lanA_S', new Vector3(-32, 0, 24));
  createStoneLantern(b, 'lanA_GateL', new Vector3(-31, 0, 2.5));
  createStoneLantern(b, 'lanA_GateR', new Vector3(-26, 0, 2.5));
  createStoneLantern(b, 'lanA_N', new Vector3(-32, 0, -18));
}
