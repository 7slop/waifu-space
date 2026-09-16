import { createSignal, onCleanup } from 'solid-js';
import { EmojiIcon } from './icons';
import '../styles/strike.css';

/**
 * Minimal surface the mobile touch overlay needs from the Strike engine.
 * StrikeBabylonEngine satisfies this structurally so tests can fake it.
 */
export interface StrikeTouchSink {
  setTouchMove(x: number, y: number): void;
  addTouchLook(dx: number, dy: number): void;
  setTouchFire(pressed: boolean): void;
  setTouchSecondary(pressed: boolean): void;
  setTouchCrouch(pressed: boolean): void;
  queueTouchJump(): void;
  cycleWeapon(dir: 1 | -1): void;
  toggleGrenadeArmed(): void;
  reload(): void;
  clearTouchInput(): void;
}

interface StrikeTouchControlsProps {
  sink: () => StrikeTouchSink | null;
}

const STICK_RADIUS = 52;

function suppress(e: { stopPropagation(): void; preventDefault(): void }) {
  e.stopPropagation();
  e.preventDefault();
}

export function StrikeTouchControls(props: StrikeTouchControlsProps) {
  let stickBaseRef!: HTMLDivElement;
  const [stick, setStick] = createSignal({ x: 0, y: 0 });
  let stickPointerId: number | null = null;
  let lookPointerId: number | null = null;
  let lookLastX = 0;
  let lookLastY = 0;

  onCleanup(() => {
    props.sink()?.clearTouchInput();
  });

  const handleStickDown = (e: PointerEvent) => {
    if (stickPointerId !== null) return;
    suppress(e);
    stickPointerId = e.pointerId;
    stickBaseRef.setPointerCapture(e.pointerId);
    updateStick(e);
  };

  const updateStick = (e: PointerEvent) => {
    if (stickPointerId !== e.pointerId) return;
    const rect = stickBaseRef.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    setStick({ x: dx, y: dy });
    const nx = dx / STICK_RADIUS;
    const ny = dy / STICK_RADIUS;
    props.sink()?.setTouchMove(nx, -ny);
  };

  const releaseStick = (e: PointerEvent) => {
    if (stickPointerId !== e.pointerId) return;
    stickPointerId = null;
    setStick({ x: 0, y: 0 });
    props.sink()?.setTouchMove(0, 0);
    try {
      stickBaseRef.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleLookDown = (e: PointerEvent) => {
    if (lookPointerId !== null) return;
    suppress(e);
    lookPointerId = e.pointerId;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    lookLastX = e.clientX;
    lookLastY = e.clientY;
  };

  const handleLookMove = (e: PointerEvent) => {
    if (lookPointerId !== e.pointerId) return;
    suppress(e);
    const dx = e.clientX - lookLastX;
    const dy = e.clientY - lookLastY;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      props.sink()?.addTouchLook(dx, dy);
    }
  };

  const releaseLook = (e: PointerEvent) => {
    if (lookPointerId !== e.pointerId) return;
    lookPointerId = null;
    lookLastX = 0;
    lookLastY = 0;
    try {
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  /** Reusable handler factory for momentary (hold) action buttons. */
  const holdButton =
    (press: () => void, release: () => void) =>
    (e: PointerEvent) => {
      suppress(e);
      if (e.type === 'pointerdown') {
        press();
      } else if (e.type === 'pointerup' || e.type === 'pointerleave' || e.type === 'pointercancel') {
        release();
      }
    };

  const tapButton =
    (action: () => void) =>
    (e: PointerEvent) => {
      suppress(e);
      if (e.type === 'pointerdown' || e.type === 'pointerup') {
        if (e.type === 'pointerup') action();
      }
    };

  return (
    <div class="stc-overlay" data-testid="stc-overlay" aria-hidden="true">
      {/* Right-side camera look pad (rest of the stage). */}
      <div
        class="stc-look-zone"
        data-testid="stc-look-zone"
        onPointerDown={(e) => handleLookDown(e as PointerEvent)}
        onPointerMove={(e) => handleLookMove(e as PointerEvent)}
        onPointerUp={(e) => releaseLook(e as PointerEvent)}
        onPointerCancel={(e) => releaseLook(e as PointerEvent)}
      />

      {/* Left-side virtual movement joystick. */}
      <div
        class="stc-joystick"
        ref={stickBaseRef}
        data-testid="stc-joystick"
        onPointerDown={(e) => handleStickDown(e as PointerEvent)}
        onPointerMove={(e) => updateStick(e as PointerEvent)}
        onPointerUp={(e) => releaseStick(e as PointerEvent)}
        onPointerCancel={(e) => releaseStick(e as PointerEvent)}
      >
        <div class="stc-joystick-base">
          <div
            class="stc-joystick-knob"
            style={{
              transform: `translate(${stick().x}px, ${stick().y}px)`
            }}
          />
        </div>
      </div>

      {/* Right-side action buttons. */}
      <div class="stc-buttons" data-testid="stc-buttons">
        <div class="stc-btn-row">
          <button
            class="stc-btn stc-btn-secondary"
            data-testid="stc-aim"
            type="button"
            onPointerDown={(e) => holdButton(() => props.sink()?.setTouchSecondary(true), () => props.sink()?.setTouchSecondary(false))(e as PointerEvent)}
            onPointerUp={(e) => holdButton(() => props.sink()?.setTouchSecondary(true), () => props.sink()?.setTouchSecondary(false))(e as PointerEvent)}
            onPointerLeave={(e) => holdButton(() => props.sink()?.setTouchSecondary(true), () => props.sink()?.setTouchSecondary(false))(e as PointerEvent)}
            onPointerCancel={(e) => holdButton(() => props.sink()?.setTouchSecondary(true), () => props.sink()?.setTouchSecondary(false))(e as PointerEvent)}
          >
            <EmojiIcon glyph="🎯" />
          </button>
          <button
            class="stc-btn stc-btn-fire"
            data-testid="stc-fire"
            type="button"
            onPointerDown={(e) => holdButton(() => props.sink()?.setTouchFire(true), () => props.sink()?.setTouchFire(false))(e as PointerEvent)}
            onPointerUp={(e) => holdButton(() => props.sink()?.setTouchFire(true), () => props.sink()?.setTouchFire(false))(e as PointerEvent)}
            onPointerLeave={(e) => holdButton(() => props.sink()?.setTouchFire(true), () => props.sink()?.setTouchFire(false))(e as PointerEvent)}
            onPointerCancel={(e) => holdButton(() => props.sink()?.setTouchFire(true), () => props.sink()?.setTouchFire(false))(e as PointerEvent)}
          >
            <EmojiIcon glyph="🔥" />
          </button>
          <button
            class="stc-btn stc-btn-jump"
            data-testid="stc-jump"
            type="button"
            onPointerDown={(e) => tapButton(() => props.sink()?.queueTouchJump())(e as PointerEvent)}
            onPointerUp={(e) => tapButton(() => props.sink()?.queueTouchJump())(e as PointerEvent)}
          >
            <EmojiIcon glyph="⬆" />
          </button>
        </div>
        <div class="stc-btn-row">
          <button
            class="stc-btn"
            data-testid="stc-reload"
            type="button"
            onPointerDown={(e) => tapButton(() => props.sink()?.reload())(e as PointerEvent)}
            onPointerUp={(e) => tapButton(() => props.sink()?.reload())(e as PointerEvent)}
          >
            <EmojiIcon glyph="🔄" />
          </button>
          <button
            class="stc-btn"
            data-testid="stc-grenade"
            type="button"
            onPointerDown={(e) => tapButton(() => props.sink()?.toggleGrenadeArmed())(e as PointerEvent)}
            onPointerUp={(e) => tapButton(() => props.sink()?.toggleGrenadeArmed())(e as PointerEvent)}
          >
            <EmojiIcon glyph="💣" />
          </button>
          <button
            class="stc-btn"
            data-testid="stc-cycle"
            type="button"
            onPointerDown={(e) => tapButton(() => props.sink()?.cycleWeapon(1))(e as PointerEvent)}
            onPointerUp={(e) => tapButton(() => props.sink()?.cycleWeapon(1))(e as PointerEvent)}
          >
            <EmojiIcon glyph="🔁" />
          </button>
          <button
            class="stc-btn"
            data-testid="stc-crouch"
            type="button"
            onPointerDown={(e) => holdButton(() => props.sink()?.setTouchCrouch(true), () => props.sink()?.setTouchCrouch(false))(e as PointerEvent)}
            onPointerUp={(e) => holdButton(() => props.sink()?.setTouchCrouch(true), () => props.sink()?.setTouchCrouch(false))(e as PointerEvent)}
            onPointerLeave={(e) => holdButton(() => props.sink()?.setTouchCrouch(true), () => props.sink()?.setTouchCrouch(false))(e as PointerEvent)}
            onPointerCancel={(e) => holdButton(() => props.sink()?.setTouchCrouch(true), () => props.sink()?.setTouchCrouch(false))(e as PointerEvent)}
          >
            <EmojiIcon glyph="🤸" />
          </button>
        </div>
      </div>
    </div>
  );
}