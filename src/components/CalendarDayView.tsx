import { For, Show, onMount, createSignal } from 'solid-js';
import { CalendarEventItem } from '../lib/ical';
import { updateCalendarEvent, toggleTask, showToast, isSameDay, getEventsForDate } from '../lib/store';
import { layoutTimedEvents } from '../lib/calendar-layout';
import { t, getLocale, holidayTooltip } from '../lib/i18n';
import { countryFlagEmoji } from '../lib/countries';
import { onActivateKey } from '../lib/accessibility';
import { PhArrowsClockwise, PhMapPin, GlyphText } from './icons';

export function CalendarDayView(props: {
  currentDate: Date;
  events: CalendarEventItem[];
  onSelectSlot: (d: Date) => void;
  onSelectRange?: (range: { start: Date; end: Date }) => void;
  onOpenEvent: (ev: CalendarEventItem, anchorRect?: DOMRect) => void;
  onRequestMove?: (ev: CalendarEventItem, start: Date, end: Date, dateKey?: string) => void;
}) {
  let scrollContainerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (scrollContainerRef) {
      scrollContainerRef.scrollTop = 480;
    }
  });

  const today = new Date();
  const isToday = () => isSameDay(props.currentDate, today);

  const dayEvents = () => getEventsForDate(props.events, props.currentDate);
  const allDayEvents = () => dayEvents().filter(ev => ev.allDay);
  const timedLayouts = () => layoutTimedEvents(dayEvents().filter(ev => !ev.allDay));

  const getCurrentTimePercent = () => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return (minutes / 1440) * 100;
  };

const handleDragStart = (e: DragEvent, ev: CalendarEventItem) => {
    if (!e.dataTransfer) return;
    if (ev._holiday) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'calendar-event', id: ev.id, dateKey: ev.dateKey }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };

  const minuteFromColumn = (e: DragEvent | MouseEvent): number => {
    const colEl = (e.target as HTMLElement).closest('.week-day-column') as HTMLElement | null;
    if (!colEl) return 0;
    const rect = colEl.getBoundingClientRect();
    const relY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
    return Math.max(0, Math.min(1425, Math.round((relY / rect.height) * 96) * 15));
  };

  const handleDrop = (e: DragEvent) => {
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
      const newStart = new Date(props.currentDate);
      newStart.setHours(0, 0, 0, 0);
      newStart.setMinutes(minute);
      const newEnd = new Date(newStart.getTime() + (duration > 0 ? duration : 3600000));

      const m60 = minute % 60;
      const minStr = m60 < 10 ? '0' + m60 : m60;

      if (data.dateKey && ev.recurrence && ev.recurrence !== 'none' && props.onRequestMove) {
        props.onRequestMove(ev, newStart, newEnd, data.dateKey);
        showToast(t('calendar.toasts.rescheduled', { title: ev.title, date: `${Math.floor(minute / 60)}:${minStr}` }));
        return;
      }

      updateCalendarEvent(ev.id, {
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });
      showToast(t('calendar.toasts.rescheduled', {
        title: ev.title,
        date: `${Math.floor(minute / 60)}:${minStr}`
      }));
    } catch (err) {
      console.error(err);
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
      const minute = Math.max(0, Math.min(1425, Math.round((relY / rect.height) * 96) * 15));
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
    startMin: number;
    currentMin: number;
    hasMoved: boolean;
  }
  const [dragCreate, setDragCreate] = createSignal<DragCreateState | null>(null);

  const startDragCreate = (e: MouseEvent) => {
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
    const snappedMin = Math.floor(exactMin / 15) * 15;

    setDragCreate({
      startMin: snappedMin,
      currentMin: Math.min(1440, snappedMin + 30),
      hasMoved: false
    });

    const onMouseMove = (moveEv: MouseEvent) => {
      const currRect = colEl.getBoundingClientRect();
      const currRelY = Math.max(0, Math.min(currRect.height - 1, moveEv.clientY - currRect.top));
      const currFrac = currRelY / currRect.height;
      const currExactMin = currFrac * 1440;
      const currSnappedMin = Math.round(currExactMin / 15) * 15;

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

      const startDate = new Date(props.currentDate);
      startDate.setHours(Math.floor(minM / 60), minM % 60, 0, 0);

      const endDate = new Date(props.currentDate);
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
    const period = h < 12 ? 'AM' : 'PM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:${m < 10 ? '0' + m : m} ${period}`;
  };

  return (
    <div class="day-view-container" style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      <div class="week-header-row" style={{ 'padding-left': '60px' }}>
        <div class="week-header-day" style={{ 'justify-content': 'center' }}>
          <span class="week-day-name">
            {props.currentDate.toLocaleDateString(getLocale(), { weekday: 'long' })}
          </span>
          <span class={`week-day-num ${isToday() ? 'today-badge' : ''}`}>
            {props.currentDate.getDate()}
          </span>
        </div>
      </div>

      {/* All-Day Strip */}
      <div class="week-allday-strip">
        <div class="allday-gutter">{t('calendar.alldayLabel')}</div>
        <div class="week-allday-day">
          <For each={allDayEvents()}>
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
      </div>

      <div class="week-time-grid" ref={scrollContainerRef}>
        <div class="time-gutter">
          <For each={Array.from({ length: 24 })}>
            {(_, idx) => {
              const h = idx();
              const label = h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
              return (
                <div class="time-slot-label">
                  <span>{label}</span>
                </div>
              );
            }}
          </For>
        </div>

        <div class="week-columns-wrapper" style={{ flex: 1 }}>
          <div
            class={`week-day-column ${isToday() ? 'today-col' : ''}`}
            style={{ width: '100%' }}
            onMouseDown={e => startDragCreate(e)}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e)}
          >
            <For each={Array.from({ length: 24 })}>
              {(_, idx) => {
                void idx;
                return (
                  <div class="week-hour-cell" />
                );
              }}
            </For>

            {isToday() && (
              <div
                class="current-time-line"
                style={{ top: `${getCurrentTimePercent()}%` }}
              />
            )}

            {/* Drag-to-create Ghost Preview Box */}
            <Show when={dragCreate()} keyed>
              {(dc) => {
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

            <div class="week-events-layer">
              <For each={timedLayouts()}>
                {layout => {
                  const ev = layout.ev;
                  const s = new Date(ev.start);
                  const e = new Date(ev.end || ev.start);
                  const timeStr = `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                  const isResizing = resize()?.id === ev.id;
                  const preview = applyResizePreview(ev, layout);

                  return (
                    <div
                      class={`week-event-card ${ev.type === 'task' && ev.completed ? 'completed' : ''} ${isResizing ? 'is-resizing' : ''}`}
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
                      draggable={!ev._holiday}
                      onDragStart={e => handleDragStart(e, ev)}
                      onDragOver={e => {
                        e.stopPropagation();
                        handleDragOver(e);
                      }}
                      onDrop={e => {
                        e.stopPropagation();
                        handleDrop(e);
                      }}
                      onClick={e => {
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
                      <span class="card-time">{timeStr}</span>
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
        </div>
      </div>
    </div>
  );
}
