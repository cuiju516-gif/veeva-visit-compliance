import type { ApiError, Position, ReportInput } from '../api';
import { el, must } from '../dom';
import { formatCoordinate, formatDateTime, formatDistance, formatDuration, formatStatus } from '../format';
import { haversineMeters, LOCATION_LIMIT_METERS } from '../distance';
import type { AppState } from '../state';
import type { Material, MaterialKind, Visit, VisitStatus } from '../types';
import { createErrorBanner } from './errorBanner';

export interface DetailHandlers {
  onCheckIn(visitId: string, position: Position): Promise<void>;
  onCheckOut(visitId: string, position: Position): Promise<void>;
  onSubmitReport(visitId: string, report: ReportInput): Promise<void>;
  onCancel(visitId: string, reason: string): Promise<void>;
  onVoid(visitId: string, reason: string): Promise<void>;
  onDelete(visitId: string): Promise<void>;
}

export interface DetailView {
  update(state: AppState): void;
}

interface MaterialDraft {
  name: string;
  kind: MaterialKind;
}

const MATERIAL_KINDS: Array<{ value: MaterialKind; label: string }> = [
  { value: 'slide', label: 'Slide' },
  { value: 'reprint', label: '重印件' },
  { value: 'document', label: '文献' },
  { value: 'other', label: 'Other' },
];

const STEP_LABELS = ['计划', '签到', '学术沟通', '签退', '反馈记录'];

const STEP_STATES: Record<VisitStatus, Array<'done' | 'current' | 'pending'>> = {
  PLANNED: ['done', 'current', 'pending', 'pending', 'pending'],
  CHECKED_IN: ['done', 'done', 'current', 'pending', 'pending'],
  CHECKED_OUT: ['done', 'done', 'done', 'done', 'current'],
  REPORTED: ['done', 'done', 'done', 'done', 'done'],
  // Terminal states ended early: the steps that did not happen stay pending, and
  // no step is "current" because the visit will not advance any further.
  CANCELLED: ['done', 'pending', 'pending', 'pending', 'pending'],
  VOIDED: ['done', 'done', 'pending', 'pending', 'pending'],
  DELETED: ['done', 'pending', 'pending', 'pending', 'pending'],
};

