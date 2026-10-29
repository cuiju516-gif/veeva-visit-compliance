/**
 * 核心逻辑单测：node --test demo/
 * 重点覆盖边界值与"全部命中项"聚合，避免只测 happy path。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('./logic.js');

const HOSPITAL = { lat: 31.2304, lng: 121.4737 };
const MIN = 60 * 1000;

/** 沿正北方向精确偏移 m 米（球面弧长），用于边界测试 */
const northOf = (m) => ({
  lat: HOSPITAL.lat + (m / 6371008.8) * (180 / Math.PI),
  lng: HOSPITAL.lng,
});

const at = (baseIso, addMs) => new Date(new Date(baseIso).getTime() + addMs).toISOString();
const T0 = '2026-10-28T09:00:00+08:00';

const visit = ({ durationMin = 10, meters = 0 } = {}) => ({
  hospital: HOSPITAL,
  checkin: { at: T0, ...northOf(meters) },
  checkout: { at: at(T0, durationMin * MIN), ...northOf(meters) },
});

test('happy path：12 分钟、120 米 → 无异常', () => {
  const r = L.validateVisit(visit({ durationMin: 12, meters: 120 }));
  assert.equal(r.flags.length, 0);
  assert.equal(r.abnormal, false);
  assert.equal(r.durationSec, 720);
});

test('R1 边界：299s 异常、300s 合规（"不足 5 分钟"取严格小于）', () => {
  const short = L.validateVisit({
    hospital: HOSPITAL,
    checkin: { at: T0, ...northOf(0) },
    checkout: { at: at(T0, 299 * 1000), ...northOf(0) },
  });
  assert.equal(short.flags.length, 1);
  assert.equal(short.flags[0].code, L.FLAG_CODES.DURATION_TOO_SHORT);

  const edge = L.validateVisit({
    hospital: HOSPITAL,
    checkin: { at: T0, ...northOf(0) },
    checkout: { at: at(T0, 300 * 1000), ...northOf(0) },
  });
  assert.equal(edge.flags.length, 0, '恰好 5 分钟应合规');
});

test('R2 边界：500.1m 异常、499.9m 合规（"500 米以上"取严格大于）', () => {
  const near = L.validateVisit(visit({ meters: 499.9 }));
  assert.equal(near.flags.length, 0);

  const far = L.validateVisit(visit({ meters: 500.1 }));
  assert.equal(far.flags.length, 2, '签到与签退同点位，两个点各产生一条 R2');
  assert.deepEqual(far.flags.map((f) => f.point), ['checkin', 'checkout']);
  assert.ok(far.flags.every((f) => f.code === L.FLAG_CODES.LOCATION_DEVIATION));
});

test('双重异常：时长不足 + 地点偏离 → 3 项标记全部返回', () => {
  const r = L.validateVisit(visit({ durationMin: 2, meters: 2000 }));
  assert.equal(r.flags.length, 3);
  const codes = r.flags.map((f) => f.code);
  assert.deepEqual(codes, [
    L.FLAG_CODES.DURATION_TOO_SHORT,
    L.FLAG_CODES.LOCATION_DEVIATION,
    L.FLAG_CODES.LOCATION_DEVIATION,
  ], 'R1 一条 + R2 每条偏离点各一条');
  assert.equal(r.abnormal, true);
});

test('签到合规但签退偏离 → 同样标记异常', () => {
  const v = visit({ durationMin: 8, meters: 0 });
  v.checkout = { ...v.checkout, ...northOf(900) };
  const r = L.validateVisit(v);
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0].code, L.FLAG_CODES.LOCATION_DEVIATION);
  assert.equal(r.flags[0].point, 'checkout');
});

test('R2 逐点：签到点与签退点各自成一条标记，detail 可区分', () => {
  const v = visit({ durationMin: 8, meters: 0 });
  v.checkin = { ...v.checkin, ...northOf(800) };
  v.checkout = { ...v.checkout, ...northOf(1200) };
  const r = L.validateVisit(v);
  assert.equal(r.flags.length, 2);
  assert.equal(r.flags[0].point, 'checkin');
  assert.match(r.flags[0].detail, /签到点距医院 800 米/);
  assert.match(r.flags[1].detail, /签退点距医院 1200 米/);
});

test('未签退时不应得出时长/距离结论', () => {
  const r = L.validateVisit({ hospital: HOSPITAL, checkin: { at: T0, ...northOf(0) } });
  assert.equal(r.durationSec, null);
  assert.equal(r.distanceOut, null);
  assert.equal(r.abnormal, false);
});

