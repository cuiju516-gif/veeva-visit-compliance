import type { VisitStatus } from './types';

// Pure formatting helpers. Anything that depends on the current clock takes it
// as a parameter so the behaviour is testable and deterministic.

// Dates are formatted explicitly rather than through the browser locale. This
// is an audit tool: a reviewer comparing a screenshot with a database row should
// not have to work out whether 05/06 is May or June, and the README's screenshots
// should not change shape depending on who is looking at them.
const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const STATUS_LABELS: Record<VisitStatus, string> = {
  PLANNED: '已计划',
  CHECKED_IN: '已签到',
  CHECKED_OUT: '已签退',
  REPORTED: '已完成',
  CANCELLED: '已取消',
  VOIDED: '已作废',
  DELETED: '已删除',
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
  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${rest} 秒`;
  if (minutes > 0) return `${minutes} 分 ${rest} 秒`;
  return `${rest} 秒`;
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
    value === 'REPORTED' ||
    value === 'CANCELLED' ||
    value === 'VOIDED' ||
    value === 'DELETED'
  );
}

/**
 * Chinese copy for the API's stable error codes.
 *
 * The server messages are deliberately terse and English (they are written for
 * whoever reads the logs, and they must not change when the UI is translated).
 * The UI owns the wording a user sees, keyed by the stable `code`, with the
 * server's message as a last-resort fallback so a new code is never blank.
 */
export function localizeApiError(code: string, message: string, field?: string): string {
  switch (code) {
    case 'forbidden':
      if (field === 'mrId') return '只能给自己创建拜访计划。';
      return '没有权限执行这个操作。';
    case 'not_found':
      return '这条记录不存在，可能已被删除。';
    case 'invalid_state':
      if (message.includes('cancel')) return '当前状态不能取消，只有「已计划」的拜访可以取消。';
      if (message.includes('void')) return '当前状态不能作废：作废只对「已签到」开放。';
      if (message.includes('delete')) return message.includes('window')
        ? '删除窗口已关闭：只能在创建后 1 小时内、且距开始超过 1 小时时删除，请改为取消。'
        : '当前状态不能删除。';
      if (message.includes('check')) return '当前状态不允许签到或签退。';
      if (message.includes('report')) return '当前状态不能提交记录，请先签退。';
      return '这次操作与拜访的当前状态冲突，请刷新后重试。';
    case 'conflict':
      return message.includes('already checked in')
        ? '你还有一条未签退的拜访，请先签退。'
        : '这条拜访刚被其他人修改过，请刷新后重试。';
    case 'validation_failed':
      return message.startsWith('a reason is required') ? '必须填写原因。' : message;
    case 'network_error':
      return '网络异常，请检查连接后重试。';
    default:
      return message;
  }
}
