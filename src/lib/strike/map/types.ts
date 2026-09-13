import {
  Scene,
  Vector3,
  Color3,
  AbstractMesh,
  StandardMaterial,
  PointLight,
  ShadowGenerator,
  DirectionalLight,
  HemisphericLight
} from '@babylonjs/core';
import type { ShadowQuality } from '../strike-types';

export interface BabylonSpawnPoint {
  position: Vector3;
  yaw: number;
}

export interface BabylonMapData {
  spawnPoints: BabylonSpawnPoint[];
  colliders: AbstractMesh[];
  shadowGenerator?: ShadowGenerator;
  sunLight?: DirectionalLight;
  hemiLight?: HemisphericLight;
  setRtxShadows?: (enabled: boolean) => void;
  setShadowQuality?: (quality: ShadowQuality) => void;
  updateDayNightCycle?: (elapsedSeconds: number) => void;
}

/**
 * Shared material library for the Kyoto map. Every material is created once
 * and shared across all sections to keep draw calls and GPU memory low.
 */
export interface MapMaterials {
  ground: StandardMaterial;
  wall: StandardMaterial;
  plaster: StandardMaterial;
  timber: StandardMaterial;
  tileRoof: StandardMaterial;
  shoji: StandardMaterial;
  shrineRed: StandardMaterial;
  crate: StandardMaterial;
  zenSand: StandardMaterial;
  woodDeck: StandardMaterial;
  bark: StandardMaterial;
  stone: StandardMaterial;
  darkWood: StandardMaterial;
  straw: StandardMaterial;
  gold: StandardMaterial;
  lanternGlow: StandardMaterial;
  windowGlow: StandardMaterial;
  sakura: StandardMaterial;
  bush: StandardMaterial;
  bamboo: StandardMaterial;
  neonPink: StandardMaterial;
  neonCyan: StandardMaterial;
}

export interface PointLightOptions {
  diffuse?: Color3;
  specular?: Color3;
  intensity?: number;
  range?: number;
}

/**
 * Shared build context passed to every map component and section.
 * Owns collider registration, shadow casting, lantern light collection
 * (used later by the day/night cycle), and optional .wsmap recording.
 */
export interface MapBuilder {
  scene: Scene;
  mats: MapMaterials;
  colliders: AbstractMesh[];
  lanternLights: PointLight[];
  /** Editor mode: meshes are not frozen and stay transformable. */
  editor: boolean;
  /** Active .wsmap recorder (present when built with record: true). */
  recorder?: import('./map-format').MapRecorder;

  /** Box with automatic collision and shadow registration */
  addBox(
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    mat: StandardMaterial,
    collidable?: boolean,
    castShadow?: boolean,
    rotation?: Vector3,
    scale?: Vector3
  ): AbstractMesh;

  /** Flat ground plane recorded as a 'ground' object */
  addGround(
    name: string,
    width: number,
    height: number,
    pos: Vector3,
    mat: StandardMaterial,
    collidable?: boolean
  ): AbstractMesh;

  /** Registers a warm point light that participates in the day/night cycle */
  addLanternLight(
    name: string,
    pos: Vector3,
    opts?: PointLightOptions
  ): PointLight;

  /** Registers a shadow caster if shadow generation is available */
  addShadowCaster(mesh: AbstractMesh): void;

  /** Opens a reusable component group (house/tree/lantern, …); no-op elsewhere */
  beginComponent(
    kind: string,
    name: string,
    pos: Vector3,
    params?: Record<string, number | string | boolean>,
    rotation?: Vector3
  ): void;

  /** Closes the currently open component group */
  endComponent(): void;

  /** Whether a component group is currently being built */
  inComponent(): boolean;

  /** Captures point lights emitted while the last component was being built */
  takeComponentLights(): PointLight[];
}
