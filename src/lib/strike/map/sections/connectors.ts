import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createCrateCluster, createSakeBarrelStack, createWoodenCart,
  createBambooFence, createStoneLantern
} from '../components';

/**
 * Connectors between sections:
 * - A-Short / B-Short covered corridors (Mid ↔ Sites) with stairs
 * - Mid-to-A / Mid-to-B walled passages (clean L-shaped routes)
 * - Approach streets between the spawns and the lanes, dressed with props
 */
export function buildConnectors(b: MapBuilder) {
  const { mats } = b;

  // ═══════════════════════════════════════════════════════════════════
  // A-SHORT: covered corridor (X = -17.5..-13.5, Z = -22..-16) + stairs
  // ═══════════════════════════════════════════════════════════════════

  b.addBox('aShortWW', 0.7, 4, 6, new Vector3(-17.5, 2, -19), mats.plaster);
  b.addBox('aShortWE', 0.7, 4, 6, new Vector3(-13.5, 2, -19), mats.plaster);
  b.addBox('aShortRf', 4.7, 0.35, 6.5, new Vector3(-15.5, 4.1, -19), mats.tileRoof, false);
  // 3 stairs rising north towards A-Site (each 0.2m rise, 0.8m deep)
  b.addBox('aShortSt1', 3, 0.2, 0.8, new Vector3(-15.5, 0.1, -16.6), mats.ground);
  b.addBox('aShortSt2', 3, 0.2, 0.8, new Vector3(-15.5, 0.3, -17.4), mats.ground);
  b.addBox('aShortSt3', 3, 0.2, 0.8, new Vector3(-15.5, 0.5, -18.2), mats.ground);

  // --- Mid-to-A passage (X = -18..-8, Z = -18.5..-14.5) ---
  // Walled on north/south; east cap has a 2m mouth from Mid; opens west into
  // the A approach street and connects to the A-Short corridor mouth.
  b.addBox('midToAWN', 10, 3.5, 0.7, new Vector3(-13, 1.75, -14.5), mats.plaster);
  b.addBox('midToAS', 10, 3.5, 0.7, new Vector3(-13, 1.75, -18.5), mats.plaster);
  b.addBox('midToAWS_N', 0.7, 3.5, 1.2, new Vector3(-8.5, 1.75, -14.6), mats.plaster);
  b.addBox('midToAWS_S', 0.7, 3.5, 1.4, new Vector3(-8.5, 1.75, -17.7), mats.plaster);
  b.addBox('midToACrate', 1.8, 1.3, 1.8, new Vector3(-11.5, 0.65, -15), mats.crate);

  // ═══════════════════════════════════════════════════════════════════
  // B-SHORT: covered corridor (X = +13.5..+17.5, Z = -22..-16) + stairs
  // ═══════════════════════════════════════════════════════════════════

  b.addBox('bShortWW', 0.7, 4, 6, new Vector3(13.5, 2, -19), mats.plaster);
  b.addBox('bShortWE', 0.7, 4, 6, new Vector3(17.5, 2, -19), mats.plaster);
  b.addBox('bShortRf', 4.7, 0.35, 6.5, new Vector3(15.5, 4.1, -19), mats.tileRoof, false);
  // 3 stairs rising north towards B-Site
  b.addBox('bShortSt1', 3, 0.2, 0.8, new Vector3(15.5, 0.1, -16.6), mats.ground);
  b.addBox('bShortSt2', 3, 0.2, 0.8, new Vector3(15.5, 0.3, -17.4), mats.ground);
  b.addBox('bShortSt3', 3, 0.2, 0.8, new Vector3(15.5, 0.5, -18.2), mats.ground);
  // Crouch cover inside the corridor (window peek spot)
  b.addBox('bShortPeek', 1.2, 1.0, 0.5, new Vector3(14.5, 0.5, -19), mats.crate);

  // --- Mid-to-B passage (X = +8..+18, Z = -18.5..-14.5) ---
  b.addBox('midToBWN', 10, 3.5, 0.7, new Vector3(13, 1.75, -14.5), mats.plaster);
  b.addBox('midToBS', 10, 3.5, 0.7, new Vector3(13, 1.75, -18.5), mats.plaster);
  b.addBox('midToBWS_N', 0.7, 3.5, 1.2, new Vector3(8.5, 1.75, -14.6), mats.plaster);
  b.addBox('midToBWS_S', 0.7, 3.5, 1.4, new Vector3(8.5, 1.75, -17.7), mats.plaster);
  b.addBox('midToBCrate', 1.8, 1.3, 1.8, new Vector3(11.5, 0.65, -15), mats.crate);

  // ═══════════════════════════════════════════════════════════════════
  // SPAWN-TO-LANE TRANSITION WALLS
  // ═══════════════════════════════════════════════════════════════════

  // T1 (South) → A-Long entry (diagonal walk, channel via buildings)
  b.addBox('t1toAWall', 0.8, 4, 8, new Vector3(-14, 2, 34), mats.plaster);
  // T1 (South) → B-Short / Secret entry
  b.addBox('t1toBWall', 0.8, 4, 8, new Vector3(14, 2, 34), mats.plaster);
  // T2 (North) → A-Long entry
  b.addBox('t2toAWall', 0.8, 4, 8, new Vector3(-14, 2, -34), mats.plaster);
  // T2 (North) → B-Short / Secret entry
  b.addBox('t2toBWall', 0.8, 4, 8, new Vector3(14, 2, -34), mats.plaster);

  // Lane approach walls (channel from spawn area to lanes, Z = ±20..±34)
  b.addBox('appALongW1', 0.8, 4, 12, new Vector3(-18, 2, 28), mats.plaster);
  b.addBox('appALongW2', 0.8, 4, 12, new Vector3(-18, 2, -28), mats.plaster);
  b.addBox('appBShortE1', 0.8, 4, 12, new Vector3(18, 2, 28), mats.plaster);
  b.addBox('appBShortE2', 0.8, 4, 12, new Vector3(18, 2, -28), mats.plaster);

  // Mid approach corridor walls (funnel from spawn into mid)
  b.addBox('midAppSWL', 0.8, 3.5, 12, new Vector3(-8, 1.75, 28), mats.plaster);
  b.addBox('midAppSWR', 0.8, 3.5, 12, new Vector3(8, 1.75, 28), mats.plaster);
  b.addBox('midAppNWL', 0.8, 3.5, 12, new Vector3(-8, 1.75, -28), mats.plaster);
  b.addBox('midAppNWR', 0.8, 3.5, 12, new Vector3(8, 1.75, -28), mats.plaster);

  // ═══════════════════════════════════════════════════════════════════
  // APPROACH STREETS (A & B) — props so the connector zones read as
  // intentional back streets instead of empty gaps
  // ═══════════════════════════════════════════════════════════════════

  // A approach street (between the Machiya row and Mid's west wall)
  createWoodenCart(b, 'cartAStreet', new Vector3(-12, 0, 6), 0.4);
  createCrateCluster(b, 'crateAStreet', new Vector3(-10.5, 0, -4), false);
  createSakeBarrelStack(b, 'sakeAStreet', new Vector3(-16, 0, -10), true);
  createBambooFence(b, 'bambooAStreet', new Vector3(-16.5, 0, 10), 5, true);
  createStoneLantern(b, 'lanAStreetS', new Vector3(-10, 0, 14));
  createStoneLantern(b, 'lanAStreetN', new Vector3(-10, 0, -11));

  // B approach street (between Mid's east wall and the merchant quarter)
  createWoodenCart(b, 'cartBStreet', new Vector3(12, 0, -6), -0.4);
  createCrateCluster(b, 'crateBStreet', new Vector3(10.5, 0, 4), false);
  createSakeBarrelStack(b, 'sakeBStreet', new Vector3(16, 0, 10), true);
  createBambooFence(b, 'bambooBStreet', new Vector3(16.5, 0, -10), 5, true);
  createStoneLantern(b, 'lanBStreetS', new Vector3(10, 0, 12));
  createStoneLantern(b, 'lanBStreetN', new Vector3(10, 0, -11));
}
