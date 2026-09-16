import { Scene, Mesh, StandardMaterial } from '@babylonjs/core';
import type { MapBuilder } from '../types';

/**
 * Runtime animation for map components. Effects are only registered when the
 * map is built for gameplay (not the editor): the editor keeps every mesh
 * transformable, so nothing here must fight its gizmos.
 *
 * A single scoped BeforeRender listener per scene drives all effects, fed
 * with elapsed milliseconds. Meshes targeted by effects MUST be created
 * without b.addBox() (or at least not pushed into b.colliders), because
 * createKyotoMap freezeWorldMatrix()es every collider afterwards — a frozen
 * child would ignore the parent/pivot transforms the effects animate.
 */

export interface RuntimeEffect {
  update(elapsedMs: number): void;
}

type Timer = { effects: RuntimeEffect[]; startedAt: number; dispose: () => void };
const EFFECT_TIMERS = new WeakMap<Scene, Timer>();

/** Drives one shared BeforeRender listener per scene; ignores editor builds. */
export function registerRuntimeEffects(b: MapBuilder, effects: RuntimeEffect[]): void {
  if (b.editor || effects.length === 0) return;
  let timer = EFFECT_TIMERS.get(b.scene);
  if (!timer) {
    const list: RuntimeEffect[] = [];
    const startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const obs = b.scene.onBeforeRenderObservable.add(() => {
      const elapsed = ((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - startedAt);
      for (let i = 0; i < list.length; i++) {
        try {
          list[i].update(elapsed);
        } catch {
          // Never let a cosmetic animation crash the render loop.
        }
      }
    });
    timer = {
      effects: list,
      startedAt,
      dispose: () => b.scene.onBeforeRenderObservable.remove(obs)
    };
    EFFECT_TIMERS.set(b.scene, timer);
  }
  for (const e of effects) {
    timer.effects.push(e);
  }
}

/** Pulsing emissive material (blinking server LEDs, thrash strips). */
export function pulseEmissive(
  targets: StandardMaterial[],
  base: [number, number, number],
  amp: [number, number, number],
  rate = 2,
  phase = 0
): RuntimeEffect {
  return {
    update(elapsedMs: number) {
      const p = 0.5 + 0.5 * Math.sin(((elapsedMs / 1000) * rate * Math.PI * 2) + phase);
      for (const m of targets) {
        m.emissiveColor.set(base[0] + amp[0] * p, base[1] + amp[1] * p, base[2] + amp[2] * p);
      }
    }
  };
}

/** Gentle periodic sway around a mesh's own pivot (bamboo, flags, trees). */
export function swayRotation(mesh: Mesh, amp: number, rate = 0.3, phase = 0, axisIndex = 1): RuntimeEffect {
  const base = mesh.rotation.clone();
  return {
    update(elapsedMs: number) {
      const a = Math.sin(((elapsedMs / 1000) * rate * Math.PI * 2) + phase) * amp;
      mesh.rotation.set(base.x, base.y, base.z);
      if (axisIndex === 0) mesh.rotation.x += a;
      else if (axisIndex === 2) mesh.rotation.z += a;
      else mesh.rotation.y += a;
    }
  };
}

/** Cycles a hue around the colour wheel (RGB peripherals). */
export function cycleHue(targets: StandardMaterial[], rate = 0.6, phase = 0): RuntimeEffect {
  return {
    update(elapsedMs: number) {
      const hue = (phase + (elapsedMs / 1000) * rate) % 1;
      const rgb = hue2rgb(hue);
      for (const m of targets) {
        m.emissiveColor.set(rgb[0], rgb[1], rgb[2]);
        m.diffuseColor.set(rgb[0] * 0.5, rgb[1] * 0.5, rgb[2] * 0.5);
      }
    }
  };
}

function hue2rgb(hue: number): [number, number, number] {
  const h = ((hue % 1) + 1) % 1;
  const r = Math.abs(h * 6 - 3) - 1;
  const g = 2 - Math.abs(h * 6 - 2);
  const b = 2 - Math.abs(h * 6 - 4);
  return [clamp01(r), clamp01(g), clamp01(b)];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}