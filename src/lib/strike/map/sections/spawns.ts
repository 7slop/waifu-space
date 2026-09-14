import { Vector3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { createSakuraTree, createGardenBush, createStoneLantern, createBambooFence } from '../components';

/** Team 1 Spawn — "Cherry Blossom Plaza" (South, Z = +38..+48). */
function buildTeam1Spawn(b: MapBuilder) {
  const { mats } = b;

  // Raised spawn floor (subtle visual boundary)
  b.addBox('t1Floor', 42, 0.15, 12, new Vector3(0, 0.075, 44), mats.ground, false);

  // Spawn cover walls (waist-high, channel exits)
  b.addBox('t1CoverL', 6, 1.35, 0.8, new Vector3(-8, 0.675, 40), mats.stone);
  b.addBox('t1CoverR', 6, 1.35, 0.8, new Vector3(8, 0.675, 40), mats.stone);

  // Spawn area flanking walls (guide players into 3 exits)
  b.addBox('t1WallWL', 8, 4.5, 0.8, new Vector3(-18, 2.25, 40), mats.wall);  // West exit wall
  b.addBox('t1WallWR', 8, 4.5, 0.8, new Vector3(18, 2.25, 40), mats.wall);   // East exit wall

  // Sakura trees for orientation
  createSakuraTree(b, 'sakuraT1L', new Vector3(-12, 0, 45));
  createSakuraTree(b, 'sakuraT1R', new Vector3(12, 0, 45));
  createGardenBush(b, 'bushT1L', new Vector3(-8, 0, 43), 1.1);
  createGardenBush(b, 'bushT1R', new Vector3(8, 0, 43), 1.1);

  // Stone lanterns flanking mid exit
  createStoneLantern(b, 'lanT1L', new Vector3(-3, 0, 40));
  createStoneLantern(b, 'lanT1R', new Vector3(3, 0, 40));
}

/** Team 2 Spawn — "Bamboo Garden" (North, Z = -48..-38). */
function buildTeam2Spawn(b: MapBuilder) {
  const { mats } = b;

  // Raised spawn floor
  b.addBox('t2Floor', 42, 0.15, 12, new Vector3(0, 0.075, -44), mats.ground, false);

  // Spawn cover walls
  b.addBox('t2CoverL', 6, 1.35, 0.8, new Vector3(-8, 0.675, -40), mats.stone);
  b.addBox('t2CoverR', 6, 1.35, 0.8, new Vector3(8, 0.675, -40), mats.stone);

  // Spawn area flanking walls
  b.addBox('t2WallWL', 8, 4.5, 0.8, new Vector3(-18, 2.25, -40), mats.wall);
  b.addBox('t2WallWR', 8, 4.5, 0.8, new Vector3(18, 2.25, -40), mats.wall);

  // Bamboo groves & foliage
  createBambooFence(b, 'bambooT2L', new Vector3(-12, 0, -46), 6, true);
  createBambooFence(b, 'bambooT2R', new Vector3(12, 0, -46), 6, true);
  createSakuraTree(b, 'sakuraT2L', new Vector3(-15, 0, -45));
  createSakuraTree(b, 'sakuraT2R', new Vector3(15, 0, -45));
  createGardenBush(b, 'bushT2L', new Vector3(-8, 0, -43), 1.1);
  createGardenBush(b, 'bushT2R', new Vector3(8, 0, -43), 1.1);

  // Stone lanterns
  createStoneLantern(b, 'lanT2L', new Vector3(-3, 0, -40));
  createStoneLantern(b, 'lanT2R', new Vector3(3, 0, -40));
}

export function buildSpawns(b: MapBuilder) {
  buildTeam1Spawn(b);
  buildTeam2Spawn(b);
}
