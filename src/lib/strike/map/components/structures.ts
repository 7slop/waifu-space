import { Vector3, AbstractMesh, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { registerRuntimeEffects, swayRotation } from './runtime-effects';
import { createProcTexture } from '../materials';

/** Torii gate with pillars, crossbeams, and plaque */
export function createTorii(b: MapBuilder, prefix: string, pos: Vector3, scale = 1.0): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  b.beginComponent('torii', prefix, pos, { scale });

  const { mats } = b;
  const pW = 0.8 * scale;
  const pH = 7.0 * scale;
  const span = 4.5 * scale;
  const pl = b.addBox(`${prefix}_PL`, pW, pH, pW, new Vector3(pos.x - span, pos.y + pH / 2, pos.z), mats.shrineRed);
  const pr = b.addBox(`${prefix}_PR`, pW, pH, pW, new Vector3(pos.x + span, pos.y + pH / 2, pos.z), mats.shrineRed);
  const top = b.addBox(`${prefix}_Top`, span * 2 + 3.2, 0.85 * scale, 1.1 * scale, new Vector3(pos.x, pos.y + pH - 0.2, pos.z), mats.shrineRed);
  const sub = b.addBox(`${prefix}_Sub`, span * 2 + 1.6, 0.4 * scale, 0.7 * scale, new Vector3(pos.x, pos.y + pH - 1.3, pos.z), mats.shrineRed);
  meshes.push(b.addBox(`${prefix}_Plq`, 0.85 * scale, 1.1 * scale, 0.25 * scale, new Vector3(pos.x, pos.y + pH - 0.75, pos.z), mats.gold, false, false));
  meshes.push(pl, pr, top, sub);
  b.addShadowCaster(pl);
  b.addShadowCaster(pr);
  b.addShadowCaster(top);
  b.addShadowCaster(sub);

  b.endComponent();
  return meshes;
}

/** Japanese flag (Hi no Maru) on a pole — white field with a red sun disc. */
export function createJapanFlag(b: MapBuilder, prefix: string, pos: Vector3, size = 1.0): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const s = Math.max(0.5, Math.min(2.0, size));
  b.beginComponent('japanFlag', prefix, pos, { size: s });

  const poleH = 4.5 * s;
  const pole = MeshBuilder.CreateCylinder(`${prefix}_Pole`, { height: poleH, diameterTop: 0.06 * s, diameterBottom: 0.1 * s, tessellation: 8 }, scene);
  pole.position = new Vector3(pos.x, pos.y + poleH / 2, pos.z);
  pole.material = mats.darkWood;
  pole.checkCollisions = true;
  pole.receiveShadows = true;
  b.colliders.push(pole);
  b.addShadowCaster(pole);
  meshes.push(pole);

  // Stone base
  const base = MeshBuilder.CreateCylinder(`${prefix}_Base`, { height: 0.4 * s, diameterTop: 0.7 * s, diameterBottom: 0.8 * s, tessellation: 10 }, scene);
  base.position = new Vector3(pos.x, pos.y + 0.2 * s, pos.z);
  base.material = mats.stone;
  base.checkCollisions = true;
  b.colliders.push(base);
  meshes.push(base);

  // Golden finial ball
  const ball = MeshBuilder.CreateSphere(`${prefix}_Ball`, { diameter: 0.16 * s, segments: 6 }, scene);
  ball.position = new Vector3(pos.x, pos.y + poleH + 0.1 * s, pos.z);
  ball.material = mats.gold;
  ball.isPickable = false;
  meshes.push(ball);

  // Flag cloth (white background + red sun Disc), gently flapping
  const flag = MeshBuilder.CreatePlane(`${prefix}_Flag`, { width: 2.4 * s, height: 1.5 * s }, scene);
  const flagMat = new StandardMaterial(`${prefix}_FlagMat`, scene);
  flagMat.diffuseColor = new Color3(0.95, 0.95, 0.9);
  flagMat.specularColor = new Color3(0.02, 0.02, 0.02);
  flagMat.maxSimultaneousLights = 4;
  const tex = createProcTexture(`${prefix}_flagtex`, scene, 256, 160, 1, 1, (ctx, cw, ch) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#bc002d';
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, cw * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });
  flagMat.diffuseTexture = tex;
  flagMat.backFaceCulling = false;
  flag.material = flagMat;
  flag.parent = pole;
  flag.position = new Vector3(1.2 * s, poleH / 2 - 1.1 * s, 0.02 * s);
  flag.rotation.y = 0.15;
  flag.isPickable = false;
  flag.receiveShadows = true;
  meshes.push(flag);

  registerRuntimeEffects(b, [swayRotation(flag, 0.05, 0.8, 0, 1)]);

  b.endComponent();
  return meshes;
}