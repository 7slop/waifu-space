import { For, Show, createMemo } from 'solid-js';
import { CalendarEventItem } from '../lib/ical';
import { toggleTask, isSameDay, getEventsForDate } from '../lib/store';
import { t, getLocale, holidayTooltip, formatClock } from '../lib/i18n';
import { countryFlagEmoji } from '../lib/countries';
import { onActivateKey } from '../lib/accessibility';
import { PhArrowsClockwise, PhMapPin, PhCake, GlyphText } from './icons';

const MAX_DAYS = 10;

/**
 * Agenda / schedule view: a spacious, date-grouped layout of events for a
 * rolling N-day window starting at `startDate`. Each day section expands to
 * fill available space with generous padding. Max 10 days visible.
 */
export function CalendarScheduleView(props: {
  startDate: Date;
  events: CalendarEventItem[];
  days?: number;
  onOpenEvent: (ev: CalendarEventItem, anchorRect?: DOMRect) => void;
}) {
  const days = Math.min(props.days ?? 7, MAX_DAYS);
  const today = new Date();

  const dayList = () => {
    const list: Date[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(props.startDate);
      d.setDate(props.startDate.getDate() + i);
      d.setHours(0, 0, 0, 0);
      list.push(d);
    }
    return list;
  };

  return (
    <div class="schedule-view-container">
      <For each={dayList()}>
        {day => {
          const isToday = isSameDay(day, today);
          const dayNum = day.getDate();
          const sorted = createMemo(() =>
            getEventsForDate(props.events, day)
              .slice()
              .sort((a, b) => {
                if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
                return new Date(a.start).getTime() - new Date(b.start).getTime();
              })
          );
          return (
            <section class={`schedule-day-group ${isToday ? 'today' : ''}`}>
              <div class={`schedule-day-header ${isToday ? 'today' : ''}`}>
                <span class="schedule-day-num">{dayNum}</span>
                <div class="schedule-day-label">
                  <span class="schedule-day-name">
                    {day.toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                  {isToday && <span class="schedule-today-badge">{t('calendar.toolbar.today')}</span>}
                </div>
              </div>

              <div class="schedule-day-body">
                <Show
                  when={sorted().length > 0}
                  fallback={<p class="schedule-empty">{t('calendar.schedule.noEvents')}</p>}
                >
                  <For each={sorted()}>
                    {ev => {
                      const timeStr = createMemo(() =>
                        ev.allDay
                          ? t('calendar.alldayLabel')
                          : `${formatClock(ev.start)}${ev.end && ev.end !== ev.start ? ' – ' + formatClock(ev.end) : ''}`
                      );
                      return (
                      <div
                        class={`schedule-event-row ${ev.type === 'task' && ev.completed ? 'completed' : ''}`}
                        role="button"
                        tabindex="0"
                        aria-label={t('calendar.a11y.openEvent', { title: ev.title })}
                        title={ev._holiday ? holidayTooltip(ev._holiday) : undefined}
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
                        <span class="schedule-ev-dot" style={{ background: ev.color || '#ff6584' }} />
                        <div class="schedule-ev-content">
                          <span class="schedule-ev-title">{ev.title}</span>
                          <span class="schedule-ev-time">{timeStr()}</span>
                        </div>
                        <div class="schedule-ev-meta">
                          {ev.type === 'task' && (
                            <input
                              type="checkbox"
                              class="schedule-task-check"
                              checked={ev.completed}
                              onClick={e => {
                                e.stopPropagation();
                                toggleTask(ev.id, ev.dateKey);
                              }}
                            />
                          )}
                          {ev.type === 'birthday' && <span class="schedule-ev-icon schedule-ev-birthday"><PhCake /></span>}
                          {ev._holiday && <span class="pill-holiday-flag"><GlyphText text={ev._holiday.culture ? '🎉' : countryFlagEmoji(ev._holiday.countryCode)} /></span>}
                          {ev.recurrence && ev.recurrence !== 'none' && (
                            <span class="schedule-ev-icon" title={t('calendar.sidebar.repeats', { rule: ev.recurrence })}><PhArrowsClockwise /></span>
                          )}
                          {ev.location && (
                            <span class="schedule-ev-icon"><PhMapPin /> {ev.location}</span>
                          )}
                        </div>
                      </div>
                    );
                  }}
                </For>
                </Show>
              </div>
            </section>
          );
        }}
      </For>
    </div>
  );
}