const TEMPLATE = `
  <section class="card detail-card" data-testid="visit-detail" aria-labelledby="detail-heading">
    <div data-detail-banner></div>
    <div class="detail-empty" data-detail-empty>
      <p data-detail-empty-text>从左侧列表选择一条拜访，查看详情与合规证据。</p>
    </div>
    <div class="detail-body" data-detail-body hidden>
      <header class="detail-head">
        <div class="detail-title">
          <p class="eyebrow">拜访详情</p>
          <h2 id="detail-heading" data-detail-hcp></h2>
          <p class="detail-subtitle" data-detail-subtitle></p>
        </div>
        <span class="pill" data-status-pill data-testid="status-pill"></span>
      </header>

      <div class="abnormal-panel" data-abnormal hidden aria-labelledby="abnormal-heading">
        <div class="abnormal-head">
          <h3 id="abnormal-heading">异常拜访</h3>
          <span class="badge badge-abnormal">异常</span>
        </div>
        <p class="abnormal-intro">服务端在签退时命中以下合规规则，全部列出。</p>
        <ul class="flag-list" data-flag-list data-testid="flag-list"></ul>
      </div>

      <p class="compliance-note" data-compliance-note hidden></p>
      <ol class="timeline" data-timeline aria-label="Visit steps"></ol>
      <p class="meta-line" data-meta></p>

      <section class="step" aria-labelledby="checkin-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">第 2 步</p>
            <h3 id="checkin-heading">签到</h3>
          </div>
        </div>
        <p class="hint">坐标与医院登记基准点比对（阈值 500 米）。时间戳由服务端生成。</p>
        <p class="record" data-checkin-record hidden></p>
        <form class="geo-form" data-checkin-form data-testid="checkin-form">
          <div class="field">
            <label for="checkin-lat">纬度</label>
            <input id="checkin-lat" data-testid="checkin-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkin-distance">
          </div>
          <div class="field">
            <label for="checkin-lng">经度</label>
            <input id="checkin-lng" data-testid="checkin-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkin-distance">
          </div>
          <p class="distance-hint" id="checkin-distance" data-checkin-distance data-testid="distance-hint" aria-live="polite"></p>
          <div data-checkin-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkin-submit">签到</button>
            <span class="hint" data-checkin-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="checkout-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">第 4 步</p>
            <h3 id="checkout-heading">签退</h3>
          </div>
        </div>
        <p class="hint">签退结束本次停留。服务端计算时长，并重新校验签到点与签退点。</p>
        <p class="record" data-checkout-record hidden></p>
        <p class="duration-line">服务端计算时长：<strong class="duration-value" data-duration-value data-testid="duration-value">—</strong> <span class="hint" data-duration-note></span></p>
        <form class="geo-form" data-checkout-form data-testid="checkout-form">
          <div class="field">
            <label for="checkout-lat">纬度</label>
            <input id="checkout-lat" data-testid="checkout-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkout-distance">
          </div>
          <div class="field">
            <label for="checkout-lng">经度</label>
            <input id="checkout-lng" data-testid="checkout-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkout-distance">
          </div>
          <p class="distance-hint" id="checkout-distance" data-checkout-distance data-testid="checkout-distance-hint" aria-live="polite"></p>
          <div data-checkout-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkout-submit">签退</button>
            <span class="hint" data-checkout-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="report-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">第 5 步</p>
            <h3 id="report-heading">拜访记录</h3>
          </div>
        </div>
        <form class="report-form" data-report-form data-testid="report-form">
          <div class="field">
            <label for="report-talking-points">谈话要点</label>
            <textarea id="report-talking-points" data-testid="report-talking-points" rows="3" maxlength="4000"></textarea>
          </div>
          <div class="field">
            <label for="report-feedback">医生反馈</label>
            <textarea id="report-feedback" data-testid="report-feedback" rows="3" maxlength="4000"></textarea>
          </div>
          <label class="checkbox">
            <input type="checkbox" data-testid="report-materials-distributed" data-materials-distributed>
            <span>已派发资料</span>
          </label>
          <div class="materials" data-materials-block hidden>
            <div class="materials-head">
              <span class="materials-title">资料</span>
              <button class="btn btn-small" type="button" data-testid="report-material-add" data-material-add>添加资料</button>
            </div>
            <div class="materials-list" data-material-rows></div>
          </div>
          <div data-report-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="report-submit">提交拜访记录</button>
            <span class="hint" data-report-hint></span>
          </div>
        </form>
      </section>

      <section class="card detail-card" data-terminal-card aria-labelledby="terminal-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">提前结束这次拜访</p>
            <h3 id="terminal-heading">取消或作废</h3>
          </div>
        </div>
        <p class="hint" data-terminal-hint></p>
        <div class="field">
          <label for="terminal-reason">原因（取消与作废必填）</label>
          <textarea id="terminal-reason" data-testid="terminal-reason" rows="2" maxlength="500"></textarea>
        </div>
        <div data-terminal-banner></div>
        <div class="form-actions">
          <button class="btn btn-small" type="button" data-testid="cancel-submit" data-cancel-submit>取消计划</button>
          <button class="btn btn-small" type="button" data-testid="void-submit" data-void-submit>作废拜访</button>
          <button class="btn btn-small btn-danger" type="button" data-testid="delete-submit" data-delete-submit>删除计划</button>
        </div>
      </section>
    </div>
  </section>
`;

function isMaterialKind(value: string): value is MaterialKind {
  return value === 'slide' || value === 'reprint' || value === 'document' || value === 'other';
}

