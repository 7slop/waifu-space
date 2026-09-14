import { For, Show, onMount, createSignal, createMemo } from 'solid-js';
import { CalendarEventItem } from '../lib/ical';
import { updateCalendarEvent, toggleTask, showToast, isSameDay, getEventsForDate, startOfWeek } from '../lib/store';
import { state } from '../lib/store';
import { layoutTimedEvents } from '../lib/calendar-layout';
import { minuteFromClientY, snapMinute } from '../lib/calendar-drag';
import { useNow, timePercentOfDay } from '../lib/live-time';
import { t, getLocale, holidayTooltip, hourMinute, formatClock } from '../lib/i18n';
import { countryFlagEmoji } from '../lib/countries';
import { onActivateKey } from '../lib/accessibility';
import { PhArrowsClockwise, PhMapPin, GlyphText } from './icons';

export function CalendarWeekView(props: {
  currentDate: Date;
  events: CalendarEventItem[];
  dayCount?: number;
  onSelectSlot: (d: Date) => void;
  onSelectRange?: (range: { start: Date; end: Date }) => void;
  onOpenEvent: (ev: CalendarEventItem, anchorRect?: DOMRect) => void;
  onRequestMove?: (ev: CalendarEventItem, start: Date, end: Date, dateKey?: string) => void;
}) {
  let scrollContainerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (scrollContainerRef) {
      scrollContainerRef.scrollTop = 480; // Scroll to 8 AM
    }
  });

  const getStartOfWeek = (d: Date) => startOfWeek(d, state.settings.weekStart ?? 0);

  const weekDays = () => {
    const start = getStartOfWeek(props.currentDate);
    const days: Date[] = [];
    for (let i = 0; i < (props.dayCount ?? 7); i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const today = new Date();

  const now = useNow();
  const currentTimePercent = () => timePercentOfDay(now());

  const handleDragStart = (e: DragEvent, ev: CalendarEventItem) => {
    if (ev._holiday) {
      e.preventDefault();
      return;
    }
    // Timed events/tasks use the pointer-based move-drag with a live placement
    // preview (see startEventDrag); only all-day pills route through native DnD.
    if (!ev.allDay) {
      e.preventDefault();
      return;
    }
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'calendar-event', id: ev.id, dateKey: ev.dateKey }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };

  // Resolve a drop anywhere inside a day column to a day minute (0..1439) with
  // 5-minute precision. Conservative clamping keeps drops on the bottom edge
  // from wrapping into the next day.
  const minuteFromColumn = (e: DragEvent | MouseEvent): number => {
    const colEl = (e.target as HTMLElement).closest('.week-day-column') as HTMLElement | null;
    if (!colEl) return 0;
    return Math.min(1425, minuteFromClientY(e.clientY, colEl));
  };

  const handleDrop = (e: DragEvent, targetDay: Date) => {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.type !== 'calendar-event' && data.type !== 'sidebar-task') return;
      const ev = props.events.find(x => x.id === data.id);
      if (!ev) return;
      // Country holidays are read-only and must never be moved by a drop.
      if (ev._holiday) return;

      const oldStart = new Date(ev.start);
      const oldEnd = new Date(ev.end || ev.start);
      const duration = oldEnd.getTime() - oldStart.getTime();

      const minute = minuteFromColumn(e);
      const newStart = new Date(targetDay);
      newStart.setHours(0, 0, 0, 0);
      newStart.setMinutes(minute);
      const newEnd = new Date(newStart.getTime() + (duration > 0 ? duration : 3600000));

      const m60 = minute % 60;
      const minStr = m60 < 10 ? '0' + m60 : m60;
      const dateStr = `${newStart.toLocaleDateString(getLocale())} ${Math.floor(minute / 60)}:${minStr}`;

      if (data.dateKey && ev.recurrence && ev.recurrence !== 'none' && props.onRequestMove) {
        props.onRequestMove(ev, newStart, newEnd, data.dateKey);
        showToast(t('calendar.toasts.rescheduled', { title: ev.title, date: dateStr }));
        return;
      }

      updateCalendarEvent(ev.id, {
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });
      showToast(t('calendar.toasts.rescheduled', {
        title: ev.title,
        date: dateStr
      }));
    } catch (err) {
      console.error(err);
    }
  };

  // ---- Event move-drag with live placement preview (5-min snap) ----
  interface DragMoveState {
    id: string;
    dateKey?: string;
    title: string;
    color: string;
    durationMin: number;
    dayIndex: number;
    startMin: number;
    moved: boolean;
  }
  const [dragMove, setDragMove] = createSignal<DragMoveState | null>(null);
  // A real drag also produces a click on release; swallow that click so the
  // event modal does not pop open right after a move.
  let suppressClickAfterDrag = false;

  const activeDrag = () => {
    const d = dragMove();
    return d && d.moved ? d : null;
  };

  const startEventDrag = (e: MouseEvent, ev: CalendarEventItem) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.event-resize-handle') || target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
    if (ev._holiday) return;
    e.preventDefault();
    e.stopPropagation();

    const s = new Date(ev.start);
    const e2 = new Date(ev.end || ev.start);
    const durationMin = Math.max(30, Math.round((e2.getTime() - s.getTime()) / 60000));
    const colEl = (e.currentTarget as HTMLElement).closest('.week-day-column') as HTMLElement | null;
    const dayIndex = colEl ? Number(colEl.dataset.dayIndex ?? 0) : 0;

    setDragMove({
      id: ev.id,
      dateKey: ev.dateKey,
      title: ev.title,
      color: ev.color || '#ff6584',
      durationMin,
      dayIndex,
      startMin: snapMinute(s.getHours() * 60 + s.getMinutes()),
      moved: false
    });

    const onMove = (moveEv: MouseEvent) => {
      if (typeof document !== 'undefined') document.body.classList.add('is-dragging-event');
      const colEl = (moveEv.target as HTMLElement).closest('.week-day-column') as HTMLElement | null;
      setDragMove(prev => {
        if (!prev || !colEl) return prev;
        const idx = Number(colEl.dataset.dayIndex ?? prev.dayIndex);
        const snapped = minuteFromClientY(moveEv.clientY, colEl);
        const maxStart = 1440 - prev.durationMin;
        return {
          ...prev,
          dayIndex: idx,
          startMin: Math.max(0, Math.min(maxStart, snapMinute(snapped))),
          moved: true
        };
      });
    };

    const onKey = (k: KeyboardEvent) => {
      if (k.key !== 'Escape') return;
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKey);
      }
      if (typeof document !== 'undefined') document.body.classList.remove('is-dragging-event');
      setDragMove(null);
    };

    const onUp = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKey);
      }
      if (typeof document !== 'undefined') document.body.classList.remove('is-dragging-event');

      const d = dragMove();
      setDragMove(null);
      if (!d || !d.moved) return; // not a drag, plain click

      const evt = props.events.find(x => x.id === d.id);
      if (!evt || evt._holiday) return;
      const targetDay = weekDays()[d.dayIndex];
      if (!targetDay) return; // dragged outside the grid — cancel

      const minute = Math.min(d.startMin, 1425);
      const newStart = new Date(targetDay);
      newStart.setHours(0, 0, 0, 0);
      newStart.setMinutes(minute);
      const newEnd = new Date(newStart.getTime() + d.durationMin * 60000);

      suppressClickAfterDrag = true;

      const m60 = minute % 60;
      const dateStr = `${newStart.toLocaleDateString(getLocale())} ${Math.floor(minute / 60)}:${m60 < 10 ? '0' + m60 : m60}`;

      if (d.dateKey && evt.recurrence && evt.recurrence !== 'none' && props.onRequestMove) {
        props.onRequestMove(evt, newStart, newEnd, d.dateKey);
      } else {
        updateCalendarEvent(evt.id, {
          start: newStart.toISOString(),
          end: newEnd.toISOString()
        });
      }
      showToast(t('calendar.toasts.rescheduled', { title: evt.title, date: dateStr }));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('keydown', onKey);
    }
  };

  // ---- Event resize (Google Calendar style) ----
  interface ResizeState {
    id: string;
    edge: 'top' | 'bottom';
    startOfDay: Date;
    oldStartMin: number;
    oldEndMin: number;
    newStartMin: number;
    newEndMin: number;
  }
  const [resize, setResize] = createSignal<ResizeState | null>(null);

  const startResize = (e: MouseEvent, ev: CalendarEventItem, edge: 'top' | 'bottom') => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (ev._holiday) return;

    const s = new Date(ev.start);
    const startOfDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const oldStartMin = s.getHours() * 60 + s.getMinutes();
    const e2 = new Date(ev.end || ev.start);
    const oldEndMin = e2.getHours() * 60 + e2.getMinutes();

    const colEl = (e.currentTarget as HTMLElement).closest('.week-day-column') as HTMLElement | null;
    if (!colEl) return;

    setResize({ id: ev.id, edge, startOfDay, oldStartMin, oldEndMin, newStartMin: oldStartMin, newEndMin: oldEndMin });
    if (typeof document !== 'undefined') document.body.classList.add('is-resizing-event');

    const onMove = (moveEv: MouseEvent) => {
      const rect = colEl.getBoundingClientRect();
      const relY = Math.max(0, Math.min(rect.height - 1, moveEv.clientY - rect.top));
      const minute = Math.min(1425, snapMinute((relY / rect.height) * 1440));
      setResize(prev => {
        if (!prev) return prev;
        let { newStartMin, newEndMin } = prev;
        if (prev.edge === 'top') {
          newStartMin = Math.min(minute, prev.oldEndMin - 30);
        } else {
          newEndMin = Math.max(minute, prev.oldStartMin + 30);
        }
        return { ...prev, newStartMin, newEndMin };
      });
    };

    const onUp = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      if (typeof document !== 'undefined') document.body.classList.remove('is-resizing-event');

      const r = resize();
      setResize(null);
      if (!r) return;
      if (r.newStartMin === r.oldStartMin && r.newEndMin === r.oldEndMin) return;

      const target = props.events.find(x => x.id === r.id);
      if (!target) return;
      const newStart = new Date(r.startOfDay);
      newStart.setMinutes(r.newStartMin);
      const newEnd = new Date(r.startOfDay);
      newEnd.setMinutes(r.newEndMin);

      if (target.recurrence && target.recurrence !== 'none') {
        updateCalendarEvent(target.id, { start: newStart.toISOString(), end: newEnd.toISOString() }, target.dateKey);
      } else {
        updateCalendarEvent(target.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
      }
      showToast(t('calendar.toasts.resized', { title: target.title }));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  };

  const applyResizePreview = (ev: CalendarEventItem, layout: { topPct: number; heightPct: number }) => {
    const r = resize();
    if (!r || r.id !== ev.id) return layout;
    const topMin = r.edge === 'top' ? r.newStartMin : r.oldStartMin;
    const endMin = r.edge === 'bottom' ? r.newEndMin : r.oldEndMin;
    return {
      ...layout,
      topPct: Math.max(0, (topMin / 1440) * 100),
      heightPct: Math.max(2.2, ((endMin - topMin) / 1440) * 100)
    };
  };

  // Click-and-drag to create
  interface DragCreateState {
    day: Date;
    startMin: number;
    currentMin: number;
    hasMoved: boolean;
  }
  const [dragCreate, setDragCreate] = createSignal<DragCreateState | null>(null);

  const startDragCreate = (e: MouseEvent, day: Date) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.week-event-card') || target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
      return;
    }

    const colEl = e.currentTarget as HTMLElement;
    const rect = colEl.getBoundingClientRect();
    const relY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
    const fraction = relY / rect.height;
    const exactMin = fraction * 1440;
    const snappedMin = snapMinute(exactMin);

    const initial = {
      day,
      startMin: snappedMin,
      currentMin: Math.min(1440, snappedMin + 30),
      hasMoved: false
    };
    setDragCreate(initial);

    const onMouseMove = (moveEv: MouseEvent) => {
      const currRect = colEl.getBoundingClientRect();
      const currRelY = Math.max(0, Math.min(currRect.height - 1, moveEv.clientY - currRect.top));
      const currFrac = currRelY / currRect.height;
      const currExactMin = currFrac * 1440;
      const currSnappedMin = snapMinute(currExactMin);

      setDragCreate(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentMin: Math.max(0, Math.min(1440, currSnappedMin)),
          hasMoved: true
        };
      });
    };

    const onMouseUp = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      const state = dragCreate();
      if (!state) return;

      const minM = Math.min(state.startMin, state.currentMin);
      let maxM = Math.max(state.startMin, state.currentMin);
      if (maxM - minM < 15) maxM = minM + 30;

      const startDate = new Date(state.day);
      startDate.setHours(Math.floor(minM / 60), minM % 60, 0, 0);

      const endDate = new Date(state.day);
      endDate.setHours(Math.floor(maxM / 60), maxM % 60, 0, 0);

      setDragCreate(null);

      if (state.hasMoved && props.onSelectRange) {
        props.onSelectRange({ start: startDate, end: endDate });
      } else {
        props.onSelectSlot(startDate);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  const formatDragTime = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return hourMinute(h, m);
  };

  return (
    <div class="week-view-container" style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      {/* Week Header */}
      <div class="week-header-row">
        <div class="time-gutter-header">GMT</div>
        <For each={weekDays()}>
          {d => {
            const isT = isSameDay(d, today);
            return (
              <div class={`week-header-day ${isT ? 'today' : ''}`}>
                <span class="week-day-name">
                  {d.toLocaleDateString(getLocale(), { weekday: 'short' })}
                </span>
                <span class={`week-day-num ${isT ? 'today-badge' : ''}`}>
                  {d.getDate()}
                </span>
              </div>
            );
          }}
        </For>
      </div>

      {/* All-Day Strip */}
      <div class="week-allday-strip">
        <div class="allday-gutter">{t('calendar.alldayLabel')}</div>
        <For each={weekDays()}>
          {day => {
            const alldayEvents = () => getEventsForDate(props.events, day).filter(ev => ev.allDay);
            return (
              <div class="week-allday-day">
                <For each={alldayEvents()}>
                  {ev => (
                    <div
                      class={`allday-pill ${ev._holiday ? 'holiday' : ''}`}
                      style={{ background: ev.color || '#ff6584' }}
                      role="button"
                      tabindex="0"
                      aria-label={t('calendar.a11y.openEvent', { title: ev.title })}
                      title={ev._holiday ? holidayTooltip(ev._holiday) : undefined}
                      draggable={!ev._holiday}
                      onDragStart={e => handleDragStart(e, ev)}
                      onClick={e => {
                        e.stopPropagation();
                        props.onOpenEvent(ev, e.currentTarget.getBoundingClientRect());
                      }}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        props.onOpenEvent(ev, e.currentTarget.getBoundingClientRect());
                      }}
                      onKeyDown={e => onActivateKey(e, () => props.onOpenEvent(ev))}
                    >
                      {ev.type === 'task' && (
                        <input
                          type="checkbox"
                          class="pill-task-check"
                          checked={ev.completed}
                          onClick={e => {
                            e.stopPropagation();
                            toggleTask(ev.id, ev.dateKey);
                          }}
                        />
                      )}
                      {ev._holiday && <span class="pill-holiday-flag"><GlyphText text={ev._holiday.culture ? '🎉' : countryFlagEmoji(ev._holiday.countryCode)} /></span>}
                      <span class="allday-pill-title">{ev.title}</span>
                    </div>
                  )}
                </For>
              </div>
            );
          }}
        </For>
      </div>

      {/* 24-Hour Time Grid */}
      <div class="week-time-grid" ref={scrollContainerRef}>
