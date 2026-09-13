import {
  MeshBuilder, Vector3, Color3, StandardMaterial, Mesh
} from '@babylonjs/core';
import { createProcTexture } from '../materials';
import type { MapBuilder } from '../types';

/** Scenic background — sky dome, Mount Fuji, rolling hills, clouds. No collisions. */
export function buildSky(b: MapBuilder): StandardMaterial {
  const { scene } = b;

  // Daytime Japan Sky Dome with Panoramic Procedural Sky Texture
  const skyMat = new StandardMaterial('matSky', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;

  const skyTex = createProcTexture(
    'sky_panorama',
    scene,
    1024, 512,
    1, 1,
    (ctx, w, h) => {
      // Atmospheric vertical sky gradient: Deep zenith blue down to warm horizon
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0.0, '#12406f');
      skyGrad.addColorStop(0.12, '#1c538e');
      skyGrad.addColorStop(0.35, '#3b7bbd');
      skyGrad.addColorStop(0.65, '#6fa6db');
      skyGrad.addColorStop(0.85, '#a4cef0');
      skyGrad.addColorStop(1.0, '#dbebf7');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Afternoon sun glow on sky (south-west azimuth, upper sky)
      const sunX = w * 0.38;
      const sunY = h * 0.3;
      const sunGlow = ctx.createRadialGradient ? ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 180) : null;
      if (sunGlow) {
        sunGlow.addColorStop(0.0, 'rgba(255, 252, 235, 0.95)');
        sunGlow.addColorStop(0.2, 'rgba(255, 240, 190, 0.65)');
        sunGlow.addColorStop(0.5, 'rgba(255, 215, 140, 0.25)');
        sunGlow.addColorStop(1.0, 'rgba(255, 200, 120, 0.0)');
        ctx.fillStyle = sunGlow;
        ctx.fillRect(0, 0, w, h);
      }

      // Soft painterly Japanese cumulus and cirrus clouds. Centers are spread
      // evenly with a safe edge margin so no puffy blob ever straddles the
      // panorama wrap seam (which produced a visible seam + a bright dot at
      // the top of the sky dome).
      for (let i = 0; i < 18; i++) {
        const cw = 64 + (i % 5) * 34;
        const ch = 18 + (i % 3) * 10;
        const margin = cw + 32;
        const cx = margin + (i * (w - margin * 2)) / 17;
        const cy = h * 0.34 + Math.sin(i * 1.7) * (h * 0.2);
        ctx.fillStyle = 'rgba(245, 250, 255, 0.5)';
        ctx.beginPath();
        if (ctx.ellipse) {
          ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(cx, cy, ch, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // Polar vignette: fade the very top of the dome to deep blue so the pole
      // never reads as a bright pinched dot.
      const poleMask = ctx.createRadialGradient ? ctx.createRadialGradient(w / 2, 0, 8, w / 2, 0, 220) : null;
      if (poleMask) {
        poleMask.addColorStop(0.0, 'rgba(10, 34, 62, 0.6)');
        poleMask.addColorStop(0.6, 'rgba(10, 34, 62, 0.12)');
        poleMask.addColorStop(1.0, 'rgba(10, 34, 62, 0)');
        ctx.fillStyle = poleMask;
        ctx.fillRect(0, 0, w, h);
      }
    }
  );
  skyMat.diffuseTexture = skyTex;
  skyMat.emissiveTexture = skyTex;

  const skyDome = MeshBuilder.CreateSphere('skyDome', { diameter: 500, segments: 28 }, scene);
  skyDome.material = skyMat;
  skyDome.isPickable = false;
  skyDome.checkCollisions = false;

  // Mount Fuji (Majestic landmark on NW horizon)
  const fujiBaseMat = new StandardMaterial('matFujiBase', scene);
  fujiBaseMat.diffuseColor = new Color3(0.24, 0.30, 0.44);
  fujiBaseMat.specularColor = new Color3(0.04, 0.04, 0.04);
  const fujiBase = MeshBuilder.CreateCylinder('fujiBase', { height: 110, diameterBottom: 210, diameterTop: 36, tessellation: 36 }, scene);
  fujiBase.position = new Vector3(-105, 48, -170);
  fujiBase.material = fujiBaseMat;
  fujiBase.isPickable = false;
  fujiBase.checkCollisions = false;

  const fujiCapMat = new StandardMaterial('matFujiCap', scene);
  fujiCapMat.diffuseColor = new Color3(0.96, 0.97, 0.99);
  fujiCapMat.specularColor = new Color3(0.25, 0.25, 0.25);
  const fujiCap = MeshBuilder.CreateCylinder('fujiCap', { height: 40, diameterBottom: 82, diameterTop: 34, tessellation: 36 }, scene);
  fujiCap.position = new Vector3(-105, 88, -170);
  fujiCap.material = fujiCapMat;
  fujiCap.isPickable = false;
  fujiCap.checkCollisions = false;

  // Natural rolling forested hills (soft evergreen pine mounds framing the valley)
  const ridgeMat = new StandardMaterial('matRidge', scene);
  ridgeMat.diffuseColor = new Color3(0.16, 0.26, 0.20);
  ridgeMat.specularColor = new Color3(0.02, 0.02, 0.02);
  const rollingHills = [
    // North horizon (framing Mount Fuji in the NW)
    { x: -25, y: 15, z: -145, w: 90, h: 32, d: 45 },
    { x: 65, y: 18, z: -145, w: 100, h: 36, d: 50 },
    // South horizon (behind Team 1 Spawn)
    { x: -50, y: 14, z: 135, w: 90, h: 30, d: 45 },
    { x: 5, y: 18, z: 140, w: 95, h: 36, d: 50 },
    { x: 60, y: 15, z: 135, w: 90, h: 32, d: 45 },
    // East horizon (behind Secret / B-Site)
    { x: 135, y: 16, z: -45, w: 45, h: 34, d: 90 },
    { x: 140, y: 20, z: 0, w: 50, h: 38, d: 95 },
    { x: 135, y: 15, z: 45, w: 45, h: 32, d: 90 },
    // West horizon (behind A-Long)
    { x: -135, y: 16, z: -45, w: 45, h: 34, d: 90 },
    { x: -140, y: 20, z: 0, w: 50, h: 38, d: 95 },
    { x: -135, y: 15, z: 45, w: 45, h: 32, d: 90 }
  ];
  for (let r = 0; r < rollingHills.length; r++) {
    const rh = rollingHills[r];
    const hill = MeshBuilder.CreateCylinder(`hill${r}`, {
      height: rh.h,
      diameterBottom: Math.max(rh.w, rh.d),
      diameterTop: Math.max(rh.w, rh.d) * 0.35,
      tessellation: 16
    }, scene);
    hill.position = new Vector3(rh.x, rh.y, rh.z);
    hill.material = ridgeMat;
    hill.isPickable = false;
    hill.checkCollisions = false;
  }

  // Stylized clouds (dim emissive so they never bloom through the sky line)
  const cloudMat = new StandardMaterial('matCloud', scene);
  cloudMat.diffuseColor = new Color3(0.88, 0.91, 0.96);
  cloudMat.specularColor = new Color3(0.08, 0.08, 0.08);
  cloudMat.emissiveColor = new Color3(0.12, 0.14, 0.16);
  const cloudPos = [
    new Vector3(-55, 56, -75),
    new Vector3(55, 62, -55),
    new Vector3(75, 52, 65),
    new Vector3(-70, 58, 60),
    new Vector3(0, 68, -30),
    new Vector3(-30, 54, 40)
  ];
  for (let c = 0; c < cloudPos.length; c++) {
    const cloud: Mesh = MeshBuilder.CreateSphere(`cloud${c}`, { diameterX: 36, diameterY: 11, diameterZ: 20, segments: 8 }, scene);
    cloud.position = cloudPos[c];
    cloud.material = cloudMat;
    cloud.isPickable = false;
    cloud.checkCollisions = false;
  }

  return skyMat;
}
