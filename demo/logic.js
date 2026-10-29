/**
 * 拜访合规 —— 纯业务逻辑（无 DOM 依赖）
 *
 * 浏览器：挂载到 window.VisitLogic
 * Node  ：通过 module.exports 供单测复用（logic.test.mjs）
 *
 * 阈值与判分口径严格对齐题面：
 *   R1 停留时长 不足 5 分钟   → durationSec <  300  → 异常
 *   R2 签到/签退点距医院 500 米以上 → distance > 500 → 异常
 * （"不足"取严格小于；"以上"取严格大于。边界值 300s / 500m 视为合规。）
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VisitLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RULES = Object.freeze({
    MIN_DURATION_SEC: 5 * 60,
    MAX_DISTANCE_M: 500,
  });

  const STATUS_LABELS = Object.freeze({
    PLANNED: '已计划',
    CHECKED_IN: '已签到',
    CHECKED_OUT: '已签退',
    REPORTED: '已完成',
    CANCELLED: '已取消',
    VOIDED: '已作废',
    DELETED: '已删除',
  });

  const ACTIONS = Object.freeze({
    CHECKIN: { from: ['PLANNED'], to: 'CHECKED_IN', label: '签到' },
    CHECKOUT: { from: ['CHECKED_IN'], to: 'CHECKED_OUT', label: '签退' },
    REPORT: { from: ['CHECKED_OUT'], to: 'REPORTED', label: '提交拜访记录' },
    CANCEL: { from: ['PLANNED'], to: 'CANCELLED', label: '取消计划' },
    // 删除只允许发生在"计划阶段 + 纠错窗口内"，且不需要原因
    DELETE: { from: ['PLANNED'], to: 'DELETED', label: '删除计划' },
    // 作废只允许在"已签到、未签退"时发生：签退后判定已固化，作废窗口关闭
    VOID: { from: ['CHECKED_IN'], to: 'VOIDED', label: '作废拜访' },
    // 两条系统边：计划超时未签到 → 取消；签到超时未签退 → 作废
    EXPIRE_PLAN: { from: ['PLANNED'], to: 'CANCELLED', label: '超时未签到，系统代取消' },
    EXPIRE_VISIT: { from: ['CHECKED_IN'], to: 'VOIDED', label: '超时未签退，系统作废' },
  });

  const FLAG_CODES = Object.freeze({
    DURATION_TOO_SHORT: 'DURATION_TOO_SHORT',
    LOCATION_DEVIATION: 'LOCATION_DEVIATION',
  });

  const EARTH_RADIUS_M = 6371008.8;
  const rad = (deg) => (deg * Math.PI) / 180;

  /** Haversine 大圆距离（米） */
  function haversineMeters(a, b) {
    if (!a || !b) return null;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** 停留时长（秒）；缺任一时间为 null */
  function computeDurationSec(checkinAt, checkoutAt) {
    if (!checkinAt || !checkoutAt) return null;
    const ms = new Date(checkoutAt).getTime() - new Date(checkinAt).getTime();
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.round(ms / 1000));
  }

  function formatDuration(sec) {
    if (sec == null || !Number.isFinite(sec)) return '—';
    const s = Math.max(0, Math.round(sec));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (d) return `${d} 天 ${h} 小时`;
    if (h) return `${h} 小时 ${m} 分`;
    if (m) return `${m} 分 ${String(r).padStart(2, '0')} 秒`;
    return `${r} 秒`;
  }

  /**
   * 核心校验：返回全部命中项（不是只返回第一条）
   * @param {{hospital:{lat:number,lng:number}, checkin?:{at:string,lat:number,lng:number}, checkout?:{at:string,lat:number,lng:number}}} v
   */
  function validateVisit(v) {
    const flags = [];
    const hospital = v.hospital;
    const durationSec = computeDurationSec(v.checkin && v.checkin.at, v.checkout && v.checkout.at);
    const distanceIn = v.checkin ? haversineMeters(v.checkin, hospital) : null;
    const distanceOut = v.checkout ? haversineMeters(v.checkout, hospital) : null;

    if (durationSec !== null && durationSec < RULES.MIN_DURATION_SEC) {
      flags.push({
        code: FLAG_CODES.DURATION_TOO_SHORT,
        rule: 'R1',
        title: '停留时长不足 5 分钟',
        detail: `实际停留 ${formatDuration(durationSec)}，低于 ${RULES.MIN_DURATION_SEC / 60} 分钟阈值`,
      });
    }
    // R2 逐点判定：签到/签退各自与医院基准点比对，两点都偏离则各产生一条标记
    const deviating = [];
    if (distanceIn !== null && distanceIn > RULES.MAX_DISTANCE_M) {
      deviating.push({ point: 'checkin', label: '签到点', distance: distanceIn });
    }
    if (distanceOut !== null && distanceOut > RULES.MAX_DISTANCE_M) {
      deviating.push({ point: 'checkout', label: '签退点', distance: distanceOut });
    }
    deviating.forEach((d) => {
      flags.push({
        code: FLAG_CODES.LOCATION_DEVIATION,
        rule: 'R2',
        point: d.point,
        title: `${d.label}偏离医院`,
        detail: `${d.label}距医院 ${Math.round(d.distance)} 米，超出 ${RULES.MAX_DISTANCE_M} 米阈值`,
      });
    });

    return {
      durationSec,
      distanceIn,
      distanceOut,
      flags,
      abnormal: flags.length > 0,
    };
  }

  /** 统计口径：一条拜访最终只落进一个计数器 */
  function statBucket(status) {
    if (status === 'CHECKED_OUT' || status === 'REPORTED') return 'DONE';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'VOIDED') return 'VOIDED';
    if (status === 'DELETED') return 'DELETED';
    return 'OPEN';
  }

  /** 状态机守卫：非法流转返回 409（而不是抛异常或静默成功） */
  function checkTransition(action, status) {
    const a = ACTIONS[action];
    if (!a) return { ok: false, code: 400, message: `未知动作 ${action}` };
    if (a.from.includes(status)) return { ok: true, to: a.to };
    const fromLabel = STATUS_LABELS[status] || status;
    const need = a.from.map((s) => STATUS_LABELS[s]).join(' / ');
    return {
      ok: false,
      code: 409,
      message: `非法状态流转：当前「${fromLabel}」，不能${a.label}（需先处于「${need}」）`,
    };
  }

  /** GPS 入参校验：必填、数字、范围、经纬度写反启发式 */
  function parseCoords(input) {
    const latStr = String((input && input.lat) != null ? input.lat : '').trim();
    const lngStr = String((input && input.lng) != null ? input.lng : '').trim();
    if (!latStr || !lngStr) {
      return { ok: false, code: 400, error: '缺少 GPS 坐标（纬度与经度均为必填）' };
    }
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, code: 400, error: 'GPS 坐标必须是数字' };
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      const looksSwapped = Math.abs(lng) <= 90 && Math.abs(lat) <= 180;
      return {
        ok: false,
        code: 400,
        error: looksSwapped
          ? `纬度 ${lat} 超出 -90~90（而经度 ${lng} 落在纬度范围内）——疑似经纬度写反`
          : `坐标越界：纬度需在 -90~90、经度需在 -180~180`,
      };
    }
    return { ok: true, lat, lng };
  }

  return {
    RULES,
    STATUS_LABELS,
    ACTIONS,
    FLAG_CODES,
    haversineMeters,
    computeDurationSec,
    formatDuration,
    validateVisit,
    checkTransition,
    statBucket,
    parseCoords,
  };
});