function readPosition(latInput: HTMLInputElement, lngInput: HTMLInputElement): Position | null {
  const lat = Number.parseFloat(latInput.value);
  const lng = Number.parseFloat(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function distanceText(latInput: HTMLInputElement, lngInput: HTMLInputElement, visit: Visit): string {
  if (latInput.value.trim() === '' || lngInput.value.trim() === '') {
    return '填入经纬度后显示与医院基准点的距离。';
  }
  const lat = Number.parseFloat(latInput.value);
  const lng = Number.parseFloat(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '填入合法数字后显示距离。';
  }
  if (!Number.isFinite(visit.baseLat) || !Number.isFinite(visit.baseLng)) {
    return '医院基准坐标不可用。';
  }
  const meters = haversineMeters({ lat, lng }, { lat: visit.baseLat, lng: visit.baseLng });
  if (meters > LOCATION_LIMIT_METERS) {
    return `距医院基准点 ${formatDistance(meters)} —— 超出 ${LOCATION_LIMIT_METERS} 米阈值。`;
  }
  return `距医院基准点 ${formatDistance(meters)} —— 在 ${LOCATION_LIMIT_METERS} 米阈值内。`;
}

export function mountDetailView(host: HTMLElement, handlers: DetailHandlers): DetailView {
  host.innerHTML = TEMPLATE;

  const card = must<HTMLElement>(host, '.detail-card');
  const empty = must<HTMLElement>(host, '[data-detail-empty]');
  const emptyText = must<HTMLElement>(host, '[data-detail-empty-text]');
  const body = must<HTMLElement>(host, '[data-detail-body]');
  const hcpName = must<HTMLElement>(host, '[data-detail-hcp]');
  const subtitle = must<HTMLElement>(host, '[data-detail-subtitle]');
  const statusPill = must<HTMLElement>(host, '[data-status-pill]');
  const abnormalPanel = must<HTMLElement>(host, '[data-abnormal]');
  const flagList = must<HTMLUListElement>(host, '[data-flag-list]');
  const complianceNote = must<HTMLElement>(host, '[data-compliance-note]');
  const timeline = must<HTMLOListElement>(host, '[data-timeline]');
  const metaLine = must<HTMLElement>(host, '[data-meta]');

  const checkinForm = must<HTMLFormElement>(host, '[data-checkin-form]');
  const checkinLat = must<HTMLInputElement>(host, '#checkin-lat');
  const checkinLng = must<HTMLInputElement>(host, '#checkin-lng');
  const checkinSubmit = must<HTMLButtonElement>(host, '[data-testid="checkin-submit"]');
  const checkinRecord = must<HTMLElement>(host, '[data-checkin-record]');
  const checkinDistance = must<HTMLElement>(host, '[data-checkin-distance]');
  const checkinHint = must<HTMLElement>(host, '[data-checkin-hint]');

  const checkoutForm = must<HTMLFormElement>(host, '[data-checkout-form]');
  const checkoutLat = must<HTMLInputElement>(host, '#checkout-lat');
  const checkoutLng = must<HTMLInputElement>(host, '#checkout-lng');
  const checkoutSubmit = must<HTMLButtonElement>(host, '[data-testid="checkout-submit"]');
  const checkoutRecord = must<HTMLElement>(host, '[data-checkout-record]');
  const checkoutDistance = must<HTMLElement>(host, '[data-checkout-distance]');
  const checkoutHint = must<HTMLElement>(host, '[data-checkout-hint]');
  const durationValue = must<HTMLElement>(host, '[data-duration-value]');
  const durationNote = must<HTMLElement>(host, '[data-duration-note]');

  const reportForm = must<HTMLFormElement>(host, '[data-report-form]');
  const talkingPoints = must<HTMLTextAreaElement>(host, '[data-testid="report-talking-points"]');
  const feedback = must<HTMLTextAreaElement>(host, '[data-testid="report-feedback"]');
  const materialsDistributed = must<HTMLInputElement>(host, '[data-materials-distributed]');
  const materialsBlock = must<HTMLElement>(host, '[data-materials-block]');
  const materialRows = must<HTMLElement>(host, '[data-material-rows]');
  const materialAdd = must<HTMLButtonElement>(host, '[data-material-add]');
  const reportSubmit = must<HTMLButtonElement>(host, '[data-testid="report-submit"]');
  const reportHint = must<HTMLElement>(host, '[data-report-hint]');

  const terminalReason = must<HTMLTextAreaElement>(host, '[data-testid="terminal-reason"]');
  const cancelSubmit = must<HTMLButtonElement>(host, '[data-cancel-submit]');
  const voidSubmit = must<HTMLButtonElement>(host, '[data-void-submit]');
  const deleteSubmit = must<HTMLButtonElement>(host, '[data-delete-submit]');
  const terminalHint = must<HTMLElement>(host, '[data-terminal-hint]');

  const detailBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-detail-banner]').append(detailBanner.element);
  const checkinBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-checkin-banner]').append(checkinBanner.element);
  const checkoutBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-checkout-banner]').append(checkoutBanner.element);
  const terminalBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-terminal-banner]').append(terminalBanner.element);
  const reportBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-report-banner]').append(reportBanner.element);

  let currentVisit: Visit | null = null;
  let formVisitId: string | null = null;
  let busy = false;
  let lastCheckinError: ApiError | null = null;
  let lastCheckoutError: ApiError | null = null;
  let lastReportError: ApiError | null = null;
  let materials: MaterialDraft[] = [];
  let materialFieldSeq = 0;

  function updateDistance(
    latInput: HTMLInputElement,
    lngInput: HTMLInputElement,
    output: HTMLElement,
    visit: Visit,
  ): void {
    const text = distanceText(latInput, lngInput, visit);
    output.textContent = text;
    const meters = haversineMeters(
      { lat: Number.parseFloat(latInput.value), lng: Number.parseFloat(lngInput.value) },
      { lat: visit.baseLat, lng: visit.baseLng },
    );
    output.classList.toggle('warn', Number.isFinite(meters) && meters > LOCATION_LIMIT_METERS);
  }

  function renderMaterials(): void {
    materialRows.replaceChildren();
    materials.forEach((draft, index) => {
      const row = el('div', 'material-row');
      materialFieldSeq += 1;
      const nameId = `material-name-${materialFieldSeq}`;
      const kindId = `material-kind-${materialFieldSeq}`;

      const nameLabel = el('label', 'sr-only', `Material ${index + 1} name`);
      nameLabel.htmlFor = nameId;
      const nameInput = el('input');
      nameInput.id = nameId;
      nameInput.type = 'text';
      nameInput.value = draft.name;
      nameInput.placeholder = 'Name';
      nameInput.dataset.testid = 'report-material-name';
      nameInput.addEventListener('input', () => {
        draft.name = nameInput.value;
      });

      const kindLabel = el('label', 'sr-only', `Material ${index + 1} kind`);
      kindLabel.htmlFor = kindId;
      const kindSelect = el('select');
      kindSelect.id = kindId;
      kindSelect.dataset.testid = 'report-material-kind';
      for (const kind of MATERIAL_KINDS) {
        const item = document.createElement('option');
        item.value = kind.value;
        item.textContent = kind.label;
        kindSelect.append(item);
      }
      kindSelect.value = draft.kind;
      kindSelect.addEventListener('change', () => {
        draft.kind = isMaterialKind(kindSelect.value) ? kindSelect.value : 'document';
      });

      const remove = el('button', 'btn btn-small', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove material ${index + 1}`);
      remove.addEventListener('click', () => {
        materials.splice(index, 1);
        renderMaterials();
        materialAdd.focus();
      });

      row.append(nameLabel, nameInput, kindLabel, kindSelect, remove);
      materialRows.append(row);
    });
  }

  function addMaterial(): void {
    reportBanner.clear();
    materials.push({ name: '', kind: 'document' });
    renderMaterials();
    const inputs = materialRows.querySelectorAll<HTMLInputElement>('[data-testid="report-material-name"]');
    const last = inputs.item(inputs.length - 1);
    if (last) last.focus();
  }

  function toggleMaterials(): void {
    materialsBlock.hidden = !materialsDistributed.checked;
    if (materialsDistributed.checked && materials.length === 0) {
      materials.push({ name: '', kind: 'document' });
      renderMaterials();
    }
  }

  materialsDistributed.addEventListener('change', toggleMaterials);
  materialAdd.addEventListener('click', addMaterial);

  function resetForms(visit: Visit): void {
    checkinLat.value = String(visit.checkin?.lat ?? visit.baseLat);
    checkinLng.value = String(visit.checkin?.lng ?? visit.baseLng);
    checkoutLat.value = String(visit.checkout?.lat ?? visit.baseLat);
    checkoutLng.value = String(visit.checkout?.lng ?? visit.baseLng);
    updateDistance(checkinLat, checkinLng, checkinDistance, visit);
    updateDistance(checkoutLat, checkoutLng, checkoutDistance, visit);

    talkingPoints.value = visit.talkingPoints;
    feedback.value = visit.hcpFeedback;
    materialsDistributed.checked = visit.materialsDistributed;
    materials = visit.materials.map((material) => ({ name: material.name, kind: material.kind }));
    renderMaterials();
    toggleMaterials();

    checkinBanner.clear();
    checkoutBanner.clear();
    reportBanner.clear();
  }

  function renderTimeline(status: VisitStatus): void {
    timeline.replaceChildren();
    const states = STEP_STATES[status];
    STEP_LABELS.forEach((label, index) => {
      const state = states[index] ?? 'pending';
      const item = el('li', `timeline-step is-${state}`);
      item.append(el('span', 'timeline-index', String(index + 1)));
      item.append(el('span', 'timeline-label', label));
      const stateText = state === 'done' ? 'completed' : state === 'current' ? 'current' : 'pending';
      item.append(el('span', 'sr-only', `: ${stateText}`));
      if (state === 'current') item.setAttribute('aria-current', 'step');
      timeline.append(item);
    });
  }

  function renderRecord(target: HTMLElement, label: string, point: NonNullable<Visit['checkin']>): void {
    target.hidden = false;
    target.textContent =
      `${label} ${formatDateTime(point.at)} at ` +
      `${formatCoordinate(point.lat)}, ${formatCoordinate(point.lng)}.`;
  }

  function renderVisit(visit: Visit): void {
    hcpName.textContent = visit.hcpName;
    subtitle.textContent = `${visit.productName} · ${visit.hospitalName} · ${visit.department}`;
    statusPill.className = `pill pill-${visit.status.toLowerCase().replaceAll('_', '-')}`;
    statusPill.textContent = formatStatus(visit.status);

    abnormalPanel.hidden = !visit.abnormal;
    flagList.replaceChildren();
    if (visit.abnormal) {
      if (visit.flags.length === 0) {
        const item = el('li', 'flag-item');
        item.append(el('span', 'flag-detail', '服务端把这次拜访标记为异常。'));
        flagList.append(item);
      } else {
        for (const flag of visit.flags) {
          const item = el('li', 'flag-item');
          item.append(el('code', 'flag-code', flag.code));
          item.append(el('span', 'flag-detail', flag.detail));
          flagList.append(item);
        }
      }
    }

    if (visit.abnormal) {
      complianceNote.hidden = true;
      complianceNote.textContent = '';
      complianceNote.className = 'compliance-note';
    } else if (visit.status === 'CHECKED_OUT' || visit.status === 'REPORTED') {
      complianceNote.hidden = false;
      complianceNote.className = 'compliance-note ok';
      complianceNote.textContent = '签退时未命中任何合规规则。';
    } else {
      complianceNote.hidden = false;
      complianceNote.className = 'compliance-note';
      complianceNote.textContent = '合规判定在签退时执行。';
    }

    renderTimeline(visit.status);
    metaLine.textContent = `计划 ${formatDateTime(visit.plannedAt)} · 代表 ${visit.mrName}`;

    if (visit.checkin) {
      renderRecord(checkinRecord, '已签到', visit.checkin);
    } else {
      checkinRecord.hidden = true;
      checkinRecord.textContent = '';
    }

    if (visit.checkout) {
      renderRecord(checkoutRecord, '已签退', visit.checkout);
      durationValue.textContent = formatDuration(visit.durationSeconds ?? 0);
      durationNote.textContent = 'computed by the server';
    } else {
      checkoutRecord.hidden = true;
      checkoutRecord.textContent = '';
      durationValue.textContent = '尚未产生';
      durationNote.textContent = '签退时由服务端派生';
    }

    checkinLat.disabled = !visit.capabilities.canCheckIn;
    checkinLng.disabled = !visit.capabilities.canCheckIn;
    checkoutLat.disabled = !visit.capabilities.canCheckOut;
    checkoutLng.disabled = !visit.capabilities.canCheckOut;
    checkinSubmit.disabled = !visit.capabilities.canCheckIn || busy;
    checkoutSubmit.disabled = !visit.capabilities.canCheckOut || busy;
    reportSubmit.disabled = !visit.capabilities.canReport || busy;
    cancelSubmit.disabled = !visit.capabilities.canCancel || busy;
    voidSubmit.disabled = !visit.capabilities.canVoid || busy;
    // canDelete is the state machine's answer; the time window is the server's
    // to enforce, and a refused delete comes back as a 409 with the reason.
    deleteSubmit.disabled = !visit.capabilities.canDelete || busy;
    terminalReason.disabled = !(visit.capabilities.canCancel || visit.capabilities.canVoid) || busy;

    if (visit.capabilities.canCheckIn) {
      checkinHint.textContent = '时间由服务端生成；坐标按输入原样保存。';
    } else if (visit.checkin) {
      checkinHint.textContent = '已记录签到。';
    } else {
      checkinHint.textContent = '当前状态不可签到。';
    }

    if (visit.capabilities.canCheckOut) {
      checkoutHint.textContent = '时间由服务端生成；停留时长由服务端计算。';
    } else if (visit.checkout) {
      checkoutHint.textContent = '已记录签退。';
    } else {
      checkoutHint.textContent = '签到后可用。';
    }

    if (visit.evaluation) {
      const ev = visit.evaluation;
      // The snapshot is the point of the design: say which rules were in force
      // and when the verdict was reached, not just "abnormal".
      const distances = [
        ev.distanceInM === null ? null : `签到 ${Math.round(ev.distanceInM)} 米`,
        ev.distanceOutM === null ? null : `签退 ${Math.round(ev.distanceOutM)} 米`,
      ].filter((part): part is string => part !== null).join(' · ');
      const parts = [
        `规则 ${ev.ruleVersion}`,
        `阈值 ${ev.thresholds.minDurationSec} 秒 / ${ev.thresholds.maxDistanceM} 米`,
      ];
      if (distances !== '') parts.push(distances);
      complianceNote.textContent = `${parts.join(' · ')}（${ev.source === 'void_backfill' ? '作废补判' : '签退判定'}）`;
    }

    if (visit.reportOverdue) {
      terminalHint.textContent = '记录缺失：签退后超过补记录时限仍未提交拜访记录。';
    }

    if (visit.capabilities.canReport) {
      reportHint.textContent = 'Submitting files the report and marks the visit REPORTED.';
    } else if (visit.status === 'REPORTED') {
      reportHint.textContent = 'Report filed.';
    } else {
      reportHint.textContent = '签退后可用。';
    }

    if (visit.capabilities.canCancel) {
      terminalHint.textContent = '取消需要填写原因，并计入取消统计；删除只用于录入错误，且仅在创建后短时间内可用。';
    } else if (visit.capabilities.canVoid) {
      terminalHint.textContent = '作废保留签到证据并重跑位置规则，异常不会被抹掉。';
    } else if (visit.status === 'VOIDED' && visit.voidReason) {
      terminalHint.textContent = `已作废：${visit.voidReason}`;
    } else if (visit.status === 'CANCELLED' && visit.cancelReason) {
      terminalHint.textContent = `已取消：${visit.cancelReason}`;
    } else if (visit.status === 'DELETED') {
      terminalHint.textContent = '已删除：数据仍在库中，但不进任何统计。';
    } else {
      terminalHint.textContent = '当前状态没有可执行的取消/作废/删除操作。';
    }
  }

  checkinLat.addEventListener('input', () => {
    if (currentVisit) updateDistance(checkinLat, checkinLng, checkinDistance, currentVisit);
  });
  checkinLng.addEventListener('input', () => {
    if (currentVisit) updateDistance(checkinLat, checkinLng, checkinDistance, currentVisit);
  });
  checkoutLat.addEventListener('input', () => {
    if (currentVisit) updateDistance(checkoutLat, checkoutLng, checkoutDistance, currentVisit);
  });
  checkoutLng.addEventListener('input', () => {
    if (currentVisit) updateDistance(checkoutLat, checkoutLng, checkoutDistance, currentVisit);
  });

  checkinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentVisit === null || busy || !currentVisit.capabilities.canCheckIn) return;
    if (!checkinForm.reportValidity()) return;
    const position = readPosition(checkinLat, checkinLng);
    if (position === null) {
      checkinBanner.showText('Enter a latitude between -90 and 90 and a longitude between -180 and 180.');
      checkinLat.focus();
      return;
    }
    checkinBanner.clear();
    void handlers.onCheckIn(currentVisit.id, position);
  });

  checkoutForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentVisit === null || busy || !currentVisit.capabilities.canCheckOut) return;
    if (!checkoutForm.reportValidity()) return;
    const position = readPosition(checkoutLat, checkoutLng);
    if (position === null) {
      checkoutBanner.showText('Enter a latitude between -90 and 90 and a longitude between -180 and 180.');
      checkoutLat.focus();
      return;
    }
    checkoutBanner.clear();
    void handlers.onCheckOut(currentVisit.id, position);
  });

  cancelSubmit.addEventListener('click', () => {
    if (currentVisit === null || busy || !currentVisit.capabilities.canCancel) return;
    const reason = terminalReason.value.trim();
    if (reason === '') {
      terminalBanner.showText('取消必须填写原因。');
      terminalReason.focus();
      return;
    }
    terminalBanner.clear();
    void handlers.onCancel(currentVisit.id, reason);
  });

  voidSubmit.addEventListener('click', () => {
    if (currentVisit === null || busy || !currentVisit.capabilities.canVoid) return;
    const reason = terminalReason.value.trim();
    if (reason === '') {
      terminalBanner.showText('作废必须填写原因。');
      terminalReason.focus();
      return;
    }
    terminalBanner.clear();
    void handlers.onVoid(currentVisit.id, reason);
  });

  deleteSubmit.addEventListener('click', () => {
    if (currentVisit === null || busy || !currentVisit.capabilities.canDelete) return;
    // No reason: deleting is a correction, not a business event. The server
    // still refuses outside the window and explains which condition failed.
    terminalBanner.clear();
    void handlers.onDelete(currentVisit.id);
  });

  reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentVisit === null || busy || !currentVisit.capabilities.canReport) return;
    if (!reportForm.reportValidity()) return;

    const distributed = materialsDistributed.checked;
    let payloadMaterials: Material[] = [];
    if (distributed) {
      if (materials.length === 0) {
        reportBanner.showText('至少添加一条资料，或取消勾选「已派发资料」。');
        materialAdd.focus();
        return;
      }
      const trimmed = materials.map((material) => ({
        name: material.name.trim(),
        kind: material.kind,
      }));
      const blankIndex = trimmed.findIndex((material) => material.name === '');
      if (blankIndex >= 0) {
        reportBanner.showText(`Material ${blankIndex + 1} needs a name, or remove that row.`);
        const inputs = materialRows.querySelectorAll<HTMLInputElement>(
          '[data-testid="report-material-name"]',
        );
        inputs.item(blankIndex)?.focus();
        return;
      }
      payloadMaterials = trimmed;
    }

    reportBanner.clear();
    void handlers.onSubmitReport(currentVisit.id, {
      talkingPoints: talkingPoints.value.trim(),
      hcpFeedback: feedback.value.trim(),
      materialsDistributed: distributed,
      materials: payloadMaterials,
    });
  });

  return {
    update(state) {
      busy = state.loading.mutation || state.loading.selected;
      currentVisit = state.selected;
      card.setAttribute('aria-busy', String(state.loading.selected));
      detailBanner.show(state.errors.detail);
      if (state.errors.checkin !== lastCheckinError) {
        lastCheckinError = state.errors.checkin;
        checkinBanner.show(state.errors.checkin);
      }
      if (state.errors.checkout !== lastCheckoutError) {
        lastCheckoutError = state.errors.checkout;
        checkoutBanner.show(state.errors.checkout);
      }
      if (state.errors.report !== lastReportError) {
        lastReportError = state.errors.report;
        reportBanner.show(state.errors.report);
      }

      if (state.selected === null) {
        formVisitId = null;
        empty.hidden = false;
        body.hidden = true;
        emptyText.textContent = state.loading.selected
          ? 'Loading visit…'
          : state.errors.detail
            ? '该拜访加载失败。'
            : '从左侧列表选择一条拜访，查看详情与合规证据。';
        return;
      }

      empty.hidden = true;
      body.hidden = false;
      renderVisit(state.selected);
      if (state.selected.id !== formVisitId) {
        formVisitId = state.selected.id;
        resetForms(state.selected);
      }
    },
  };
}
