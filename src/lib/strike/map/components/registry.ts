import { Vector3, AbstractMesh } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { createMachiyaHouse, createKuraStorehouse } from './house';
import {
  createSakuraTree,
  createGardenBush,
  createBambooFence,
  createBambooPlant,
  createBigSakuraTree,
  createOakFence,
  createFallenWood
} from './nature';
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
import { createTorii, createJapanFlag } from './structures';
import { createStoneLantern, createHangingLantern } from './lights';
import {
  createFountain,
  createFlowerPot,
  createBambooWaterFeature,
  createRockGarden,
  createStonePath,
  createWindChime,
  createRock
} from './decorations';
import {
  createStoneArch,
  createPagoda,
  createShrineTable,
  createBannerPole,
  createPathMarker,
  createOrnamentalBridge,
  createWall,
  createFloor,
  createRoof,
  WallStyle,
  FloorStyle,
  RoofStyle
} from './architecture';
import { createDoor, createFuton, createTable, createChair, createMangaPile } from './interior';
import { createServerRack, createComputerDesk } from './electronics';
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
  },
  {
    id: 'fountain',
    label: 'Fountain',
    hint: 'Multi-tiered circular stone fountain with water',
    defaults: { tiers: 3 },
    build: (b, name, pos, p) => createFountain(b, name, pos, num(p, 'tiers', 3))
  },
  {
    id: 'flowerPot',
    label: 'Flower Pot',
    hint: 'Ceramic pot with flowering plant',
    defaults: { size: 1 },
    build: (b, name, pos, p) => createFlowerPot(b, name, pos, num(p, 'size', 1))
  },
  {
    id: 'bambooWaterFeature',
    label: 'Bamboo Water Feature',
    hint: 'Shishi-odoshi deer scarer with stone basin',
    defaults: {},
    build: (b, name, pos) => createBambooWaterFeature(b, name, pos)
  },
  {
    id: 'rockGarden',
    label: 'Rock Garden',
    hint: 'Raked sand garden with stone arrangement',
    defaults: { scale: 1 },
    build: (b, name, pos, p) => createRockGarden(b, name, pos, num(p, 'scale', 1))
  },
  {
    id: 'stonePath',
    label: 'Stone Path',
    hint: 'Winding stepping stones across the ground',
    defaults: { length: 5 },
    build: (b, name, pos, p) => createStonePath(b, name, pos, num(p, 'length', 5))
  },
  {
    id: 'windChime',
    label: 'Wind Chime',
    hint: 'Hanging furyū furin bell',
    defaults: {},
    build: (b, name, pos) => createWindChime(b, name, pos)
  },
  {
    id: 'stoneArch',
    label: 'Stone Arch',
    hint: 'Mossy stone archway gate',
    defaults: { scale: 1 },
    build: (b, name, pos, p) => createStoneArch(b, name, pos, num(p, 'scale', 1))
  },
  {
    id: 'pagoda',
    label: 'Pagoda',
    hint: 'Multi-tier stone pagoda lantern',
    defaults: { tiers: 3 },
    build: (b, name, pos, p) => createPagoda(b, name, pos, num(p, 'tiers', 3))
  },
  {
    id: 'shrineTable',
    label: 'Offering Table',
    hint: 'Wooden table for shrine offerings',
    defaults: {},
    build: (b, name, pos) => createShrineTable(b, name, pos)
  },
  {
    id: 'bannerPole',
    label: 'Banner Pole',
    hint: 'Tall pole with a war banner',
    defaults: { color: 'red' },
    build: (b, name, pos, p) => createBannerPole(b, name, pos, (p.color as 'red' | 'white') || 'red')
  },
  {
    id: 'pathMarker',
    label: 'Path Marker',
    hint: 'Small red torii marker along paths',
    defaults: {},
    build: (b, name, pos) => createPathMarker(b, name, pos)
  },
  {
    id: 'ornamentalBridge',
    label: 'Ornamental Bridge',
    hint: 'Arching footbridge over ponds or gardens',
    defaults: { span: 4 },
    build: (b, name, pos, p) => createOrnamentalBridge(b, name, pos, num(p, 'span', 4))
  },
  {
    id: 'door',
    label: 'Door',
    hint: 'Timber door that opens/closes with E (plays a sound)',
    defaults: { width: 1.2, height: 2.4, swing: 1 },
    build: (b, name, pos, p) =>
      createDoor(b, name, pos, {
        width: num(p, 'width', 1.2),
        height: num(p, 'height', 2.4),
        swing: String(p.swing) === '-1' ? -1 : 1
      })
  },
  {
    id: 'futon',
    label: 'Futon',
    hint: 'Traditional sleeping futon with indigo blanket',
    defaults: { width: 1.9 },
    build: (b, name, pos, p) => createFuton(b, name, pos, { width: num(p, 'width', 1.9) })
  },
  {
    id: 'table',
    label: 'Table',
    hint: 'Simple wooden dining table',
    defaults: { width: 1.8, depth: 1 },
    build: (b, name, pos, p) => createTable(b, name, pos, { width: num(p, 'width', 1.8), depth: num(p, 'depth', 1) })
  },
  {
    id: 'chair',
    label: 'Chair',
    hint: 'Wooden chair with a reclined backrest',
    defaults: {},
    build: (b, name, pos) => createChair(b, name, pos)
  },
  {
    id: 'mangaPile',
    label: 'Manga Pile',
    hint: 'Stack of manga volumes with colorful spines',
    defaults: { count: 6 },
    build: (b, name, pos, p) => createMangaPile(b, name, pos, { count: num(p, 'count', 6) })
  },
  {
    id: 'serverRack',
    label: 'Server Rack',
    hint: '19-inch rack with blinking activity LEDs',
    defaults: { rows: 3, blinkSpeed: 2 },
    build: (b, name, pos, p) =>
      createServerRack(b, name, pos, { rows: num(p, 'rows', 3), blinkSpeed: num(p, 'blinkSpeed', 2) })
  },
  {
    id: 'computerDesk',
    label: 'Computer Desk',
    hint: 'Battlestation desk with monitor and RGB lighting',
    defaults: { rgbOn: true, monitorSize: 1 },
    build: (b, name, pos, p) =>
      createComputerDesk(b, name, pos, { rgbOn: bool(p, 'rgbOn', true), monitorSize: num(p, 'monitorSize', 1) })
  },
  {
    id: 'bambooPlant',
    label: 'Bamboo Plant',
    hint: 'Single bamboo culm that sways in the breeze',
    defaults: { height: 4 },
    build: (b, name, pos, p) => createBambooPlant(b, name, pos, num(p, 'height', 4))
  },
  {
    id: 'sakuraBig',
    label: 'Big Sakura Tree',
    hint: 'Large detailed cherry blossom tree',
    defaults: { scale: 1 },
    build: (b, name, pos, p) => createBigSakuraTree(b, name, pos, num(p, 'scale', 1))
  },
  {
    id: 'oakFence',
    label: 'Oak Fence',
    hint: 'Picket fence with air between the wood',
    defaults: { length: 4, alongZ: true },
    build: (b, name, pos, p) => createOakFence(b, name, pos, num(p, 'length', 4), bool(p, 'alongZ', true))
  },
  {
    id: 'fallenWood',
    label: 'Fallen Wood',
    hint: 'Bark log lying on the ground',
    defaults: { length: 1.6, alongZ: true },
    build: (b, name, pos, p) => createFallenWood(b, name, pos, num(p, 'length', 1.6), bool(p, 'alongZ', true))
  },
  {
    id: 'japanFlag',
    label: 'Japan Flag',
    hint: 'Hi no Maru flag on a pole',
    defaults: { size: 1 },
    build: (b, name, pos, p) => createJapanFlag(b, name, pos, num(p, 'size', 1))
  },
  {
    id: 'rock',
    label: 'Rock',
    hint: 'Configured rock (10 variants)',
    defaults: { variant: 0, scale: 1 },
    build: (b, name, pos, p) => createRock(b, name, pos, parseInt(String(p.variant), 10) || 0, num(p, 'scale', 1))
  },
  {
    id: 'wall',
    label: 'Wall',
    hint: 'Configurable wall pane (plaster / timber / stone / shoji)',
    defaults: { width: 4, height: 3, style: 'plaster' },
    build: (b, name, pos, p) =>
      createWall(b, name, pos, {
        width: num(p, 'width', 4),
        height: num(p, 'height', 3),
        style: (p.style as WallStyle) || 'plaster'
      })
  },
  {
    id: 'floor',
    label: 'Floor',
    hint: 'Configurable floor pane (deck / tatami / stone / sand)',
    defaults: { width: 4, depth: 4, style: 'woodDeck' },
    build: (b, name, pos, p) =>
      createFloor(b, name, pos, {
        width: num(p, 'width', 4),
        depth: num(p, 'depth', 4),
        style: (p.style as FloorStyle) || 'woodDeck'
      })
  },
  {
    id: 'roof',
    label: 'Roof',
    hint: 'Configurable flat roof pane (tile / thatch / red / metal)',
    defaults: { width: 4, depth: 4, style: 'tileRoof' },
    build: (b, name, pos, p) =>
      createRoof(b, name, pos, {
        width: num(p, 'width', 4),
        depth: num(p, 'depth', 4),
        style: (p.style as RoofStyle) || 'tileRoof'
      })
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