import {
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  AbstractMesh,
  StandardMaterial,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  ShadowGenerator
} from '@babylonjs/core';
import { ShadowQuality } from './strike-types';
import type { BabylonMapData, BabylonSpawnPoint, MapBuilder, PointLightOptions } from './map/types';
import { createMapMaterials } from './map/materials';
import {
  buildGround, buildSpawns, buildLaneA, buildLaneB, buildMid,
  buildSiteA, buildSiteB, buildSecret, buildConnectors, buildSky
} from './map/sections';

/**
 * Creates the shared build context used by every map component and section.
 * Handles collider registration, shadow casting, and day/night lantern collection.
 */
function createMapBuilder(scene: Scene, shadowGen?: ShadowGenerator): MapBuilder {
  const colliders: AbstractMesh[] = [];
  const lanternLights: PointLight[] = [];

  return {
    scene,
    mats: createMapMaterials(scene),
    colliders,
    lanternLights,
    addBox(
      name: string,
      w: number,
      h: number,
      d: number,
      pos: Vector3,
      mat: StandardMaterial,
      collidable = true,
      castShadow = true
    ): AbstractMesh {
      const box = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      box.position = pos;
      box.material = mat;
      box.receiveShadows = true;
      if (collidable) {
        box.checkCollisions = true;
        colliders.push(box);
      }
      if (castShadow && shadowGen) {
        shadowGen.addShadowCaster(box);
      }
      box.freezeWorldMatrix();
      box.doNotSyncBoundingInfo = true;
      return box;
    },
    addLanternLight(name: string, pos: Vector3, opts: PointLightOptions = {}): PointLight {
      const pl = new PointLight(name, pos, scene);
      pl.diffuse = opts.diffuse ?? new Color3(1.0, 0.85, 0.5);
      pl.specular = opts.specular ?? new Color3(0.25, 0.18, 0.08);
      pl.intensity = opts.intensity ?? 1.2;
      pl.range = opts.range ?? 12;
      lanternLights.push(pl);
      return pl;
    },
    addShadowCaster(mesh: AbstractMesh): void {
      if (shadowGen) {
        shadowGen.addShadowCaster(mesh);
      }
    }
  };
}

/**
 * Builds the competitive tactical FPS map "Kyoto v2" in Babylon.js (104m × 104m).
 *
 * Strict 3-lane competitive layout inspired by CS2 / Valorant:
 *
 *   Lane A  ("A-Long")   — West Machiya Street, long-range / AWP lane
 *   Mid     ("Torii Ave") — Central high-risk corridor, both teams meet at ~6s
 *   Lane B  ("B-Short")  — East Merchant Quarter, close-quarters combat
 *   Secret  ("Roji")     — East flank passage, slow but uncontested B-Site flank
 *
 *   A-Site  ("Tea House Courtyard")  — NW, 3 entry points, raised wooden platform
 *   B-Site  ("Temple Gate / Shrine") — NE, 3 entry points, elevated stone platform
 *
 *   Connectors: A-Short (Mid↔A), B-Short (Mid↔B), Mid-to-A, Mid-to-B
 *
 * Timing: Both teams reach mid chokepoints in ~5.9s at rifle speed (7.4 m/s).
 * Sightlines: No unbroken sightline >20m (A-Long split by stone gate into 2×30m).
 *
 * Background: Daytime Japan skybox, Mount Fuji (NW), surrounding mountain ridges.
 *
 * The map is split into sections (see ./map/sections) built from reusable
 * components (see ./map/components) — each section fully seals against its
 * neighbours so the whole arena reads as one continuous map with no void gaps.
 */
