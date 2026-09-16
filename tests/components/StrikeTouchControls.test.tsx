import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { StrikeTouchControls, StrikeTouchSink } from '../../src/components/StrikeTouchControls';

function createSink() {
  const calls = {
    setTouchMove: [] as Array<[number, number]>,
    addTouchLook: [] as Array<[number, number]>,
    setTouchFire: [] as boolean[],
    setTouchSecondary: [] as boolean[],
    setTouchCrouch: [] as boolean[],
    queueTouchJump: 0,
    cycleWeapon: 0,
    toggleGrenadeArmed: 0,
    reload: 0,
    clearTouchInput: 0
  };
  const sink: StrikeTouchSink = {
    setTouchMove: (x, y) => calls.setTouchMove.push([x, y]),
    addTouchLook: (dx, dy) => calls.addTouchLook.push([dx, dy]),
    setTouchFire: (p) => calls.setTouchFire.push(p),
    setTouchSecondary: (p) => calls.setTouchSecondary.push(p),
    setTouchCrouch: (p) => calls.setTouchCrouch.push(p),
    queueTouchJump: () => calls.queueTouchJump++,
    cycleWeapon: () => calls.cycleWeapon++,
    toggleGrenadeArmed: () => calls.toggleGrenadeArmed++,
    reload: () => calls.reload++,
    clearTouchInput: () => calls.clearTouchInput++
  };
  return { sink, calls };
}

describe('StrikeTouchControls', () => {
  afterEach(cleanup);

  it('fires while the fire button is held and stops on release', () => {
    const { sink, calls } = createSink();
    render(() => <StrikeTouchControls sink={() => sink} />);

    const fire = screen.getByTestId('stc-fire') as HTMLButtonElement;
    fireEvent.pointerDown(fire, { pointerId: 1 });
    expect(calls.setTouchFire).toEqual([true]);
    fireEvent.pointerUp(fire, { pointerId: 1 });
    expect(calls.setTouchFire).toEqual([true, false]);
  });

  it('fires a single jump per tap', () => {
    const { sink, calls } = createSink();
    render(() => <StrikeTouchControls sink={() => sink} />);

    const jump = screen.getByTestId('stc-jump') as HTMLButtonElement;
    fireEvent.pointerDown(jump, { pointerId: 1 });
    fireEvent.pointerUp(jump, { pointerId: 1 });
    expect(calls.queueTouchJump).toBe(1);
  });

  it('maps joystick drags to normalized move input and resets on release', () => {
    const { sink, calls } = createSink();
    render(() => <StrikeTouchControls sink={() => sink} />);

    const stick = screen.getByTestId('stc-joystick') as HTMLDivElement;
    // happy-dom returns a zero rect, so the base center is (0, 0).
    fireEvent.pointerDown(stick, { pointerId: 7, clientX: 110, clientY: 110 });
    fireEvent.pointerMove(stick, { pointerId: 7, clientX: 140, clientY: 150 });

    const lastSet = calls.setTouchMove[calls.setTouchMove.length - 1];
    expect(Math.hypot(lastSet[0], lastSet[1])).toBeGreaterThan(0);
    expect(Math.abs(lastSet[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(lastSet[1])).toBeLessThanOrEqual(1);
    // Distance 150 > 52 radius -> clamped to the rim
    expect(Math.hypot(lastSet[0], lastSet[1])).toBeCloseTo(1, 5);

    fireEvent.pointerUp(stick, { pointerId: 7 });
    expect(calls.setTouchMove[calls.setTouchMove.length - 1]).toEqual([0, 0]);
  });

  it('feeds look deltas from the look pad drag', () => {
    const { sink, calls } = createSink();
    render(() => <StrikeTouchControls sink={() => sink} />);

    const look = screen.getByTestId('stc-look-zone') as HTMLDivElement;
    fireEvent.pointerDown(look, { pointerId: 3, clientX: 600, clientY: 200 });
    fireEvent.pointerMove(look, { pointerId: 3, clientX: 630, clientY: 210 });
    fireEvent.pointerMove(look, { pointerId: 3, clientX: 650, clientY: 250 });
    fireEvent.pointerUp(look, { pointerId: 3 });

    expect(calls.addTouchLook).toEqual([
      [30, 10],
      [20, 40]
    ]);
  });

  it('clears touch input on unmount', () => {
    const { sink, calls } = createSink();
    const { unmount } = render(() => <StrikeTouchControls sink={() => sink} />);
    expect(calls.clearTouchInput).toBe(0);
    unmount();
    expect(calls.clearTouchInput).toBeGreaterThan(0);
  });

  it('routes utility buttons (reload, grenade, cycle, crouch, aim)', () => {
    const { sink, calls } = createSink();
    render(() => <StrikeTouchControls sink={() => sink} />);

    fireEvent.pointerDown(screen.getByTestId('stc-reload'), { pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId('stc-reload'), { pointerId: 1 });
    expect(calls.reload).toBe(1);

    fireEvent.pointerDown(screen.getByTestId('stc-grenade'), { pointerId: 2 });
    fireEvent.pointerUp(screen.getByTestId('stc-grenade'), { pointerId: 2 });
    expect(calls.toggleGrenadeArmed).toBe(1);

    fireEvent.pointerDown(screen.getByTestId('stc-cycle'), { pointerId: 3 });
    fireEvent.pointerUp(screen.getByTestId('stc-cycle'), { pointerId: 3 });
    expect(calls.cycleWeapon).toBe(1);

    fireEvent.pointerDown(screen.getByTestId('stc-crouch'), { pointerId: 4 });
    expect(calls.setTouchCrouch[calls.setTouchCrouch.length - 1]).toBe(true);
    fireEvent.pointerUp(screen.getByTestId('stc-crouch'), { pointerId: 4 });
    expect(calls.setTouchCrouch[calls.setTouchCrouch.length - 1]).toBe(false);

    fireEvent.pointerDown(screen.getByTestId('stc-aim'), { pointerId: 5 });
    expect(calls.setTouchSecondary[calls.setTouchSecondary.length - 1]).toBe(true);
    fireEvent.pointerUp(screen.getByTestId('stc-aim'), { pointerId: 5 });
    expect(calls.setTouchSecondary[calls.setTouchSecondary.length - 1]).toBe(false);
  });
});