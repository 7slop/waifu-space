// Reactive "now" clock. Components use it to re-compute derived values (e.g.
// the calendar current-time line) on a cadence instead of the frozen result of
// a single `new Date()` read. Ticks every minute by default.
import { createSignal, onCleanup } from 'solid-js';

export function useNow(intervalMs = 60_000): () => Date {
  const [now, setNow] = createSignal(new Date());
  const id = setInterval(() => setNow(new Date()), intervalMs);
  onCleanup(() => clearInterval(id));
  return now;
}

export function timePercentOfDay(d: Date): number {
  const minutes = d.getHours() * 60 + d.getMinutes();
  return (minutes / 1440) * 100;
}