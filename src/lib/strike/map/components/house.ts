import { MeshBuilder, Vector3, Color3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/**
 * Authentic Kyoto Machiya townhouse — plaster body, timber frame,
 * kawara tile gabled roof, optional shoji screens & veranda.
 */
export function createMachiyaHouse(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  w: number,
  h: number,
  d: number,
  options: {
    hasVeranda?: boolean;
    verandaSide?: 'north' | 'south' | 'east' | 'west';
    hasShoji?: boolean;
  } = {}
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  const push = (m: AbstractMesh) => {
    meshes.push(m);
    return m;
  };
  b.beginComponent('machia', prefix, pos, {
    w,
    h,
    d,
    hasVeranda: Boolean(options.hasVeranda),
    verandaSide: options.verandaSide ?? 'south',
    hasShoji: options.hasShoji ?? true
  });

  const { mats } = b;
  const { hasVeranda = false, verandaSide = 'south', hasShoji = true } = options;

  // Main plaster body
  push(b.addBox(`${prefix}_Body`, w, h, d, new Vector3(pos.x, pos.y + h / 2, pos.z), mats.plaster));

  // Corner timber columns (proud of plaster wall by 0.08m on all sides to eliminate z-fighting / texture flickering)
  const pw = 0.62;
  const colHalf = pw / 2;
  const offX = w / 2 - colHalf + 0.06;
  const offZ = d / 2 - colHalf + 0.06;
  push(b.addBox(`${prefix}_PFL`, pw, h, pw, new Vector3(pos.x - offX, pos.y + h / 2, pos.z + offZ), mats.timber, false));
  push(b.addBox(`${prefix}_PFR`, pw, h, pw, new Vector3(pos.x + offX, pos.y + h / 2, pos.z + offZ), mats.timber, false));
  push(b.addBox(`${prefix}_PBL`, pw, h, pw, new Vector3(pos.x - offX, pos.y + h / 2, pos.z - offZ), mats.timber, false));
  push(b.addBox(`${prefix}_PBR`, pw, h, pw, new Vector3(pos.x + offX, pos.y + h / 2, pos.z - offZ), mats.timber, false));

  // Mid-level timber band (proud of plaster wall by 0.08m)
  push(b.addBox(`${prefix}_BmF`, w + 0.2, 0.35, 0.45, new Vector3(pos.x, pos.y + h * 0.52, pos.z + d / 2 + 0.05), mats.timber, false));
  push(b.addBox(`${prefix}_BmB`, w + 0.2, 0.35, 0.45, new Vector3(pos.x, pos.y + h * 0.52, pos.z - d / 2 - 0.05), mats.timber, false));

  // Shoji windows glowing warm from within with window lights
  if (hasShoji) {
    push(b.addBox(`${prefix}_ShF`, Math.min(w * 0.6, 5), h * 0.3, 0.12,
      new Vector3(pos.x, pos.y + h * 0.25, pos.z + d / 2 + 0.08), mats.windowGlow, false));
    push(b.addBox(`${prefix}_ShU`, Math.min(w * 0.5, 4), h * 0.22, 0.12,
      new Vector3(pos.x, pos.y + h * 0.75, pos.z + d / 2 + 0.08), mats.windowGlow, false));

    // Warm point light radiating outward from the window
    const winPL = b.addLanternLight(`${prefix}_WinPL`, new Vector3(pos.x, pos.y + h * 0.35, pos.z + d / 2 + 0.6), {
      intensity: 1.2,
      range: 11
    });
    winPL.specular = new Color3(0.25, 0.18, 0.08);
  }

  // Kawara tile gabled roof (overhanging eaves)
  const oh = 1.3;
  const rW = w + oh * 2;
  const rD = d + oh * 2;
  push(b.addBox(`${prefix}_Eaves`, rW, 0.5, rD, new Vector3(pos.x, pos.y + h + 0.25, pos.z), mats.tileRoof));
  push(b.addBox(`${prefix}_Ridge`, rW * 0.7, 0.65, rD * 0.7, new Vector3(pos.x, pos.y + h + 0.75, pos.z), mats.tileRoof));
  push(b.addBox(`${prefix}_Cap`, rW * 0.45, 0.35, rD * 0.45, new Vector3(pos.x, pos.y + h + 1.15, pos.z), mats.timber));

  // Optional veranda (engawa)
  if (hasVeranda) {
    const dH = 0.45;
    if (verandaSide === 'south')
      push(b.addBox(`${prefix}_Vr`, w, dH, 1.6, new Vector3(pos.x, pos.y + dH / 2, pos.z + d / 2 + 0.8), mats.woodDeck));
    else if (verandaSide === 'north')
      push(b.addBox(`${prefix}_Vr`, w, dH, 1.6, new Vector3(pos.x, pos.y + dH / 2, pos.z - d / 2 - 0.8), mats.woodDeck));
    else if (verandaSide === 'east')
      push(b.addBox(`${prefix}_Vr`, 1.6, dH, d, new Vector3(pos.x + w / 2 + 0.8, pos.y + dH / 2, pos.z), mats.woodDeck));
    else if (verandaSide === 'west')
      push(b.addBox(`${prefix}_Vr`, 1.6, dH, d, new Vector3(pos.x - w / 2 - 0.8, pos.y + dH / 2, pos.z), mats.woodDeck));
  }

  b.endComponent();
  return meshes;
}

/**
 * Authentic Kyoto Kura (Merchant Fireproof Storehouse)
 * Heavy white plaster walls, dark timber base & corner columns, black tile gable roof.
 */
export function createKuraStorehouse(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  w: number,
  h: number,
  d: number
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  const push = (m: AbstractMesh) => {
    meshes.push(m);
    return m;
  };
  b.beginComponent('kura', prefix, pos, { w, h, d });

  const { mats } = b;

  // Stone foundation plinth
  push(b.addBox(`${prefix}_Plinth`, w + 0.3, 0.8, d + 0.3, new Vector3(pos.x, pos.y + 0.4, pos.z), mats.stone));

  // Thick plaster storehouse body
  push(b.addBox(`${prefix}_Body`, w, h - 0.8, d, new Vector3(pos.x, pos.y + 0.8 + (h - 0.8) / 2, pos.z), mats.plaster));

  // Dark timber corner pillars (proud of plaster by 0.06m to eliminate z-fighting)
  const pw = 0.55;
  const offX = w / 2 - pw / 2 + 0.05;
  const offZ = d / 2 - pw / 2 + 0.05;
  push(b.addBox(`${prefix}_P1`, pw, h, pw, new Vector3(pos.x - offX, pos.y + h / 2, pos.z - offZ), mats.timber, false));
  push(b.addBox(`${prefix}_P2`, pw, h, pw, new Vector3(pos.x + offX, pos.y + h / 2, pos.z - offZ), mats.timber, false));
  push(b.addBox(`${prefix}_P3`, pw, h, pw, new Vector3(pos.x - offX, pos.y + h / 2, pos.z + offZ), mats.timber, false));
  push(b.addBox(`${prefix}_P4`, pw, h, pw, new Vector3(pos.x + offX, pos.y + h / 2, pos.z + offZ), mats.timber, false));

  // Horizontal timber beam trim
  push(b.addBox(`${prefix}_Bm`, w + 0.2, 0.4, d + 0.2, new Vector3(pos.x, pos.y + h * 0.65, pos.z), mats.timber, false));

  // Iron-barred storehouse window glowing warm from within
  push(b.addBox(`${prefix}_Win`, 2.0, 1.2, 0.15, new Vector3(pos.x, pos.y + h * 0.65, pos.z + d / 2 + 0.08), mats.windowGlow, false));

  // Warm window light (cycled with lanterns by updateDayNightCycle)
  const winPL = b.addLanternLight(`${prefix}_WinPL`, new Vector3(pos.x, pos.y + h * 0.65, pos.z + d / 2 + 0.6), {
    intensity: 1.2,
    range: 11
  });
  winPL.specular = new Color3(0.4, 0.3, 0.15);

  // Heavy kawara tile roof
  const oh = 1.2;
  push(b.addBox(`${prefix}_Eaves`, w + oh * 2, 0.6, d + oh * 2, new Vector3(pos.x, pos.y + h + 0.3, pos.z), mats.tileRoof));
  push(b.addBox(`${prefix}_Ridge`, (w + oh * 2) * 0.65, 0.7, (d + oh * 2) * 0.65, new Vector3(pos.x, pos.y + h + 0.9, pos.z), mats.tileRoof));

  b.endComponent();
  return meshes;
}