export function createKyotoMap(scene: Scene): BabylonMapData {
  // ═══════════════════════════════════════════════════════════════════
  // 1. LIGHTING & REAL-TIME SHADOW GENERATOR
  // ═══════════════════════════════════════════════════════════════════

  // Primary warm Japanese afternoon Sun: distinct angled light source
  const sunLight = new DirectionalLight('sun', new Vector3(0.55, -0.82, 0.45), scene);
  sunLight.position = new Vector3(-60, 85, -60);
  sunLight.diffuse = new Color3(1.05, 0.98, 0.88);
  sunLight.specular = new Color3(0.22, 0.20, 0.16);
  sunLight.intensity = 0.95; // Balanced, natural warm sunlight

  // Soft atmospheric skylight fill (gentle cool blue from above)
  const hemiLight = new HemisphericLight('hemi', new Vector3(0.1, 1, 0.1), scene);
  hemiLight.diffuse = new Color3(0.48, 0.58, 0.72);
  hemiLight.groundColor = new Color3(0.24, 0.25, 0.24);
  hemiLight.intensity = 0.55;

  // Secondary soft bounce fill from north-east
  const fillLight = new DirectionalLight('fill', new Vector3(-0.55, -0.65, -0.45), scene);
  fillLight.position = new Vector3(60, 65, 60);
  fillLight.diffuse = new Color3(0.35, 0.42, 0.52);
  fillLight.intensity = 0.28;

  // Real-time Shadow Generator with Poisson filtering
  let shadowGen: ShadowGenerator | undefined;
  try {
    shadowGen = new ShadowGenerator(1024, sunLight);
    shadowGen.usePoissonSampling = true;
    shadowGen.bias = 0.0015;
    shadowGen.normalBias = 0.02;
    shadowGen.darkness = 0.45; // Soft natural shadows
  } catch (err) {
    console.warn('[KyotoMap] ShadowGenerator skipped:', err);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. BUILD ALL MAP SECTIONS (ground → lanes → mid → sites → secret)
  // ═══════════════════════════════════════════════════════════════════

  const b = createMapBuilder(scene, shadowGen);

  buildGround(b);
  buildSpawns(b);
  buildLaneA(b);
  buildLaneB(b);
  buildMid(b);
  buildSiteA(b);
  buildSiteB(b);
  buildSecret(b);
  buildConnectors(b);
  const skyMat = buildSky(b);

  // ═══════════════════════════════════════════════════════════════════
  // 3. TACTICAL SITE LIGHTING
  // ═══════════════════════════════════════════════════════════════════

  // Tactical focal point lights (warm lantern illumination for key sites)
  const focalLights = [
    new Vector3(-27, 2.5, -29),   // A-Site Tea House Courtyard
    new Vector3(27, 2.5, -29),    // B-Site Temple Gate
    new Vector3(0, 2.8, 0),       // Mid Torii center
    new Vector3(40, 2.5, 0)       // Secret Passage midpoint
  ];
  for (let fl = 0; fl < focalLights.length; fl++) {
    b.addLanternLight(`focal${fl}`, focalLights[fl], {
      diffuse: new Color3(1.0, 0.85, 0.58),
      specular: new Color3(0.12, 0.10, 0.06),
      intensity: 0.75,
      range: 24
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. SPAWN POINTS (12 Total — 6 per team)
  // ═══════════════════════════════════════════════════════════════════

  const spawnPoints: BabylonSpawnPoint[] = [
    // --- Team 1: South Base (Cherry Blossom Plaza) ---
    { position: new Vector3(-4, 1.0, 46), yaw: 0 },
    { position: new Vector3(4, 1.0, 46), yaw: 0 },
    { position: new Vector3(-10, 1.0, 44), yaw: 0 },
    { position: new Vector3(10, 1.0, 44), yaw: 0 },
    { position: new Vector3(-2, 1.0, 43), yaw: 0 },
    { position: new Vector3(2, 1.0, 43), yaw: 0 },

    // --- Team 2: North Base (Bamboo Garden) ---
    { position: new Vector3(-4, 1.0, -46), yaw: Math.PI },
    { position: new Vector3(4, 1.0, -46), yaw: Math.PI },
    { position: new Vector3(-10, 1.0, -44), yaw: Math.PI },
    { position: new Vector3(10, 1.0, -44), yaw: Math.PI },
    { position: new Vector3(-2, 1.0, -43), yaw: Math.PI },
    { position: new Vector3(2, 1.0, -43), yaw: Math.PI },
  ];

  // ═══════════════════════════════════════════════════════════════════
  // 5. SHADOW QUALITY TOGGLES & DAY/NIGHT CYCLE
  // ═══════════════════════════════════════════════════════════════════

  const setRtxShadows = (enabled: boolean) => {
    if (!shadowGen) return;
    try {
      if (enabled) {
        shadowGen.useContactHardeningShadow = true;
        shadowGen.contactHardeningLightSizeUVRatio = 0.08;
        shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
        shadowGen.bias = 0.0005;
        shadowGen.normalBias = 0.015;
      } else {
        shadowGen.useContactHardeningShadow = false;
        shadowGen.usePoissonSampling = true;
        shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
        shadowGen.bias = 0.0015;
        shadowGen.normalBias = 0.02;
      }
    } catch (err) {
      console.warn('[KyotoMap] Error toggling RTX shadows:', err);
    }
  };

  const setShadowQuality = (quality: ShadowQuality) => {
    if (!shadowGen) return;
    try {
      const sm = shadowGen.getShadowMap();
      if (quality === 'off') {
        if (sm) sm.refreshRate = 0; // Completely skip shadow pass for maximum FPS on low-end hardware
        shadowGen.darkness = 0;
      } else if (quality === 'low') {
        if (sm) sm.refreshRate = 1;
        shadowGen.useContactHardeningShadow = false;
        shadowGen.usePoissonSampling = true;
        shadowGen.filteringQuality = ShadowGenerator.QUALITY_LOW;
        shadowGen.darkness = 0.35;
        shadowGen.bias = 0.0025;
      } else if (quality === 'medium') {
        if (sm) sm.refreshRate = 1;
        shadowGen.useContactHardeningShadow = false;
        shadowGen.usePoissonSampling = true;
        shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
        shadowGen.darkness = 0.45;
        shadowGen.bias = 0.0015;
      } else if (quality === 'rtx') {
        if (sm) sm.refreshRate = 1;
        shadowGen.useContactHardeningShadow = true;
        shadowGen.contactHardeningLightSizeUVRatio = 0.08;
        shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
        shadowGen.darkness = 0.55;
        shadowGen.bias = 0.0005;
      }
    } catch (err) {
      console.warn('[KyotoMap] Error setting shadow quality:', err);
    }
  };

  const CYCLE_DURATION = 1440; // 24 minutes in seconds

  const updateDayNightCycle = (elapsedSeconds: number) => {
    const cycleTime = elapsedSeconds % CYCLE_DURATION;
    const phase = cycleTime / CYCLE_DURATION; // 0.0 to 1.0

    // Sun / Moon orbital angle:
    // phase 0.0 = dawn (east), 0.25 = noon, 0.5 = dusk (west), 0.75 = midnight (moon)
    const angle = phase * Math.PI * 2;
    const sunElevation = Math.sin(angle); // -1 to +1: >0 is day, <0 is night
    const sunAzimuth = Math.cos(angle);

    const isDaytime = sunElevation > -0.08;

    if (isDaytime) {
      // Day / Dawn / Dusk sun direction (pointing down from sun towards center)
      const sunHeight = Math.max(0.12, sunElevation);
      sunLight.direction = new Vector3(sunAzimuth * 0.75, -sunHeight, 0.45).normalize();
      sunLight.position = new Vector3(-sunAzimuth * 120, sunHeight * 140, -60);

      if (sunElevation < 0.25) {
        // Dawn or Dusk (sunset glow)
        const t = Math.max(0, sunElevation / 0.25);
        sunLight.diffuse = Color3.Lerp(new Color3(1.0, 0.45, 0.25), new Color3(1.05, 0.98, 0.88), t);
        sunLight.intensity = 0.55 + t * 0.4;
        hemiLight.diffuse = Color3.Lerp(new Color3(0.42, 0.32, 0.45), new Color3(0.48, 0.58, 0.72), t);
        hemiLight.intensity = 0.35 + t * 0.2;
        scene.clearColor = Color4.Lerp(new Color4(0.35, 0.22, 0.38, 1.0), new Color4(0.42, 0.65, 0.88, 1.0), t);
        skyMat.emissiveColor = Color3.Lerp(new Color3(0.9, 0.55, 0.5), new Color3(1.0, 1.0, 1.0), t);
      } else {
        // Full daytime
        sunLight.diffuse = new Color3(1.05, 0.98, 0.88);
        sunLight.intensity = 0.95;
        hemiLight.diffuse = new Color3(0.48, 0.58, 0.72);
        hemiLight.intensity = 0.55;
        scene.clearColor = new Color4(0.42, 0.65, 0.88, 1.0);
        skyMat.emissiveColor = new Color3(1.0, 1.0, 1.0);
      }

      // Lanterns & lit windows remain luminous during daytime with warm ambient glow
      const lanternIntensity = Math.max(1.6, 2.15 - sunElevation * 0.45);
      b.lanternLights.forEach((l) => (l.intensity = lanternIntensity));
    } else {
      // Nighttime (Directional light becomes cool moonlight)
      const moonHeight = Math.max(0.2, -sunElevation);
      sunLight.direction = new Vector3(-sunAzimuth * 0.65, -moonHeight, -0.4).normalize();
      sunLight.position = new Vector3(sunAzimuth * 100, moonHeight * 120, 60);

      // Cool silvery moonlight
      sunLight.diffuse = new Color3(0.35, 0.48, 0.75);
      sunLight.intensity = 0.42;

      // Night skylight fill
      hemiLight.diffuse = new Color3(0.14, 0.18, 0.32);
      hemiLight.groundColor = new Color3(0.08, 0.09, 0.14);
      hemiLight.intensity = 0.28;

      scene.clearColor = new Color4(0.05, 0.07, 0.14, 1.0);
      skyMat.emissiveColor = new Color3(0.12, 0.15, 0.28);

      // Lanterns & lit windows shine brightly at night!
      b.lanternLights.forEach((l) => (l.intensity = 3.4));
    }
  };

  // Performance optimization: Freeze world matrix on all static map architecture colliders
  // to eliminate per-frame bounding box sync and world matrix recalculation.
  for (let i = 0; i < b.colliders.length; i++) {
    b.colliders[i].freezeWorldMatrix();
    b.colliders[i].doNotSyncBoundingInfo = true;
  }

  return {
    spawnPoints,
    colliders: b.colliders,
    shadowGenerator: shadowGen,
    sunLight,
    hemiLight,
    setRtxShadows,
    setShadowQuality,
    updateDayNightCycle
  };
}

// Backwards-compatible alias for existing imports
export const createCyberShrineMap = createKyotoMap;
export type { BabylonMapData, BabylonSpawnPoint };
