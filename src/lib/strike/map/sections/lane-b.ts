import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createMerchantStall, createSakeBarrelStack, createWoodenCart,
  createBambooFence, createHangingLantern, createStoneLantern
} from '../components';

/** Lane B — "B-Short" East Merchant Quarter (X = +22..+34). Close-quarters lane. */
export function buildLaneB(b: MapBuilder) {
  const { mats } = b;

  // --- Authentic Kyoto Merchant Stalls ---
  createMerchantStall(b, 'stallB1', new Vector3(26, 0, -16), 5, 4, 'south');
  createMerchantStall(b, 'stallB5', new Vector3(26, 0, -6), 4.5, 3.8, 'north');
  createMerchantStall(b, 'stallB2', new Vector3(30, 0, -2), 4, 4.5, 'south');
  createMerchantStall(b, 'stallB6', new Vector3(30, 0, 7), 4.5, 4, 'south');
  createMerchantStall(b, 'stallB3', new Vector3(26, 0, 13), 5, 4, 'north');
  createMerchantStall(b, 'stallB4', new Vector3(30, 0, 24), 4, 4, 'south');

  // --- Fully Sealed West Wall (separates Lane B from Mid Plaza) ---
  // Solid plaster walls with authentic timber copings and tactical choke at Z=-2..+1
  b.addBox('bShortWallW1', 0.8, 4, 10, new Vector3(22, 2, -16), mats.plaster);
  b.addBox('bShortWallW1b', 0.8, 4, 5.5, new Vector3(22, 2, -7), mats.plaster); // Seals 9m gap
  b.addBox('bShortWallW2', 0.8, 4, 6, new Vector3(22, 2, 2.5), mats.plaster);
  createBambooFence(b, 'bambooMidB', new Vector3(22, 0, 8.5), 5.5, true); // Natural bamboo partition
  b.addBox('bShortWallW3', 0.8, 4, 10, new Vector3(22, 2, 16.5), mats.plaster);

  // --- Fully Sealed East Wall (separates Lane B from Secret Passage Roji) ---
  b.addBox('bShortWallE0', 0.8, 4, 7, new Vector3(34, 2, -17.5), mats.plaster);
  b.addBox('bShortWallE1', 0.8, 4, 6, new Vector3(34, 2, -10), mats.plaster);
  createBambooFence(b, 'bambooShortSec', new Vector3(34, 0, -3.5), 4, true);
  b.addBox('bShortWallE2', 0.8, 4, 11, new Vector3(34, 2, 6.5), mats.plaster);
  b.addBox('bShortWallE2b', 0.8, 4, 5, new Vector3(34, 2, 16.5), mats.plaster);
  b.addBox('bShortWallE3', 0.8, 4, 8, new Vector3(34, 2, 24), mats.plaster);

  // --- Traditional Kyoto Sake Barrel Stacks (Komodaru) ---
  createSakeBarrelStack(b, 'sakeB1', new Vector3(25, 0, -11), true);
  createSakeBarrelStack(b, 'sakeB2', new Vector3(31, 0, 3), false);
  createSakeBarrelStack(b, 'sakeB3', new Vector3(25, 0, 18), true);

  // --- Traditional Kyoto Wooden Handcarts (Daisan) ---
  createWoodenCart(b, 'cartB1', new Vector3(29, 0, -10), 0.12);
  createWoodenCart(b, 'cartB2', new Vector3(26, 0, 19), -0.15);

  // --- Ceramic Urns & Storage Crates ---
  b.addBox('barrelB1', 1.4, 1.2, 1.4, new Vector3(28, 0.6, -7.5), mats.crate);
  b.addBox('barrelB2', 1.4, 1.2, 1.4, new Vector3(24, 0.6, 6), mats.crate);

  // --- Noren Fabric Curtains ---
  b.addBox('norenB1', 3.5, 2.2, 0.12, new Vector3(28, 2.9, -5), mats.shoji, false);
  b.addBox('norenB2', 3.5, 2.2, 0.12, new Vector3(28, 2.9, 15), mats.shoji, false);

  // --- Atmospheric Covered Arcades (supported by timber columns, illuminated by hanging lanterns) ---
  const bArcades = [
    { name: 'bArc1', z: -8, d: 7.5 },
    { name: 'bArc2', z: 8, d: 7.5 },
    { name: 'bArc3', z: 23, d: 7.0 }
  ];
  for (const arc of bArcades) {
    // Roof canopy
    b.addBox(`${arc.name}_Rf`, 6.6, 0.45, arc.d, new Vector3(28, 3.85, arc.z), mats.tileRoof);
    // 4 Vertical timber columns supporting the canopy
    const zOff = arc.d / 2 - 0.4;
    b.addBox(`${arc.name}_P1`, 0.38, 3.85, 0.38, new Vector3(25.2, 1.92, arc.z - zOff), mats.timber, false);
    b.addBox(`${arc.name}_P2`, 0.38, 3.85, 0.38, new Vector3(30.8, 1.92, arc.z - zOff), mats.timber, false);
    b.addBox(`${arc.name}_P3`, 0.38, 3.85, 0.38, new Vector3(25.2, 1.92, arc.z + zOff), mats.timber, false);
    b.addBox(`${arc.name}_P4`, 0.38, 3.85, 0.38, new Vector3(30.8, 1.92, arc.z + zOff), mats.timber, false);
    // Illuminated hanging paper lantern under each arcade
    createHangingLantern(b, `${arc.name}_Lant`, new Vector3(28, 3.1, arc.z));
  }

  // --- Stone Lanterns for Alleyway Illumination ---
  createStoneLantern(b, 'lanB_S', new Vector3(31, 0, 21));
  createStoneLantern(b, 'lanB_Mid', new Vector3(25, 0, 3));
  createStoneLantern(b, 'lanB_N', new Vector3(25, 0, -19));
}