<div class="time-gutter">
          <For each={Array.from({ length: 24 })}>
            {(_, idx) => {
              const h = idx();
              // Memoized so the gutter re-renders instantly when the
              // 12h/24h setting changes (a plain read inside <For> wouldn't).
              const label = createMemo(() => (h === 0 ? '' : hourMinute(h, 0)));
              return (
                <div class="time-slot-label">
                  <span>{label()}</span>
                </div>
              );
            }}
          </For>
        </div>

        <div class="week-columns-wrapper">
          <For each={weekDays()}>
            {(day, idx) => {
              const isT = isSameDay(day, today);
              const dayEvents = () => getEventsForDate(props.events, day);
              const timedLayouts = () => layoutTimedEvents(dayEvents().filter(ev => !ev.allDay));

              return (
                <div
                  class={`week-day-column ${isT ? 'today-col' : ''}`}
                  data-day-index={idx()}
                  onMouseDown={e => startDragCreate(e, day)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, day)}
                >
                  <For each={Array.from({ length: 24 })}>
                    {(_, idx) => {
                      void idx;
                      return (
                        <div class="week-hour-cell" />
                      );
                    }}
                  </For>

                  {isT && (
                    <div
                      class="current-time-line"
                      style={{ top: `${currentTimePercent()}%` }}
                    />
                  )}

                  {/* Drag-to-create Ghost Preview Box */}
                  <Show when={dragCreate()} keyed>
                    {(dc) => {
                      if (!isSameDay(dc.day, day)) return null;
                      const start = Math.min(dc.startMin, dc.currentMin);
                      const end = Math.max(dc.startMin, dc.currentMin, start + 15);
                      const topPct = (start / 1440) * 100;
                      const heightPct = Math.max(1.6, ((end - start) / 1440) * 100);

                      return (
                        <div
                          class="drag-create-preview"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`
                          }}
                        >
                          <span class="drag-create-title">(New Event)</span>
                          <span class="drag-create-time">
                            {formatDragTime(start)} – {formatDragTime(end)}
                          </span>
                        </div>
                      );
                    }}
                  </Show>

                  {/* Drag-to-move placement preview (event snaps to the target slot) */}
                  <Show when={activeDrag()}>
                    {(drag) => {
                      const d = drag();
                      if (d.dayIndex !== idx()) return null;
                      const topPct = (d.startMin / 1440) * 100;
                      const heightPct = Math.max(2.2, (d.durationMin / 1440) * 100);
                      return (
                        <div
                          class="drag-move-preview"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            background: d.color
                          }}
                        >
                          <span class="drag-preview-title">{d.title}</span>
                          <span class="drag-preview-time">
                            {formatDragTime(d.startMin)} – {formatDragTime(d.startMin + d.durationMin)}
                          </span>
                        </div>
                      );
                    }}
                  </Show>

                  <div class="week-events-layer">
                    <For each={timedLayouts()}>
                      {layout => {
                            const ev = layout.ev;
                            const s = new Date(ev.start);
                            // Memoized so the label updates in place when the
                            // time format setting is switched.
                            const timeStr = createMemo(() => `${formatClock(s)}`);
                            const isResizing = resize()?.id === ev.id;
                            const preview = applyResizePreview(ev, layout);

                            return (
                              <div
                                class={`week-event-card ${ev.type === 'task' && ev.completed ? 'completed' : ''} ${isResizing ? 'is-resizing' : ''} ${dragMove()?.id === ev.id && dragMove()?.moved ? 'is-dragging-source' : ''}`}
                                style={{
                                  top: `${preview.topPct}%`,
                                  height: `${preview.heightPct}%`,
                                  left: `calc(${layout.leftPct}% + 2px)`,
                                  width: `calc(${layout.widthPct}% - 4px)`,
                                  background: ev.color || '#ff6584'
                                }}
                                role="button"
                                tabindex="0"
                                aria-label={t('calendar.a11y.openEvent', { title: ev.title })}
                                onMouseDown={e => startEventDrag(e, ev)}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (suppressClickAfterDrag) {
                                    suppressClickAfterDrag = false;
                                    return;
                                  }
                                  props.onOpenEvent(ev, e.currentTarget.getBoundingClientRect());
                                }}
                                onContextMenu={e => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  props.onOpenEvent(ev, e.currentTarget.getBoundingClientRect());
                                }}
                                onKeyDown={e => onActivateKey(e, () => props.onOpenEvent(ev))}
                              >
                                <div
                                  class="event-resize-handle top"
                                  onMouseDown={e => startResize(e, ev, 'top')}
                                  aria-hidden="true"
                                />
                                <div class="event-card-header">
                                  {ev.type === 'task' && (
                                    <input
                                      type="checkbox"
                                      class="card-task-check"
                                      checked={ev.completed}
                                      onClick={e => {
                                        e.stopPropagation();
                                        toggleTask(ev.id, ev.dateKey);
                                      }}
                                    />
                                  )}
                                  <span class="card-title">{ev.title}</span>
                                  {ev.recurrence && ev.recurrence !== 'none' && (
                                    <span class="card-repeat-icon" title={`Repeats: ${ev.recurrence}`}><PhArrowsClockwise /></span>
                                  )}
                                </div>
                                <span class="card-time">{timeStr()}</span>
                                {ev.location && <span class="card-loc"><PhMapPin /> {ev.location}</span>}
                                <div
                                  class="event-resize-handle"
                                  onMouseDown={e => startResize(e, ev, 'bottom')}
                                  aria-hidden="true"
                                />
                              </div>
                            );
                          }}
                        </For>
                      </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
