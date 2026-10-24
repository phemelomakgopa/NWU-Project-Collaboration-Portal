import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { IconButton } from '../../components/ui';
import { addDays, formatDate, parseDay, toDayKey, todayKey } from '../../utils/format';
import styles from './Dashboard.module.css';

const STRIP_DAYS = 14;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function itemLink(item) {
  if (item.kind === 'task') return `/projects/${item.project_id}/tasks`;
  return `/projects/${item.project_id}`;
}

function kindLabel(item) {
  if (item.kind === 'meeting') return `Meeting at ${item.time}`;
  if (item.kind === 'project') return 'Project deadline';
  return 'Task';
}

function AgendaItem({ item, overdue = false, compact = false }) {
  return (
    <li>
      <Link
        to={itemLink(item)}
        className={`${styles.item} ${styles[`item-${item.kind}`]} ${overdue ? styles.itemOverdue : ''}`}
        title={`${kindLabel(item)}: ${item.title} (${item.project_name})`}
      >
        <span className={styles.itemTitle}>
          {item.kind === 'meeting' && <span className={styles.itemTime}>{item.time} </span>}
          {item.title}
        </span>
        {!compact && item.kind !== 'project' && <span className={styles.itemProject}>{item.project_name}</span>}
        <span className="visually-hidden">{kindLabel(item)}</span>
      </Link>
    </li>
  );
}

function groupByDay(agenda) {
  const map = new Map();
  for (const item of agenda) {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
  }
  return map;
}

function TwoWeeks({ agenda }) {
  const today = todayKey();
  const byDay = useMemo(() => groupByDay(agenda), [agenda]);
  const overdue = agenda.filter((item) => item.date < today && item.kind !== 'meeting');
  const start = parseDay(today);
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(start, i));
  const later = agenda.filter((item) => item.date >= toDayKey(addDays(start, STRIP_DAYS)));

  return (
    <>
      {overdue.length > 0 && (
        <div className={styles.overdueBand}>
          <span className={styles.overdueLabel}>Overdue</span>
          <ul className={styles.overdueItems}>
            {overdue.map((item) => (
              <AgendaItem key={`${item.kind}-${item.id}`} item={item} overdue />
            ))}
          </ul>
        </div>
      )}
      <div className={styles.strip} role="list" aria-label="Next two weeks">
        {days.map((day, index) => {
          const key = toDayKey(day);
          const items = byDay.get(key) || [];
          const weekday = (day.getDay() + 6) % 7;
          const showMonth = index === 0 || day.getDate() === 1;
          return (
            <div
              key={key}
              role="listitem"
              className={`${styles.day} ${key === today ? styles.dayToday : ''} ${weekday >= 5 ? styles.dayWeekend : ''} ${items.length ? '' : styles.dayEmpty}`}
              aria-label={`${formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' })}, ${items.length || 'nothing'} due`}
            >
              <div className={styles.dayHead}>
                <span className={styles.dayName}>{key === today ? 'Today' : WEEKDAYS[weekday]}</span>
                <span className={styles.dayNumber}>
                  {day.getDate()}
                  {showMonth && <span className={styles.dayMonth}> {day.toLocaleDateString('en-ZA', { month: 'short' })}</span>}
                </span>
              </div>
              {items.length > 0 && (
                <ul className={styles.dayItems}>
                  {items.map((item) => (
                    <AgendaItem key={`${item.kind}-${item.id}`} item={item} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {later.length > 0 && (
        <p className={styles.later}>
          {later.length} more {later.length === 1 ? 'item' : 'items'} after{' '}
          {formatDate(toDayKey(addDays(start, STRIP_DAYS - 1)), { day: 'numeric', month: 'long' })}. Switch to the month view to see them.
        </p>
      )}
    </>
  );
}

function Month({ agenda }) {
  const today = todayKey();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);
  const byDay = useMemo(() => groupByDay(agenda), [agenda]);

  const leading = (cursor.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  const selectedItems = byDay.get(selected) || [];
  const shift = (months) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1));

  return (
    <div className={styles.month}>
      <div>
        <div className={styles.monthNav}>
          <IconButton icon={faChevronLeft} label="Previous month" onClick={() => shift(-1)} />
          <h3 className={styles.monthTitle} aria-live="polite">
            {cursor.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
          </h3>
          <IconButton icon={faChevronRight} label="Next month" onClick={() => shift(1)} />
        </div>
        <div className={styles.monthGrid}>
          {WEEKDAYS.map((d) => (
            <span key={d} className={styles.monthWeekday} aria-hidden="true">
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={`blank-${i}`} />;
            const key = toDayKey(day);
            const items = byDay.get(key) || [];
            const kinds = [...new Set(items.map((item) => item.kind))];
            return (
              <button
                key={key}
                className={`${styles.monthDay} ${key === today ? styles.monthToday : ''} ${key === selected ? styles.monthSelected : ''}`}
                onClick={() => setSelected(key)}
                aria-pressed={key === selected}
                aria-label={`${formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' })}, ${items.length} items`}
              >
                {day.getDate()}
                {kinds.length > 0 && (
                  <span className={styles.monthDots} aria-hidden="true">
                    {kinds.map((kind) => (
                      <span key={kind} className={`${styles.dot} ${styles[`dot-${kind}`]}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.monthAgenda}>
        <h3 className={styles.monthAgendaTitle}>{formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {selectedItems.length === 0 ? (
          <p className={styles.muted}>Nothing due on this day.</p>
        ) : (
          <ul className={styles.agendaList}>
            {selectedItems.map((item) => (
              <AgendaItem key={`${item.kind}-${item.id}`} item={item} overdue={item.date < today && item.kind !== 'meeting'} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Planner({ agenda }) {
  const [view, setView] = useState('weeks');
  return (
    <section className={styles.planner} aria-labelledby="planner-heading">
      <div className={styles.sectionHead}>
        <h2 id="planner-heading" className={styles.sectionTitle}>
          Coming up
        </h2>
        <div className={styles.legend} aria-hidden="true">
          <span>
            <span className={`${styles.dot} ${styles['dot-task']}`} /> Your tasks
          </span>
          <span>
            <span className={`${styles.dot} ${styles['dot-meeting']}`} /> Meetings
          </span>
          <span>
            <span className={`${styles.dot} ${styles['dot-project']}`} /> Project deadlines
          </span>
        </div>
        <div className={styles.segmented} role="group" aria-label="Planner view">
          <button aria-pressed={view === 'weeks'} onClick={() => setView('weeks')}>
            2 weeks
          </button>
          <button aria-pressed={view === 'month'} onClick={() => setView('month')}>
            Month
          </button>
        </div>
      </div>
      {view === 'weeks' ? <TwoWeeks agenda={agenda} /> : <Month agenda={agenda} />}
    </section>
  );
}
