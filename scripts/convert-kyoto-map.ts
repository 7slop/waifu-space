/**
 * Serializes the classic programmatic Kyoto map (the section builders) into
 * src/lib/strike/map/kyoto.wsmap so the game and the map editor share the
 * exact same data file.
 *
 * Usage:  bun run map:export
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { NullEngine, Scene } from '@babylonjs/core';
import { createMapBuilder } from '../src/lib/strike/map/builder';
import {
  buildGround, buildSpawns, buildLaneA, buildLaneB, buildMid,
  buildSiteA, buildSiteB, buildSecret, buildConnectors
} from '../src/lib/strike/map/sections';
import { DEFAULT_KYOTO_SPAWNS, serializeLayout } from '../src/lib/strike/map/map-format';

// Babylon's DynamicTexture creates a canvas to draw procedural textures into.
// Node has neither `document` nor `OffscreenCanvas`. We only need a stub: the
// texture draw callbacks call canvas-2D APIs and the NullEngine never actually
// renders, so a Proxy that swallows every call and returns safe objects is
// enough to let the whole map build without a real GPU.
if (typeof (globalThis as any).OffscreenCanvas === 'undefined') {
  class CanvasStub {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext(): unknown {
      return new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
              return () => ({ addColorStop() { /* no-op */ } });
            }
            return () => undefined;
          },
          set() {
            return true;
          }
        }
      );
    }
    toDataURL(): string {
      return '';
    }
  }
  (globalThis as any).OffscreenCanvas = CanvasStub;
}

const engine = new NullEngine();
const scene = new Scene(engine);

const b = createMapBuilder(scene, undefined, { record: true });

buildGround(b);
buildSpawns(b);
buildLaneA(b);
buildLaneB(b);
buildMid(b);
buildSiteA(b);
buildSiteB(b);
buildSecret(b);
buildConnectors(b);

if (!b.recorder) {
  console.error('Recorder was not attached to the map builder');
  process.exit(1);
}

const layout = b.recorder.toLayout('kyoto', DEFAULT_KYOTO_SPAWNS);

const outPath = resolve(process.cwd(), 'src/lib/strike/map/kyoto.wsmap');
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, serializeLayout(layout), 'utf8');

const boxes = layout.objects.filter((o) => o.kind === 'box').length;
const grounds = layout.objects.filter((o) => o.kind === 'ground').length;
const components = layout.objects.filter((o) => o.kind === 'component').length;

console.log(`[map:export] wrote ${outPath}`);
console.log(`  objects: ${layout.objects.length} (boxes ${boxes}, grounds ${grounds}, components ${components})`);
console.log(`  spawns:  ${layout.spawns.length}`);

scene.dispose();
engine.dispose();
process.exit(0);