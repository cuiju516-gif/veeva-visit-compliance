import type { VisitStatus } from './types';

// Pure formatting helpers. Anything that depends on the current clock takes it
// as a parameter so the behaviour is testable and deterministic.

// Dates are formatted explicitly rather than through the browser locale. This
// is an audit tool: a reviewer comparing a screenshot with a database row should
// not have to work out whether 05/06 is May or June, and the README's screenshots
// should not change shape depending on who is looking at them.
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const STATUS_LABELS: Record<VisitStatus, string> = {
  PLANNED: 'Planned',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  REPORTED: 'Reported',
};

export function formatStatus(status: VisitStatus): string {
  return STATUS_LABELS[status];
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatShortDate(value)} ${formatShortTime(value)}`;
}

/** Compact date for dense table cells, still in the browser's locale. */
export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Compact time for dense table cells, still in the browser's locale. */
export function formatShortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return month;
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

/** Formats a server-supplied second count as e.g. "12m 30s". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${rest}s`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

/** Formats a [0, 1] fraction as a human percentage, e.g. 0.125 -> "13%". */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return '0%';
  const percent = fraction * 100;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded < 1) return '<1%';
  if (rounded >= 100) return '100%';
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  return `${Math.round(Math.max(0, meters))} m`;
}

export function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(6);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Value for an <input type="datetime-local"> in the browser's local zone. */
export function toDateTimeLocalValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Default plan time: tomorrow at 10:00, local time. */
export function defaultPlannedLocal(now: Date = new Date()): string {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    10,
    0,
    0,
    0,
  );
  return toDateTimeLocalValue(tomorrow);
}

/** RFC3339 with the browser's UTC offset, e.g. 2026-10-29T10:00:00+08:00. */
export function toRFC3339WithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

export function isVisitStatus(value: string): value is VisitStatus {
  return (
    value === 'PLANNED' ||
    value === 'CHECKED_IN' ||
    value === 'CHECKED_OUT' ||
    value === 'REPORTED'
  );
}
