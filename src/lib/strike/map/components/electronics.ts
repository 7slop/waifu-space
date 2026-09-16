import { MeshBuilder, Vector3, AbstractMesh, StandardMaterial, Color3 } from '@babylonjs/core';
import type { MapBuilder } from '../types';
import { registerRuntimeEffects, pulseEmissive, cycleHue } from './runtime-effects';
import { createProcTexture } from '../materials';

function ledMaterial(scene: MapBuilder['scene'], key: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(key, scene);
  m.diffuseColor = color.clone();
  m.specularColor = new Color3(0, 0, 0);
  m.emissiveColor = color.scale(0.35);
  m.disableLighting = true;
  m.maxSimultaneousLights = 4;
  return m;
}

function ledBox(
  b: MapBuilder,
  name: string,
  pos: Vector3,
  mat: StandardMaterial,
  w = 0.05,
  h = 0.03,
  d = 0.02
): AbstractMesh {
  const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, b.scene);
  mesh.position = pos;
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

/**
 * 19-inch server rack with stacked bays and blinking LED activity lights.
 * `rows` = bay count (each bay 2U). Blink only runs in gameplay builds.
 */
export function createServerRack(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { rows?: number; blinkSpeed?: number } = {}
): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const rows = Math.max(1, Math.min(6, Math.round(opts.rows ?? 3)));
  const blink = Math.max(0.2, Math.min(5, opts.blinkSpeed ?? 2));
  b.beginComponent('serverRack', prefix, pos, { rows, blinkSpeed: blink });

  const w = 0.9;
  const d = 0.95;
  const bayH = 0.22;
  const rackH = 0.1 + rows * bayH + 0.12;

  // Corner posts
  const postH = rackH - 0.16;
  for (const [px, pz] of [
    [-w / 2 + 0.05, -d / 2 + 0.06],
    [w / 2 - 0.05, -d / 2 + 0.06],
    [-w / 2 + 0.05, d / 2 - 0.06],
    [w / 2 - 0.05, d / 2 - 0.06]
  ] as const) {
    const post = MeshBuilder.CreateCylinder(`${prefix}_Post_${px}_${pz}`, { height: postH, diameter: 0.05, tessellation: 6 }, scene);
    post.position = new Vector3(pos.x + px, pos.y + 0.08 + postH / 2, pos.z + pz);
    post.material = mats.metal;
    post.receiveShadows = true;
    meshes.push(post);
  }

  // Base & top plates
  meshes.push(b.addBox(`${prefix}_Base`, w + 0.08, 0.08, d + 0.08, new Vector3(pos.x, pos.y + 0.04, pos.z), mats.metal, true, true));
  meshes.push(b.addBox(`${prefix}_Top`, w + 0.08, 0.08, d + 0.08, new Vector3(pos.x, pos.y + rackH - 0.04, pos.z), mats.metal, false, true));

  // Full-height invisible collision body so players can't walk through the rack
  const body = b.addBox(`${prefix}_Collider`, w + 0.05, rackH - 0.02, d + 0.05, new Vector3(pos.x, pos.y + rackH / 2 - 0.03, pos.z), mats.metal, true, false);
  body.visibility = 0;
  body.isPickable = false;
  meshes.push(body);

  // Vent strips on the sides
  for (const side of [-1, 1]) {
    meshes.push(b.addBox(`${prefix}_Vent${side}`, 0.04, rackH - 0.3, d * 0.7, new Vector3(pos.x + side * w / 2, pos.y + rackH / 2, pos.z), mats.darkWood, false, false));
  }

  // Server bays with LED activity lights
  const ledsGreen: StandardMaterial[] = [];
  const ledsRed: StandardMaterial[] = [];
  const ledsCyan: StandardMaterial[] = [];
  for (let i = 0; i < rows; i++) {
    const by = pos.y + 0.14 + i * bayH + bayH / 2;
    meshes.push(b.addBox(`${prefix}_Bay${i}`, w * 0.72, bayH - 0.04, d * 0.55, new Vector3(pos.x, by, pos.z - 0.02), mats.metal, false, true));

    // Face panel
    const face = MeshBuilder.CreateBox(`${prefix}_Face${i}`, { width: w * 0.7, height: bayH - 0.08, depth: 0.02 }, scene);
    face.position = new Vector3(pos.x, by, pos.z + d / 2 - 0.03);
    face.material = mats.metal;
    face.isPickable = false;
    meshes.push(face);

    // Blinking LEDs (two per bay)
    const green = ledMaterial(scene, `${prefix}_ledG${i}`, new Color3(0.15, 1.0, 0.35));
    const red = ledMaterial(scene, `${prefix}_ledR${i}`, new Color3(1.0, 0.25, 0.2));
    ledsGreen.push(green);
    ledsRed.push(red);
    meshes.push(ledBox(b, `${prefix}_LedG${i}`, new Vector3(pos.x - w * 0.24, by, pos.z + d / 2 - 0.02), green));
    meshes.push(ledBox(b, `${prefix}_LedR${i}`, new Vector3(pos.x - w * 0.24 + 0.09, by, pos.z + d / 2 - 0.02), red));

    if (i % 2 === 0) {
      const cyan = ledMaterial(scene, `${prefix}_ledC${i}`, new Color3(0.2, 0.9, 0.95));
      ledsCyan.push(cyan);
      meshes.push(ledBox(b, `${prefix}_LedC${i}`, new Vector3(pos.x + w * 0.24, by, pos.z + d / 2 - 0.02), cyan));
    }
  }

  // Activity light animation
  const effects = [];
  if (ledsGreen.length) {
    effects.push(pulseEmissive(ledsGreen, [0, 0.25, 0.08], [0, 1.4, 0.5], blink, 0));
  }
  if (ledsRed.length) {
    effects.push(pulseEmissive(ledsRed, [0.2, 0.05, 0.04], [1.2, 0.12, 0.1], blink * 0.7, 1.2));
  }
  if (ledsCyan.length) {
    effects.push(pulseEmissive(ledsCyan, [0.05, 0.2, 0.25], [0.5, 1.2, 1.3], blink * 0.4, 2.1));
  }
  registerRuntimeEffects(b, effects);

  b.endComponent();
  return meshes;
}

