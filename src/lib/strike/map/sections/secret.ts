import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import {
  createKuraStorehouse, createCrateCluster, createSakeBarrelStack,
  createBambooFence, createHangingLantern, createStoneLantern
} from '../components';

/**
 * Secret Passage — "Roji" covered alley & East Kura District (X = +38..+51).
 *
 * Rework: the alley is now a fully sealed 5m covered route from the B-lane
 * south approach up to B-Site — both open ends that previously leaked into
 * voids are capped, the Kura storehouse quarter is fused to the perimeter on
 * all sides, and the interior is dressed with pergola beams, noren curtains
 * and lantern light.
 */
export function buildSecret(b: MapBuilder) {
  const { mats } = b;

  // --- Alley end caps (seal the north and south mouths of the Roji) ---
  // North cap: fuses the alley end to the shrine flank / Kura district
  b.addBox('secCapNorth', 14, 7.5, 1.6, new Vector3(45, 3.75, -32.5), mats.wall);
  // South cap: closes the alley before the south-east void
  b.addBox('secCapSouth', 14, 7.5, 1.6, new Vector3(45, 3.75, 32), mats.wall);

  // Inner west wall (separates Secret Passage from Lane B, with two
  // tactical doorway openings at Z=-7..-3 and Z=3..7)
  b.addBox('secretWW1', 0.8, 3.5, 22, new Vector3(38, 1.75, -18), mats.plaster);  // North segment (Z=-29..-7)
  b.addBox('secretWW_Mid', 0.8, 3.5, 6, new Vector3(38, 1.75, 0), mats.plaster);  // Mid segment (Z=-3..+3)
  b.addBox('secretWW2', 0.8, 3.5, 22, new Vector3(38, 1.75, 18), mats.plaster);   // South segment (Z=7..29)

  // Outer east alley wall (seals the eastern corridor at X=43)
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
  createBambooFence(b, 'bambooSecS', new Vector3(40.5, 0, 30.5), 4, true);
  createBambooFence(b, 'bambooSecN', new Vector3(40.5, 0, -30.5), 4, true);

  // Noren fabric curtains framing the Lane B doorways (Z=-5 and Z=+5)
  b.addBox('norenSecN', 3.4, 2.4, 0.12, new Vector3(38.6, 2.4, -5), mats.shoji, false);
  b.addBox('norenSecS', 3.4, 2.4, 0.12, new Vector3(38.6, 2.4, 5), mats.shoji, false);

  // Cover & props within Secret Passage
  createCrateCluster(b, 'secCrate', new Vector3(40.5, 0, -3), false);
  createSakeBarrelStack(b, 'secSake', new Vector3(40.5, 0, 4), true);
  createStoneLantern(b, 'secLanMid', new Vector3(40.5, 0, 0.5));
  createStoneLantern(b, 'secLanNorth', new Vector3(40.5, 0, -26));
  createStoneLantern(b, 'secLanSouth', new Vector3(40.5, 0, 26));
}
