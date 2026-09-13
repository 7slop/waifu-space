import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/** Arena ground and perimeter walls (104m × 104m). */
export function buildGround(b: MapBuilder) {
  const { mats } = b;

  // Main cobblestone ground
  b.addGround('mainGround', 104, 104, new Vector3(0, 0, 0), mats.ground, true);

  // Perimeter walls (height 7.5m)
  b.addBox('wallN', 104, 7.5, 1.4, new Vector3(0, 3.75, -52), mats.wall);
  b.addBox('wallS', 104, 7.5, 1.4, new Vector3(0, 3.75, 52), mats.wall);
  b.addBox('wallW', 1.4, 7.5, 104, new Vector3(-52, 3.75, 0), mats.wall);
  b.addBox('wallE', 1.4, 7.5, 104, new Vector3(52, 3.75, 0), mats.wall);

  // Decorative wall copings
  b.addBox('copN', 104, 0.4, 1.8, new Vector3(0, 7.6, -52), mats.tileRoof, false);
  b.addBox('copS', 104, 0.4, 1.8, new Vector3(0, 7.6, 52), mats.tileRoof, false);
  b.addBox('copW', 1.8, 0.4, 104, new Vector3(-52, 7.6, 0), mats.tileRoof, false);
  b.addBox('copE', 1.8, 0.4, 104, new Vector3(52, 7.6, 0), mats.tileRoof, false);

  // Neon edge trims (subtle cyber accent)
  b.addBox('nN', 104, 0.14, 0.14, new Vector3(0, 7.2, -51.2), mats.neonPink, false);
  b.addBox('nS', 104, 0.14, 0.14, new Vector3(0, 7.2, 51.2), mats.neonCyan, false);
  b.addBox('nW', 0.14, 0.14, 104, new Vector3(-51.2, 7.2, 0), mats.neonCyan, false);
  b.addBox('nE', 0.14, 0.14, 104, new Vector3(51.2, 7.2, 0), mats.neonPink, false);
}
