import { Vector3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { createMachiyaHouse, createKuraStorehouse } from './house';
import { createSakuraTree, createGardenBush, createBambooFence } from './nature';
import {
  createCrateCluster,
  createMerchantStall,
  createSakeBarrelStack,
  createWoodenCart,
  createLamppost,
  createWell,
  createParkBench,
  createStoreSign
} from './props';
import { createTorii } from './structures';
import { createStoneLantern, createHangingLantern } from './lights';
import type { MapComponentObject } from '../map-format';

export type ComponentParams = Record<string, number | string | boolean>;

export interface ComponentDef {
  id: string;
  label: string;
  hint?: string;
  defaults: ComponentParams;
  build: (b: MapBuilder, name: string, pos: Vector3, params: ComponentParams) => AbstractMesh[];
}

function num(p: ComponentParams, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function bool(p: ComponentParams, key: string, fallback: boolean): boolean {
  const v = p[key];
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Registry of reusable map components. New components added to the game
 * should:
 *  1. wrap their build calls with b.beginComponent(id, …, params) / endComponent
 *  2. return the meshes they created
 *  3. register a ComponentDef here so the editor palette can spawn them.
 */
export const COMPONENTS: ComponentDef[] = [
  {
    id: 'machia',
    label: 'Machiya House',
    hint: 'Plaster townhouse with timber frame, shoji & kawara roof',
    defaults: { w: 8, h: 4.5, d: 6, hasVeranda: true, verandaSide: 'south', hasShoji: true },
    build: (b, name, pos, p) =>
      createMachiyaHouse(
        b,
        name,
        pos,
        num(p, 'w', 8),
        num(p, 'h', 4.5),
        num(p, 'd', 6),
        {
          hasVeranda: bool(p, 'hasVeranda', true),
          verandaSide: (p.verandaSide as 'north' | 'south' | 'east' | 'west') || 'south',
          hasShoji: bool(p, 'hasShoji', true)
        }
      )
  },
  {
    id: 'kura',
    label: 'Kura Storehouse',
    hint: 'Fireproof merchant storehouse with iron-barred window',
    defaults: { w: 6, h: 5.5, d: 5 },
    build: (b, name, pos, p) => createKuraStorehouse(b, name, pos, num(p, 'w', 6), num(p, 'h', 5.5), num(p, 'd', 5))
  },
  {
    id: 'sakura',
    label: 'Sakura Tree',
    hint: 'Cherry blossom tree in a stone planter',
    defaults: {},
    build: (b, name, pos) => createSakuraTree(b, name, pos)
  },
  {
    id: 'bush',
    label: 'Garden Bush',
    hint: 'Sculpted Japanese garden mound',
    defaults: { radius: 1 },
    build: (b, name, pos, p) => createGardenBush(b, name, pos, num(p, 'radius', 1))
  },
  {
    id: 'bamboo',
    label: 'Bamboo Fence',
    hint: 'Fence segment along Z or X',
    defaults: { length: 5, alongZ: true },
    build: (b, name, pos, p) => createBambooFence(b, name, pos, num(p, 'length', 5), bool(p, 'alongZ', true))
  },
  {
    id: 'torii',
    label: 'Torii Gate',
    hint: 'Grand vermilion gate',
    defaults: { scale: 1 },
    build: (b, name, pos, p) => createTorii(b, name, pos, num(p, 'scale', 1))
  },
  {
    id: 'stoneLantern',
    label: 'Stone Lantern',
    hint: 'Warm glowing stone lantern',
    defaults: {},
    build: (b, name, pos) => createStoneLantern(b, name, pos)
  },
  {
    id: 'hangingLantern',
    label: 'Hanging Lantern',
    hint: 'Paper lantern with point light',
    defaults: {},
    build: (b, name, pos) => createHangingLantern(b, name, pos)
  },
  {
    id: 'crateCluster',
    label: 'Crate Cluster',
    hint: 'Tactical crate cover (2 adjacent + optional stack)',
    defaults: { withStack: true },
    build: (b, name, pos, p) => createCrateCluster(b, name, pos, bool(p, 'withStack', true))
  },
  {
    id: 'merchantStall',
    label: 'Merchant Stall',
    hint: 'Timber stall with counter & roof',
    defaults: { w: 6, d: 4, openSide: 'south' },
    build: (b, name, pos, p) =>
      createMerchantStall(b, name, pos, num(p, 'w', 6), num(p, 'd', 4), (p.openSide as 'north' | 'south' | 'east' | 'west') || 'south')
  },
  {
    id: 'sakeBarrels',
    label: 'Sake Barrel Stack',
    hint: 'Straw-wrapped Komodaru barrels',
    defaults: { isLarge: false },
    build: (b, name, pos, p) => createSakeBarrelStack(b, name, pos, bool(p, 'isLarge', false))
  },
  {
    id: 'woodenCart',
    label: 'Wooden Cart',
    hint: 'Two-wheeled daisan cart',
    defaults: {},
    build: (b, name, pos) => createWoodenCart(b, name, pos, 0)
  },
  {
    id: 'lamppost',
    label: 'Lamp Post',
    hint: 'Timber post with a warm lantern (lights the street at night)',
    defaults: { height: 3.6, lightOn: true },
    build: (b, name, pos, p) =>
      createLamppost(b, name, pos, num(p, 'height', 3.6), bool(p, 'lightOn', true))
  },
  {
    id: 'well',
    label: 'Stone Well',
    hint: 'Stone ring well with timber roof',
    defaults: {},
    build: (b, name, pos) => createWell(b, name, pos)
  },
  {
    id: 'parkBench',
    label: 'Park Bench',
    hint: 'Wooden bench with backrest',
    defaults: {},
    build: (b, name, pos) => createParkBench(b, name, pos)
  },
  {
    id: 'storeSign',
    label: 'Store Sign',
    hint: 'Kanji shop banner between timber posts',
    defaults: { glyph: '茶' },
    build: (b, name, pos, p) => createStoreSign(b, name, pos, String(p.glyph ?? '茶'))
  }
];

export const COMPONENT_MAP: Record<string, ComponentDef> = Object.fromEntries(
  COMPONENTS.map((c) => [c.id, c])
);

export function isComponentId(id: string): boolean {
  return Boolean(COMPONENT_MAP[id]);
}

export function buildComponent(
  b: MapBuilder,
  componentId: string,
  name: string,
  pos: Vector3,
  params: ComponentParams = {}
): AbstractMesh[] {
  const def = COMPONENT_MAP[componentId];
  if (!def) return [];
  return def.build(b, name, pos, params);
}

/** Creates a fresh component object definition for the editor palette. */
export function createComponentObject(
  componentId: string,
  name: string,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1]
): MapComponentObject {
  const def = COMPONENT_MAP[componentId];
  return {
    id: cryptoId(),
    name,
    kind: 'component',
    component: componentId,
    position,
    rotation,
    scale,
    params: def ? { ...def.defaults } : {}
  };
}

let seqCounter = 0;
function cryptoId(): string {
  seqCounter += 1;
  const rnd = Date.now().toString(36);
  return `o_${rnd}_${seqCounter.toString(36)}`;
}