/**
 * Battlestation desk: table top, monitor on a stand, keyboard + mouse,
 * and an RGB light strip under the desk edge (cycles hues when enabled).
 */
export function createComputerDesk(
  b: MapBuilder,
  prefix: string,
  pos: Vector3,
  opts: { rgbOn?: boolean; monitorSize?: number } = {}
): AbstractMesh[] {
  const { mats, scene } = b;
  const meshes: AbstractMesh[] = [];
  const rgbOn = opts.rgbOn !== false;
  const mSize = Math.max(0.6, Math.min(1.6, opts.monitorSize ?? 1));
  b.beginComponent('computerDesk', prefix, pos, { rgbOn, monitorSize: mSize });

  const w = 1.7;
  const d = 0.85;
  const h = 0.74;

  // Desk top & legs
  meshes.push(b.addBox(`${prefix}_Top`, w, 0.08, d, new Vector3(pos.x, pos.y + h, pos.z), mats.woodDeck, true, true));
  const lw = 0.08;
  meshes.push(b.addBox(`${prefix}_LegFL`, lw, h, lw, new Vector3(pos.x - w / 2 + 0.08, pos.y + h / 2, pos.z + d / 2 - 0.1), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegFR`, lw, h, lw, new Vector3(pos.x + w / 2 - 0.08, pos.y + h / 2, pos.z + d / 2 - 0.1), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBL`, lw, h, lw, new Vector3(pos.x - w / 2 + 0.08, pos.y + h / 2, pos.z - d / 2 + 0.1), mats.darkWood));
  meshes.push(b.addBox(`${prefix}_LegBR`, lw, h, lw, new Vector3(pos.x + w / 2 - 0.08, pos.y + h / 2, pos.z - d / 2 + 0.1), mats.darkWood));

  // RGB LED strip under the desk edge (facing the operator)
  const rgbMat = new StandardMaterial(`${prefix}_RGB`, scene);
  rgbMat.diffuseColor = new Color3(0.08, 0.05, 0.12);
  rgbMat.specularColor = new Color3(0, 0, 0);
  rgbMat.emissiveColor = new Color3(0.4, 0.2, 0.9);
  rgbMat.maxSimultaneousLights = 4;
  const strip = MeshBuilder.CreateBox(`${prefix}_RGB`, { width: w - 0.2, height: 0.05, depth: 0.05 }, scene);
  strip.position = new Vector3(pos.x, pos.y + h - 0.01, pos.z + d / 2 - 0.02);
  strip.material = rgbMat;
  strip.isPickable = false;
  meshes.push(strip);
  const footStrip = MeshBuilder.CreateBox(`${prefix}_RGB2`, { width: w - 0.3, height: 0.04, depth: 0.04 }, scene);
  footStrip.position = new Vector3(pos.x, pos.y + h * 0.25, pos.z + d / 2 - 0.015);
  footStrip.material = rgbMat;
  footStrip.isPickable = false;
  meshes.push(footStrip);

  // Monitor
  const mw = 0.72 * mSize;
  const mh = 0.45 * mSize;
  const monY = pos.y + h + mh / 2 + 0.1;
  const base = b.addBox(`${prefix}_MonBase`, 0.18 * mSize, 0.05, 0.16 * mSize, new Vector3(pos.x, pos.y + h + 0.025, pos.z - 0.05), mats.darkWood, false, false);
  meshes.push(base);
  const stem = b.addBox(`${prefix}_MonStem`, 0.06 * mSize, 0.12 * mSize, 0.06 * mSize, new Vector3(pos.x, pos.y + h + 0.1 * mSize, pos.z - 0.05), mats.darkWood, false, false);
  meshes.push(stem);
  meshes.push(b.addBox(`${prefix}_MonBezel`, mw, mh, 0.06, new Vector3(pos.x, monY, pos.z - 0.05), mats.metal, false, true));

  // Screen with a soft "desktop wallpaper" dynamic texture
  const screen = MeshBuilder.CreatePlane(`${prefix}_Screen`, { width: mw * 0.92, height: mh * 0.9 }, scene);
  screen.position = new Vector3(pos.x, monY, pos.z - 0.02);
  screen.isPickable = false;
  screen.receiveShadows = true;
  const screenMat = new StandardMaterial(`${prefix}_ScreenMat`, scene);
  screenMat.diffuseColor = new Color3(0.9, 0.9, 1.0);
  screenMat.emissiveColor = new Color3(0.5, 0.6, 0.9);
  screenMat.specularColor = new Color3(0.02, 0.02, 0.04);
  screenMat.specularPower = 64;
  screenMat.maxSimultaneousLights = 4;
  const dt = createProcTexture(`${prefix}_wall`, scene, 256, 160, 1, 1, (ctx, cw, ch) => {
    const grad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, ch) : null;
    if (grad) {
      grad.addColorStop(0, '#20264d');
      grad.addColorStop(1, '#3a1650');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#2a2a55';
    }
    ctx.fillRect(0, 0, cw, ch);
    // Big "waifu moon"
    ctx.fillStyle = 'rgba(255, 182, 210, 0.9)';
    ctx.beginPath();
    ctx.arc(cw * 0.72, ch * 0.3, 26, 0, Math.PI * 2);
    ctx.fill();
    // Cherry blossom specks
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255, 190, 215, ${0.5 + Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random() * cw, Math.random() * ch, 1 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  screenMat.emissiveTexture = dt;
  screen.material = screenMat;
  meshes.push(screen);

  // Keyboard & mouse on the desk
  meshes.push(b.addBox(`${prefix}_Keyboard`, 0.44, 0.03, 0.16, new Vector3(pos.x, pos.y + h + 0.05, pos.z + 0.2), mats.metal, false, false));
  meshes.push(b.addBox(`${prefix}_Mouse`, 0.09, 0.03, 0.13, new Vector3(pos.x + 0.3, pos.y + h + 0.05, pos.z + 0.22), mats.metal, false, false));
  meshes.push(b.addBox(`${prefix}_Mug`, 0.06, 0.1, 0.06, new Vector3(pos.x + 0.42, pos.y + h + 0.09, pos.z - 0.18), mats.ceramic, false, false));

  if (rgbOn) {
    registerRuntimeEffects(b, [cycleHue([rgbMat], 0.6)]);
  }

  b.endComponent();
  return meshes;
}