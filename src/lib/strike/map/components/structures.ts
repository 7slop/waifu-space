import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/** Torii gate with pillars, crossbeams, and plaque */
export function createTorii(b: MapBuilder, prefix: string, pos: Vector3, scale = 1.0) {
  const { mats } = b;
  const pW = 0.8 * scale;
  const pH = 7.0 * scale;
  const span = 4.5 * scale;
  const pl = b.addBox(`${prefix}_PL`, pW, pH, pW, new Vector3(pos.x - span, pos.y + pH / 2, pos.z), mats.shrineRed);
  const pr = b.addBox(`${prefix}_PR`, pW, pH, pW, new Vector3(pos.x + span, pos.y + pH / 2, pos.z), mats.shrineRed);
  const top = b.addBox(`${prefix}_Top`, span * 2 + 3.2, 0.85 * scale, 1.1 * scale, new Vector3(pos.x, pos.y + pH - 0.2, pos.z), mats.shrineRed);
  const sub = b.addBox(`${prefix}_Sub`, span * 2 + 1.6, 0.4 * scale, 0.7 * scale, new Vector3(pos.x, pos.y + pH - 1.3, pos.z), mats.shrineRed);
  b.addBox(`${prefix}_Plq`, 0.85 * scale, 1.1 * scale, 0.25 * scale, new Vector3(pos.x, pos.y + pH - 0.75, pos.z), mats.gold, false, false);
  b.addShadowCaster(pl);
  b.addShadowCaster(pr);
  b.addShadowCaster(top);
  b.addShadowCaster(sub);
}
