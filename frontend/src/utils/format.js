// Dates arrive from the API as ISO strings: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM+02:00'.

/** Parse a date-only string as a local date (not UTC midnight). */
export function parseDay(value) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey() {
  return toDayKey(new Date());
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole days from today until the given day (negative when past). */
export function daysUntil(value) {
  const day = parseDay(value);
  if (!day) return null;
  const today = parseDay(todayKey());
  return Math.round((day - today) / 86400000);
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const day = parseDay(value);
  return day ? day.toLocaleDateString('en-ZA', options) : '';
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

/** "Due today", "Due in 3 days", "2 days overdue". */
export function dueLabel(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return days <= 14 ? `Due in ${days} days` : `Due ${formatDate(value)}`;
  return days === -1 ? '1 day overdue' : `${-days} days overdue`;
}

export function relativeTime(value) {
  if (!value) return '';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}
