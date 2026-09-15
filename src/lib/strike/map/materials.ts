import {
  Scene,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Texture
} from '@babylonjs/core';
import type { MapMaterials } from './types';

type TextureDrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * Generates a dedicated procedural DynamicTexture for a material surface.
 * Uploads to WebGL synchronously so the texture and meshes are ready on frame 0.
 */
function createProcTexture(
  name: string,
  scene: Scene,
  w: number,
  h: number,
  uScale: number,
  vScale: number,
  drawFn: TextureDrawFn
): DynamicTexture {
  const dt = new DynamicTexture(`tex_${name}`, { width: w, height: h }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  dt.uScale = uScale;
  dt.vScale = vScale;
  dt.wrapU = Texture.WRAP_ADDRESSMODE;
  dt.wrapV = Texture.WRAP_ADDRESSMODE;
  dt.anisotropicFilteringLevel = 4;
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  if (ctx) {
    try {
      drawFn(ctx, w, h);
      dt.update(false); // Synchronous GPU upload with mipmap pyramid generation
    } catch (err) {
      console.warn(`[KyotoMap] Texture draw failed for ${name}:`, err);
    }
  }
  return dt;
}

function createMat(
  scene: Scene,
  name: string,
  diff: Color3,
  spec = new Color3(0.08, 0.08, 0.08),
  emissive?: Color3
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = diff;
  mat.specularColor = spec;
  if (emissive) mat.emissiveColor = emissive;
  mat.maxSimultaneousLights = 4;
  return mat;
}

function createTexturedMat(
  scene: Scene,
  name: string,
  diffuseColor: Color3,
  uScale: number,
  vScale: number,
  drawFn: TextureDrawFn,
  specularColor = new Color3(0.08, 0.08, 0.08),
  emissiveColor?: Color3,
  specularPower = 32
): StandardMaterial {
  const mat = createMat(scene, name, diffuseColor, specularColor, emissiveColor);
  mat.specularPower = specularPower;
  mat.diffuseTexture = createProcTexture(name, scene, 512, 512, uScale, vScale, drawFn);
  return mat;
}

/**
 * Builds the complete shared material palette for the Kyoto map.
 * Material names must stay stable: tests and engine lookups depend on them.
 */
export function createMapMaterials(scene: Scene): MapMaterials {
  const ground = createTexturedMat(
    scene,
    'matGround',
    new Color3(0.92, 0.92, 0.92),
    28, 28,
    (ctx, w, h) => {
      ctx.fillStyle = '#2c3036'; // Dark basalt mortar
      ctx.fillRect(0, 0, w, h);
      const rows = 16;
      const cols = 12;
      const rh = h / rows;
      const cw = w / cols;
      for (let r = 0; r < rows; r++) {
        const offsetX = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + offsetX + 2;
          const y = r * rh + 2;
          const sw = cw - 4;
          const sh = rh - 4;
          // Natural slate/granite tone variation
          const tone = 90 + Math.floor(Math.sin(r * 5.3 + c * 11.7) * 20);
          ctx.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 8})`;
          ctx.fillRect(x, y, sw, sh);

          // Top and left edge highlight (subtle 3D bevel)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fillRect(x, y, sw, 2);
          ctx.fillRect(x, y, 2, sh);

          // Bottom and right edge shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
          ctx.fillRect(x, y + sh - 2, sw, 2);
          ctx.fillRect(x + sw - 2, y, 2, sh);

          // Granite mineral flecks
          for (let i = 0; i < 20; i++) {
            const fx = x + Math.random() * sw;
            const fy = y + Math.random() * sh;
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.10)';
            ctx.fillRect(fx, fy, 2, 2);
          }
        }
      }
    },
    new Color3(0.08, 0.08, 0.08),
    undefined,
    24
  );

  const wall = createTexturedMat(
    scene,
    'matWall',
    new Color3(0.85, 0.88, 0.90),
    12, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#1c2025'; // Deep mortar recesses
      ctx.fillRect(0, 0, w, h);
      const rows = 8;
      const cols = 6;
      const rh = h / rows;
      const cw = w / cols;
      for (let r = 0; r < rows; r++) {
        const offsetX = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + offsetX + 3;
          const y = r * rh + 3;
          const sw = cw - 6;
          const sh = rh - 6;
          const tone = 112 + Math.floor(Math.sin(r * 3.7 + c * 7.1) * 22);
          ctx.fillStyle = `rgb(${tone - 4}, ${tone}, ${tone + 6})`;
          ctx.fillRect(x, y, sw, sh);

          // Chiseled horizontal tool grooves
          for (let i = 4; i < sh - 4; i += 8) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.fillRect(x + 4, y + i, sw - 8, 1);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(x + 4, y + i + 1, sw - 8, 1);
          }

          // Heavy 3D bevel edges
          ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(x, y, sw, 3);
          ctx.fillRect(x, y, 3, sh);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.fillRect(x, y + sh - 3, sw, 3);
          ctx.fillRect(x + sw - 3, y, 3, sh);
        }
      }
    },
    new Color3(0.06, 0.06, 0.06),
    undefined,
    20
  );

  const plaster = createTexturedMat(
    scene,
    'matPlaster',
    new Color3(0.96, 0.96, 0.94),
    3, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#d6d1c5'; // Warm natural off-white plaster
      ctx.fillRect(0, 0, w, h);
      // Subtle plaster trowel texture sweeps
      for (let i = 0; i < 1600; i++) {
        const px = Math.random() * w;
        const py = Math.random() * h;
        const pw = 2 + Math.random() * 8;
        const ph = 1 + Math.random() * 3;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(50, 42, 32, 0.05)';
        ctx.fillRect(px, py, pw, ph);
      }
      // Fine natural hemp/sand specks
      for (let i = 0; i < 700; i++) {
        const px = Math.random() * w;
        const py = Math.random() * h;
        ctx.fillStyle = 'rgba(40, 32, 22, 0.08)';
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    },
    new Color3(0.03, 0.03, 0.03),
    undefined,
    16
  );

  const timber = createTexturedMat(
    scene,
    'matTimber',
    new Color3(0.90, 0.86, 0.82),
    1, 3,
    (ctx, w, h) => {
      ctx.fillStyle = '#322116'; // Deep dark cedar
      ctx.fillRect(0, 0, w, h);
      // Vertical wood grain fibers
      for (let i = 0; i < w; i += 3) {
        const alpha = 0.08 + Math.sin(i * 0.4) * 0.06;
        ctx.fillStyle = `rgba(16, 10, 6, ${alpha})`;
        ctx.fillRect(i, 0, 2 + Math.floor(Math.random() * 2), h);
      }
      // Subtle wood knots
      for (let k = 0; k < 4; k++) {
        const kx = (k + 0.5) * (w / 4) + (Math.random() - 0.5) * 40;
        const ky = Math.random() * h;
        ctx.strokeStyle = 'rgba(12, 7, 4, 0.22)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.ellipse) {
          ctx.ellipse(kx, ky, 5, 18, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(kx, ky, 8, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
    },
    new Color3(0.06, 0.05, 0.04),
    undefined,
    16
  );

  const tileRoof = createTexturedMat(
    scene,
    'matTileRoof',
    new Color3(0.90, 0.92, 0.95),
    4, 4,
    (ctx, w, h) => {
      ctx.fillStyle = '#1e2229'; // Charcoal ceramic base
      ctx.fillRect(0, 0, w, h);
      const rows = 16;
      const cols = 10;
      const rh = h / rows;
      const cw = w / cols;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw;
          const y = r * rh;
          // Gradient shading under top tile overlap
          if (ctx.createLinearGradient) {
            const grad = ctx.createLinearGradient(x, y, x, y + rh);
            grad.addColorStop(0, '#363d48');
            grad.addColorStop(0.7, '#232830');
            grad.addColorStop(1, '#14171d');
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = '#232830';
          }
          ctx.fillRect(x + 1, y + 1, cw - 2, rh - 2);

          // Tile upper lip glaze highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fillRect(x + 2, y + 1, cw - 4, 2);

          // Side tile groove shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(x + cw - 2, y, 2, rh);
        }
      }
    },
    new Color3(0.16, 0.16, 0.18),
    undefined,
    48
  );

  const shoji = createTexturedMat(
    scene,
    'matShoji',
    new Color3(0.96, 0.94, 0.90),
    2, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#eae5d9'; // Translucent washi rice paper
      ctx.fillRect(0, 0, w, h);
      // Delicate paper fibers
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      // Outer heavy timber frame
      ctx.fillStyle = '#2d1d11';
      ctx.fillRect(0, 0, w, 12);
      ctx.fillRect(0, h - 12, w, 12);
      ctx.fillRect(0, 0, 12, h);
      ctx.fillRect(w - 12, 0, 12, h);

      // Inner Kumiko wood lattice grid
      const grid = 64;
      ctx.fillStyle = '#3c2718';
      for (let x = grid; x < w; x += grid) {
        ctx.fillRect(x - 2, 12, 5, h - 24);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(x + 3, 12, 2, h - 24);
        ctx.fillStyle = '#3c2718';
      }
      for (let y = grid; y < h; y += grid) {
        ctx.fillRect(12, y - 2, w - 24, 5);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(12, y + 3, w - 24, 2);
        ctx.fillStyle = '#3c2718';
      }
    },
    new Color3(0.04, 0.04, 0.03),
    new Color3(0.08, 0.07, 0.05), // Warm interior glow
    12
  );

  const shrineRed = createTexturedMat(
    scene,
    'matShrineRed',
    new Color3(0.96, 0.90, 0.90),
    2, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#c52d24'; // Rich cinnabar vermilion
      ctx.fillRect(0, 0, w, h);
      // Subtle lacquered wood grain streaks
      for (let y = 0; y < h; y += 6) {
        const alpha = 0.07 + Math.sin(y * 0.15) * 0.05;
        ctx.fillStyle = Math.random() > 0.5 ? `rgba(255, 110, 90, ${alpha})` : `rgba(100, 15, 10, ${alpha})`;
        ctx.fillRect(0, y, w, 3);
      }
    },
    new Color3(0.18, 0.14, 0.14),
    undefined,
    40
  );

  const crate = createTexturedMat(
    scene,
    'matCrate',
    new Color3(0.92, 0.88, 0.84),
    1, 1,
    (ctx, w, h) => {
      ctx.fillStyle = '#946030'; // Japanese pine base
      ctx.fillRect(0, 0, w, h);
      const ph = h / 4;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#9e6734' : '#88572b';
        ctx.fillRect(4, i * ph + 2, w - 8, ph - 4);
        // Plank seam shadow
        ctx.fillStyle = '#361e0b';
        ctx.fillRect(0, i * ph, w, 3);
        // Wood grain
        for (let g = 0; g < 5; g++) {
          ctx.fillStyle = 'rgba(30, 15, 5, 0.06)';
          ctx.fillRect(4, i * ph + 4 + g * 18, w - 8, 2);
        }
      }
      // Outer border
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#6d411b';
      if (ctx.strokeRect) {
        ctx.strokeRect(8, 8, w - 16, h - 16);
      }
      // Diagonal cross-brace
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(w - 12, h - 12);
      ctx.stroke();

      // Corner iron reinforcements
      ctx.fillStyle = '#26201a';
      ctx.fillRect(0, 0, 24, 24);
      ctx.fillRect(w - 24, 0, 24, 24);
      ctx.fillRect(0, h - 24, 24, 24);
      ctx.fillRect(w - 24, h - 24, 24, 24);

      // Corner bolt specular
      ctx.fillStyle = '#a09890';
      ctx.fillRect(8, 8, 4, 4);
      ctx.fillRect(w - 12, 8, 4, 4);
      ctx.fillRect(8, h - 12, 4, 4);
      ctx.fillRect(w - 12, h - 12, 4, 4);
    },
    new Color3(0.06, 0.05, 0.04),
    undefined,
    16
  );

  const zenSand = createTexturedMat(
    scene,
    'matZenSand',
    new Color3(0.96, 0.96, 0.94),
    6, 4,
    (ctx, w, h) => {
      ctx.fillStyle = '#b5afa3'; // Pale granite sand
      ctx.fillRect(0, 0, w, h);
      const waves = 24;
      const wh = h / waves;
      for (let i = 0; i < waves; i++) {
        const y = i * wh;
        // Raked comb crest highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(0, y, w, wh * 0.45);
        // Raked groove shadow
        ctx.fillStyle = 'rgba(45, 40, 32, 0.18)';
        ctx.fillRect(0, y + wh * 0.5, w, wh * 0.5);
      }
      // Granite mineral flecks
      for (let i = 0; i < 800; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.10)' : 'rgba(30, 25, 20, 0.10)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
    },
    new Color3(0.04, 0.04, 0.04),
    undefined,
    12
  );

  const woodDeck = createTexturedMat(
    scene,
    'matWoodDeck',
    new Color3(0.92, 0.88, 0.84),
    4, 4,
    (ctx, w, h) => {
      ctx.fillStyle = '#5e3c25'; // Warm oiled cedar
      ctx.fillRect(0, 0, w, h);
      const planks = 8;
      const pw = w / planks;
      for (let i = 0; i < planks; i++) {
        const x = i * pw;
        const tone = 78 + Math.floor(Math.sin(i * 2.8) * 14);
        ctx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.64)}, ${Math.floor(tone * 0.40)})`;
        ctx.fillRect(x + 2, 0, pw - 4, h);
        // Satin polished center highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(x + pw * 0.3, 0, pw * 0.4, h);
        // Dark tongue-and-groove seam
        ctx.fillStyle = '#1c0f07';
        ctx.fillRect(x, 0, 2, h);
      }
    },
    new Color3(0.14, 0.12, 0.10),
    undefined,
    36
  );

  const bark = createTexturedMat(
    scene,
    'matBark',
    new Color3(0.85, 0.78, 0.72),
    1, 3,
    (ctx, w, h) => {
      ctx.fillStyle = '#46342b';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        const len = 12 + Math.random() * 36;
        const x = Math.random() * (w - len);
        ctx.fillStyle = 'rgba(25, 16, 12, 0.35)';
        ctx.fillRect(x, y, len, 2.5);
        ctx.fillStyle = 'rgba(95, 75, 62, 0.25)';
        ctx.fillRect(x, y + 2.5, len, 1.5);
      }
    },
    new Color3(0.04, 0.04, 0.04),
    undefined,
    16
  );

  const stone = createTexturedMat(
    scene,
    'matStone',
    new Color3(0.88, 0.90, 0.92),
    2, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#6d727b'; // Cool granite
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 180; i++) {
        const cx = Math.random() * (w - 20);
        const cy = Math.random() * h;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.fillRect(cx, cy, 14, 1.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
        ctx.fillRect(cx, cy + 1.5, 14, 1.5);
      }
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(20, 24, 30, 0.18)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      if (ctx.strokeRect) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.20)';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);
      }
    },
    new Color3(0.08, 0.08, 0.08),
    undefined,
    20
  );

  const darkWood = createTexturedMat(
    scene,
    'matDarkWood',
    new Color3(0.78, 0.72, 0.68),
    1, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#3c2a1e';
      ctx.fillRect(0, 0, w, h);
      const planks = 6;
      const ph = h / planks;
      for (let i = 0; i < planks; i++) {
        const y = i * ph;
        ctx.fillStyle = (i % 2 === 0) ? '#443022' : '#362419';
        ctx.fillRect(0, y + 2, w, ph - 4);
        ctx.fillStyle = '#1a110a';
        ctx.fillRect(0, y, w, 2);
      }
    },
    new Color3(0.04, 0.04, 0.04),
    undefined,
    16
  );

  const straw = createTexturedMat(
    scene,
    'matStraw',
    new Color3(0.92, 0.88, 0.76),
    2, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#c8af82'; // Natural straw / jute
      ctx.fillRect(0, 0, w, h);
      // Woven rope bands and straw grain
      for (let y = 0; y < h; y += 6) {
        ctx.fillStyle = (y % 18 === 0) ? '#846944' : 'rgba(100, 80, 50, 0.25)';
        ctx.fillRect(0, y, w, y % 18 === 0 ? 3 : 1);
      }
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(240, 230, 200, 0.4)' : 'rgba(70, 50, 25, 0.3)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 1.5);
      }
      // Shrine insignia seal in center (classic red/black calligraphy)
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 4;
      ctx.strokeRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(w * 0.42, h * 0.42, w * 0.16, h * 0.16);
    },
    new Color3(0.04, 0.04, 0.04),
    undefined,
    16
  );

  const gold = createMat(scene, 'matGold', new Color3(0.85, 0.70, 0.22), new Color3(0.35, 0.30, 0.12), new Color3(0.08, 0.06, 0.02));

  // Glowing lantern paper (vibrant luminous gold with radiant bloom)
  const lanternGlow = createMat(scene, 'matLanternGlow', new Color3(1.0, 0.90, 0.55));
  lanternGlow.emissiveColor = new Color3(1.4, 1.15, 0.55);
  lanternGlow.specularColor = new Color3(0, 0, 0);
  lanternGlow.disableLighting = true;

  // Warm lit building window pane (kura storehouses & tea house)
  const windowGlow = createMat(scene, 'matWindowGlow', new Color3(1.0, 0.95, 0.72));
  windowGlow.emissiveColor = new Color3(1.35, 1.1, 0.5);
  windowGlow.specularColor = new Color3(0, 0, 0);
  windowGlow.disableLighting = true;

  const sakura = createTexturedMat(
    scene,
    'matSakura',
    new Color3(0.98, 0.95, 0.96),
    3, 3,
    (ctx, w, h) => {
      // Soft blossom pink base
      ctx.fillStyle = '#f6a5c2';
      ctx.fillRect(0, 0, w, h);
      // Delicate petal clusters and emergent lime leaf tips
      for (let i = 0; i < 900; i++) {
        const px = Math.random() * w;
        const py = Math.random() * h;
        const r = 4 + Math.random() * 8;
        ctx.fillStyle = Math.random() > 0.4 ? '#ffaec9' : '#f078a0';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d6336c';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = 'rgba(255, 245, 248, 0.6)';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = '#82c91e';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    new Color3(0.04, 0.04, 0.04),
    new Color3(0.10, 0.04, 0.07),
    16
  );

  const bush = createTexturedMat(
    scene,
    'matBush',
    new Color3(0.90, 0.95, 0.90),
    2, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#264a22'; // Deep forest green base
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1000; i++) {
        const bx = Math.random() * w;
        const by = Math.random() * h;
        const br = 3 + Math.random() * 6;
        const tone = Math.random();
        ctx.fillStyle = tone > 0.6 ? '#4b7d34' : tone > 0.3 ? '#356328' : '#1f3c1b';
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 350; i++) {
        ctx.fillStyle = 'rgba(125, 195, 75, 0.55)';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    new Color3(0.06, 0.08, 0.06),
    undefined,
    20
  );

  const bamboo = createTexturedMat(
    scene,
    'matBamboo',
    new Color3(0.45, 0.54, 0.24),
    2, 4,
    (ctx, w, h) => {
      ctx.fillStyle = '#3d6b22';
      ctx.fillRect(0, 0, w, h);
      const culms = 8;
      const cw = w / culms;
      for (let i = 0; i < culms; i++) {
        const x = i * cw;
        const tone = 55 + Math.floor(Math.sin(i * 3.1) * 15);
        ctx.fillStyle = `rgb(${tone}, ${tone + 40}, ${tone - 10})`;
        ctx.fillRect(x + 2, 0, cw - 4, h);
        // Bamboo node rings
        for (let ny = 0; ny < h; ny += h / 5) {
          ctx.fillStyle = '#2a4a18';
          ctx.fillRect(x, ny - 1, cw, 3);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fillRect(x, ny + 2, cw, 1);
        }
        // Vertical highlight stripe
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x + cw * 0.3, 0, cw * 0.15, h);
        // Side shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(x, 0, 2, h);
      }
    },
    new Color3(0.06, 0.08, 0.04),
    undefined,
    16
  );

  const water = createTexturedMat(
    scene,
    'matWater',
    new Color3(0.3, 0.5, 0.7),
    4, 4,
    (ctx, w, h) => {
      ctx.fillStyle = '#1a4a6e';
      ctx.fillRect(0, 0, w, h);
      // Concentric ripple rings
      for (let i = 0; i < 12; i++) {
        const cx = w * 0.3 + Math.sin(i * 1.7) * w * 0.2;
        const cy = h * 0.4 + Math.cos(i * 2.3) * h * 0.2;
        const r = 20 + i * 12;
        ctx.strokeStyle = `rgba(120, 180, 220, ${0.15 - i * 0.01})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Caustic light patterns
      for (let i = 0; i < 300; i++) {
        const px = Math.random() * w;
        const py = Math.random() * h;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(160, 210, 255, 0.12)' : 'rgba(20, 60, 100, 0.15)';
        ctx.fillRect(px, py, 4 + Math.random() * 8, 2);
      }
      // Surface shimmer highlights
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        ctx.fillRect(sx, sy, 12 + Math.random() * 20, 1.5);
      }
    },
    new Color3(0.12, 0.14, 0.18),
    new Color3(0.04, 0.06, 0.10),
    8
  );

  const ceramic = createTexturedMat(
    scene,
    'matCeramic',
    new Color3(0.85, 0.82, 0.78),
    2, 2,
    (ctx, w, h) => {
      ctx.fillStyle = '#b8a898';
      ctx.fillRect(0, 0, w, h);
      // Glazed ceramic texture with subtle crazing
      for (let i = 0; i < 200; i++) {
        const x1 = Math.random() * w;
        const y1 = Math.random() * h;
        ctx.strokeStyle = `rgba(60, 50, 40, ${0.08 + Math.random() * 0.08})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (Math.random() - 0.5) * 30, y1 + (Math.random() - 0.5) * 30);
        ctx.stroke();
      }
      // Subtle color variation
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 245, 230, 0.08)' : 'rgba(80, 65, 50, 0.06)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 6, 6);
      }
    },
    new Color3(0.10, 0.09, 0.08),
    undefined,
    24
  );

  const moss = createTexturedMat(
    scene,
    'matMoss',
    new Color3(0.45, 0.60, 0.35),
    3, 3,
    (ctx, w, h) => {
      ctx.fillStyle = '#2a4a20';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        const mx = Math.random() * w;
        const my = Math.random() * h;
        const mr = 2 + Math.random() * 5;
        const tone = Math.random();
        ctx.fillStyle = tone > 0.6 ? '#4a7a30' : tone > 0.3 ? '#356020' : '#1e3a14';
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tiny highlight tufts
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = 'rgba(130, 200, 80, 0.45)';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    new Color3(0.04, 0.06, 0.03),
    undefined,
    16
  );

  const metal = createTexturedMat(
    scene,
    'matMetal',
    new Color3(0.6, 0.6, 0.62),
    1, 1,
    (ctx, w, h) => {
      ctx.fillStyle = '#555860';
      ctx.fillRect(0, 0, w, h);
      // Brushed metal linear grain
      for (let y = 0; y < h; y += 2) {
        const alpha = 0.04 + Math.random() * 0.06;
        ctx.fillStyle = Math.random() > 0.5 ? `rgba(200, 200, 210, ${alpha})` : `rgba(30, 30, 35, ${alpha})`;
        ctx.fillRect(0, y, w, 1);
      }
      // Rivet/bolt spots
      for (let i = 0; i < 6; i++) {
        const rx = (i + 0.5) * (w / 6);
        ctx.fillStyle = '#3a3c42';
        ctx.beginPath();
        ctx.arc(rx, h * 0.1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, h * 0.9, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(rx - 0.5, h * 0.1 - 0.5, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    new Color3(0.20, 0.20, 0.22),
    undefined,
    48
  );

  const neonPink = createMat(scene, 'matNeonPink', new Color3(0.90, 0.35, 0.62), undefined, new Color3(0.60, 0.25, 0.42));
  const neonCyan = createMat(scene, 'matNeonCyan', new Color3(0.0, 0.80, 0.78), undefined, new Color3(0.0, 0.60, 0.58));

  return {
    ground, wall, plaster, timber, tileRoof, shoji, shrineRed, crate,
    zenSand, woodDeck, bark, stone, darkWood, straw, gold,
    lanternGlow, windowGlow, sakura, bush, bamboo, neonPink, neonCyan,
    water, ceramic, moss, metal
  };
}

export { createProcTexture };
