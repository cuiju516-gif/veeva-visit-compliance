// Self-check for the pure helpers. Run with:
//   node --experimental-strip-types src/selfcheck.ts
// No test runner and no dependencies: an assertion that fails throws, and Node
// exits non-zero.

import {
  defaultPlannedLocal,
  formatDistance,
  formatDuration,
  formatPercent,
  formatShortDate,
  formatShortTime,
  formatMonthLabel,
  toDateTimeLocalValue,
  toRFC3339WithOffset,
} from './format.ts';
import { EARTH_RADIUS_METERS, haversineMeters } from './distance.ts';

let assertions = 0;

function equal<T>(actual: T, expected: T, label: string): void {
  assertions += 1;
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function close(actual: number, expected: number, tolerance: number, label: string): void {
  assertions += 1;
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

// formatDuration -----------------------------------------------------------
equal(formatDuration(0), '0s', 'duration 0');
equal(formatDuration(30), '30s', 'duration 30');
equal(formatDuration(125), '2m 5s', 'duration 125');
equal(formatDuration(750), '12m 30s', 'duration 750');
equal(formatDuration(3661), '1h 1m 1s', 'duration 3661');
equal(formatDuration(Number.NaN), '—', 'duration NaN');

// formatPercent ------------------------------------------------------------
equal(formatPercent(0), '0%', 'percent 0');
equal(formatPercent(0.25), '25%', 'percent 0.25');
equal(formatPercent(0.5), '50%', 'percent 0.5');
equal(formatPercent(1), '100%', 'percent 1');
equal(formatPercent(0.001), '<1%', 'percent 0.001');
equal(formatPercent(0.3333), '33.3%', 'percent 0.3333');
equal(formatPercent(Number.NaN), '0%', 'percent NaN');

// formatDistance -----------------------------------------------------------
equal(formatDistance(0), '0 m', 'distance 0');
equal(formatDistance(500), '500 m', 'distance 500');
equal(formatDistance(512.4), '512 m', 'distance 512.4');
equal(formatDistance(Number.NaN), '—', 'distance NaN');

// Date helpers are locale-independent by design, so the exact output is asserted.
equal(formatShortDate('not-a-date'), '—', 'short date invalid');
equal(formatShortTime('not-a-date'), '—', 'short time invalid');
equal(formatShortDate(new Date(2026, 4, 6, 13, 5).toISOString()), '2026-05-06', 'short date ISO');
equal(formatShortTime(new Date(2026, 4, 6, 13, 5).toISOString()), '13:05', 'short time padded');
equal(formatMonthLabel('2026-05'), 'May 2026', 'month label');

// haversine ----------------------------------------------------------------
close(haversineMeters({ lat: 31.2119, lng: 121.4661 }, { lat: 31.2119, lng: 121.4661 }), 0, 1e-9, 'haversine same point');
close(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), (2 * Math.PI * EARTH_RADIUS_METERS) / 360, 0.001, 'haversine one degree');
const shanghai = haversineMeters({ lat: 31.2119, lng: 121.4661 }, { lat: 31.2169, lng: 121.4661 });
if (shanghai < 555 || shanghai > 557) {
  throw new Error(`haversine Shanghai offset: expected ~556 m, got ${shanghai}`);
}
assertions += 1;
const forward = haversineMeters({ lat: 31.2243, lng: 121.449 }, { lat: 31.2119, lng: 121.4661 });
const backward = haversineMeters({ lat: 31.2119, lng: 121.4661 }, { lat: 31.2243, lng: 121.449 });
close(forward, backward, 1e-9, 'haversine symmetry');

// datetime-local / RFC3339 -------------------------------------------------
const local = new Date(2026, 0, 5, 9, 7, 0, 0);
equal(toDateTimeLocalValue(local), '2026-01-05T09:07', 'datetime-local value');
const rfc = toRFC3339WithOffset(new Date(2026, 8, 29, 10, 30, 0, 0));
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(rfc)) {
  throw new Error(`RFC3339 shape: got ${rfc}`);
}
assertions += 1;
if (new Date(rfc).getTime() !== new Date(2026, 8, 29, 10, 30, 0, 0).getTime()) {
  throw new Error(`RFC3339 round-trip: got ${rfc}`);
}
assertions += 1;

// Default plan time is tomorrow at 10:00 local.
equal(
  defaultPlannedLocal(new Date(2026, 9, 28, 19, 3, 0, 0)),
  '2026-10-29T10:00',
  'default planned local',
);

console.log(`selfcheck: ${assertions} assertions passed`);
