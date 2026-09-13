import { NullEngine, Scene } from '@babylonjs/core';
import { describe, it, expect } from 'vitest';
import { createMapBuilder } from '../../src/lib/strike/map/builder';
import { buildLayout, buildMapObject, parseLayout, serializeLayout, emptyLayout, vec3 } from '../../src/lib/strike/map/layout';
import { loadDefaultLayout } from '../../src/lib/strike/map/layout';
import { COMPONENTS, buildComponent, createComponentObject } from '../../src/lib/strike/map/components/registry';
import { COMPONENT_PARAM_SPECS } from '../../src/lib/strike/map/editor/editor-scene';

function makeScene() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return { engine, scene };
}

describe('.wsmap serialization round-trip', () => {
  it('preserves all fields through serialize → parse', () => {
    const layout = loadDefaultLayout()!;
    expect(layout.objects.length).toBeGreaterThan(100);

    const json = serializeLayout(layout);
    const parsed = parseLayout(json);

    expect(parsed).toEqual(layout);
  });

  it('preserves an edited layout', () => {
    const layout = loadDefaultLayout()!;
    layout.name = 'test-edited';
    layout.objects[0].position = [1, 2, 3];
    layout.objects[0].rotation = [0.1, 0.2, 0.3];

    const json = serializeLayout(layout);
    const parsed = parseLayout(json);

    expect(parsed.name).toBe('test-edited');
    expect(parsed.objects[0].position).toEqual([1, 2, 3]);
    expect(parsed.objects[0].rotation).toEqual([0.1, 0.2, 0.3]);
  });

  it('handles an empty layout', () => {
    const layout = emptyLayout('empty-test');
    layout.objects = [];
    layout.spawns = [];

    const json = serializeLayout(layout);
    const parsed = parseLayout(json);

    expect(parsed.name).toBe('empty-test');
    expect(parsed.objects).toHaveLength(0);
    expect(parsed.spawns).toHaveLength(0);
  });
});

describe('editor map builder with editor:true', () => {
  it('does not freeze world matrices in editor mode', () => {
    const { engine, scene } = makeScene();
    const b = createMapBuilder(scene, undefined, { editor: true });
    const layout = loadDefaultLayout()!;

    buildLayout(b, layout, true);

    // No colliders should have a frozen world matrix.
    for (const c of b.colliders) {
      expect((c as any).isWorldMatrixFrozen).toBe(false);
    }

    scene.dispose();
    engine.dispose();
  });

  it('matches mesh count when building a component by id', () => {
    const { engine, scene } = makeScene();
    const b = createMapBuilder(scene, undefined, { editor: true });

    for (const def of COMPONENTS) {
      const pos = vec3([0, 0, 0]);
      const meshes = buildComponent(b, def.id, `test_${def.id}`, pos);
      expect(meshes.length).toBeGreaterThan(0);
    }

    scene.dispose();
    engine.dispose();
  });

  it('every registered component has matching param specs', () => {
    for (const def of COMPONENTS) {
      const specs = COMPONENT_PARAM_SPECS[def.id];
      if (specs) {
        for (const key of Object.keys(specs)) {
          expect(def.defaults[key]).toBeDefined();
        }
      }
    }
  });
});

describe('layout lights', () => {
  it('round-trips lights through serialize → parse', () => {
    const layout = emptyLayout('lights-test');
    layout.lights = [
      { id: 'o_0001', name: 'TestLight', position: [1, 2, 3], color: [1, 0.5, 0.25], intensity: 2, range: 8 }
    ];
    const parsed = parseLayout(serializeLayout(layout));
    expect(parsed.lights).toEqual(layout.lights);
  });

  it('builds a layout light into the scene with an editor marker', () => {
    const { engine, scene } = makeScene();
    const b = createMapBuilder(scene, undefined, { editor: true });
    const layout = emptyLayout('lights-build');
    layout.lights = [
      { id: 'o_0001', name: 'L_A', position: [0, 3, 0], color: [1, 1, 1], intensity: 1.5, range: 9 }
    ];
    buildLayout(b, layout, true);

    const light = scene.getLightByName('L_A');
    expect(light).toBeDefined();
    expect(b.lanternLights).toContain(light);
    expect(b.lanternLights[0].range).toBe(9);

    const marker = scene.meshes.find((m) => m.name === 'o_0001__light');
    expect(marker).toBeDefined();

    scene.dispose();
    engine.dispose();
  });
});

describe('editor rebuild cycle', () => {
  it('can dispose + rebuild layout without leaking mesh count', () => {
    const { engine, scene } = makeScene();
    const b = createMapBuilder(scene, undefined, { editor: true });
    let layout = loadDefaultLayout()!;

    // First build.
    buildLayout(b, layout, true);
    const count1 = scene.meshes.length;
    expect(count1).toBeGreaterThan(50);

    // Dispose all layout object/light meshes (same routine the editor uses).
    for (const o of layout.objects) {
      for (const m of [...scene.meshes]) {
        if (m.isDisposed()) continue;
        const meta = m.metadata as { editorId?: string } | undefined;
        if (meta?.editorId === o.id && !m.parent) m.dispose();
      }
    }
    for (const l of layout.lights) {
      for (const m of [...scene.meshes]) {
        if (m.isDisposed()) continue;
        const meta = m.metadata as { editorId?: string } | undefined;
        if (meta?.editorId === l.id && !m.parent) m.dispose();
      }
    }

    // Rebuild the same layout.
    buildLayout(b, layout, true);
    const count2 = scene.meshes.length;
    expect(count2).toBe(count1);

    scene.dispose();
    engine.dispose();
  });

  it('rebuilding with a mutated layout reflects the change', () => {
    const { engine, scene } = makeScene();
    const b = createMapBuilder(scene, undefined, { editor: true });
    const layout = loadDefaultLayout()!;

    buildLayout(b, layout, true);

    // Add a new box object manually and rebuild only it.
    layout.objects.push({
      id: 'o_9999',
      name: 'test_box',
      kind: 'box',
      w: 3,
      h: 3,
      d: 3,
      position: [10, 1.5, 10],
      rotation: [0, 0, 0],
      material: 'plaster',
      collidable: true
    });

    buildMapObject(b, layout.objects[layout.objects.length - 1], true);

    const newBox = scene.getMeshByName('test_box');
    expect(newBox).toBeDefined();
    expect(newBox!.position.x).toBe(10);

    scene.dispose();
    engine.dispose();
  });
});