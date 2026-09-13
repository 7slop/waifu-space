import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { createCrateCluster } from '../components';

/**
 * Connectors between sections:
 * - A-Short / B-Short corridors (Mid ↔ Sites)
 * - Mid-to-A / Mid-to-B passages
 * - Spawn-to-lane approach corridors
 */
export function buildConnectors(b: MapBuilder) {
  const { mats } = b;

  // --- A-Short: Mid (Z=-14) → A-Site (Z=-22), X = -14..-18 ---
  // Narrow covered corridor with 90° turn and 3 short stairs

  // Corridor walls
  b.addBox('aShortWW', 0.7, 4, 8, new Vector3(-17.5, 2, -18), mats.plaster);
  b.addBox('aShortWE', 0.7, 4, 8, new Vector3(-13.5, 2, -18), mats.plaster);
  // Covered roof
  b.addBox('aShortRf', 4.7, 0.35, 8.5, new Vector3(-15.5, 4.1, -18), mats.tileRoof, false);
  // 3 stairs (each 0.2m rise, 0.8m deep)
  b.addBox('aShortSt1', 3, 0.2, 0.8, new Vector3(-15.5, 0.1, -15.5), mats.ground);
  b.addBox('aShortSt2', 3, 0.2, 0.8, new Vector3(-15.5, 0.3, -16.3), mats.ground);
  b.addBox('aShortSt3', 3, 0.2, 0.8, new Vector3(-15.5, 0.5, -17.1), mats.ground);

  // --- B-Short: Mid (Z=-14) → B-Site (Z=-22), X = +13..+17 ---
  // Similar corridor but with a risky window peek into mid

  b.addBox('bShortWW', 0.7, 4, 8, new Vector3(13.5, 2, -18), mats.plaster);
  b.addBox('bShortWE', 0.7, 4, 8, new Vector3(17.5, 2, -18), mats.plaster);
  b.addBox('bShortRf', 4.7, 0.35, 8.5, new Vector3(15.5, 4.1, -18), mats.tileRoof, false);
  b.addBox('bShortPeek', 1.2, 1.0, 0.5, new Vector3(13.5, 0.5, -17), mats.crate); // crouch cover at window

  // --- Mid-to-A Connector (X = -8..-14, Z = -14..-18) ---
  // Short open passage connecting Mid plaza to A-Short entrance
  // Walls channel the flow
  b.addBox('midToAWN', 6, 3.5, 0.7, new Vector3(-11, 1.75, -14.5), mats.plaster);
  b.addBox('midToAWS', 0.7, 3.5, 3.5, new Vector3(-8.5, 1.75, -16), mats.plaster);
  // Crate for corner cover
  b.addBox('midToACrate', 1.8, 1.3, 1.8, new Vector3(-10, 0.65, -16), mats.crate);

  // --- Mid-to-B Connector (X = +8..+14, Z = -14..-18) ---
  // Short passage through merchant-style corridor
  b.addBox('midToBWN', 6, 3.5, 0.7, new Vector3(11, 1.75, -14.5), mats.plaster);
  b.addBox('midToBWS', 0.7, 3.5, 3.5, new Vector3(8.5, 1.75, -16), mats.plaster);
  b.addBox('midToBCrate', 1.8, 1.3, 1.8, new Vector3(10, 0.65, -16), mats.crate);

  // --- Transition corridors: Spawn exits to lane entries ---

  // T1 (South) → A-Long entry (diagonal walk, channel via buildings)
  b.addBox('t1toAWall', 0.8, 4, 8, new Vector3(-14, 2, 34), mats.plaster);  // Guide wall

  // T1 (South) → B-Short / Secret entry
  b.addBox('t1toBWall', 0.8, 4, 8, new Vector3(14, 2, 34), mats.plaster);   // Guide wall

  // T2 (North) → A-Long entry
  b.addBox('t2toAWall', 0.8, 4, 8, new Vector3(-14, 2, -34), mats.plaster);

  // T2 (North) → B-Short / Secret entry
  b.addBox('t2toBWall', 0.8, 4, 8, new Vector3(14, 2, -34), mats.plaster);

  // --- Lane approach walls (channel from spawn area to lanes, Z = ±20..±34) ---
  // West corridor walls (A-Long approach from both spawns)
  b.addBox('appALongW1', 0.8, 4, 12, new Vector3(-18, 2, 28), mats.plaster);
  b.addBox('appALongW2', 0.8, 4, 12, new Vector3(-18, 2, -28), mats.plaster);

  // East corridor walls (B-Short approach from both spawns)
  b.addBox('appBShortE1', 0.8, 4, 12, new Vector3(18, 2, 28), mats.plaster);
  b.addBox('appBShortE2', 0.8, 4, 12, new Vector3(18, 2, -28), mats.plaster);

  // Mid approach corridor walls (funnel from spawn into mid)
  // South approach (T1 to Mid)
  b.addBox('midAppSWL', 0.8, 3.5, 12, new Vector3(-8, 1.75, 28), mats.plaster);
  b.addBox('midAppSWR', 0.8, 3.5, 12, new Vector3(8, 1.75, 28), mats.plaster);

  // North approach (T2 to Mid)
  b.addBox('midAppNWL', 0.8, 3.5, 12, new Vector3(-8, 1.75, -28), mats.plaster);
  b.addBox('midAppNWR', 0.8, 3.5, 12, new Vector3(8, 1.75, -28), mats.plaster);
}
