import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import {
  StrikeMapEditorController,
  COMPONENT_PARAM_SPECS,
  EditorSelectionInfo,
  EditorLightInfo,
  EditorSpawnInfo,
  EditorSelectionKind
} from '../lib/strike/map/editor/editor-scene';
import { COMPONENTS } from '../lib/strike/map/components/registry';
import '../styles/editor.css';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

function Field(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="edi-field">
      <span class="edi-field-label">{props.label}</span>
      <input
        type="number"
        step={props.step ?? 0.5}
        value={props.value.toFixed(3)}
        onChange={(e) => props.onChange(parseFloat(e.currentTarget.value) || 0)}
      />
    </label>
  );
}

function CheckRow(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="edi-check-row">
      <span>{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
    </label>
  );
}

export function StrikeMapEditor(props: { onExit?: () => void }) {
  let containerRef!: HTMLDivElement;
  let canvasRef!: HTMLCanvasElement;
  let fileInputRef!: HTMLInputElement;

  let controller: StrikeMapEditorController | null = null;

  const [objects, setObjects] = createSignal<ReturnType<StrikeMapEditorController['getObjectList']>>([]);
  const [lights, setLights] = createSignal<ReturnType<StrikeMapEditorController['getLightList']>>([]);
  const [spawns, setSpawns] = createSignal<ReturnType<StrikeMapEditorController['getSpawnList']>>([]);
  const [objectSel, setObjectSel] = createSignal<EditorSelectionInfo | null>(null);
  const [lightSel, setLightSel] = createSignal<EditorLightInfo | null>(null);
  const [spawnSel, setSpawnSel] = createSignal<EditorSpawnInfo | null>(null);
  const [selKind, setSelKind] = createSignal<EditorSelectionKind>('none');
  const [dirty, setDirty] = createSignal(false);
  const [gizmoMode, setGizmoMode] = createSignal<'translate' | 'rotate' | 'scale'>('translate');
  const [snap, setSnap] = createSignal(true);
  const [snapStep, setSnapStep] = createSignal(0.5);
  const [status, setStatus] = createSignal<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = createSignal(false);

  const refresh = () => {
    if (!controller) return;
    const kind = controller.getSelectionKind();
    setSelKind(kind);
    setObjects(controller.getObjectList());
    setLights(controller.getLightList());
    setSpawns(controller.getSpawnList());
    setObjectSel(kind === 'object' ? controller.getSelectionInfo() : null);
    setLightSel(kind === 'light' ? controller.getLightSelectionInfo() : null);
    setSpawnSel(kind === 'spawn' ? controller.getSpawnSelectionInfo() : null);
    setDirty(controller.dirty);
  };

  const notify = (kind: 'ok' | 'err' | 'info', text: string) => {
    setStatus({ kind, text });
  };

  onMount(() => {
    controller = new StrikeMapEditorController(canvasRef, () => {
      queueMicrotask(refresh);
    });

    const handleResize = () => controller?.handleResize();
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    // Wheel over the Babylon canvas drives camera zoom — swallow the event so
    // the document never scrolls underneath while zooming in/out.
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.edi-canvas')) {
        e.preventDefault();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!controller) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const kind = controller.getSelectionKind();
      if ((e.key === 'Delete' || e.key === 'Backspace') && kind !== 'none') {
        e.preventDefault();
        controller.deleteSelected();
        refresh();
        notify('info', kind === 'spawn' ? 'Spawn deleted' : kind === 'light' ? 'Light deleted' : 'Object deleted');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && kind === 'object') {
        e.preventDefault();
        controller.duplicateSelected();
        refresh();
        notify('info', 'Duplicated');
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    containerRef.addEventListener('wheel', handleWheel, { passive: false });

    refresh();
    notify('info', 'Editor ready — LMB orbit · RMB drag to pan · wheel zoom · WASD/QE fly · F focus · Shift = fast');

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      containerRef.removeEventListener('wheel', handleWheel);
      controller?.dispose();
      controller = null;
    });
  });

  const handleAddBox = () => {
    controller?.addBox();
    refresh();
    notify('info', 'Added box — move it with the translate gizmo');
  };

  const handleAddComponent = (componentId: string) => {
    controller?.addComponent(componentId);
    refresh();
  };

  const handleAddLight = () => {
    controller?.addLight();
    refresh();
    notify('info', 'Added light — pick color/intensity in the inspector');
  };

  const handleAddSpawn = () => {
    controller?.addSpawn();
    refresh();
    notify('info', 'Added spawn point — rotate it to re-aim');
  };

  const handleSelectObject = (index: number) => {
    controller?.selectByIndex(index);
    refresh();
  };

  const handleSelectLight = (id: string) => {
    controller?.selectById(id);
    refresh();
  };

  const handleSelectSpawn = (index: number) => {
    controller?.selectSpawn(index);
    refresh();
  };

  const handleSetGizmo = (mode: 'translate' | 'rotate' | 'scale') => {
    controller?.setGizmoMode(mode);
    setGizmoMode(mode);
    refresh();
  };

  const handleToggleSnap = () => {
    const next = !snap();
    controller?.setSnap(next);
    setSnap(next);
  };

  const handleSnapStep = (step: number) => {
    controller?.setTranslateSnap(step);
    setSnapStep(step);
    controller?.setSnap(true);
    setSnap(true);
  };

  const handleDelete = () => {
    controller?.deleteSelected();
    refresh();
  };

  const handleReset = async () => {
    if (controller?.dirty && !window.confirm('Discard unsaved changes and reset to the default map?')) return;
    controller?.resetToDefault();
    refresh();
    notify('info', 'Reset to default map');
  };

  const handleSave = async () => {
    if (!controller) return;
    const json = controller.serialize();

    try {
      const res = await fetch('/api/strike/map-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: json })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        controller.dirty = false;
        setDirty(false);
        notify('ok', `Saved to repo (${data.objects} objects → kyoto.wsmap)`);
      } else {
        notify('err', `Repo save failed: ${data?.error || res.status}`);
      }
    } catch {
      notify('err', 'Repo save failed (network error)');
    }

    // Always offer a manual download of the wsmap file too.
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kyoto.wsmap';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      /* download is best-effort */
    }
  };

  const handleOpen = (file: File | null) => {
    if (!file || !controller) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = controller!.importJSON(String(reader.result ?? ''));
      if (result.ok) {
        refresh();
        notify('ok', `Opened ${file.name} (${result.count} objects)`);
      } else {
        notify('err', `Open failed: ${result.error}`);
      }
    };
    reader.readAsText(file);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        setIsFullscreen(false);
      } else {
        await containerRef?.requestFullscreen?.();
        setIsFullscreen(true);
      }
    } catch (err) {
      notify('err', 'Fullscreen is not available here');
    }
    // Let the browser settle before resizing the engine.
    setTimeout(() => controller?.handleResize(), 100);
  };

  const patchLight = (
    partial: {
      position?: [number, number, number];
      color?: [number, number, number];
      intensity?: number;
      range?: number;
    }
  ) => {
    const l = lightSel();
    if (!l || !controller) return;
    controller.updateLightById(l.id, partial);
    refresh();
  };

  const patchSpawn = (partial: { position?: [number, number, number]; yaw?: number }) => {
    const s = spawnSel();
    if (!s || !controller) return;
    controller.updateSpawn(s.index, partial);
    refresh();
  };

  const selectedName = () => {
    if (selKind() === 'light') return lightSel()?.name;
    if (selKind() === 'spawn') return `Spawn ${(spawnSel()?.index ?? 0) + 1}`;
    return objectSel()?.name;
  };
  const selectedHint = () => {
    if (selKind() === 'light') return lightSel()?.id;
    if (selKind() === 'spawn') return spawnSel() ? `Team ${spawnSel()!.team}` : undefined;
    return objectSel()?.id;
  };

  return (
    <div ref={containerRef} class="map-editor" role="region" aria-label="Waifu Strike Map Editor">
      {/* ── Top toolbar ── */}
      <div class="edi-toolbar">
        <div class="edi-brand">
          <span class="edi-logo">🗺️</span>
          <span class="edi-title">Waifu Strike Map Editor</span>
          <Show when={dirty()}><span class="edi-dirty-dot" title="Unsaved changes">●</span></Show>
        </div>
        <div class="edi-toolbar-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".wsmap,application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => handleOpen(e.currentTarget.files?.[0] ?? null)}
          />
          <button class="edi-btn" onClick={() => fileInputRef?.click()}>Open .wsmap</button>
          <button class="edi-btn" onClick={handleReset}>Reset Default</button>
          <button class="edi-btn edi-btn-save" onClick={handleSave}>Save (repo + download)</button>
          <button class="edi-btn edi-btn-fullscreen" onClick={toggleFullscreen}>
            {isFullscreen() ? '✕ Exit fullscreen' : '⛶ Fullscreen'}
          </button>
        </div>
        <Show when={props.onExit}>
          <button class="edi-btn" onClick={props.onExit}>Exit</button>
        </Show>
      </div>

      {/* ── Main body ── */}
      <div class="edi-body">
        {/* Left: spawns + lights + object list */}
        <aside class="edi-panel edi-left">
          <section class="edi-list-section">
            <header class="edi-panel-head">
              <span>Spawns ({spawns().length})</span>
              <div class="edi-head-actions">
                <button class="edi-icon-btn edi-icon-add" title="Add spawn point" onClick={handleAddSpawn}>＋</button>
                <button
                  class="edi-icon-btn"
                  title="Delete selected"
                  disabled={selKind() === 'none'}
                  onClick={handleDelete}
                >🗑</button>
              </div>
            </header>
            <div class="edi-list edi-list-tight">
              <For each={spawns()}>
                {(sp) => (
                  <div
                    class={`edi-list-item edi-list-spawn ${spawnSel()?.index === sp.index ? 'active' : ''}`}
                    onClick={() => handleSelectSpawn(sp.index)}
                  >
                    <span class={`edi-spawn-disc edi-team-${sp.team.toLowerCase()}`}>{sp.team}</span>
                    <span class="edi-list-name">Spawn {sp.index + 1}</span>
                    <span class="edi-list-id">{sp.team === 'A' ? 'south' : 'north'}</span>
                  </div>
                )}
              </For>
            </div>
          </section>

          <section class="edi-list-section">
            <header class="edi-panel-head">
              <span>Lights ({lights().length})</span>
              <button class="edi-icon-btn edi-icon-add" title="Add point light" onClick={handleAddLight}>＋</button>
            </header>
            <div class="edi-list edi-list-tight">
              <For each={lights()}>
                {(l) => (
                  <div
                    class={`edi-list-item edi-list-light ${lightSel()?.id === l.id ? 'active' : ''}`}
                    onClick={() => handleSelectLight(l.id)}
                  >
                    <span class="edi-kind-badge">☀</span>
                    <span class="edi-list-name">{l.name}</span>
                    <span class="edi-list-id">{l.id}</span>
                  </div>
                )}
              </For>
            </div>
          </section>

          <section class="edi-list-section edi-list-section-grow">
            <header class="edi-panel-head">
              <span>Objects ({objects().length})</span>
            </header>
            <div class="edi-list">
              <Show
                when={objects().length > 0}
                fallback={<div class="edi-empty-state">No objects — use the palette below.</div>}
              >
                <For each={objects()}>
                  {(obj, i) => (
                    <div
                      class={`edi-list-item ${objectSel()?.id === obj.id ? 'active' : ''} edi-kind-${obj.kind}`}
                      onClick={() => handleSelectObject(i())}
                    >
                      <span class="edi-kind-badge">{obj.kind === 'component' ? '◆' : obj.kind === 'ground' ? '▦' : '▢'}</span>
                      <span class="edi-list-name">{obj.name}</span>
                      <span class="edi-list-id">{obj.id}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </section>
        </aside>

        {/* Center: 3D viewport */}
        <div class="edi-viewport">
          <canvas ref={canvasRef} class="edi-canvas" tabindex="0" />
          <div class="edi-hud">
            <Show when={selKind() !== 'none'}>
              <span>{selectedName()} <code>{selectedHint()}</code></span>
            </Show>
            <div class="edi-cam-hint">orbit: LMB · pan: RMB · zoom: wheel · fly: WASD/QE · focus: F · home: reset</div>
          </div>
        </div>

        {/* Right: inspector + gizmo controls */}
        <aside class="edi-panel edi-right">
          <Show when={selKind() === 'object' && objectSel()}>
            {(_) => {
              const s = objectSel()!;
              return (
                <>
                  <section class="edi-panel-section">
                    <header class="edi-panel-head"><span>Transform</span></header>
                    <div class="edi-field-grid">
                      <span class="edi-axis-hdr">Pos X</span>
                      <span class="edi-axis-hdr">Pos Y</span>
                      <span class="edi-axis-hdr">Pos Z</span>
                      <Field label="X" value={s.position[0]} step={snapStep()} onChange={(v) => { controller?.applyTransform('x', 'position', v); refresh(); }} />
                      <Field label="Y" value={s.position[1]} step={snapStep()} onChange={(v) => { controller?.applyTransform('y', 'position', v); refresh(); }} />
                      <Field label="Z" value={s.position[2]} step={snapStep()} onChange={(v) => { controller?.applyTransform('z', 'position', v); refresh(); }} />
                      <Field label="RX°" value={s.rotation[0] * DEG} step={15} onChange={(v) => { controller?.applyTransform('x', 'rotation', v * RAD); refresh(); }} />
                      <Field label="RY°" value={s.rotation[1] * DEG} step={15} onChange={(v) => { controller?.applyTransform('y', 'rotation', v * RAD); refresh(); }} />
                      <Field label="RZ°" value={s.rotation[2] * DEG} step={15} onChange={(v) => { controller?.applyTransform('z', 'rotation', v * RAD); refresh(); }} />
                      <Show when={s.kind === 'component' && s.scale}>
                        <Field label="SX" value={s.scale![0]} step={0.1} onChange={(v) => { controller?.applyTransform('x', 'scale', v); refresh(); }} />
                        <Field label="SY" value={s.scale![1]} step={0.1} onChange={(v) => { controller?.applyTransform('y', 'scale', v); refresh(); }} />
                        <Field label="SZ" value={s.scale![2]} step={0.1} onChange={(v) => { controller?.applyTransform('z', 'scale', v); refresh(); }} />
                      </Show>
                    </div>

                    <div class="edi-inspector-row">
                      <label class="edi-insp-label">Name</label>
                      <input
                        type="text"
                        value={s.name}
                        onBlur={(e) => { controller?.renameSelected(e.currentTarget.value); refresh(); }}
                      />
                    </div>

                    <Show when={s.kind === 'box' || s.kind === 'ground'}>
                      <div class="edi-inspector-row">
                        <label class="edi-insp-label">Material</label>
                        <select
                          value={s.material}
                          onChange={(e) => { controller?.applyMaterial(e.currentTarget.value); refresh(); }}
                        >
                          <For each={controller?.materialKeys ?? []}>
                            {(key) => <option value={key}>{key}</option>}
                          </For>
                        </select>
                      </div>
                      <div class="edi-inspector-row">
                        <CheckRow
                          label="Collidable"
                          checked={s.collidable}
                          onChange={(v) => { controller?.applyCollidable(v); refresh(); }}
                        />
                      </div>
                    </Show>

                    <Show when={s.kind === 'component'}>
                      <div class="edi-inspector-row">
                        <span class="edi-insp-label">Component</span>
                        <code class="edi-component-chip">{s.component}</code>
                      </div>
                      <For each={Object.entries(COMPONENT_PARAM_SPECS[s.component ?? ''] ?? {})}>
                        {([key, spec]) => {
                          const value = s.params[key];
                          if (spec.type === 'boolean') {
                            return (
                              <div class="edi-inspector-row">
                                <CheckRow
                                  label={spec.label ?? key}
                                  checked={Boolean(value ?? spec.default)}
                                  onChange={(v) => { controller?.updateComponentParam(key, v); refresh(); }}
                                />
                              </div>
                            );
                          }
                          if (spec.type === 'choice') {
                            return (
                              <div class="edi-inspector-row">
                                <label class="edi-insp-label">{spec.label ?? key}</label>
                                <select
                                  value={String(value ?? spec.default)}
                                  onChange={(e) => { controller?.updateComponentParam(key, e.currentTarget.value); refresh(); }}
                                >
                                  <For each={spec.choices ?? []}>
                                    {(choice) => <option value={choice}>{choice}</option>}
                                  </For>
                                </select>
                              </div>
                            );
                          }
                          return (
                            <div class="edi-inspector-row">
                              <label class="edi-insp-label">{spec.label ?? key}</label>
                              <input
                                type="number"
                                step={1}
                                value={String(value ?? spec.default)}
                                onChange={(e) => { controller?.updateComponentParam(key, parseFloat(e.currentTarget.value) || 0); refresh(); }}
                              />
                            </div>
                          );
                        }}
                      </For>
                    </Show>
                  </section>
                </>
              );
            }}
          </Show>

          <Show when={selKind() === 'light' && lightSel()}>
            {(_) => {
              const l = lightSel()!;
              return (
                <section class="edi-panel-section">
                  <header class="edi-panel-head"><span>Point Light</span></header>
                  <div class="edi-inspector-row">
                    <label class="edi-insp-label">Name</label>
                    <input
                      type="text"
                      value={l.name}
                      onBlur={(e) => { controller?.renameSelected(e.currentTarget.value); refresh(); }}
                    />
                  </div>
                  <div class="edi-field-grid">
                    <span class="edi-axis-hdr">Pos X</span>
                    <span class="edi-axis-hdr">Pos Y</span>
                    <span class="edi-axis-hdr">Pos Z</span>
                    <Field label="X" value={l.position[0]} step={snapStep()} onChange={(v) => patchLight({ position: [v, l.position[1], l.position[2]] })} />
                    <Field label="Y" value={l.position[1]} step={snapStep()} onChange={(v) => patchLight({ position: [l.position[0], v, l.position[2]] })} />
                    <Field label="Z" value={l.position[2]} step={snapStep()} onChange={(v) => patchLight({ position: [l.position[0], l.position[1], v] })} />
                    <Field label="R" value={l.color[0]} step={0.05} onChange={(v) => patchLight({ color: [v, l.color[1], l.color[2]] })} />
                    <Field label="G" value={l.color[1]} step={0.05} onChange={(v) => patchLight({ color: [l.color[0], v, l.color[2]] })} />
                    <Field label="B" value={l.color[2]} step={0.05} onChange={(v) => patchLight({ color: [l.color[0], l.color[1], v] })} />
                  </div>
                  <div class="edi-inspector-row">
                    <label class="edi-insp-label">Intensity</label>
                    <input
                      type="number"
                      step={0.1}
                      value={l.intensity.toFixed(2)}
                      onChange={(e) => patchLight({ intensity: parseFloat(e.currentTarget.value) || 0 })}
                    />
                  </div>
                  <div class="edi-inspector-row">
                    <label class="edi-insp-label">Range</label>
                    <input
                      type="number"
                      step={1}
                      value={l.range.toFixed(1)}
                      onChange={(e) => patchLight({ range: parseFloat(e.currentTarget.value) || 0 })}
                    />
                  </div>
                  <div class="edi-inspector-row">
                    <button class="edi-btn edi-btn-danger" onClick={() => { controller?.deleteSelected(); refresh(); notify('info', 'Light deleted'); }}>Delete light</button>
                  </div>
                </section>
              );
            }}
          </Show>

          <Show when={selKind() === 'spawn' && spawnSel()}>
            {(_) => {
              const s = spawnSel()!;
              return (
                <section class="edi-panel-section">
                  <header class="edi-panel-head"><span>Spawn Point {s.index + 1}</span></header>
                  <div class="edi-inspector-row">
                    <span class="edi-insp-label">Team</span>
                    <code class={`edi-team-chip edi-team-${s.team.toLowerCase()}`}>{s.team} · {s.team === 'A' ? 'south' : 'north'}</code>
                  </div>
                  <div class="edi-field-grid">
                    <span class="edi-axis-hdr">Pos X</span>
                    <span class="edi-axis-hdr">Pos Y</span>
                    <span class="edi-axis-hdr">Pos Z</span>
                    <Field label="X" value={s.position[0]} step={snapStep()} onChange={(v) => patchSpawn({ position: [v, s.position[1], s.position[2]] })} />
                    <Field label="Y" value={s.position[1]} step={snapStep()} onChange={(v) => patchSpawn({ position: [s.position[0], v, s.position[2]] })} />
                    <Field label="Z" value={s.position[2]} step={snapStep()} onChange={(v) => patchSpawn({ position: [s.position[0], s.position[1], v] })} />
                  </div>
                  <div class="edi-inspector-row">
                    <label class="edi-insp-label">Yaw °</label>
                    <input
                      type="number"
                      step={15}
                      value={(s.yaw * DEG).toFixed(0)}
                      onChange={(e) => patchSpawn({ yaw: (parseFloat(e.currentTarget.value) || 0) * RAD })}
                    />
                  </div>
                  <div class="edi-inspector-row edi-inspector-note">
                    Select the Rotate gizmo to re-aim the spawn arrow.
                  </div>
                  <div class="edi-inspector-row">
                    <button
                      class="edi-btn edi-btn-danger"
                      disabled={spawns().length <= 1}
                      onClick={() => { controller?.deleteSelected(); refresh(); notify('info', 'Spawn deleted'); }}
                    >Delete spawn</button>
                  </div>
                </section>
              );
            }}
          </Show>

          <Show when={selKind() === 'none'}>
            <div class="edi-empty-state">
              Nothing selected.<br />Click an object, light or spawn in the scene or in the lists.
            </div>
          </Show>

          <section class="edi-panel-section">
            <header class="edi-panel-head"><span>Gizmo</span></header>
            <div class="edi-gizmo-row">
              <button class={`edi-btn ${gizmoMode() === 'translate' ? 'active' : ''}`} onClick={() => handleSetGizmo('translate')}>Move</button>
              <Show when={selKind() !== 'light'}>
                <button class={`edi-btn ${gizmoMode() === 'rotate' ? 'active' : ''}`} onClick={() => handleSetGizmo('rotate')}>Rotate</button>
              </Show>
              <Show when={selKind() === 'object' && objectSel()?.kind === 'component'}>
                <button class={`edi-btn ${gizmoMode() === 'scale' ? 'active' : ''}`} onClick={() => handleSetGizmo('scale')}>Scale</button>
              </Show>
            </div>
            <div class="edi-gizmo-row">
              <button class="edi-btn" onClick={() => { controller?.frameSelected(); refresh(); }}>Focus (F)</button>
            </div>
            <div class="edi-inspector-row">
              <CheckRow label="Snap to grid" checked={snap()} onChange={handleToggleSnap} />
            </div>
            <div class="edi-snap-steps">
              <button class={`edi-btn ${snapStep() === 0.25 ? 'active' : ''}`} onClick={() => handleSnapStep(0.25)}>0.25</button>
              <button class={`edi-btn ${snapStep() === 0.5 ? 'active' : ''}`} onClick={() => handleSnapStep(0.5)}>0.5</button>
              <button class={`edi-btn ${snapStep() === 1 ? 'active' : ''}`} onClick={() => handleSnapStep(1)}>1</button>
              <button class={`edi-btn ${snapStep() === 2 ? 'active' : ''}`} onClick={() => handleSnapStep(2)}>2</button>
            </div>
          </section>
        </aside>
      </div>

      {/* ── Bottom palette ── */}
      <div class="edi-palette">
        <div class="edi-palette-group">
          <span class="edi-palette-label">Primitives</span>
          <button class="edi-palette-item" onClick={handleAddBox}>
            <span class="edi-palette-icon">▢</span>
            <span>Box</span>
          </button>
          <button class="edi-palette-item" onClick={handleAddLight}>
            <span class="edi-palette-icon">☀</span>
            <span>Light</span>
          </button>
          <button class="edi-palette-item" onClick={handleAddSpawn}>
            <span class="edi-palette-icon">⬢</span>
            <span>Spawn</span>
          </button>
        </div>
        <div class="edi-palette-group">
          <span class="edi-palette-label">Components</span>
          <For each={COMPONENTS}>
            {(comp) => (
              <button class="edi-palette-item" onClick={() => handleAddComponent(comp.id)} title={comp.hint}>
                <span class="edi-palette-icon">◆</span>
                <span>{comp.label}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* ── Status toast ── */}
      <Show when={status()}>
        <div class={`edi-toast edi-toast-${status()?.kind}`}>
          {status()?.text}
          <button class="edi-toast-close" onClick={() => setStatus(null)}>×</button>
        </div>
      </Show>
    </div>
  );
}