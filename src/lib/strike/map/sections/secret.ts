import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createKuraStorehouse, createCrateCluster, createSakeBarrelStack,
  createBambooFence, createHangingLantern, createStoneLantern
} from '../components';

/** Secret Passage — "Roji" covered alley & East Kura District (X = +38..+51, Z = -32..+32). */
export function buildSecret(b: MapBuilder) {
  const { mats } = b;

  // Inner west wall (separates Secret Passage from Lane B, with tactical doorway openings)
  b.addBox('secretWW1', 0.8, 3.5, 22, new Vector3(38, 1.75, -18), mats.plaster);  // North segment (Z=-29..-7)
  b.addBox('secretWW_Mid', 0.8, 3.5, 6, new Vector3(38, 1.75, 0), mats.plaster);  // Mid segment (Z=-3..+3)
  b.addBox('secretWW2', 0.8, 3.5, 22, new Vector3(38, 1.75, 18), mats.plaster);   // South segment (Z=7..29)

  // Outer east alley wall (seals the eastern corridor at X=43, fully closing the previous 14m void!)
  b.addBox('secWallEastN', 0.8, 4.0, 22, new Vector3(43, 2.0, -18), mats.plaster);
  b.addBox('secWallEastMid', 0.8, 4.0, 10, new Vector3(43, 2.0, 0), mats.plaster);
  b.addBox('secWallEastS', 0.8, 4.0, 22, new Vector3(43, 2.0, 18), mats.plaster);
  // Tile roof coping over the east alley wall
  b.addBox('secCopingN', 1.4, 0.35, 22, new Vector3(43, 4.15, -18), mats.tileRoof, false);
  b.addBox('secCopingMid', 1.4, 0.35, 10, new Vector3(43, 4.15, 0), mats.tileRoof, false);
  b.addBox('secCopingS', 1.4, 0.35, 22, new Vector3(43, 4.15, 18), mats.tileRoof, false);

  // --- Traditional Kyoto Kura Storehouses (filling the outer eastern quarter X=44..51) ---
  createKuraStorehouse(b, 'kuraE1', new Vector3(47.5, 0, -20), 7, 6.5, 12);
  createKuraStorehouse(b, 'kuraE2', new Vector3(47.5, 0, 0), 7, 6.8, 12);
  createKuraStorehouse(b, 'kuraE3', new Vector3(47.5, 0, 20), 7, 6.5, 12);

  // Enclosure cap walls sealing the northern and southern edges of the Kura district
  b.addBox('kuraCapN', 9.5, 5.5, 0.8, new Vector3(47.5, 2.75, -31), mats.plaster);
  b.addBox('kuraCapS', 9.5, 5.5, 0.8, new Vector3(47.5, 2.75, 31), mats.plaster);

  // Pergola beams across Roji alley with supporting vertical timber posts
  for (let i = 0; i < 7; i++) {
    const zP = -24 + i * 8;
    // Crossbeam spanning from west wall to east wall
    b.addBox(`secBeam${i}`, 5.2, 0.3, 0.3, new Vector3(40.5, 3.2, zP), mats.timber, false);
    // Vertical timber posts supporting the beam
    b.addBox(`secPostW${i}`, 0.3, 3.2, 0.3, new Vector3(38.3, 1.6, zP), mats.timber, false);
    b.addBox(`secPostE${i}`, 0.3, 3.2, 0.3, new Vector3(42.7, 1.6, zP), mats.timber, false);
    // Hanging lantern with warm point light
    createHangingLantern(b, `secLant${i}`, new Vector3(40.5, 2.65, zP));
  }

  // Bamboo screen gates at alley entries
  createBambooFence(b, 'bambooSecS', new Vector3(40.5, 0, 31), 3, true);
  createBambooFence(b, 'bambooSecN', new Vector3(40.5, 0, -31), 3, true);

  // Cover & props within Secret Passage
  createCrateCluster(b, 'secCrate', new Vector3(40.5, 0, -3), false);
  createSakeBarrelStack(b, 'secSake', new Vector3(40.5, 0, 4), true);
  createStoneLantern(b, 'secLanMid', new Vector3(40.5, 0, 0.5));
  createStoneLantern(b, 'secLanNorth', new Vector3(40.5, 0, -30));
  createStoneLantern(b, 'secLanSouth', new Vector3(40.5, 0, 30));
}