test('状态机：非法流转一律 409', () => {
  assert.equal(L.checkTransition('CHECKIN', 'PLANNED').ok, true);
  assert.equal(L.checkTransition('CHECKOUT', 'PLANNED').code, 409);
  assert.equal(L.checkTransition('CHECKIN', 'CHECKED_IN').code, 409);
  assert.equal(L.checkTransition('REPORT', 'CHECKED_IN').code, 409);
  assert.equal(L.checkTransition('REPORT', 'CHECKED_OUT').ok, true);
  assert.equal(L.checkTransition('CHECKOUT', 'REPORTED').code, 409);
});

test('取消计划：只有 PLANNED 可取消，签到后不可取消', () => {
  assert.equal(L.checkTransition('CANCEL', 'PLANNED').ok, true);
  assert.equal(L.checkTransition('CANCEL', 'CHECKED_IN').code, 409);
  assert.equal(L.checkTransition('CANCEL', 'REPORTED').code, 409);
  assert.equal(L.checkTransition('CHECKIN', 'CANCELLED').code, 409);
});

test('删除：只在 PLANNED 可删，删除后是终态', () => {
  assert.equal(L.checkTransition('DELETE', 'PLANNED').ok, true);
  assert.equal(L.checkTransition('DELETE', 'CHECKED_IN').code, 409);
  assert.equal(L.checkTransition('DELETE', 'CANCELLED').code, 409);
  assert.equal(L.checkTransition('CHECKIN', 'DELETED').code, 409);
  assert.equal(L.checkTransition('CANCEL', 'DELETED').code, 409);
});

test('统计口径：每个终态只落进一个计数器', () => {
  assert.equal(L.statBucket('CHECKED_OUT'), 'DONE');
  assert.equal(L.statBucket('REPORTED'), 'DONE');
  assert.equal(L.statBucket('CANCELLED'), 'CANCELLED');
  assert.equal(L.statBucket('VOIDED'), 'VOIDED');
  assert.equal(L.statBucket('DELETED'), 'DELETED');
  assert.equal(L.statBucket('PLANNED'), 'OPEN');
  assert.equal(L.statBucket('CHECKED_IN'), 'OPEN');
});

test('作废：只允许"已签到未签退"，签退后判定已固化', () => {
  assert.equal(L.checkTransition('VOID', 'CHECKED_IN').ok, true);
  assert.equal(L.checkTransition('VOID', 'CHECKED_OUT').code, 409, '签退后作废窗口关闭');
  assert.equal(L.checkTransition('VOID', 'PLANNED').code, 409, '计划阶段应走取消/删除');
  assert.equal(L.checkTransition('VOID', 'REPORTED').code, 409);
  assert.equal(L.checkTransition('VOID', 'VOIDED').code, 409, '不能重复作废');
  assert.equal(L.checkTransition('CHECKOUT', 'VOIDED').code, 409);
});

test('系统边：计划超时→取消，签到超时→作废', () => {
  assert.equal(L.checkTransition('EXPIRE_PLAN', 'PLANNED').to, 'CANCELLED');
  assert.equal(L.checkTransition('EXPIRE_PLAN', 'CHECKED_IN').code, 409);
  assert.equal(L.checkTransition('EXPIRE_VISIT', 'CHECKED_IN').to, 'VOIDED');
  assert.equal(L.checkTransition('EXPIRE_VISIT', 'CHECKED_OUT').code, 409);
});

test('坐标校验：必填 / 非数字 / 越界 / 经纬度写反', () => {
  assert.equal(L.parseCoords({ lat: '', lng: '121.47' }).code, 400);
  assert.equal(L.parseCoords({ lat: 'abc', lng: '121.47' }).code, 400);
  assert.equal(L.parseCoords({ lat: '200', lng: '121.47' }).ok, false);
  assert.match(L.parseCoords({ lat: '200', lng: '121.47' }).error, /越界/);

  const swapped = L.parseCoords({ lat: '121.47', lng: '31.23' });
  assert.equal(swapped.ok, false);
  assert.match(swapped.error, /写反/);

  assert.deepEqual(L.parseCoords({ lat: '31.2304', lng: '121.4737' }), {
    ok: true, lat: 31.2304, lng: 121.4737,
  });
});

test('时长格式化', () => {
  assert.equal(L.formatDuration(0), '0 秒');
  assert.equal(L.formatDuration(299), '4 分 59 秒');
  assert.equal(L.formatDuration(720), '12 分 00 秒');
  assert.equal(L.formatDuration(3720), '1 小时 2 分');
  assert.equal(L.formatDuration(86400 * 7 + 3600), '7 天 1 小时');
  assert.equal(L.formatDuration(null), '—');
});
