/* 交互 Demo 的应用层：内存数据 + 虚拟时钟 + 渲染（无框架、无构建） */
(function () {
  'use strict';

  const L = window.VisitLogic;
  const {
    RULES, STATUS_LABELS, validateVisit, checkTransition, statBucket,
    parseCoords, haversineMeters, formatDuration,
  } = L;

  const TZ = 'Asia/Shanghai';
  /* 三类直接使用者：同一套数据，三种数据范围与操作权限 */
  const ACTORS = {
    MR: { key: 'MR', role: 'MR', name: '张伟', title: '医药代表', scope: '本人数据' },
    MR2: { key: 'MR2', role: 'MR', name: '李娜', title: '医药代表', scope: '本人数据' },
    ADMIN: { key: 'ADMIN', role: 'ADMIN', name: '王敏', title: '系统管理员', scope: '全局主数据' },
  };
  const REPS = ['张伟', '李娜', '周涛'];
  /* 纠错删除窗口：创建后 1 小时内、且距离计划开始还有 1 小时以上 */
  const DELETE_WINDOW_MS = 3600 * 1000;

  /* ---------------- 主数据（管理员维护，业务记录只引用 ID） ---------------- */
  /* 医院 / 医生 / 药品三张表：新增与下线是管理员的职责，代表连入口都看不到。 */
  function seedMaster() {
    return {
      hospitals: [
        { id: 'HSP-01', name: '示例三甲医院', lat: 31.2304, lng: 121.4737, address: '中心院区 · 门诊楼', status: 'ACTIVE' },
        { id: 'HSP-02', name: '示例医院东院', lat: 31.2192, lng: 121.5311, address: '东院区 · 住院部', status: 'ACTIVE' },
      ],
      hcps: [
        { id: 'HCP-01', name: '王建国', hospitalId: 'HSP-01', dept: '心内科', title: '主任医师', status: 'ACTIVE' },
        { id: 'HCP-02', name: '李淑芬', hospitalId: 'HSP-01', dept: '肿瘤科', title: '副主任医师', status: 'ACTIVE' },
        { id: 'HCP-03', name: '陈志强', hospitalId: 'HSP-02', dept: '呼吸科', title: '主任医师', status: 'ACTIVE' },
        { id: 'HCP-04', name: '赵敏', hospitalId: 'HSP-02', dept: '肿瘤科', title: '主治医师', status: 'ACTIVE' },
      ],
      products: [
        { id: 'PRD-01', name: '可瑞达', status: 'ACTIVE' },
        { id: 'PRD-02', name: '欧狄沃', status: 'ACTIVE' },
        { id: 'PRD-03', name: '艾瑞妮', status: 'ACTIVE' },
        { id: 'PRD-04', name: '安维汀', status: 'INACTIVE' },
      ],
    };
  }

  const master = () => state.master;
  const hospitalOf = (hcpRec) => (hcpRec && state.master.hospitals.find((h) => h.id === hcpRec.hospitalId)) || null;
  const productOf = (id) => state.master.products.find((p) => p.id === id) || null;
  const hcpOf = (id) => state.master.hcps.find((h) => h.id === id) || null;
  const alive = (r) => !r.deletedAt;
  const activeHcps = () => state.master.hcps.filter((h) => h.status === 'ACTIVE' && alive(h));
  /** 可选药品只列在架产品；已下线的历史产品仍能在明细里看到 */
  const activeProducts = () => state.master.products.filter((p) => p.status === 'ACTIVE' && alive(p));

  /* ---------------- 工具 ---------------- */

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const zoned = (d) => {
    const out = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(d).forEach((p) => { out[p.type] = p.value; });
    return out;
  };

  const fmtClock = (d) => { const p = zoned(d); return `${p.hour}:${p.minute}:${p.second}`; };
  const fmtClockFull = (d) => { const p = zoned(d); return `${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
  const fmtDT = (iso) => {
    if (!iso) return '—';
    const p = zoned(new Date(iso));
    return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
  };
  const monthKey = (iso) => { const p = zoned(new Date(iso)); return `${p.year}-${p.month}`; };
  const monthLabel = (key) => `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`;

  /** 以基准点为原点，按方位角/距离生成坐标（等距近似，仅用于 Demo 取点） */
  function pointAt(base, meters, bearingDeg) {
    const b = (bearingDeg * Math.PI) / 180;
    const north = meters * Math.cos(b);
    const east = meters * Math.sin(b);
    const lat = base.lat + north / 111320;
    const lng = base.lng + east / (111320 * Math.cos((base.lat * Math.PI) / 180));
    return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
  }

  const SPOT_SPECS = [
    { key: 'gate', label: '医院正门', meters: 0, bearing: 90 },
    { key: 'cafe', label: '门诊楼咖啡厅', meters: 180, bearing: 45 },
    { key: 'across', label: '街对面写字楼', meters: 620, bearing: 110 },
    { key: 'park', label: '隔壁园区', meters: 1200, bearing: 200 },
    { key: 'mall', label: '两公里外商城', meters: 2000, bearing: 300 },
  ];

  const spotsFor = (base) => SPOT_SPECS.map((s) => ({ ...s, point: pointAt(base, s.meters, s.bearing) }));

  /** 断言用的基准点：优先取当前拜访的医院快照 */
  function baseForVisit(v) {
    if (v && v.hospital) return v.hospital;
    const first = state.master.hospitals[0];
    return { name: first.name, lat: first.lat, lng: first.lng };
  }

  /* ---------------- 数据 ---------------- */

  const state = {
    offsetMs: 0,
    tab: 'flow',
    actor: 'MR',
    master: seedMaster(),
    mdEdit: null,

    mrView: 'list',
    sort: { key: 'plannedAt', dir: 'desc' },
    statusFilter: 'ALL',
    showDeleted: false,
    modal: null,
    menuId: null,
    createHospitalId: null,
    showDeletedMaster: false,
    boardProduct: 'ALL',
    activeId: null,
    visits: [],
    logs: [],
    seq: 0,
    boardMonth: null,

    /* 合规规则可配置：版本化保存，判定时把阈值快照写进结果 */
    rules: { minDurationSec: 300, maxDistanceM: 500, timeoutHours: 24, reportTimeoutHours: 72, version: 'v1' },
    ruleHistory: [
      { version: 'v1', minDurationSec: 300, maxDistanceM: 500, timeoutHours: 24, reportTimeoutHours: 72, at: '2026-09-01T09:00:00+08:00', by: '系统初始化', note: '题面给定阈值 + 悬挂超时 24h + 补记录 72h' },
    ],
  };

  const now = () => new Date(Date.now() + state.offsetMs);
  const iso = (d) => d.toISOString();
  const active = () => state.visits.find((v) => v.id === state.activeId) || null;

  const me = () => ACTORS[state.actor];
  const isMR = () => me().role === 'MR';
  const isAdmin = () => me().role === 'ADMIN';
  const seesAll = () => isAdmin();

  /** 数据范围：代表只看本人，管理员看全量 */
  function visibleVisits() {
    return seesAll() ? state.visits : state.visits.filter((v) => v.mr === me().name);
  }

  /** 操作权限：只有本人可以动自己的拜访 */
  const canOperate = (v) => isMR() && !!v && v.mr === me().name;

  function boardScopeVisits() {
    // 只有两类使用者：代表看本人，管理员看全量。没有团队这一层。
    if (isMR()) return state.visits.filter((v) => v.mr === me().name);
    return state.visits;
  }

  function makeVisit(spec) {
    const hcpRec = hcpOf(spec.hcpId) || activeHcps()[0];
    const baseRec = hospitalOf(hcpRec) || state.master.hospitals[0];
    const base = { name: baseRec.name, lat: baseRec.lat, lng: baseRec.lng };
    const prod = (spec.productId && productOf(spec.productId))
      || state.master.products.find((x) => x.name === spec.product)
      || state.master.products[0];
    const inP = pointAt(base, spec.inMeters || 0, spec.bearing || 90);
    const outP = pointAt(base, spec.outMeters != null ? spec.outMeters : spec.inMeters || 0, spec.bearing || 90);
    const hasCheckin = !!spec.checkinAt;
    const hasCheckout = hasCheckin && (spec.status || 'REPORTED') !== 'CHECKED_IN';
    const checkinAt = hasCheckin ? new Date(spec.checkinAt).toISOString() : null;
    const checkoutAt = hasCheckout
      ? new Date(new Date(checkinAt).getTime() + (spec.durationMin || 10) * 60000).toISOString()
      : null;
    const v = {
      id: spec.id,
      hcpId: hcpRec.id,
      hcpName: hcpRec.name,
      dept: hcpRec.dept,
      productId: prod.id,
      product: prod.name,
      plannedAt: spec.plannedAt,
      createdAt: spec.createdAt || new Date(Math.min(
        new Date(spec.plannedAt).getTime() - 2 * 86400000,
        Date.now() - 2 * 3600000,
      )).toISOString(),
      status: spec.status || 'REPORTED',
      hospitalId: baseRec.id,
      hospital: base,
      review: null,
      cancel: spec.cancel || null,
      deleted: null,
      void: spec.void || null,
      audit: spec.audit || [],
      checkin: hasCheckin ? { at: checkinAt, lat: inP.lat, lng: inP.lng } : null,
      checkout: hasCheckout ? { at: checkoutAt, lat: outP.lat, lng: outP.lng } : null,
      report: hasCheckin && (spec.status || 'REPORTED') !== 'CHECKED_OUT'
        ? { talkingPoints: spec.tp || '', feedback: spec.fb || '', materials: !!spec.materials }
        : null,
      warning: spec.warning || null,
      preset: null,
    };
    v.evaluation = validateVisit(v, state.rules);
    v.abnormal = v.evaluation.abnormal;
    return v;
  }

  const SEED = [
    { id: 'V-0902', hcpId: 'HCP-01', product: '可瑞达', plannedAt: '2026-09-01T10:00:00+08:00', checkinAt: '2026-09-02T09:05:00+08:00', durationMin: 16, inMeters: 0, outMeters: 120,
      tp: '介绍一线治疗最新 OS 数据，医生关注不良反应管理', fb: '认可疗效数据，希望补充老年患者亚组分析', materials: true },
    { id: 'V-0909', hcpId: 'HCP-02', product: '可瑞达', plannedAt: '2026-09-08T10:00:00+08:00', checkinAt: '2026-09-09T14:20:00+08:00', durationMin: 4, inMeters: 60,
      tp: '简短沟通，医生门诊结束后仅停留数分钟', fb: '时间仓促，未深入讨论', materials: false },
    { id: 'V-0914', hcpId: 'HCP-03', product: '欧狄沃', plannedAt: '2026-09-13T10:00:00+08:00', checkinAt: '2026-09-14T10:40:00+08:00', durationMin: 11, inMeters: 0,
      tp: '分享联合治疗 III 期研究结果', fb: '关注免疫相关肺炎风险', materials: true },
    { id: 'V-0922', hcpId: 'HCP-02', product: '艾瑞妮', plannedAt: '2026-09-21T10:00:00+08:00', checkinAt: '2026-09-22T15:05:00+08:00', durationMin: 7, inMeters: 30,
      tp: '讲解适应症与用药剂量调整', fb: '需要一份患者教育手册', materials: true },
    { id: 'V-0928', hcpId: 'HCP-03', product: '艾瑞妮', plannedAt: '2026-09-27T10:00:00+08:00', checkinAt: '2026-09-28T11:10:00+08:00', durationMin: 2, inMeters: 900,
      tp: '在医院外咖啡厅短暂碰面', fb: '未见到医生本人，由助理代收资料', materials: false },
    { id: 'V-1002', hcpId: 'HCP-01', product: '可瑞达', plannedAt: '2026-10-01T10:00:00+08:00', checkinAt: '2026-10-02T09:12:00+08:00', durationMin: 12, inMeters: 0,
      tp: '月度随访，更新最新指南推荐', fb: '愿意在科室会上分享病例', materials: true },
    { id: 'V-1008', hcpId: 'HCP-02', product: '可瑞达', plannedAt: '2026-10-07T10:00:00+08:00', checkinAt: '2026-10-08T16:30:00+08:00', durationMin: 4, inMeters: 0,
      tp: '医生临时有手术，仅寒暄数句', fb: '约定下周再访', materials: false },
    { id: 'V-1015', hcpId: 'HCP-01', product: '可瑞达', plannedAt: '2026-10-14T10:00:00+08:00', checkinAt: '2026-10-15T10:05:00+08:00', durationMin: 18, inMeters: 320,
      tp: '详细解读真实世界研究数据', fb: '关注医保支付与可及性', materials: true },
    { id: 'V-1021', hcpId: 'HCP-03', product: '欧狄沃', plannedAt: '2026-10-20T10:00:00+08:00', checkinAt: '2026-10-21T14:00:00+08:00', durationMin: 9, inMeters: 1200,
      tp: '地点在院外会议中心，沟通辅助治疗适应症', fb: '对给药周期有疑问', materials: true },
    { id: 'V-1023', hcpId: 'HCP-01', product: '欧狄沃', plannedAt: '2026-10-22T10:00:00+08:00', checkinAt: '2026-10-23T09:40:00+08:00', durationMin: 14, inMeters: 80,
      tp: '沟通新适应症上市信息', fb: '希望提供文献复印件', materials: true },
  ];

  SEED.forEach((s) => state.visits.push(makeVisit(s)));

  // 一条始终"进行中"的记录：20 分钟前签到、尚未签退（时间相对 now，打开页面就能用）
  const nowMs0 = Date.now();
  state.visits.push(makeVisit({
    id: 'V-1030', hcpId: 'HCP-01', product: '可瑞达',
    plannedAt: new Date(nowMs0 - 40 * 60000).toISOString(),
    checkinAt: new Date(nowMs0 - 20 * 60000).toISOString(),
    inMeters: 120, bearing: 60, status: 'CHECKED_IN',
  }));

  // 一条"签退后一直没补记录"的拜访：加载时会被扫描成「记录缺失」，进管理员待办
  state.visits.push(makeVisit({
    id: 'V-1032', hcpId: 'HCP-01', product: '可瑞达',
    plannedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    checkinAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    durationMin: 15, inMeters: 60, status: 'CHECKED_OUT',
  }));

  // 第二个代表（李娜）的一条待签到计划：用来演示"代表之间数据互相看不到"
  state.visits.push(makeVisit({
    id: 'V-1031', hcpId: 'HCP-02', product: '可瑞达',
    plannedAt: '2026-11-04T14:00:00+08:00', status: 'PLANNED',
    createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
  }));

  // 系统边 ①：签到后 7 天没签退 → 加载时被扫描成「超时作废」
  state.visits.push(makeVisit({
    id: 'V-1019', hcpId: 'HCP-01', product: '欧狄沃',
    plannedAt: '2026-10-19T09:00:00+08:00', checkinAt: '2026-10-19T10:00:00+08:00',
    status: 'CHECKED_IN',
  }));

  // 系统边 ②：计划过期 4 天仍未签到 → 加载时被扫描成「超时取消（NO_CHECKIN）」
  state.visits.push(makeVisit({
    id: 'V-1022', hcpId: 'HCP-03', product: '欧狄沃',
    plannedAt: '2026-10-22T10:00:00+08:00', status: 'PLANNED',
  }));

  // 一条已作废：代表误签到后自助作废——不计入拜访次数，但保留痕迹
  state.visits.push(makeVisit({
    id: 'V-1018', hcpId: 'HCP-01', product: '可瑞达',
    plannedAt: '2026-10-18T10:00:00+08:00', checkinAt: '2026-10-18T10:05:00+08:00',
    durationMin: 6, inMeters: 0, status: 'VOIDED',
    void: {
      cause: 'MANUAL', at: '2026-10-18T10:31:00+08:00', by: '张伟',
      reason: '签到后发现医生停诊，未见到本人，本趟不作数',
      distanceIn: 0, flags: [],
    },
  }));

  // 一条已取消的计划：取消不删记录，留痕但不计入拜访次数
  state.visits.push(makeVisit({
    id: 'V-1024', hcpId: 'HCP-04', product: '艾瑞妮',
    plannedAt: '2026-10-24T10:00:00+08:00', status: 'CANCELLED',
    cancel: { reason: '医生临时停诊', at: '2026-10-23T18:10:00+08:00', by: '张伟' },
  }));

  // 一条"仅计划、未签到"的记录：用于演示看板只统计已签到拜访
  state.visits.push(makeVisit({
    id: 'V-1028', hcpId: 'HCP-02', product: '欧狄沃',
    plannedAt: '2026-11-03T10:00:00+08:00', status: 'PLANNED', warning: null,
    // 刚建 10 分钟，仍处在"纠错窗口"内 → 可删除
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  }));
  // 归属：谁的计划谁负责（代表只看自己，管理员看全量）
  const OWNER_BY_ID = {
    'V-0902': '张伟', 'V-0909': '李娜', 'V-0914': '张伟', 'V-0922': '周涛', 'V-0928': '张伟',
    'V-1002': '张伟', 'V-1008': '李娜', 'V-1015': '张伟', 'V-1021': '周涛', 'V-1023': '张伟',
    'V-1028': '张伟', 'V-1018': '张伟', 'V-1022': '张伟', 'V-1030': '张伟',
    'V-1031': '李娜', 'V-1032': '张伟',
  };
  state.visits.forEach((v) => { v.mr = OWNER_BY_ID[v.id] || '张伟'; });

  state.activeId = 'V-1028';
  state.seq = 1100;

  /* ---------------- 日志 / 提示 ---------------- */

  function log(method, path, status, note) {
    state.logs.unshift({ at: iso(now()), method, path, status, note, id: Math.random().toString(36).slice(2) });
    state.logs = state.logs.slice(0, 60);
  }

  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast ' + (kind || ''); }, 3200);
  }

  function fail(path, code, message) {
    log('POST', path, code, message);
    toast(message, 'error');
    render();
  }

  /* ---------------- 业务动作 ---------------- */

  function createVisit(hcpId, productId, plannedAt) {
    if (!plannedAt) { showFormError('create-error', '请选择计划时间'); return; }
    const plannedMs = new Date(plannedAt).getTime();
    if (!Number.isFinite(plannedMs)) { showFormError('create-error', '计划时间格式不正确'); return; }
    if (plannedMs <= now().getTime()) {
      log('POST', '/api/visits', 400, '计划时间不能早于当前时间');
      showFormError('create-error', '计划时间不能早于当前时间，请选择未来的时间');
      return;
    }
    const hcpRec = hcpOf(hcpId) || activeHcps()[0];
    if (!hcpRec || hcpRec.status !== 'ACTIVE') { toast('该医生已停用，不能新建拜访', 'error'); return; }
    const baseRec = hospitalOf(hcpRec);
    const prod = productOf(productId) || activeProducts()[0];
    if (!prod || prod.status !== 'ACTIVE') { toast('该产品已下线，不能新建拜访', 'error'); return; }
    const id = 'V-' + (++state.seq);
    const v = {
      id, mr: me().name,
      hcpId: hcpRec.id, hcpName: hcpRec.name, dept: hcpRec.dept,
      hospitalId: baseRec.id, hospital: { name: baseRec.name, lat: baseRec.lat, lng: baseRec.lng },
      productId: prod.id, product: prod.name,
      plannedAt, status: 'PLANNED',
      checkin: null, checkout: null, report: null, review: null,
      deleted: null, audit: [{ action: 'CREATE', at: iso(now()), by: me().name, reason: '新建计划' }],
      abnormal: false,
      evaluation: { flags: [], durationSec: null, distanceIn: null, distanceOut: null, abnormal: false },
      warning: null, preset: null,
    };
    const diffDays = (plannedMs - now().getTime()) / 86400000;
    if (diffDays > 7) v.warning = '计划时间超过 7 天，业务习惯是「预约下周」';

    state.visits.push(v);
    state.activeId = id;
    state.modal = null;
    state.mrView = 'list';
    log('POST', '/api/visits', 201, v.warning ? `已创建拜访计划（提示：${v.warning}）` : '已创建拜访计划');
    toast(v.warning ? `计划已创建，但${v.warning}` : '拜访计划已创建', v.warning ? 'warn' : 'ok');
    render();
  }

  function doCheckin() {
    const v = active();
    if (!v) return;
    const path = `/api/visits/${v.id}/checkin`;
    if (!canOperate(v)) return fail(path, 403, `无权限：${ACTORS[state.actor].title}不能操作代表 ${v.mr} 的拜访`);
    const t = checkTransition('CHECKIN', v.status);
    if (!t.ok) return fail(path, t.code, t.message);

    const p = parseCoords({ lat: val('#in-lat'), lng: val('#in-lng') });
    if (!p.ok) return fail(path, p.code, p.error);

    v.checkin = { at: iso(now()), lat: p.lat, lng: p.lng };
    v.status = 'CHECKED_IN';
    v.evaluation = validateVisit(v, state.rules);
    log('POST', path, 200, `签到成功 · 距医院 ${Math.round(haversineMeters(v.checkin, v.hospital))} 米`);
    toast('签到成功，开始学术沟通', 'ok');
    render();
  }

  function doCheckout() {
    const v = active();
    if (!v) return;
    const path = `/api/visits/${v.id}/checkout`;
    if (!canOperate(v)) return fail(path, 403, `无权限：${ACTORS[state.actor].title}不能操作代表 ${v.mr} 的拜访`);
    const t = checkTransition('CHECKOUT', v.status);
    if (!t.ok) return fail(path, t.code, t.message);

    const p = parseCoords({ lat: val('#out-lat'), lng: val('#out-lng') });
    if (!p.ok) return fail(path, p.code, p.error);

    v.checkout = { at: iso(now()), lat: p.lat, lng: p.lng };
    v.status = 'CHECKED_OUT';
    v.evaluation = validateVisit(v, state.rules);
    v.abnormal = v.evaluation.abnormal;
    v.review = v.abnormal
      ? { status: 'PENDING', by: null, at: null, note: '' }
      : null;

    const f = v.evaluation.flags;
    log('POST', path, 200, v.abnormal
      ? `已签退，自动标记异常：${f.map((x) => x.rule).join(' / ')}`
      : '已签退，停留时长与位置均合规');
    toast(v.abnormal
      ? `已签退，本次拜访被标记为异常（${v.evaluation.flags.length} 项）`
      : '已签退，合规校验通过', v.abnormal ? 'warn' : 'ok');

    // 签退时间已在上面落定；这里紧接着把记录表单弹出来，做成"一次操作"
    state.modal = { kind: 'report', id: v.id };
    render();
  }



  function saveEdit(id) {
    const v = state.visits.find((x) => x.id === id);
    if (!v) return;
    const path = `/api/visits/${id}`;
    if (v.status !== 'PLANNED') return fail(path, 409, `只有待签到的计划可以修改（当前状态：${STATUS_LABELS[v.status]}）`);
    const reason = String(val('#ed-reason') || '').trim();
    if (!reason) return fail(path, 400, '修改计划必须填写原因（审计要求）');

    const hcpRec = hcpOf(val('#ed-hcp')) || hcpOf(v.hcpId);
    const prod = productOf(val('#ed-product')) || productOf(v.productId);
    const plannedAt = readDateTime('ed');
    if (!plannedAt) return fail(path, 400, '计划时间不能为空');
    if (new Date(plannedAt).getTime() <= now().getTime()) {
      log('PUT', path, 400, '计划时间不能早于当前时间');
      showFormError('edit-error', '计划时间不能早于当前时间');
      return;
    }

    const before = { hcp: v.hcpName, product: v.product, at: fmtDT(v.plannedAt) };
    const afterAt = fmtDT(plannedAt);
    const changes = [];
    if (before.hcp !== hcpRec.name) changes.push(`医生 ${before.hcp}→${hcpRec.name}`);
    if (before.product !== prod.name) changes.push(`药品 ${before.product}→${prod.name}`);
    if (before.at !== afterAt) changes.push(`时间 ${before.at}→${afterAt}`);
    if (!changes.length) return fail(path, 400, '没有检测到修改内容（未变更则不产生留痕）');

    const baseRec = hospitalOf(hcpRec);
    Object.assign(v, {
      hcpId: hcpRec.id, hcpName: hcpRec.name, dept: hcpRec.dept,
      hospitalId: baseRec.id, hospital: { name: baseRec.name, lat: baseRec.lat, lng: baseRec.lng },
      productId: prod.id, product: prod.name,
      plannedAt,
    });
    v.audit.push({ action: 'EDIT', at: iso(now()), by: me().name, reason, detail: changes.join('；') });
    log('PUT', path, 200, `已修改计划（原因：${reason}）`);
    toast('修改已保存，并写入操作留痕', 'ok');
    state.modal = null;
    render();
  }

  function rebook() {
    const v = active();
    if (!v) return;
    if (!canOperate(v)) { toast('无权限：不能代代表预约', 'error'); return; }
    const p = zoned(new Date(now().getTime() + 7 * 86400000));
    createVisit(v.hcpId, v.productId, `${p.year}-${p.month}-${p.day}T10:00`);
  }

  function doReport(id, data) {
    const v = state.visits.find((x) => x.id === id);
    if (!v) return;
    const path = `/api/visits/${v.id}/report`;
    if (!canOperate(v)) return fail(path, 403, `无权限：${me().title}不能操作代表 ${v.mr} 的拜访`);
    const t = checkTransition('REPORT', v.status);
    if (!t.ok) return fail(path, t.code, t.message);

    const tp = String(data.tp || '').trim();
    if (!tp) {
      log('POST', path, 400, '谈话要点为必填项');
      const err = document.getElementById('rp-error');
      if (err) { err.textContent = '谈话要点为必填项'; err.hidden = false; }
      toast('谈话要点为必填项', 'error');
      return;
    }

    v.report = { talkingPoints: tp, feedback: String(data.fb || '').trim(), materials: !!data.materials };
    delete v.reportMissing;
    v.status = 'REPORTED';
    v.audit.push({ action: 'REPORT', at: iso(now()), by: me().name, reason: '', detail: '已补填拜访记录' });
    log('POST', path, 200, v.abnormal ? '拜访记录已提交（异常记录已留存）' : '拜访记录已提交');
    toast('拜访记录已提交，流程完成', 'ok');
    state.modal = null;
    render();
  }

  function dryRun(kind) {
    const v = active();
    if (!v) { toast('请先选择一条拜访', 'warn'); return; }
    const base = `/api/visits/${v.id}`;

    if (kind === 'checkout-first') {
      const t = checkTransition('CHECKOUT', v.status);
      log('POST', `${base}/checkout`, t.ok ? 200 : t.code,
        t.ok ? `当前状态允许签退（该分支只在 PLANNED 时返回 409）` : t.message);
      toast(t.ok ? '当前状态允许签退，不会触发 409' : t.message, t.ok ? 'ok' : 'error');
    }
    if (kind === 'dup-checkin') {
      const t = checkTransition('CHECKIN', v.status);
      log('POST', `${base}/checkin`, t.ok ? 200 : t.code,
        t.ok ? '当前为「已计划」，首次签到允许（重复签到请再点一次）' : t.message);
      toast(t.ok ? '当前状态允许签到' : t.message, t.ok ? 'ok' : 'error');
    }
    if (kind === 'report-first') {
      const t = checkTransition('REPORT', v.status);
      log('POST', `${base}/report`, t.ok ? 200 : t.code,
        t.ok ? '当前状态允许提交记录' : t.message);
      toast(t.ok ? '当前状态允许提交' : t.message, t.ok ? 'ok' : 'error');
    }
    if (kind === 'bad-lat') {
      const p = parseCoords({ lat: '200', lng: '121.47' });
      log('POST', `${base}/checkin`, p.ok ? 200 : p.code, p.ok ? '通过' : p.error);
      toast(p.error, 'error');
    }
    if (kind === 'product-admin') {
      log('POST', '/api/admin/products', 403, '无权限：药品主数据只能由系统管理员维护');
      toast('403：代表不能新增/下线药品，只能选用在架产品', 'error');
    }
    if (kind === 'swapped') {
      const p = parseCoords({ lat: '121.47', lng: '31.23' });
      log('POST', `${base}/checkin`, p.ok ? 200 : p.code, p.ok ? '通过' : p.error);
      toast(p.error, 'error');
    }
    render();
  }

  /** 状态机的系统迁移：签到后超过阈值仍未签退 → 自动作废（cause=TIMEOUT） */
  /** 两条系统边：计划超时未签到 → 取消；签到超时未签退 → 作废 */
  function sweepTimeouts() {
    const limitMs = state.rules.timeoutHours * 3600 * 1000;
    const nowMs = now().getTime();
    let expired = 0;
    let voided = 0;
    let missing = 0;
    const reportLimitMs = state.rules.reportTimeoutHours * 3600 * 1000;

    state.visits.forEach((v) => {
      // ① PLANNED 超时 → CANCELLED（NO_CHECKIN）
      if (v.status === 'PLANNED') {
        const due = new Date(v.plannedAt).getTime() + limitMs;
        if (nowMs <= due) return;
        const t = checkTransition('EXPIRE_PLAN', v.status);
        if (!t.ok) return;
        const hours = Math.round((nowMs - new Date(v.plannedAt).getTime()) / 3600000);
        v.status = 'CANCELLED';
        v.cancel = { cause: 'NO_CHECKIN', at: iso(now()), by: '系统', reason: `计划时间已过 ${hours} 小时仍未签到，系统代取消` };
        v.audit.push({ action: 'CANCEL', at: iso(now()), by: '系统', reason: v.cancel.reason, detail: '超时未签到，不计入完成' });
        log('POST', `/api/visits/${v.id}/cancel`, 200, `系统代取消：${hours} 小时未签到`);
        expired += 1;
        return;
      }
      // ③ CHECKED_OUT 长期不补记录 → 标记「记录缺失」（不改状态，只加标记）
      if (v.status === 'CHECKED_OUT' && v.checkout && !v.report && !v.reportMissing) {
        const age = nowMs - new Date(v.checkout.at).getTime();
        if (age > reportLimitMs) {
          const hours = Math.round(age / 3600000);
          v.reportMissing = { at: iso(now()), hours };
          v.audit.push({ action: 'REPORT_MISSING', at: iso(now()), by: '系统', reason: `签退后 ${hours} 小时未补记录`, detail: `超过 ${state.rules.reportTimeoutHours} 小时时限，进管理员待办` });
          log('POST', `/api/visits/${v.id}/flag`, 200, `记录缺失：签退后 ${hours} 小时未补记录`);
          missing += 1;
        }
      }

      // ② CHECKED_IN 超时 → VOIDED（TIMEOUT）
      if (v.status === 'CHECKED_IN') {
        const due = new Date(v.checkin.at).getTime() + limitMs;
        if (nowMs <= due) return;
        const t = checkTransition('EXPIRE_VISIT', v.status);
        if (!t.ok) return;
        const hours = Math.round((nowMs - new Date(v.checkin.at).getTime()) / 3600000);
        const reason = `签到后 ${hours} 小时未签退，超出 ${state.rules.timeoutHours} 小时上限`;
        v.status = 'VOIDED';
        v.void = { cause: 'TIMEOUT', at: iso(now()), by: '系统', reason, ...judgeAtVoid(v) };
        v.audit.push({ action: 'VOID', at: iso(now()), by: '系统', reason, detail: '超时未签退，系统作废' });
        log('POST', `/api/visits/${v.id}/void`, 200, `系统超时作废：${reason}`);
        voided += 1;
      }
    });

    if (expired || voided) {
      const parts = [];
      if (expired) parts.push(`超时取消 ${expired} 条`);
      if (voided) parts.push(`超时作废 ${voided} 条`);
      if (missing) parts.push(`记录缺失 ${missing} 条`);
      toast(`系统扫描：${parts.join(' · ')}`, 'warn');
      render();
    }
    return expired + voided;
  }

  /** 作废发生在判定之前，所以必须在这里补跑签到点校验，否则签到证据随记录一起失效 */
  function judgeAtVoid(v) {
    if (!v.checkin) return { distanceIn: null, flags: [] };
    const distanceIn = haversineMeters(v.checkin, v.hospital);
    const flags = [];
    if (distanceIn > RULES.MAX_DISTANCE_M) {
      flags.push({
        code: 'LOCATION_DEVIATION', rule: 'R2', point: 'checkin',
        title: '签到点偏离医院',
        detail: `签到点距医院 ${Math.round(distanceIn)} 米，超出 ${RULES.MAX_DISTANCE_M} 米阈值（作废时补判）`,
      });
    }
    return { distanceIn, flags };
  }

  function doCancel(id, reason) {
    const v = state.visits.find((x) => x.id === id);
    if (!v) return;
    const path = `/api/visits/${v.id}/cancel`;
    if (!canOperate(v)) return fail(path, 403, `无权限：${ACTORS[state.actor].title}不能操作代表 ${v.mr} 的拜访`);
    const t = checkTransition('CANCEL', v.status);
    if (!t.ok) return fail(path, t.code, t.message);
    const why = String(reason || '').trim();
    if (!why) return fail(path, 400, '取消需要填写原因（审计要求）');

    v.status = 'CANCELLED';
    v.cancel = { cause: 'MANUAL', reason: why, at: iso(now()), by: me().name };
    v.audit.push({ action: 'CANCEL', at: iso(now()), by: me().name, reason: why, detail: '主动取消，不计入完成' });
    log('POST', path, 200, `已取消：${why}`);
    toast('计划已取消（需原因，不计入完成）', 'ok');
    state.modal = null;
    render();
  }

  /** 删除：计划阶段 + 纠错窗口内，不需要原因，但保留操作人与时间 */
  function canDelete(v) {
    if (!v || v.status !== 'PLANNED') return false;
    const overdue = now().getTime() > new Date(v.plannedAt).getTime() - 3600000;
    const tooOld = now().getTime() - new Date(v.createdAt).getTime() > DELETE_WINDOW_MS;
    return !overdue && !tooOld;
  }

  function doDelete(id) {
    const v = state.visits.find((x) => x.id === id);
    if (!v) return;
    const path = `/api/visits/${v.id}`;
    if (!canOperate(v)) return fail(path, 403, `无权限：${ACTORS[state.actor].title}不能操作代表 ${v.mr} 的拜访`);
    const t = checkTransition('DELETE', v.status);
    if (!t.ok) return fail(path, t.code, t.message);
    if (!canDelete(v)) return fail(path, 409, '已进入执行窗口或超出纠错时限，只能取消');

    v.status = 'DELETED';
    v.deleted = { at: iso(now()), by: me().name };
    v.audit.push({ action: 'DELETE', at: iso(now()), by: me().name, reason: '', detail: '纠错删除（免原因），不计任何统计' });
    log('DELETE', path, 204, '已删除（纠错窗口内，免原因）');
    toast('计划已删除，不进任何统计', 'ok');
    state.modal = null;
    if (state.activeId === v.id) state.activeId = null;
    render();
  }

  function doVoid(id, reason) {
    const v = state.visits.find((x) => x.id === id);
    if (!v) return;
    const path = `/api/visits/${v.id}/void`;
    if (!canOperate(v)) return fail(path, 403, `无权限：${ACTORS[state.actor].title}不能操作代表 ${v.mr} 的拜访`);
    const t = checkTransition('VOID', v.status);
    if (!t.ok) return fail(path, t.code, t.message);
    const why = String(reason || '').trim();
    if (!why) return fail(path, 400, '作废需要填写原因（审计要求）');

    const judged = judgeAtVoid(v);
    v.status = 'VOIDED';
    v.void = { cause: 'MANUAL', at: iso(now()), by: me().name, reason: why, ...judged };
    v.audit.push({
      action: 'VOID', at: iso(now()), by: me().name, reason: why,
      detail: judged.flags.length ? `作废时补判命中 ${judged.flags.map((f) => f.rule).join('/')}` : '作废时补判未命中规则',
    });
    log('POST', path, 200, judged.flags.length
      ? `已作废（原因：${why}）；作废时补判命中 ${judged.flags.map((f) => f.rule).join('/')}`
      : `已作废（原因：${why}）`);
    toast(judged.flags.length ? '已作废，但签到点偏离医院（已留痕）' : '已作废，不计入完成', judged.flags.length ? 'warn' : 'ok');
    state.modal = null;
    render();
  }

  function switchActor(role) {
    if (!ACTORS[role]) return;
    const from = ACTORS[state.actor];
    state.actor = role;
    state.modal = null;
    const r = ACTORS[role].role;
    state.tab = r === 'ADMIN' ? 'rules' : 'flow';

    const list = visibleVisits();
    if (!list.some((v) => v.id === state.activeId)) state.activeId = list.length ? list[0].id : null;

    log('GET', '/api/session', 200,
      `${from.title} ${from.name} → ${ACTORS[role].title} ${ACTORS[role].name}（数据范围：${ACTORS[role].scope}）`);
    toast(`已切换为${ACTORS[role].title} · ${ACTORS[role].name}`, 'ok');
    render();
  }

  function saveRules() {
    const min = Number(val('#cfg-min'));
    const max = Number(val('#cfg-max'));
    const timeout = Number(val('#cfg-timeout'));
    const reportTimeout = Number(val('#cfg-report'));
    if (!Number.isFinite(min) || min < 30) { toast('最短停留时长需 ≥ 30 秒', 'error'); return; }
    if (!Number.isFinite(max) || max < 50) { toast('最大偏离距离需 ≥ 50 米', 'error'); return; }
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 720) { toast('悬挂超时需在 1~720 小时之间', 'error'); return; }
    if (!Number.isFinite(reportTimeout) || reportTimeout < 1 || reportTimeout > 720) { toast('补记录时限需在 1~720 小时之间', 'error'); return; }
    if (min === state.rules.minDurationSec && max === state.rules.maxDistanceM
      && timeout === state.rules.timeoutHours && reportTimeout === state.rules.reportTimeoutHours) {
      toast('与当前配置相同，未产生新版本', 'warn');
      return;
    }
    const version = 'v' + (state.ruleHistory.length + 1);
    state.rules = {
      minDurationSec: min, maxDistanceM: max, timeoutHours: timeout,
      reportTimeoutHours: reportTimeout, version,
    };
    state.ruleHistory.unshift({
      version, minDurationSec: min, maxDistanceM: max, timeoutHours: timeout, reportTimeoutHours: reportTimeout,
      at: iso(now()), by: me().name, note: '管理员调整阈值 / 超时',
    });
    log('PUT', '/api/admin/rules', 200,
      `规则升级为 ${version}：${min}s / ${max}m / 悬挂 ${timeout}h / 补记录 ${reportTimeout}h`);
    toast(`已生效 ${version}：${min}s / ${max}m / ${timeout}h / ${reportTimeout}h`, 'ok');
    sweepTimeouts();
    render();
  }

  function resetRules() {
    if (state.rules.minDurationSec === 300 && state.rules.maxDistanceM === 500
      && state.rules.timeoutHours === 24 && state.rules.reportTimeoutHours === 72) {
      toast('已是默认值 300 / 500 / 24h / 72h', 'warn');
      return;
    }
    const a = document.getElementById('cfg-min');
    const b = document.getElementById('cfg-max');
    const c = document.getElementById('cfg-timeout');
    const d = document.getElementById('cfg-report');
    if (a) a.value = 300;
    if (b) b.value = 500;
    if (c) c.value = 24;
    if (d) d.value = 72;
    saveRules();
  }

  /* ---------------- 渲染：流程 ---------------- */

  const val = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.value : '';
  };

  function statusPill(status, abnormal) {
    if (abnormal && (status === 'CHECKED_OUT' || status === 'REPORTED')) {
      return '<span class="pill red">异常</span>';
    }
    const cls = { PLANNED: 'gray', CHECKED_IN: 'blue', CHECKED_OUT: 'amber', REPORTED: 'green', CANCELLED: 'gray', VOIDED: 'gray' }[status] || 'gray';
    return `<span class="pill ${cls}">${STATUS_LABELS[status] || status}</span>`;
  }

  function recentVisits(list) {
    const key = (v) => new Date((v.checkin && v.checkin.at) || v.plannedAt).getTime();
    return (list || state.visits).slice().sort((a, b) => key(b) - key(a));
  }

  function stepper(v) {
    const idx = { PLANNED: 1, CHECKED_IN: 2, CHECKED_OUT: 3, REPORTED: 4, CANCELLED: -1 }[v.status];
    const steps = [
      ['拜访计划', 'Plan'],
      ['现场签到', 'Check-in'],
      ['拜访签退', 'Check-out'],
      ['反馈记录', 'Call Report'],
    ];
    return `<div class="stepper">${steps.map(([name, en], i) => {
      const cls = i < idx ? 'done' : i === idx ? 'current' : '';
      return `<div class="step ${cls}">
        <span class="bar"></span>
        <span class="num">${i < idx ? '✓' : i + 1}</span>
        <span class="name">${name}</span>
        <span class="en">${en}</span>
      </div>`;
    }).join('')}</div>`;
  }

  /** 管理员改过医院坐标后，历史拜访仍用签到时快照 */
  function masterMoved(v) {
    const cur = state.master.hospitals.find((h) => h.id === v.hospitalId);
    return !!(cur && (cur.lat !== v.hospital.lat || cur.lng !== v.hospital.lng));
  }

  function visitMeta(v) {
    return `<dl class="kv wide">
      <dt>拜访医生</dt><dd>${esc(v.hcpName)} · ${esc(v.dept)}</dd>
      <dt>目标产品</dt><dd>${esc(v.product)}</dd>
      <dt>计划时间</dt><dd>${fmtDT(v.plannedAt)} ${v.warning ? `<span class="pill amber" title="${esc(v.warning)}">软提示</span>` : ''}</dd>
      <dt>拜访医院</dt><dd>${esc(v.hospital.name)} <span class="muted tiny">(${v.hospital.lat}, ${v.hospital.lng})</span>${masterMoved(v) ? ' <span class="pill amber">主数据已变更</span>' : ''}</dd>
    </dl>${v.warning ? `<div class="callout warn" style="margin-bottom:12px">⚠ ${esc(v.warning)}（不阻断流程，仅提示）</div>` : ''}`;
  }

  function coordsBlock(kind, point) {
    const v = active();
    const prefill = point || (v && v.checkin) || baseForVisit(v);
    return `
      <div class="grid-2">
        <div class="field">
          <label>纬度 Latitude<span class="req">*</span></label>
          <input type="number" step="0.000001" id="${kind}-lat" value="${prefill.lat}" />
        </div>
        <div class="field">
          <label>经度 Longitude<span class="req">*</span></label>
          <input type="number" step="0.000001" id="${kind}-lng" value="${prefill.lng}" />
        </div>
      </div>
      <div class="spots">
        ${spotsFor(baseForVisit(v)).map((s) => `<button class="chip-btn" data-action="spot" data-target="${kind}" data-spot="${s.key}" data-meters="${s.meters}">${s.label} · ${s.meters} 米</button>`).join('')}
      </div>
      <div class="preview" id="${kind}-preview"></div>`;
  }

  function cardCheckin(v) {
    return `<section class="card">
      <div class="card-head">
        <div>
          <h2>第 2 步 · 现场签到（Check-in）</h2>
          <p class="sub">到达医院后签到。系统记录 GPS 坐标与进入时间；坐标本应来自移动端采集，这里手动输入模拟。</p>
        </div>
        <span class="pill gray">待签到</span>
      </div>
      ${visitMeta(v)}
      <div class="field"><label>签到坐标（模拟移动端采集）</label></div>
      ${coordsBlock('in')}
      <div class="btn-row">
        <button class="btn primary" data-action="checkin">签到 · 记录坐标与时间</button>
        <button class="btn ghost" data-action="cancel-open">取消计划</button>
        <button class="btn ghost" data-action="delete-open" data-id="${v.id}">删除（纠错）</button>
      </div>
    </section>`;
  }

  function cardCheckout(v) {
    const dIn = haversineMeters(v.checkin, v.hospital);
    return `<section class="card">
      <div class="card-head">
        <div>
          <h2>第 4 步 · 拜访签退（Check-out）</h2>
          <p class="sub">沟通结束后签退，系统记录离开时间并自动计算停留时长，同时执行合规校验。</p>
        </div>
        <span class="pill blue">已签到</span>
      </div>
      <div class="grid-3" style="margin-bottom:14px">
        <div class="field" style="margin:0">
          <label>签到时间</label>
          <div class="small">${fmtDT(v.checkin.at)}</div>
        </div>
        <div class="field" style="margin:0">
          <label>已停留（实时）</label>
          <div class="small"><strong id="live" style="font-family:var(--mono)">—</strong></div>
        </div>
        <div class="field" style="margin:0">
          <label>签到点距医院</label>
          <div class="small">${Math.round(dIn)} 米</div>
        </div>
      </div>
      <div id="live-hint" class="callout" style="margin-bottom:12px"></div>
      <div class="field"><label>签退坐标</label></div>
      ${coordsBlock('out')}
      <div class="btn-row">
        <button class="btn primary" data-action="checkout">签退 · 计算时长并校验</button>
        <button class="btn tiny" data-action="advance" data-min="5">⏩ 快进 5 分钟</button>
        <button class="btn ghost" data-action="void-open" data-id="${v.id}">作废这次拜访</button>
        <span class="muted tiny">时长 = 签退时间 − 签到时间（服务端计算）</span>
      </div>
    </section>`;
  }

  function flagList(v) {
    const flags = v.evaluation && v.evaluation.flags ? v.evaluation.flags : [];
    if (!flags.length) return '';
    return `<ul class="flag-list">${flags.map((f) => `
      <li class="flag-item">
        <span class="f-tag">${f.rule}</span>
        <span><b>${esc(f.title)}</b>${esc(f.detail)}</span>
      </li>`).join('')}</ul>`;
  }

  function cardReport(v) {
    const ev = v.evaluation;
    return `<section class="card">
      <div class="card-head">
        <div>
          <h2>第 5 步 · 反馈拜访记录（Call Report）</h2>
          <p class="sub">补充谈话要点、医生反馈，以及是否派发了合规学术资料。</p>
        </div>
        ${statusPill(v.status, v.abnormal)}
      </div>

      <div class="verdict ${ev.abnormal ? 'bad' : 'good'}" style="margin:0 0 12px">
        <span class="v-icon">${ev.abnormal ? '⚠' : '✓'}</span>
        <span>
          ${ev.abnormal ? `合规校验未通过 · 命中 ${ev.flags.length} 项异常` : '合规校验通过'}
          <span class="v-sub">停留 ${formatDuration(ev.durationSec)} · 签到 ${Math.round(ev.distanceIn)} 米${ev.distanceOut != null ? ' · 签退 ' + Math.round(ev.distanceOut) + ' 米' : ''}</span>
        </span>
      </div>
      ${flagList(v)}

      <div class="field" style="margin-top:12px">
        <label>谈话要点<span class="req">*</span></label>
        <textarea id="tp" placeholder="例：介绍最新 III 期数据，医生关注不良反应管理">${esc(v.report ? v.report.talkingPoints : '')}</textarea>
      </div>
      <div class="field">
        <label>医生反馈</label>
        <textarea id="fb" placeholder="例：认可疗效，希望补充老年亚组数据">${esc(v.report ? v.report.feedback : '')}</textarea>
      </div>
      <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
        <input type="checkbox" id="materials" ${v.report && v.report.materials ? 'checked' : ''} style="width:auto" />
        已派发合规学术资料（文献复印件等）
      </label>
      <div class="btn-row">
        <button class="btn primary" data-action="report">提交拜访记录</button>
        <span class="muted tiny">已签退：判定已固化，作废窗口已关闭</span>
      </div>
    </section>`;
  }

  function cardCancelled(v) {
    const info = v.cancel || {};
    const auto = info.cause === 'NO_CHECKIN';
    return `<section class="card">
      <div class="card-head">
        <div>
          <h2>计划已取消</h2>
          <p class="sub">${esc(v.id)} · ${esc(v.hcpName)} · ${esc(v.product)}</p>
        </div>
        ${statusPill(v.status, false)}
      </div>
      <div class="verdict bad" style="margin:0 0 14px">
        <span class="v-icon">⊘</span>
        <span>${auto ? '系统代取消（超时未签到）' : '代表主动取消'} · 不计入完成<span class="v-sub">原因：${esc(info.reason || '—')} · ${info.at ? fmtDT(info.at) : ''} · ${esc(info.by || '')}</span></span>
      </div>
      <p class="small muted" style="margin-bottom:14px">
        取消是终态：它会留在"取消统计"里，用来衡量行程与关系的质量（医生停诊、临时改期都算这里）。
        如果只是录错了，应该用「删除」——删除不进任何统计。
      </p>
      <button class="btn ghost" data-action="back-to-list">返回列表</button>
    </section>`;
  }

  function cardDone(v) {
    const ev = v.evaluation;
    return `<section class="card">
      <div class="card-head">
        <div>
          <h2>拜访已完成</h2>
          <p class="sub">${esc(v.id)} · ${esc(v.hcpName)} · ${esc(v.product)}</p>
        </div>
        ${statusPill(v.status, v.abnormal)}
      </div>
      <div class="verdict ${ev.abnormal ? 'bad' : 'good'}" style="margin:0 0 14px">
        <span class="v-icon">${ev.abnormal ? '⚠' : '✓'}</span>
        <span>
          ${ev.abnormal ? `已标记异常（${ev.flags.length} 项）` : '本次拜访合规'}
          <span class="v-sub">时长 ${formatDuration(ev.durationSec)} · 签到 ${Math.round(ev.distanceIn)} 米 · 签退 ${Math.round(ev.distanceOut)} 米</span>
        </span>
      </div>
      ${flagList(v)}
      <dl class="kv wide" style="margin-top:14px">
        <dt>签到</dt><dd>${fmtDT(v.checkin.at)}</dd>
        <dt>签退</dt><dd>${fmtDT(v.checkout.at)}</dd>
        <dt>谈话要点</dt><dd>${esc(v.report.talkingPoints) || '—'}</dd>
        <dt>医生反馈</dt><dd>${esc(v.report.feedback) || '—'}</dd>
        <dt>学术资料</dt><dd>${v.report.materials ? '已派发' : '未派发'}</dd>
      </dl>
      <div class="btn-row">
        <button class="btn" data-action="new-visit">＋ 再建一条拜访</button>
        <button class="btn ghost" data-action="tab" data-tab="board">看月度看板 →</button>
      </div>
    </section>`;
  }

  function cardDeleted(v) {
    const info = v.deleted || {};
    return `<section class="card">
      <div class="card-head">
        <div><h2>计划已删除</h2><p class="sub">${esc(v.id)} · ${esc(v.hcpName)} · ${esc(v.product)}</p></div>
        ${statusPill(v.status, false)}
      </div>
      <div class="verdict na" style="margin:0 0 14px">
        <span class="v-icon">🗑</span>
        <span>纠正性删除 · 不进任何统计<span class="v-sub">${info.at ? fmtDT(info.at) : ''} · ${esc(info.by || '')} · 无需原因（删除只允许发生在纠错窗口内）</span></span>
      </div>
      <p class="small muted" style="margin-bottom:14px">
        删除与取消不同：删除表示"这条本来就不该存在"，所以它不出现在完成率、取消率、作废率任何一个分母里；
        取消表示"这次没去成"，会进取消统计。删除仍保留操作人与时间，供管理员追溯。
      </p>
      <button class="btn ghost" data-action="back-to-list">返回列表</button>
    </section>`;
  }

  function cardFor(v) {
    if (v.status === 'DELETED') return cardDeleted(v);
    if (v.status === 'VOIDED') return cardVoided(v);
    if (v.status === 'CANCELLED') return cardCancelled(v);
    if (v.status === 'PLANNED') return cardCheckin(v);
    if (v.status === 'CHECKED_IN') return cardCheckout(v);
    if (v.status === 'CHECKED_OUT') return cardReport(v);
    return cardDone(v);
  }

  function defaultPlannedAt() {
    const d = new Date(now().getTime() + 7 * 86400000);
    const p = zoned(d);
    return `${p.year}-${p.month}-${p.day}T10:00`;
  }

  function createCard() {
    return `<section class="card">
      <div class="card-head">
        <div>
          <h2>第 1 步 · 拜访计划（Plan）</h2>
          <p class="sub">预约下周要拜访的医生与目标科室；产品维度用于后续统计。</p>
        </div>
        <span class="pill purple">新建</span>
      </div>
      <div class="grid-2">
        <div class="field">
          <label>拜访医生 (HCP)</label>
          <select id="f-hcp">
            ${activeHcps().map((h) => {
              const hp = hospitalOf(h);
              return `<option value="${h.id}">${esc(h.name)} · ${esc(h.dept)} · ${esc(hp ? hp.name : '—')}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="field">
          <label>目标产品</label>
          <select id="f-product">
            ${activeProducts().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>计划拜访时间<span class="req">*</span></label>
        <input type="datetime-local" id="f-planned" value="${defaultPlannedAt()}" />
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="create">创建拜访计划</button>
        ${state.visits.some((v) => v.status !== 'REPORTED') ? '<button class="btn ghost" data-action="cancel-create">取消</button>' : ''}
      </div>
    </section>`;
  }

  function introCard() {
    return `<section class="card">
      <div class="card-head"><div><h2>从哪开始？</h2><p class="sub">全流程 5 步：计划 → 签到 → 签退 → 补记录</p></div></div>
      <ol class="small" style="margin:0;padding-left:20px;color:var(--ink-2);line-height:2">
        <li><b>拜访计划</b> — 选医生、产品、下周时间</li>
        <li><b>现场签到</b> — 填坐标（或点快捷点），记录进入时间</li>
        <li><b>学术沟通</b> — 业务动作，Demo 中由「签退」触发时长计算</li>
        <li><b>拜访签退</b> — 记录离开时间，自动算时长并跑合规校验</li>
        <li><b>反馈记录</b> — 谈话要点 / 医生反馈 / 资料派发</li>
      </ol>
    </section>`;
  }

  /* ---------------- 渲染：侧栏 ---------------- */

  function judgeCard(v) {
    const ev = v && v.evaluation ? v.evaluation : null;
    const dur = ev ? ev.durationSec : null;
    const dIn = ev ? ev.distanceIn : null;
    const dOut = ev ? ev.distanceOut : null;
    const rt = (ev && ev.rules) || state.rules;

    const row = (id, title, valueHtml, state_) => `
      <div class="rule-row">
        <span class="rule-id">${id}</span>
        <span class="r-main"><b>${title}</b><span>${valueHtml}</span></span>
        <span class="rule-verdict ${state_}">${state_ === 'good' ? '✓' : state_ === 'bad' ? '✗' : '·'}</span>
      </div>`;

    const durState = dur == null ? 'na' : dur < rt.minDurationSec ? 'bad' : 'good';
    const inState = dIn == null ? 'na' : dIn > rt.maxDistanceM ? 'bad' : 'good';
    const outState = dOut == null ? 'na' : dOut > rt.maxDistanceM ? 'bad' : 'good';

    let verdictCls = 'na';
    let verdictIcon = '·';
    let verdictText = '尚未开始';
    let verdictSub = '签到后开始计时';

    if (v) {
      if (v.status === 'PLANNED') {
        verdictText = '待签到';
        verdictSub = '尚无时长与位置结论';
      } else if (v.status === 'CANCELLED') {
        verdictText = '已取消';
        verdictSub = '计划未执行，不产生时长与位置判定';
      } else if (v.status === 'CHECKED_IN') {
        verdictText = '计时中';
        verdictSub = '签退后得出最终判定（时长在签退时定格）';
      } else if (ev) {
        verdictCls = ev.abnormal ? 'bad' : 'good';
        verdictIcon = ev.abnormal ? '⚠' : '✓';
        verdictText = ev.abnormal ? `异常 · 命中 ${ev.flags.length} 项` : '合规';
        verdictSub = `时长 ${formatDuration(dur)}`;
      }
    }

    const outdated = !!(ev && ev.rules && ev.rules.version !== state.rules.version);

    return `<section class="card">
      <div class="card-head"><div><h3>合规判定</h3><p class="sub">服务端在签退时计算并存档</p></div>
        <span class="pill purple" title="这条判定依据的规则版本">${rt.version}</span>
      </div>
      ${row('R1', `停留时长 ≥ ${formatDuration(rt.minDurationSec)}`, dur == null ? '—' : formatDuration(dur), durState)}
      ${row('R2', `签到点距医院 ≤ ${rt.maxDistanceM} 米`, dIn == null ? '—' : Math.round(dIn) + ' 米', inState)}
      ${row('R2', `签退点距医院 ≤ ${rt.maxDistanceM} 米`, dOut == null ? '—' : Math.round(dOut) + ' 米', outState)}
      <div class="verdict ${verdictCls}">
        <span class="v-icon">${verdictIcon}</span>
        <span>${verdictText}<span class="v-sub">${verdictSub}</span></span>
      </div>
      ${v && v.evaluation ? flagList(v) : ''}
      <p class="muted tiny" style="margin-top:10px">
        判定依据 <b>${rt.version}</b>（${rt.minDurationSec}s / ${rt.maxDistanceM}m，签退时快照）。
        ${outdated ? `<br />当前规则已升级为 <b>${state.rules.version}</b>（${state.rules.minDurationSec}s / ${state.rules.maxDistanceM}m），只影响之后的判定。` : ''}
        <br />R2 逐点判定：签到与签退各自比对，两点都偏离会各产生一条标记。
      </p>
    </section>`;
  }

  function labCard() {
    if (!isMR()) return '';
    const v = active();
    const dis = v ? '' : 'disabled';
    return `<section class="card">
      <div class="card-head"><div><h3>分支探针（dry-run）</h3><p class="sub">只预览接口返回，不修改数据</p></div></div>
      <p class="muted tiny">正常界面上这些入口不会出现。点击可在右侧日志看到接口会返回 400 / 409。</p>
      <div class="lab-list" style="margin-top:10px">
        <button data-action="lab" data-lab="checkout-first" ${dis}>未签到就签退 <span class="code-tag">→ 409</span></button>
        <button data-action="lab" data-lab="dup-checkin" ${dis}>重复签到 <span class="code-tag">→ 409</span></button>
        <button data-action="lab" data-lab="report-first" ${dis}>未签退就提交报告 <span class="code-tag">→ 409</span></button>
        <button data-action="lab" data-lab="bad-lat" ${dis}>纬度填 200 <span class="code-tag">→ 400</span></button>
        <button data-action="lab" data-lab="swapped" ${dis}>经纬度写反 <span class="code-tag">→ 400</span></button>
        <button data-action="lab" data-lab="product-admin" ${dis}>代表新增药品 <span class="code-tag">→ 403</span></button>
      </div>
    </section>`;
  }

  function logCard() {
    const rows = state.logs.length
      ? state.logs.map((l) => {
        const cls = 's' + String(l.status)[0];
        return `<li class="log-row">
          <time>${fmtClock(new Date(l.at))}</time>
          <div class="log-main">
            <div class="log-line">
              <span class="m">${l.method}</span>
              <code>${esc(l.path)}</code>
              <span class="s-code ${cls}">${l.status}</span>
            </div>
            <div class="log-note">${esc(l.note || '')}</div>
          </div>
        </li>`;
      }).join('')
      : '<li class="log-empty">暂无请求</li>';

    return `<section class="card">
      <div class="card-head">
        <div><h3>事件日志</h3><p class="sub">模拟接口调用与判定结果</p></div>
        <button class="btn tiny ghost" data-action="clear-log">清空</button>
      </div>
      <ul class="log">${rows}</ul>
    </section>`;
  }

  function readonlyBody(v) {
    const ev = v.evaluation || {};
    const dIn = ev.distanceIn != null ? Math.round(ev.distanceIn) + ' 米' : '—';
    const dOut = ev.distanceOut != null ? Math.round(ev.distanceOut) + ' 米' : '—';
    return `<div style="margin-bottom:10px">${statusPill(v.status, v.abnormal)}</div>
      <dl class="kv wide">
        <dt>计划时间</dt><dd>${fmtDT(v.plannedAt)}</dd>
        <dt>签到</dt><dd>${v.checkin ? fmtDT(v.checkin.at) + ' · ' + dIn : '—'}</dd>
        <dt>签退</dt><dd>${v.checkout ? fmtDT(v.checkout.at) + ' · ' + dOut : '—'}</dd>
        <dt>停留时长</dt><dd>${ev.durationSec != null ? formatDuration(ev.durationSec) : '—'}</dd>
        <dt>判定</dt><dd>${v.status === 'PLANNED' ? '未开始' : v.status === 'VOIDED' ? '已作废' : (ev.abnormal ? '异常' : '合规')}${ev.rules ? ' · 依据 ' + ev.rules.version : ''}</dd>
        <dt>作废</dt><dd>${v.void ? `<span class="pill gray">${v.void.cause === 'TIMEOUT' ? '超时作废' : '主动作废'}</span> ${esc(v.void.reason)}` : '—'}</dd>
        ${v.report ? `<dt>谈话要点</dt><dd>${esc(v.report.talkingPoints) || '—'}</dd>` : ''}
      </dl>
      ${flagList(v)}`;
  }

  const STATUS_ORDER = { PLANNED: 0, CHECKED_IN: 1, CHECKED_OUT: 2, REPORTED: 3, CANCELLED: 4, VOIDED: 5, DELETED: 6 };
  const FLAG_SHORT = { DURATION_TOO_SHORT: '时长不足', LOCATION_DEVIATION: '地点偏离' };

  function flagsLabel(v) {
    const flags = (v.evaluation && v.evaluation.flags && v.evaluation.flags.length)
      ? v.evaluation.flags
      : (v.void && v.void.flags && v.void.flags.length ? v.void.flags : null);
    if (!flags) return '无';
    const codes = Array.from(new Set(flags.map((f) => f.code))).sort();
    return codes.map((c) => FLAG_SHORT[c] || c).join('+') + (v.status === 'VOIDED' ? '（作废补判）' : '');
  }

  function sortKey(v, key) {
    if (key === 'status') return STATUS_ORDER[v.status] == null ? 9 : STATUS_ORDER[v.status];
    if (key === 'flags') return flagsLabel(v);
    return new Date(v.plannedAt).getTime();
  }

  function sortVisits(list) {
    const { key, dir } = state.sort;
    const mul = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const ka = sortKey(a, key);
      const kb = sortKey(b, key);
      if (ka < kb) return -mul;
      if (ka > kb) return mul;
      return new Date(b.plannedAt) - new Date(a.plannedAt);
    });
  }

  function sortHeader(key, label) {
    const on = state.sort.key === key;
    const arrow = on ? (state.sort.dir === 'asc' ? '↑' : '↓') : '↕';
    return `<th class="sortable${on ? ' sorted' : ''}" data-action="sort" data-key="${key}">${label}<span class="arrow">${arrow}</span></th>`;
  }

  function mrCounts() {
    const base = state.visits.filter((v) => v.mr === me().name && !v.deleted);
    const by = (st) => base.filter((v) => v.status === st).length;
    return {
      ALL: base.length,
      PLANNED: by('PLANNED'), CHECKED_IN: by('CHECKED_IN'),
      CHECKED_OUT: by('CHECKED_OUT'), REPORTED: by('REPORTED'), CANCELLED: by('CANCELLED'),
      VOIDED: by('VOIDED'),
      deleted: state.visits.filter((v) => v.mr === me().name && v.deleted).length,
    };
  }

  function mrVisits() {
    let list = state.visits.filter((v) => v.mr === me().name);
    if (!state.showDeleted) list = list.filter((v) => !v.deleted);
    if (state.statusFilter !== 'ALL') list = list.filter((v) => v.status === state.statusFilter);
    return sortVisits(list);
  }

  const toLocalInput = (str) => {
    const p = zoned(new Date(str));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };

  function mrRow(v) {
    const deletable = canDelete(v);
    const dur = v.status === 'CHECKED_IN'
      ? '<span class="muted tiny">计时中</span>'
      : v.evaluation && v.evaluation.durationSec != null && v.status !== 'VOIDED'
        ? formatDuration(v.evaluation.durationSec)
        : '<span class="muted tiny">—</span>';

    const statusCell = v.status === 'VOIDED'
      ? `<span class="pill ${v.void && v.void.cause === 'TIMEOUT' ? 'amber' : 'gray'}">${v.void && v.void.cause === 'TIMEOUT' ? '超时作废' : '已作废'}</span>`
      : v.status === 'CANCELLED' && v.cancel && v.cancel.cause === 'NO_CHECKIN'
        ? '<span class="pill amber">超时取消</span>'
        : v.status === 'CHECKED_OUT'
          ? `${statusPill(v.status, false)}<div class="tiny" style="margin-top:2px;color:${v.reportMissing ? 'var(--bad)' : 'var(--muted)'}">${v.reportMissing ? '记录缺失' : '待填记录'}</div>`
          : statusPill(v.status, false);

    const hasFlags = (v.evaluation && v.evaluation.flags && v.evaluation.flags.length)
      || (v.void && v.void.flags && v.void.flags.length);
    const flagCell = hasFlags
      ? `<span class="pill red">${esc(flagsLabel(v))}</span>`
      : (v.status === 'CHECKED_OUT' || v.status === 'REPORTED')
        ? '<span class="pill green">合规</span>'
        : '<span class="muted tiny">—</span>';

    // 只把"此刻真能用"的动作放进菜单；不可用的不显示，但给一行说明，避免以为功能坏了
    const items = [`<button data-action="open" data-id="${v.id}">查看详情</button>`];
    let note = '';
    if (v.status === 'PLANNED') {
      items.push(`<button data-action="edit" data-id="${v.id}">修改计划</button>`);
      items.push(`<button data-action="cancel-open-list" data-id="${v.id}">取消（需原因）</button>`);
      if (deletable) {
        items.push('<div class="sep"></div>');
        items.push(`<button class="danger" data-action="delete" data-id="${v.id}">删除（纠错）</button>`);
      } else {
        note = '已进入执行窗口，只能取消';
      }
    } else if (v.status === 'CHECKED_IN') {
      items.push(`<button data-action="void-open" data-id="${v.id}">作废这次拜访</button>`);
      note = '作废需填原因，签到证据会保留';
    } else if (v.status === 'CHECKED_OUT') {
      note = '已签退：只能补记录，作废窗口已关闭';
    } else if (v.status === 'REPORTED') {
      note = '已完成：记录冻结';
    } else if (v.status === 'CANCELLED') {
      note = '已取消：终态，不可再操作';
    } else if (v.status === 'VOIDED') {
      note = '已作废：终态，证据保留';
    }
    const menuOpen = state.menuId === v.id;
    const actions = `<span class="row-actions">
      <button class="kebab${menuOpen ? ' open' : ''}" data-action="menu" data-id="${v.id}" title="操作" aria-haspopup="true" aria-expanded="${menuOpen}">⋯</button>
      ${menuOpen ? `<span class="menu" role="menu">${items.join('')}${note ? `<div class="note">${note}</div>` : ''}</span>` : ''}
    </span>`;

    return `<tr class="row-click ${v.status === 'DELETED' ? 'row-deleted' : v.status === 'VOIDED' ? 'row-voided' : ''}"
      data-action="open" data-id="${v.id}" title="打开 ${esc(v.id)}">
      <td>${fmtDT(v.plannedAt)}<div class="tiny muted">${esc(v.id)}</div></td>
      <td><b>${esc(v.hcpName)}</b><div class="tiny muted">${esc(v.dept)} · ${esc(v.hospital ? v.hospital.name : '')}</div></td>
      <td>${esc(v.product)}</td>
      <td>${statusCell}</td>
      <td>${flagCell}</td>
      <td class="num small">${dur}</td>
      <td style="white-space:nowrap">${actions}</td>
    </tr>`;
  }

  /* ---------------- 可搜索下拉（医院 / 医生 / 药品） ---------------- */

  const hospitalItems = () => state.master.hospitals
    .filter((h) => h.status === 'ACTIVE' && alive(h))
    .map((h) => ({ value: h.id, label: h.name, meta: h.address || '' }));

  const hcpItems = (hospitalId) => activeHcps()
    .filter((h) => !hospitalId || h.hospitalId === hospitalId)
    .map((h) => {
      const hp = state.master.hospitals.find((x) => x.id === h.hospitalId);
      return { value: h.id, label: h.name, meta: `${h.dept || ''}${hp ? ' · ' + hp.name : ''}` };
    });

  const productItems = () => activeProducts().map((p) => ({ value: p.id, label: p.name, meta: '' }));

  function comboHtml(id, items, selectedValue, placeholder) {
    const sel = items.find((i) => i.value === selectedValue) || items[0] || null;
    return `<div class="combo" data-combo-wrap="${id}">
      <input type="text" class="combo-text" id="${id}-text" data-combo-text="${id}"
             value="${sel ? esc(sel.label) : ''}" placeholder="${esc(placeholder || '搜索…')}"
             autocomplete="off" role="combobox" aria-expanded="false" />
      <input type="hidden" id="${id}" value="${sel ? sel.value : ''}" />
      <button type="button" class="combo-toggle" data-action="combo-toggle" data-combo="${id}" tabindex="-1" aria-label="展开">▾</button>
      <ul class="combo-list" id="${id}-list" role="listbox" hidden>
        ${items.map((i) => `<li role="option" data-value="${esc(i.value)}" data-label="${esc(i.label)}" data-meta="${esc(i.meta || '')}">
          <span class="combo-label">${esc(i.label)}</span>${i.meta ? `<span class="combo-meta">${esc(i.meta)}</span>` : ''}
        </li>`).join('')}
      </ul>
    </div>`;
  }

  /** 换医院时只重建医生这个组合框，不动其它已填字段 */
  function refreshHcpCombo(hospitalId) {
    const wrap = document.querySelector('[data-combo-wrap="f-hcp"]');
    if (!wrap) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = comboHtml('f-hcp', hcpItems(hospitalId), null, '搜索医生');
    wrap.replaceWith(tmp.firstElementChild);
  }

  function openCombo(id) {
    document.querySelectorAll('.combo-list').forEach((el) => { el.hidden = true; });
    const list = document.getElementById(id + '-list');
    if (!list) return;
    list.hidden = false;
    const text = document.getElementById(id + '-text');
    if (text) { text.setAttribute('aria-expanded', 'true'); text.select(); }
    filterCombo(id, '');
  }

  function closeCombos() {
    document.querySelectorAll('.combo-list').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('.combo-text').forEach((el) => el.setAttribute('aria-expanded', 'false'));
  }

  function filterCombo(id, q) {
    const list = document.getElementById(id + '-list');
    if (!list) return;
    const query = String(q || '').trim().toLowerCase();
    let shown = 0;
    Array.from(list.children).forEach((li) => {
      const hay = `${li.dataset.label} ${li.dataset.meta}`.toLowerCase();
      const hit = !query || hay.includes(query);
      li.hidden = !hit;
      li.classList.remove('active');
      if (hit) shown += 1;
    });
    list.classList.toggle('empty', shown === 0);
  }

  function pickCombo(id, value) {
    const list = document.getElementById(id + '-list');
    const text = document.getElementById(id + '-text');
    const hidden = document.getElementById(id);
    if (!list || !text || !hidden) return;
    const li = Array.from(list.children).find((x) => x.dataset.value === value);
    if (!li) return;
    text.value = li.dataset.label;
    hidden.value = li.dataset.value;
    closeCombos();

    if (id === 'f-hospital') {
      state.createHospitalId = hidden.value;
      refreshHcpCombo(hidden.value);
    }
  }

  /** 日期 + 24 小时制时分：显式 00–23，不依赖浏览器 locale */
  function dateTimeField(prefix, valueLike) {
    const d = new Date(valueLike);
    const p = zoned(d);
    const dateVal = `${p.year}-${p.month}-${p.day}`;
    const hourVal = p.hour;
    const minVal = p.minute;

    const nowP = zoned(now());
    const minDate = `${nowP.year}-${nowP.month}-${nowP.day}`;

    // 分钟按 5 分钟步进；若当前值不在步进上（历史数据），额外插进去
    const mins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
    if (!mins.includes(minVal)) { mins.push(minVal); mins.sort(); }

    const opt = (v, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`;

    return `<div class="dt-field">
      <input type="date" id="${prefix}-date" value="${dateVal}" min="${minDate}" />
      <span class="dt-sep">
        <select id="${prefix}-hour" aria-label="小时（24 小时制）">${Array.from({ length: 24 }, (_, i) => opt(String(i).padStart(2, '0'), hourVal)).join('')}</select>
        <span class="dt-colon">:</span>
        <select id="${prefix}-minute" aria-label="分钟">${mins.map((m) => opt(m, minVal)).join('')}</select>
      </span>
    </div>`;
  }

  function readDateTime(prefix) {
    const date = val('#' + prefix + '-date');
    const hour = val('#' + prefix + '-hour');
    const minute = val('#' + prefix + '-minute');
    if (!date) return '';
    return `${date}T${hour}:${minute}`;
  }

  /** 变更时间后撤销二次确认，避免"确认过一次就一直放行" */
  function resetCreateConfirm() {
    const btn = document.querySelector('[data-action="create"]');
    if (btn) { delete btn.dataset.confirmed; btn.textContent = '创建计划'; }
    const warn = document.getElementById('create-warning');
    if (warn) warn.hidden = true;
  }

  /** 弹窗内联错误：不重绘，保住用户已填的内容 */
  function showFormError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.hidden = false; }
    toast(msg, 'error');
  }

  function modalShell({ title, sub: subtitle, body, footer }) {
    return `<div class="modal-backdrop" data-action="modal-close">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <div>
            <h3>${title}</h3>
            ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
          </div>
          <button class="modal-x" data-action="modal-close" aria-label="关闭">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">${footer}</div>
      </div>
    </div>`;
  }

  const modalVisit = () => (state.modal && state.modal.id
    ? state.visits.find((x) => x.id === state.modal.id)
    : null);

  function editModal(v) {
    return modalShell({
      title: '修改计划',
      subtitle: `${esc(v.id)} · 当前：${esc(v.hcpName)} · ${esc(v.product)} · ${fmtDT(v.plannedAt)}`,
      body: `
        <div class="grid-2">
          <div class="field"><label>医生</label>${comboHtml('ed-hcp', hcpItems(null), v.hcpId, '搜索医生 / 科室')}</div>
          <div class="field"><label>药品</label>${comboHtml('ed-product', productItems(), v.productId, '搜索药品')}</div>
        </div>
        <div class="field"><label>计划开始时间</label>
          ${dateTimeField('ed', v.plannedAt)}
        </div>
        <div class="form-error" id="edit-error" hidden></div>
        <div class="field" style="margin-bottom:0"><label>修改原因<span class="req">*</span></label>
          <input type="text" id="ed-reason" placeholder="如 医生临时改期，与科室确认后改到周四上午" />
          <span class="muted tiny">原因会写进操作留痕，管理员能看到</span>
        </div>`,
      footer: `<button class="btn ghost" data-action="modal-close">取消</button>
        <button class="btn primary" data-action="save-edit" data-id="${v.id}">保存修改</button>`,
    });
  }

  function deleteModal(v) {
    const ok = canDelete(v);
    return modalShell({
      title: '删除计划',
      subtitle: `${esc(v.id)} · ${esc(v.hcpName)} · ${esc(v.product)} · ${fmtDT(v.plannedAt)}`,
      body: `<div class="callout${ok ? '' : ' warn'}">
          删除是<b>纠正录入错误</b>：<b>不需要原因</b>，但会自动记录操作人与时间，且<b>不进任何统计</b>——
          完成率、取消率、作废率都不含它。
          <br />窗口：创建后 1 小时内，且距离计划开始还有 1 小时以上。超出窗口请改用「取消」（需原因，进取消统计）。
        </div>
        ${ok ? '' : '<p class="small muted" style="margin:10px 0 0">按钮已禁用：这条已经进入执行窗口，删了会让「计划执行率」失真。</p>'}`,
      footer: `<button class="btn ghost" data-action="modal-close">取消</button>
        <button class="btn danger" data-action="confirm-delete" data-id="${v.id}" ${ok ? '' : 'disabled'}>确认删除</button>`,
    });
  }

  function cancelModal(v) {
    return modalShell({
      title: '取消计划',
      subtitle: `${esc(v.id)} · ${esc(v.hcpName)} · ${esc(v.product)} · ${fmtDT(v.plannedAt)}`,
      body: `
        <div class="field"><label>取消原因<span class="req">*</span></label>
          <select id="cancel-reason">
            <option>医生临时停诊</option>
            <option>时间冲突 / 改期</option>
            <option>科室临时会议</option>
            <option>其他（备注说明）</option>
          </select>
        </div>
        <div class="callout">取消需要原因，并且会留在「取消统计」里——它衡量的是"没去成"的比例，
          与"删除（录入纠错，不入账）"是两件事。</div>`,
      footer: `<button class="btn ghost" data-action="modal-close">返回</button>
        <button class="btn primary" data-action="confirm-cancel" data-id="${v.id}">确认取消</button>`,
    });
  }

  function voidModal(v) {
    return modalShell({
      title: '作废这次拜访',
      subtitle: `${esc(v.id)} · ${esc(v.hcpName)} · 已签到 ${v.checkin ? fmtDT(v.checkin.at) : '—'}`,
      body: `
        <div class="field"><label>作废原因<span class="req">*</span></label>
          <select id="void-reason">
            <option>医生停诊，未见到本人</option>
            <option>误签到（走错院区）</option>
            <option>临时中止，未开展沟通</option>
            <option>其他（需备注说明）</option>
          </select>
        </div>
        <div class="callout warn">作废不会抹掉签到证据：系统会用已有坐标补判 R2，并把结果留在作废记录里。
          签退之后作废窗口就关闭了，这条拜访会正常计入完成。</div>`,
      footer: `<button class="btn ghost" data-action="modal-close">返回</button>
        <button class="btn danger" data-action="confirm-void" data-id="${v.id}">确认作废</button>`,
    });
  }

  function createModal() {
    return modalShell({
      title: '新建拜访计划',
      subtitle: '预约医生与产品；医生、药品只列在架主数据',
      body: `
        <div class="grid-2">
          <div class="field"><label>拜访医院<span class="req">*</span></label>
            ${comboHtml('f-hospital', hospitalItems(), state.createHospitalId, '搜索医院')}
          </div>
          <div class="field"><label>拜访医生 (HCP)<span class="req">*</span></label>
            ${comboHtml('f-hcp', hcpItems(state.createHospitalId), null, '搜索医生 / 科室')}
          </div>
        </div>
        <div class="field"><label>目标产品</label>
          ${comboHtml('f-product', productItems(), null, '搜索药品')}
        </div>
        <div class="field"><label>计划拜访时间<span class="req">*</span></label>
          ${dateTimeField('f', defaultPlannedAt())}
          <span class="muted tiny">24 小时制，不能早于当前时间（${fmtDT(now().toISOString())}）</span>
        </div>
        <div class="form-error" id="create-error" hidden></div>
        <div class="callout warn" id="create-warning" hidden></div>`,
      footer: `<button class="btn ghost" data-action="modal-close">取消</button>
        <button class="btn primary" data-action="create">创建计划</button>`,
    });
  }

  function visitDetailModal(v) {
    return modalShell({
      title: '拜访详情（只读）',
      subtitle: `${esc(v.id)} · ${esc(v.mr)} · ${esc(v.hcpName)} · ${esc(v.product)}`,
      body: readonlyBody(v),
      footer: `<button class="btn ghost" data-action="modal-close">关闭</button>`,
    });
  }

  function reportModal(v) {
    const ev = v.evaluation || {};
    return modalShell({
      title: '补填拜访记录',
      subtitle: `${esc(v.id)} · ${esc(v.hcpName)} · 停留 ${formatDuration(ev.durationSec)} · 签退 ${v.checkout ? fmtDT(v.checkout.at) : '—'}`,
      body: `
        <div class="callout" style="margin-bottom:12px">
          签退时间已经锁定（判定也已完成）。这只是把第 5 步的记录补上，<b>不会改动时长与判定</b>。
        </div>
        <div class="field"><label>谈话要点<span class="req">*</span></label>
          <textarea id="rp-tp" placeholder="例：介绍最新 III 期数据，医生关注不良反应管理"></textarea>
        </div>
        <div class="field"><label>医生反馈</label>
          <textarea id="rp-fb" placeholder="例：认可疗效，希望补充老年亚组数据"></textarea>
        </div>
        <label class="small" style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="rp-materials" style="width:auto" /> 已派发合规学术资料（文献复印件等）
        </label>
        <div class="form-error" id="rp-error" hidden></div>`,
      footer: `<button class="btn ghost" data-action="modal-close">稍后填</button>
        <button class="btn primary" data-action="save-report" data-id="${v.id}">提交记录</button>`,
    });
  }

  function mdDeleteModal(kind, id) {
    const meta = MD_META[kind];
    const rec = mdRecord(kind, id);
    if (!rec) return '';
    const refs = state.visits.filter((v) =>
      (kind === 'hospital' && v.hospitalId === id)
      || (kind === 'hcp' && v.hcpId === id)
      || (kind === 'product' && v.productId === id)).length;
    return modalShell({
      title: `删除${meta.noun}`,
      subtitle: `${esc(rec.name)} · ${esc(rec.id)}`,
      body: `<div class="callout">
          这是<b>逻辑删除</b>：数据库里不会真的删掉这一行，只是打上删除标记、不再出现在任何下拉与列表里。
          历史拜访记录靠<b>快照</b>（当时的姓名、科室、药品名、医院坐标）仍能完整显示，不受影响。
          ${refs ? `<br />当前有 <b>${refs}</b> 条拜访引用了它，删除后这些记录照常可读。` : ''}
        </div>`,
      footer: `<button class="btn ghost" data-action="modal-close">取消</button>
        <button class="btn danger" data-action="md-delete-confirm" data-kind="${kind}" data-id="${id}">确认删除</button>`,
    });
  }

  function modalHost() {
    const m = state.modal;
    if (!m) return '';
    // 这两个不依赖"当前拜访"，要在取 visit 之前处理
    if (m.kind === 'create') return createModal();
    if (m.kind === 'md-delete') return mdDeleteModal(m.mdKind, m.id);
    if (m.kind === 'report') {
      const rv = state.visits.find((x) => x.id === m.id);
      return rv ? reportModal(rv) : '';
    }

    const v = modalVisit();
    if (!v) return '';
    if (m.kind === 'edit') return editModal(v);
    if (m.kind === 'delete') return deleteModal(v);
    if (m.kind === 'cancel') return cancelModal(v);
    if (m.kind === 'void') return voidModal(v);
    if (m.kind === 'visit') return visitDetailModal(v);
    return '';
  }

  function auditCard(v) {
    const list = (v.audit || []).slice().reverse();
    if (!list.length) return '';
    const LABEL = { CREATE: '新建', EDIT: '修改', DELETE: '删除', CANCEL: '取消', CHECKIN: '签到', CHECKOUT: '签退', REPORT: '提交记录' };
    const rows = list.map((a) => `<li class="audit-item">
      <div class="audit-line">
        <time>${fmtDT(a.at)}</time>
        <span class="pill gray">${LABEL[a.action] || a.action}</span>
        <span class="small">${esc(a.by || '')}</span>
      </div>
      ${a.reason ? `<div class="audit-reason">原因：${esc(a.reason)}</div>` : ''}
      ${a.detail ? `<div class="audit-detail">${esc(a.detail)}</div>` : ''}
    </li>`).join('');
    return `<section class="card">
      <div class="card-head"><div><h3>操作留痕</h3><p class="sub">谁在什么时候改了什么、为什么</p></div></div>
      <ul class="audit-list">${rows}</ul>
    </section>`;
  }

  function viewMRList() {
    const counts = mrCounts();
    const list = mrVisits();
    const chips = [
      ['ALL', '全部'], ['PLANNED', '待签到'], ['CHECKED_IN', '进行中'],
      ['CHECKED_OUT', '已签退'], ['REPORTED', '已完成'], ['CANCELLED', '已取消'], ['VOIDED', '已作废'],
    ].map(([k, label]) => `<button class="chip-btn ${state.statusFilter === k ? 'accent' : ''}"
      data-action="status-filter" data-status="${k}">${label} ${counts[k]}</button>`).join('');

    return `<div class="layout" style="grid-template-columns:minmax(0,1fr)">
      <div class="col-main">
        <section class="card">
          <div class="card-head">
            <div>
              <h2>我的拜访计划</h2>
              <p class="sub">${esc(me().name)} · 华东一区 · 共 ${counts.ALL} 条</p>
            </div>
            <button class="btn primary" data-action="new-visit">＋ 新建计划</button>
          </div>
          <div class="list-toolbar">
            <div class="month-switch">${chips}</div>
            <button class="chip-btn ${state.showDeleted ? 'accent' : ''}" data-action="toggle-deleted">
              ${state.showDeleted ? '隐藏已删除' : `显示已删除 ${counts.deleted}`}
            </button>
          </div>
          <table class="data plan-table">
            <thead><tr>
              ${sortHeader('plannedAt', '计划开始时间')}
              <th>医生 / 医院</th>
              <th>药品</th>
              ${sortHeader('status', '状态')}
              ${sortHeader('flags', '异常类型')}
              <th class="num">停留时长</th>
              <th>操作</th>
            </tr></thead>
            <tbody>${list.map(mrRow).join('') || '<tr><td colspan="7" class="muted small">没有符合条件的计划</td></tr>'}</tbody>
          </table>
          <p class="muted tiny" style="margin-top:10px">
            取消（需原因）和删除（免原因，仅创建后 1 小时内且距开始 &gt; 1 小时）都只对「待签到」开放；
            签到后只能签退或作废，签退后判定固化、作废窗口关闭。已完成记录冻结。
          </p>
        </section>

        ${logCard()}
      </div>
      ${modalHost()}
    </div>`;
  }

  function viewMRDetail() {
    const v = active();
    if (!v) return viewMRList();
    return `<div class="layout">
      <div class="col-main">
        <div class="btn-row">
          <button class="btn ghost" data-action="back-to-list">← 返回我的拜访</button>
          <span class="muted tiny">${esc(v.id)} · ${esc(v.hcpName)} · ${esc(v.product)}</span>
        </div>
        ${['PLANNED', 'CHECKED_IN', 'CHECKED_OUT', 'REPORTED'].includes(v.status) ? stepper(v) : ''}
        ${cardFor(v)}
        ${auditCard(v)}
      </div>
      <aside class="col-side">
        ${judgeCard(v)}
        ${labCard()}
        ${logCard()}
      </aside>
      ${modalHost()}
    </div>`;
  }

  function viewFlow() {
    return state.mrView === 'detail' && active() ? viewMRDetail() : viewMRList();
  }

  /* ---------------- 渲染：看板 ---------------- */

  function boardMonths(scope) {
    const set = new Set((scope || state.visits).filter((v) => v.checkin).map((v) => monthKey(v.checkin.at)));
    set.add(monthKey(iso(now())));
    return Array.from(set).sort().reverse();
  }

  function viewBoard() {
    const scope = boardScopeVisits();
    const inMonth = (v) => monthKey((v.checkin && v.checkin.at) || v.plannedAt) === (state.boardMonth || '');
    const months = boardMonths(scope);
    if (!months.includes(state.boardMonth)) state.boardMonth = months[0];
    const m = state.boardMonth;

    // 删除不进任何统计；其余按 checkin（没签到就用计划时间）落月
    const monthVisits = scope.filter((v) => v.status !== 'DELETED'
      && monthKey((v.checkin && v.checkin.at) || v.plannedAt) === m);

    const productList = state.master.products.filter((p) =>
      p.status === 'ACTIVE' || monthVisits.some((v) => v.productId === p.id));

    const rows = productList.map((p) => {
      const all = monthVisits.filter((v) => v.productId === p.id);
      const done = all.filter((v) => statBucket(v.status) === 'DONE');
      const bad = done.filter((v) => v.abnormal).length;
      return {
        id: p.id, name: p.name, inactive: p.status === 'INACTIVE',
        done: done.length, ok: done.length - bad, bad,
        cancelled: all.filter((v) => statBucket(v.status) === 'CANCELLED').length,
        voided: all.filter((v) => statBucket(v.status) === 'VOIDED').length,
      };
    });

    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const totalDone = sum('done');
    const totalBad = sum('bad');
    const totalCancelled = sum('cancelled');
    const totalVoided = sum('voided');
    const max = Math.max(1, ...rows.map((r) => r.done));

    const barRow = (r) => `<tr>
      <td><b>${esc(r.name)}</b>${r.inactive ? ' <span class="pill gray">已下线</span>' : ''}</td>
      <td class="num">${r.done}</td>
      <td class="num">${r.ok}</td>
      <td class="num">${r.bad}</td>
      <td class="num">${r.cancelled || '—'}</td>
      <td class="num">${r.voided || '—'}</td>
      <td class="num">${r.done ? Math.round((r.bad / r.done) * 100) + '%' : '—'}</td>
      <td class="bar-cell">
        <div class="bar">
          <span class="seg-ok" style="width:${(r.ok / max) * 100}%"></span>
          <span class="seg-bad" style="width:${(r.bad / max) * 100}%"></span>
        </div>
        <div class="bar-note">有效 ${r.ok} · 异常 ${r.bad}</div>
      </td>
    </tr>`;

    const detail = monthVisits
      .filter((v) => state.boardProduct === 'ALL' || v.productId === state.boardProduct)
      .sort((a, b) => new Date((b.checkin && b.checkin.at) || b.plannedAt) - new Date((a.checkin && a.checkin.at) || a.plannedAt))
      .map((v) => {
        const when = (v.checkin && v.checkin.at) || v.plannedAt;
        const dur = v.status === 'CHECKED_IN'
          ? '<span class="muted tiny">计时中</span>'
          : v.evaluation && v.evaluation.durationSec != null && v.status !== 'VOIDED'
            ? formatDuration(v.evaluation.durationSec)
            : '<span class="muted tiny">—</span>';
        const dist = v.checkin && v.evaluation && v.evaluation.distanceIn != null
          ? Math.round(v.evaluation.distanceIn) + ' 米' : '—';
        const hasFlags = (v.evaluation && v.evaluation.flags && v.evaluation.flags.length)
          || (v.void && v.void.flags && v.void.flags.length);
        const verdict = v.status === 'VOIDED'
          ? `<span class="pill gray">已作废</span>${hasFlags ? ` <span class="pill red">${esc(flagsLabel(v))}</span>` : ''}`
          : v.status === 'CANCELLED'
            ? '<span class="pill gray">已取消</span>'
            : statusPill(v.status, false) + (v.abnormal ? ' <span class="pill red">异常</span>' : '');
        return `<tr class="row-click${v.status === 'VOIDED' ? ' row-voided' : ''}" data-action="open-visit" data-id="${v.id}">
          <td>${fmtDT(when)}</td>
          ${seesAll() ? `<td>${esc(v.mr)}</td>` : ''}
          <td>${esc(v.hcpName)}</td>
          <td>${esc(v.product)}</td>
          <td class="num">${dur}</td>
          <td class="num">${dist}</td>
          <td style="white-space:nowrap">${verdict}</td>
        </tr>`;
      }).join('');

    const repFilter = '';

    const scopeNote = isMR()
      ? '数据范围：仅本人（代表视角）'
      : '数据范围：全量（管理员视角，只读）';

    return `<div class="layout" style="grid-template-columns:minmax(0,1fr)">
      <div class="col-main">
        <section class="card">
          <div class="board-head">
            <div>
              <h2 style="font-size:16px">${isMR() ? '我的月度统计 · 按产品' : '月度看板 · 按产品'}</h2>
              <p class="sub muted tiny" style="margin-top:3px">
                ${scopeNote}；按「签到时间」落月，未签到的按计划时间；删除不计入任何口径。
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${repFilter}
              <div class="month-switch">
                ${months.map((k) => `<button class="chip-btn ${k === m ? 'accent' : ''}" data-action="month" data-month="${k}">${monthLabel(k)}</button>`).join('')}
              </div>
            </div>
          </div>
          <table class="data" style="margin-top:12px">
            <thead><tr>
              <th>产品</th><th class="num">完成</th><th class="num">有效</th><th class="num">异常</th>
              <th class="num">取消</th><th class="num">作废</th><th class="num">异常率</th><th>分布</th>
            </tr></thead>
            <tbody>${rows.map(barRow).join('')}</tbody>
            <tfoot><tr class="totals">
              <td>合计</td>
              <td class="num">${totalDone}</td>
              <td class="num">${totalDone - totalBad}</td>
              <td class="num">${totalBad}</td>
              <td class="num">${totalCancelled || '—'}</td>
              <td class="num">${totalVoided || '—'}</td>
              <td class="num">${totalDone ? Math.round((totalBad / totalDone) * 100) + '%' : '—'}</td>
              <td class="bar-cell"></td>
            </tr></tfoot>
          </table>
          <p class="muted tiny" style="margin-top:10px">
            <b>完成</b> = 已签退 + 已补记录；<b>有效</b> = 完成 − 异常；<b>异常率</b> = 异常 ÷ 完成。
            <b>取消</b>（未去成）与<b>作废</b>（到了但不算）是两套独立计数，互不重叠；
            删除是纠错，不进任何分母。
          </p>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>${monthLabel(m)} 拜访明细</h3><p class="sub">三种终态都在这里，可按药品筛选</p></div>
            <select id="board-product" style="width:auto;min-width:150px">
              <option value="ALL"${state.boardProduct === 'ALL' ? ' selected' : ''}>全部药品</option>
              ${state.master.products.map((p) => `<option value="${p.id}"${state.boardProduct === p.id ? ' selected' : ''}>${esc(p.name)}${p.status === 'INACTIVE' ? '（已下线）' : ''}</option>`).join('')}
            </select>
          </div>
          <table class="data">
            <thead><tr><th>签到/计划时间</th>${seesAll() ? '<th>代表</th>' : ''}<th>医生</th><th>产品</th><th class="num">停留</th><th class="num">签到距离</th><th>状态</th></tr></thead>
            <tbody>${detail || `<tr><td colspan="7" class="muted small">该月没有记录</td></tr>`}</tbody>
          </table>
        </section>

        ${isAdmin() ? reportBacklogCard(monthVisits) : ''}

        <section class="card">
          <p class="small muted">💡 V-1028 是一条仅计划、未签到的拜访，不计入任何月份统计——「计划 ≠ 拜访发生」。
          页面加载时系统跑了一次超时扫描：一条过期未签到的计划被「超时取消」，一条签到未签退的拜访被「超时作废」。</p>
        </section>
      </div>
      ${modalHost()}
    </div>`;
  }

  function reportBacklogCard(monthVisits) {
    const list = monthVisits
      .filter((v) => v.status === 'CHECKED_OUT')
      .sort((a, b) => new Date(a.checkout.at) - new Date(b.checkout.at));
    if (!list.length) return '';
    const limit = state.rules.reportTimeoutHours;
    const rows = list.map((v) => {
      const hours = Math.round((now().getTime() - new Date(v.checkout.at).getTime()) / 3600000);
      const late = !!v.reportMissing || hours > limit;
      return `<tr class="row-click" data-action="open-visit" data-id="${v.id}">
        <td>${fmtDT(v.checkout.at)}</td>
        <td>${esc(v.mr)}</td>
        <td>${esc(v.hcpName)}</td>
        <td>${esc(v.product)}</td>
        <td class="num">${hours} 小时</td>
        <td>${late ? '<span class="pill red">记录缺失</span>' : '<span class="pill amber">待填记录</span>'}</td>
        <td>${statusPill(v.status, false)}</td>
      </tr>`;
    }).join('');
    return `<section class="card">
      <div class="card-head">
        <div><h3>待补记录 ${list.length}</h3><p class="sub">签退已锁定时间与判定，只差第 5 步的记录；超过 ${limit} 小时标「记录缺失」</p></div>
      </div>
      <table class="data">
        <thead><tr><th>签退时间</th><th>代表</th><th>医生</th><th>药品</th><th class="num">已过</th><th>记录</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }


  /** 主数据三张表的元信息：一处定义，增删改查与日志共用 */
  const MD_META = {
    hospital: { key: 'hospitals', prefix: 'HSP', path: '/api/admin/hospitals', noun: '医院' },
    hcp: { key: 'hcps', prefix: 'HCP', path: '/api/admin/hcps', noun: '医生' },
    product: { key: 'products', prefix: 'PRD', path: '/api/admin/products', noun: '药品' },
  };

  function mdRecord(kind, id) {
    const list = state.master[MD_META[kind].key] || [];
    return list.find((r) => r.id === id) || null;
  }

  function nextMdId(kind) {
    const list = state.master[MD_META[kind].key];
    const n = list.reduce((max, r) => {
      const v = Number(String(r.id).split('-')[1]);
      return Number.isFinite(v) ? Math.max(max, v) : max;
    }, 0) + 1;
    return `${MD_META[kind].prefix}-${String(n).padStart(2, '0')}`;
  }

  function adminFail(path, code, message) {
    log('POST', path, code, message);
    toast(message, 'error');
    render();
  }

  /** 引用检查：被引用就不能物理删除，只能停用/下线 */
  function mdRefs(kind, id) {
    if (kind === 'hospital') {
      const hcps = state.master.hcps.filter((h) => h.hospitalId === id);
      if (hcps.length) return `该医院下还有 ${hcps.length} 位医生，不能删除（先停用或改挂）`;
      const visits = state.visits.filter((v) => v.hospitalId === id);
      if (visits.length) return `该医院已被 ${visits.length} 条拜访引用，不能删除；请改为「下线」`;
    }
    if (kind === 'hcp') {
      const n = state.visits.filter((v) => v.hcpId === id).length;
      if (n) return `该医生已被 ${n} 条拜访引用，不能删除；请改为「停用」`;
    }
    if (kind === 'product') {
      const n = state.visits.filter((v) => v.productId === id).length;
      if (n) return `该药品已被 ${n} 条拜访引用，不能删除；请改为「下线」`;
    }
    return null;
  }

  function mdOpenForm(kind, id) {
    state.mdEdit = { kind, id: id || null };
    render();
  }

  function mdSave(kind) {
    const e = state.mdEdit;
    if (!e || e.kind !== kind) return;
    const meta = MD_META[kind];
    const name = String(val('#md-name') || '').trim();
    if (!name) return adminFail(meta.path, 400, '名称不能为空');

    const list = state.master[meta.key];
    const rec = e.id ? mdRecord(kind, e.id) : null;
    const dup = list.find((r) => r.name === name && r.id !== (rec && rec.id));
    if (dup) return adminFail(meta.path, 409, `同名${meta.noun}已存在：${name}`);

    if (kind === 'hospital') {
      const lat = Number(val('#md-lat'));
      const lng = Number(val('#md-lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return adminFail(meta.path, 400, '坐标非法：纬度需在 -90~90、经度需在 -180~180');
      }
      const address = String(val('#md-address') || '').trim();
      if (rec) { Object.assign(rec, { name, lat, lng, address }); }
      else { list.push({ id: nextMdId(kind), name, lat, lng, address, status: 'ACTIVE' }); }
    }

    if (kind === 'hcp') {
      const hospitalId = val('#md-hospital');
      if (!hospitalId) return adminFail(meta.path, 400, '必须选择所属医院');
      const dept = String(val('#md-dept') || '').trim();
      const title = String(val('#md-title') || '').trim();
      if (rec) { Object.assign(rec, { name, hospitalId, dept, title }); }
      else { list.push({ id: nextMdId(kind), name, hospitalId, dept, title, status: 'ACTIVE' }); }
    }

    if (kind === 'product') {
      if (rec) rec.name = name;
      else list.push({ id: nextMdId(kind), name, status: 'ACTIVE' });
    }

    const method = rec ? 'PUT' : 'POST';
    log(method, rec ? `${meta.path}/${rec.id}` : meta.path, rec ? 200 : 201, `${rec ? '已更新' : '已新增'}${meta.noun}：${name}`);
    toast(`${meta.noun}「${name}」已保存`, 'ok');
    state.mdEdit = null;
    render();
  }

  function mdToggle(kind, id) {
    const meta = MD_META[kind];
    const rec = mdRecord(kind, id);
    if (!rec) return;
    if (rec.status === 'ACTIVE' && kind === 'hospital') {
      const n = state.master.hcps.filter((h) => h.hospitalId === id && h.status === 'ACTIVE').length;
      if (n) return adminFail(`${meta.path}/${id}/status`, 409, `该医院下还有 ${n} 位在册医生，不能下线`);
    }
    rec.status = rec.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const on = rec.status === 'ACTIVE';
    log('PUT', `${meta.path}/${id}/status`, 200, `${rec.name} → ${on ? '启用' : kind === 'hcp' ? '停用' : '下线'}`);
    toast(`${rec.name} 已${on ? '启用' : kind === 'hcp' ? '停用' : '下线'}`, 'ok');
    render();
  }

  function mdDelete(kind, id) {
    const meta = MD_META[kind];
    const rec = mdRecord(kind, id);
    if (!rec) return;
    rec.deletedAt = iso(now());
    rec.deletedBy = ACTORS.ADMIN.name;
    const refs = state.visits.filter((v) =>
      (kind === 'hospital' && v.hospitalId === id)
      || (kind === 'hcp' && v.hcpId === id)
      || (kind === 'product' && v.productId === id)).length;
    log('DELETE', `${meta.path}/${id}`, 200,
      `逻辑删除${meta.noun}「${rec.name}」${refs ? `（${refs} 条历史记录靠快照仍可显示）` : ''}`);
    toast(`已删除「${rec.name}」：数据保留，不再展示`, 'ok');
    state.modal = null;
    render();
  }

  function mdForm(kind) {
    const e = state.mdEdit;
    const open = !!e && e.kind === kind;
    if (!open) {
      return `<div class="btn-row" style="margin-top:12px">
        <button class="btn" data-action="md-new" data-kind="${kind}">＋ 新增${MD_META[kind].noun}</button>
      </div>`;
    }
    const rec = e.id ? mdRecord(kind, e.id) : null;
    const val_ = (k) => (rec ? esc(rec[k]) : '');

    let fields = `<div class="field" style="margin-bottom:8px"><label>名称<span class="req">*</span></label>
      <input type="text" id="md-name" value="${val_('name')}" placeholder="${kind === 'hospital' ? '如 示例人民医院' : kind === 'hcp' ? '如 张三' : '如 可瑞达'}" /></div>`;

    if (kind === 'hospital') {
      fields += `<div class="grid-2">
        <div class="field"><label>纬度</label><input type="number" step="0.000001" id="md-lat" value="${rec ? rec.lat : ''}" /></div>
        <div class="field"><label>经度</label><input type="number" step="0.000001" id="md-lng" value="${rec ? rec.lng : ''}" /></div>
      </div>
      <div class="field"><label>地址</label><input type="text" id="md-address" value="${val_('address')}" /></div>`;
    }
    if (kind === 'hcp') {
      fields += `<div class="grid-2">
        <div class="field"><label>所属医院<span class="req">*</span></label>
          <select id="md-hospital">
            ${state.master.hospitals.map((h) => `<option value="${h.id}"${rec && rec.hospitalId === h.id ? ' selected' : ''}>${esc(h.name)}${h.status === 'INACTIVE' ? '（已下线）' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>科室</label><input type="text" id="md-dept" value="${val_('dept')}" placeholder="如 心内科" /></div>
      </div>
      <div class="field"><label>职称</label><input type="text" id="md-title" value="${val_('title')}" placeholder="如 主任医师" /></div>`;
    }

    return `<div class="md-form">
      <div class="md-form-head">${rec ? '编辑' : '新增'}${MD_META[kind].noun}${rec ? ' · ' + esc(rec.name) : ''}</div>
      ${fields}
      <div class="btn-row">
        <button class="btn primary" data-action="md-save" data-kind="${kind}">保存</button>
        <button class="btn ghost" data-action="md-cancel">取消</button>
      </div>
    </div>`;
  }

  function viewAdmin() {
    const r = state.rules;
    const stale = state.visits.filter((v) => v.evaluation && v.evaluation.rules && v.evaluation.rules.version !== r.version).length;

    const history = state.ruleHistory.map((h) => `<tr>
      <td><b>${h.version}</b></td>
      <td class="num">${h.minDurationSec} 秒</td>
      <td class="num">${h.maxDistanceM} 米</td>
      <td class="num">${h.timeoutHours != null ? h.timeoutHours + ' 小时' : '—'}</td>
      <td class="num">${h.reportTimeoutHours != null ? h.reportTimeoutHours + ' 小时' : '—'}</td>
      <td>${fmtDT(h.at)}</td>
      <td>${esc(h.by)}</td>
      <td class="muted">${esc(h.note)}</td>
    </tr>`).join('');

    const statusPillOf = (st, kind, rec) => rec && rec.deletedAt
      ? '<span class="pill red">已删除</span>'
      : st === 'ACTIVE'
        ? '<span class="pill green">在册</span>'
        : `<span class="pill gray">${kind === 'hcp' ? '停用' : '下线'}</span>`;

    const mdList = (arr) => arr.filter((r) => state.showDeletedMaster || !r.deletedAt);
    const hospitalRows = mdList(state.master.hospitals).map((h) => `<tr data-search="${esc(h.name + ' ' + h.id + ' ' + (h.address || '') + ' ' + h.lat + ' ' + h.lng)}">
      <td><b>${esc(h.name)}</b><div class="tiny muted">${esc(h.id)}</div></td>
      <td class="small">${h.lat}, ${h.lng}</td>
      <td class="small muted">${esc(h.address || '—')}</td>
      <td>${statusPillOf(h.status, 'hospital', h)}</td>
      <td class="num">${state.master.hcps.filter((x) => x.hospitalId === h.id && !x.deletedAt).length}</td>
      <td style="white-space:nowrap">${h.deletedAt ? `<button class="btn tiny ghost" data-action="md-restore" data-kind="hcp" data-id="${h.id}">恢复</button>` : `
        <button class="btn tiny" data-action="md-edit" data-kind="hospital" data-id="${h.id}">编辑</button>
        <button class="btn tiny ghost" data-action="md-toggle" data-kind="hospital" data-id="${h.id}">${h.status === 'ACTIVE' ? '下线' : '启用'}</button>
        <button class="btn tiny ghost" data-action="md-delete" data-kind="hospital" data-id="${h.id}">删除</button>`}
      </td>
    </tr>`).join('');

    const hcpRows = mdList(state.master.hcps).map((h) => {
      const hp = state.master.hospitals.find((x) => x.id === h.hospitalId);
      return `<tr data-search="${esc([h.name, h.id, h.dept, h.title, hp ? hp.name : ''].join(' '))}">
        <td><b>${esc(h.name)}</b><div class="tiny muted">${esc(h.id)}</div></td>
        <td class="small">${esc(hp ? hp.name : '—')}</td>
        <td class="small">${esc(h.dept || '—')}</td>
        <td class="small muted">${esc(h.title || '—')}</td>
        <td>${statusPillOf(h.status, 'hcp', h)}</td>
        <td class="num">${state.visits.filter((v) => v.hcpId === h.id).length}</td>
        <td style="white-space:nowrap">${h.deletedAt ? `<button class="btn tiny ghost" data-action="md-restore" data-kind="hcp" data-id="${h.id}">恢复</button>` : `
          <button class="btn tiny" data-action="md-edit" data-kind="hcp" data-id="${h.id}">编辑</button>
          <button class="btn tiny ghost" data-action="md-toggle" data-kind="hcp" data-id="${h.id}">${h.status === 'ACTIVE' ? '停用' : '启用'}</button>
          <button class="btn tiny ghost" data-action="md-delete" data-kind="hcp" data-id="${h.id}">删除</button>`}
        </td>
      </tr>`;
    }).join('');

    const productRows = mdList(state.master.products).map((p) => `<tr data-search="${esc(p.name + ' ' + p.id + ' ' + p.status)}">
      <td><b>${esc(p.name)}</b><div class="tiny muted">${esc(p.id)}</div></td>
      <td>${statusPillOf(p.status, 'product', p)}</td>
      <td class="num">${state.visits.filter((v) => v.productId === p.id).length}</td>
      <td style="white-space:nowrap">${p.deletedAt ? `<button class="btn tiny ghost" data-action="md-restore" data-kind="hcp" data-id="${h.id}">恢复</button>` : `
        <button class="btn tiny" data-action="md-edit" data-kind="product" data-id="${p.id}">编辑</button>
        <button class="btn tiny ghost" data-action="md-toggle" data-kind="product" data-id="${p.id}">${p.status === 'ACTIVE' ? '下线' : '启用'}</button>
        <button class="btn tiny ghost" data-action="md-delete" data-kind="product" data-id="${p.id}">删除</button>`}
      </td>
    </tr>`).join('');

    return `<div class="layout" style="grid-template-columns:minmax(0,1fr)">
      <div class="col-main">
        <section class="card">
          <div class="card-head">
            <div>
              <h2>合规规则配置</h2>
              <p class="sub">当前生效 ${r.version} · 最短停留 ${r.minDurationSec} 秒 · 最大偏离 ${r.maxDistanceM} 米 · 悬挂超时 ${r.timeoutHours} 小时 · 补记录 ${r.reportTimeoutHours} 小时</p>
            </div>
            <span class="pill purple">${r.version}</span>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>R1 最短停留时长（秒）</label>
              <input type="number" id="cfg-min" value="${r.minDurationSec}" min="30" step="30" />
              <span class="muted tiny">300 秒 = 5 分钟；"不足"取严格小于</span>
            </div>
            <div class="field">
              <label>R2 最大偏离距离（米）</label>
              <input type="number" id="cfg-max" value="${r.maxDistanceM}" min="50" step="50" />
              <span class="muted tiny">签到点与签退点各自与该值比对</span>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>悬挂拜访超时（小时）</label>
              <input type="number" id="cfg-timeout" value="${r.timeoutHours}" min="1" max="720" step="1" />
              <span class="muted tiny">签到后超过该时长仍未签退 → 自动作废（TIMEOUT）</span>
            </div>
            <div class="field">
              <label>补记录时限（小时）</label>
              <input type="number" id="cfg-report" value="${r.reportTimeoutHours}" min="1" max="720" step="1" />
              <span class="muted tiny">签退后超过该时长仍未补记录 → 标「记录缺失」，进管理员待办（不改状态）</span>
            </div>
          </div>
          <div class="btn-row" style="margin-top:2px">
            <button class="btn primary" data-action="save-rules">保存并生效</button>
            <button class="btn ghost" data-action="reset-rules">恢复题面默认（300 / 500）</button>
            <span class="muted tiny">保存会生成新版本，只影响之后签退的拜访</span>
          </div>
          <div class="callout warn" style="margin-top:14px">
            改阈值<b>不会</b>改写历史判定。每条拜访在签退时会把当时的阈值<b>快照</b>写进判定结果，
            当前有 <b>${stale}</b> 条历史记录基于旧版本——否则一次配置变更会让过去的合规结论全部漂移。
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>规则版本历史</h3><p class="sub">可审计：谁在什么时候把阈值改成了什么</p></div></div>
          <table class="data">
            <thead><tr><th>版本</th><th class="num">最短停留</th><th class="num">最大偏离</th><th class="num">悬挂超时</th><th class="num">补记录时限</th><th>生效时间</th><th>操作人</th><th>说明</th></tr></thead>
            <tbody>${history}</tbody>
          </table>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>医院信息表</h3><p class="sub">R2 的唯一输入。改坐标<b>不回算</b>历史拜访（判定用签到时快照）</p></div>
            <div class="table-tools">
              <input class="table-search" data-table-search="hospital" placeholder="搜索医院 / 地址" />
              <button class="chip-btn ${state.showDeletedMaster ? 'accent' : ''}" data-action="toggle-deleted-master">
                ${state.showDeletedMaster ? '隐藏已删除' : '显示已删除'}
              </button>
              <span class="pill gray">${state.master.hospitals.length} 条</span>
            </div>
          </div>
          <table class="data">
            <thead><tr><th>医院</th><th>基准坐标</th><th>地址</th><th>状态</th><th class="num">医生数</th><th>操作</th></tr></thead>
            <tbody>${hospitalRows}</tbody>
          </table>
          ${mdForm('hospital')}
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>医生信息表</h3><p class="sub">拜访对象；停用后不能被新预约，但历史记录保留</p></div>
            <div class="table-tools">
              <input class="table-search" data-table-search="hcp" placeholder="搜索医生 / 科室 / 职称" />
              <span class="pill gray">${state.master.hcps.length} 条</span>
            </div>
          </div>
          <table class="data">
            <thead><tr><th>医生</th><th>所属医院</th><th>科室</th><th>职称</th><th>状态</th><th class="num">拜访数</th><th>操作</th></tr></thead>
            <tbody>${hcpRows}</tbody>
          </table>
          ${mdForm('hcp')}
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>药品信息表</h3><p class="sub">被拜访引用后只能下线，不能物理删除（否则历史记录失去引用）</p></div>
            <div class="table-tools">
              <input class="table-search" data-table-search="product" placeholder="搜索药品" />
              <span class="pill gray">${state.master.products.length} 条</span>
            </div>
          </div>
          <table class="data">
            <thead><tr><th>药品</th><th>状态</th><th class="num">拜访数</th><th>操作</th></tr></thead>
            <tbody>${productRows}</tbody>
          </table>
          ${mdForm('product')}
        </section>

        <section class="card">
          <p class="small muted">💡 删除是<b>逻辑删除</b>：库里保留，只是不再出现在下拉与列表里；历史记录靠快照照常可读。
          「下线 / 停用」则是有意保留、仍可见的状态。想看被删掉的行，点表格右上角「显示已删除」。</p>
        </section>
      </div>
      ${modalHost()}
    </div>`;
  }

  /* ---------------- 渲染入口 ---------------- */

  function render() {
    document.querySelectorAll('#tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });

    // 虚拟时钟只在代表视角有意义：只有他会签到/签退，需要快进时间
    const clockbar = document.querySelector('.clockbar');
    if (clockbar) clockbar.hidden = !isMR();

    const first = document.querySelector('#tabs button[data-tab="flow"]');
    if (first) {
      first.hidden = !isMR();
      first.textContent = '我的拜访';
    }
    const boardTab = document.querySelector('#tabs button[data-tab="board"]');
    if (boardTab) {
      boardTab.hidden = false;          // 两类角色都有月度看板，只是范围不同
      boardTab.textContent = '月度看板';
    }

    const third = document.querySelector('#tabs button[data-tab="rules"]');
    const adminOnly = isAdmin();
    if (third) {
      third.hidden = !adminOnly;
      third.textContent = '规则配置';
    }
    if (!adminOnly && state.tab === 'rules') state.tab = 'board';
    if (!isMR() && state.tab === 'flow') state.tab = 'board';

    const rb = document.getElementById('rolebar');
    if (rb) {
      const BADGE = { MR: 'MR', ADMIN: 'AD' };
      const ROLE = { MR: '代表', ADMIN: '管理员' };
      rb.innerHTML = Object.values(ACTORS).map((a) => `
        <button class="rail-btn ${state.actor === a.key ? 'active' : ''}" data-action="role" data-role="${a.key}"
                title="${a.title} · ${a.name}">
          <span class="rail-icon">${BADGE[a.role]}</span>
          <span class="rail-label">${a.name}</span>
          <span class="rail-name">${ROLE[a.role]}</span>
        </button>`).join('');
    }

    const app = document.getElementById('app');
    if (state.tab === 'flow') app.innerHTML = viewFlow();
    else if (state.tab === 'board') app.innerHTML = viewBoard();
    else app.innerHTML = viewAdmin();

    if (state.tab === 'flow') {
      updatePreview('in');
      updatePreview('out');
      paintLive();
      const chip = document.querySelector('.visit-chip.active');
      if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  function updatePreview(kind) {
    const latEl = document.getElementById(kind + '-lat');
    const lngEl = document.getElementById(kind + '-lng');
    const box = document.getElementById(kind + '-preview');
    if (!latEl || !lngEl || !box) return;

    const p = parseCoords({ lat: latEl.value, lng: lngEl.value });
    if (!p.ok) {
      box.className = 'preview bad';
      box.innerHTML = `<span class="pv-icon">⚠</span><span>${esc(p.error)}</span>`;
      return;
    }
    const base = baseForVisit(active());
    const d = haversineMeters({ lat: p.lat, lng: p.lng }, base);
    const over = d > RULES.MAX_DISTANCE_M;
    box.className = 'preview ' + (over ? 'bad' : 'ok');
    box.innerHTML = `<span class="pv-icon">${over ? '⚠' : '✓'}</span>
      <span>距医院基准点 <strong>${Math.round(d)} 米</strong>，${over
        ? `超出 ${RULES.MAX_DISTANCE_M} 米 → 会被标记 R2 异常`
        : `在 ${RULES.MAX_DISTANCE_M} 米范围内`}</span>`;
  }

  function paintLive() {
    const clockEl = document.getElementById('clock');
    if (clockEl) clockEl.textContent = fmtClockFull(now());

    const v = active();
    if (!v || v.status !== 'CHECKED_IN') return;

    const live = document.getElementById('live');
    const hint = document.getElementById('live-hint');
    const sec = Math.max(0, Math.round((now().getTime() - new Date(v.checkin.at).getTime()) / 1000));

    if (live) live.textContent = formatDuration(sec);
    if (hint) {
      const short = sec < RULES.MIN_DURATION_SEC;
      const stale = sec >= 86400;
      hint.className = 'callout' + (short || stale ? ' warn' : '');
      hint.innerHTML = stale
        ? `⏱ 签到已超过 <b>${Math.floor(sec / 86400)} 天</b>：这是「悬挂拜访」（签到未签退），时长已不可信。应自助作废，或等系统超时收敛。`
        : short
          ? `⏱ 不足 ${RULES.MIN_DURATION_SEC / 60} 分钟：此刻签退会被 <b>R1</b> 标记为异常。用虚拟时钟「+5 分」快进。`
          : `✓ 已过 ${RULES.MIN_DURATION_SEC / 60} 分钟阈值：此刻签退时长合规。`;
    }
  }

  /* ---------------- 事件 ---------------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    const inMenuArea = e.target.closest('.row-actions');
    if (!el) {
      if (state.menuId && !inMenuArea) { state.menuId = null; render(); }
      return;
    }
    const action = el.dataset.action;
    if (action !== 'menu' && state.menuId) state.menuId = null;
    if (action === 'menu') {
      state.menuId = state.menuId === el.dataset.id ? null : el.dataset.id;
      render();
      return;
    }

    if (action === 'tab') { state.tab = el.dataset.tab; render(); }
    else if (action === 'advance') {
      state.offsetMs += Number(el.dataset.min) * 60000;
      render();
    }
    else if (action === 'reset-clock') { state.offsetMs = 0; render(); }
    else if (action === 'new-visit') {
      if (!isMR()) { toast(`${ACTORS[state.actor].title}不能代代表创建拜访`, 'error'); return; }
      if (!state.createHospitalId) {
        const first = state.master.hospitals.find((h) => h.status === 'ACTIVE');
        state.createHospitalId = first ? first.id : null;
      }
      state.modal = { kind: 'create' }; render();
    }
    else if (action === 'role') { switchActor(el.dataset.role); }
    else if (action === 'save-rules') { saveRules(); }
    else if (action === 'reset-rules') { resetRules(); }
    else if (action === 'cancel-open') { state.modal = { kind: 'cancel', id: state.activeId }; render(); }
    else if (action === 'delete-open') { state.modal = { kind: 'delete', id: el.dataset.id }; render(); }
    else if (action === 'open-visit') { state.modal = { kind: 'visit', id: el.dataset.id }; render(); }
    else if (action === 'modal-close') {
      if (el.classList.contains('modal-backdrop') && e.target.closest('.modal')) return;
      state.modal = null; render();
    }
    else if (action === 'confirm-cancel') { doCancel(el.dataset.id, val('#cancel-reason')); }
    else if (action === 'rebook') { rebook(); }
    else if (action === 'md-new') { mdOpenForm(el.dataset.kind, null); }
    else if (action === 'md-edit') { mdOpenForm(el.dataset.kind, el.dataset.id); }
    else if (action === 'md-cancel') { state.mdEdit = null; render(); }
    else if (action === 'md-save') { mdSave(el.dataset.kind); }
    else if (action === 'md-toggle') { mdToggle(el.dataset.kind, el.dataset.id); }
    else if (action === 'md-delete') { state.modal = { kind: 'md-delete', mdKind: el.dataset.kind, id: el.dataset.id }; render(); }
    else if (action === 'md-delete-confirm') { mdDelete(el.dataset.kind, el.dataset.id); }
    else if (action === 'md-restore') {
      const rec = mdRecord(el.dataset.kind, el.dataset.id);
      if (rec) {
        delete rec.deletedAt;
        delete rec.deletedBy;
        log('POST', `/api/admin/${MD_META[el.dataset.kind].path}/${el.dataset.id}/restore`, 200, `已恢复${MD_META[el.dataset.kind].noun}「${rec.name}」`);
        toast(`已恢复「${rec.name}」`, 'ok');
        render();
      }
    }
    else if (action === 'sort') {
      const key = el.dataset.key;
      state.sort = state.sort.key === key
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'plannedAt' ? 'desc' : 'asc' };
      render();
    }
    else if (action === 'status-filter') { state.statusFilter = el.dataset.status; render(); }
    else if (action === 'toggle-deleted') { state.showDeleted = !state.showDeleted; render(); }
    else if (action === 'toggle-deleted-master') { state.showDeletedMaster = !state.showDeletedMaster; render(); }
    else if (action === 'combo-toggle') {
      const id = el.dataset.combo;
      const list = document.getElementById(id + '-list');
      if (list && !list.hidden) closeCombos(); else openCombo(id);
    }
    else if (action === 'open') {
      state.activeId = el.dataset.id; state.mrView = 'detail'; state.modal = null; render();
    }
    else if (action === 'back-to-list') { state.mrView = 'list'; render(); }
    else if (action === 'edit') { state.modal = { kind: 'edit', id: el.dataset.id }; render(); }
    else if (action === 'delete') { state.modal = { kind: 'delete', id: el.dataset.id }; render(); }
    else if (action === 'save-edit') { saveEdit(el.dataset.id); }

    else if (action === 'close-panel') { state.modal = null; render(); }
    else if (action === 'void-open') {
      state.modal = { kind: 'void', id: el.dataset.id }; render();
    }
    else if (action === 'cancel-open-list') {
      state.modal = { kind: 'cancel', id: el.dataset.id }; render();
    }
    else if (action === 'void-close') { state.modal = null; render(); }
    else if (action === 'confirm-void') { doVoid(el.dataset.id, val('#void-reason')); }
    else if (action === 'confirm-delete') { doDelete(el.dataset.id); }
    else if (action === 'confirm-void') { doVoidRequest(el.dataset.id, val('#void-reason')); }
    else if (action === 'void-decision') { doVoidDecision(el.dataset.id, el.dataset.decision); }
    else if (action === 'cancel-create') { state.modal = null; render(); }
    else if (action === 'select') { state.activeId = el.dataset.id; state.modal = null; render(); }
    else if (action === 'create') {
      const plannedAt = readDateTime('f');
      const ms = plannedAt ? new Date(plannedAt).getTime() : NaN;
      if (!Number.isFinite(ms)) { showFormError('create-error', '请选择计划时间'); return; }
      if (ms <= now().getTime()) { showFormError('create-error', '计划时间不能早于当前时间，请选择未来的时间'); return; }

      const minutes = Math.round((ms - now().getTime()) / 60000);
      if (minutes <= 60 && el.dataset.confirmed !== '1') {
        // 第一次点击：只给出警示，把按钮换成确认态
        const warn = document.getElementById('create-warning');
        if (warn) {
          warn.hidden = false;
          warn.innerHTML = `该计划将在 <b>${minutes} 分钟</b>后开始，创建后立刻进入执行窗口：<b>不能删除，只能取消</b>，且签到点必须落在医院 500 米内。确认要现在创建吗？`;
        }
        el.dataset.confirmed = '1';
        el.textContent = '仍要创建';
        const err = document.getElementById('create-error');
        if (err) err.hidden = true;
        return;
      }
      createVisit(val('#f-hcp'), val('#f-product'), plannedAt);
    }
    else if (action === 'spot') {
      const spot = spotsFor(baseForVisit(active())).find((s) => s.key === el.dataset.spot);
      const target = el.dataset.target;
      const latEl = document.getElementById(target + '-lat');
      const lngEl = document.getElementById(target + '-lng');
      if (spot && latEl && lngEl) {
        latEl.value = spot.point.lat;
        lngEl.value = spot.point.lng;
        updatePreview(target);
      }
    }
    else if (action === 'checkin') { doCheckin(); }
    else if (action === 'checkout') { doCheckout(); }
    else if (action === 'report') {
      doReport(state.activeId, {
        tp: val('#tp'), fb: val('#fb'),
        materials: !!(document.getElementById('materials') || {}).checked,
      });
    }
    else if (action === 'save-report') {
      doReport(el.dataset.id, {
        tp: val('#rp-tp'), fb: val('#rp-fb'),
        materials: !!(document.getElementById('rp-materials') || {}).checked,
      });
    }
    else if (action === 'lab') { dryRun(el.dataset.lab); }
    else if (action === 'clear-log') { state.logs = []; render(); }
    else if (action === 'month') { state.boardMonth = el.dataset.month; render(); }
  });

  document.addEventListener('mousedown', (e) => {
    const li = e.target.closest('.combo-list li');
    if (!li) return;
    e.preventDefault();
    const wrap = li.closest('[data-combo-wrap]');
    if (wrap) pickCombo(wrap.dataset.comboWrap, li.dataset.value);
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'board-product') { state.boardProduct = e.target.value; render(); }
    if (/^f-(date|hour|minute)$/.test(e.target.id)) resetCreateConfirm();
    if (e.target.id === 'f-hospital') {
      state.createHospitalId = e.target.value;
      const hcpSel = document.getElementById('f-hcp');
      if (hcpSel) hcpSel.innerHTML = hcpOptions(state.createHospitalId);
    }
  });

  document.addEventListener('keydown', (e) => {
    const comboId = e.target.dataset && e.target.dataset.comboText;
    if (comboId) {
      const list = document.getElementById(comboId + '-list');
      const items = list ? Array.from(list.children).filter((li) => !li.hidden) : [];
      let idx = items.findIndex((li) => li.classList.contains('active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list && list.hidden) { openCombo(comboId); return; }
        idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
        items.forEach((li) => li.classList.remove('active'));
        if (items[idx]) { items[idx].classList.add('active'); items[idx].scrollIntoView({ block: 'nearest' }); }
        return;
      }
      if (e.key === 'Enter' && idx >= 0 && items[idx]) { e.preventDefault(); pickCombo(comboId, items[idx].dataset.value); return; }
      if (e.key === 'Escape') { closeCombos(); return; }
    }
    if (e.key === 'Escape' && state.modal) { state.modal = null; render(); }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.combo')) closeCombos();
  }, true);

  document.addEventListener('input', (e) => {
    const comboId = e.target.dataset && e.target.dataset.comboText;
    if (comboId) {
      const list = document.getElementById(comboId + '-list');
      if (list && list.hidden) openCombo(comboId);
      filterCombo(comboId, e.target.value);
      return;
    }
    if (e.target.dataset && e.target.dataset.tableSearch) {
      const q = e.target.value.trim().toLowerCase();
      const card = e.target.closest('.card');
      if (card) {
        card.querySelectorAll('tbody tr').forEach((tr) => {
          const hay = (tr.dataset.search || tr.textContent || '').toLowerCase();
          tr.hidden = !!q && !hay.includes(q);
        });
      }
      return;
    }
    const id = e.target.id || '';
    if (/^in-(lat|lng)$/.test(id)) updatePreview('in');
    else if (/^out-(lat|lng)$/.test(id)) updatePreview('out');
  });

  setInterval(() => { paintLive(); sweepTimeouts(); }, 1000);

  log('GET', '/api/visits', 200, '已加载种子数据（10 条历史拜访 + 1 条仅计划的拜访）');

  // 调试/自动化钩子（便于截图验证与二次开发，正常使用不需要）
  window.__veevaDemo = {
    state, render,
    switchActor, saveRules, resetRules,
    checkin: doCheckin,
    checkout: doCheckout,
    report: doReport,
  };

  sweepTimeouts();
  render();
})();
