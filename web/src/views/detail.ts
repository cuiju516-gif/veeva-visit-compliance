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
  { value: 'reprint', label: 'Reprint' },
  { value: 'document', label: 'Document' },
  { value: 'other', label: 'Other' },
];

const STEP_LABELS = ['Plan', 'Check-in', 'Detailing', 'Check-out', 'Call report'];

const STEP_STATES: Record<VisitStatus, Array<'done' | 'current' | 'pending'>> = {
  PLANNED: ['done', 'current', 'pending', 'pending', 'pending'],
  CHECKED_IN: ['done', 'done', 'current', 'pending', 'pending'],
  CHECKED_OUT: ['done', 'done', 'done', 'done', 'current'],
  REPORTED: ['done', 'done', 'done', 'done', 'done'],
};

const TEMPLATE = `
  <section class="card detail-card" data-testid="visit-detail" aria-labelledby="detail-heading">
    <div data-detail-banner></div>
    <div class="detail-empty" data-detail-empty>
      <p data-detail-empty-text>Select a visit from the list to see its details and compliance evidence.</p>
    </div>
    <div class="detail-body" data-detail-body hidden>
      <header class="detail-head">
        <div class="detail-title">
          <p class="eyebrow">Selected visit</p>
          <h2 id="detail-heading" data-detail-hcp></h2>
          <p class="detail-subtitle" data-detail-subtitle></p>
        </div>
        <span class="pill" data-status-pill data-testid="status-pill"></span>
      </header>

      <div class="abnormal-panel" data-abnormal hidden aria-labelledby="abnormal-heading">
        <div class="abnormal-head">
          <h3 id="abnormal-heading">Abnormal visit</h3>
          <span class="badge badge-abnormal">Flagged</span>
        </div>
        <p class="abnormal-intro">The server raised the following compliance flags at check-out. Every flag is listed.</p>
        <ul class="flag-list" data-flag-list data-testid="flag-list"></ul>
      </div>

      <p class="compliance-note" data-compliance-note hidden></p>
      <ol class="timeline" data-timeline aria-label="Visit steps"></ol>
      <p class="meta-line" data-meta></p>

      <section class="step" aria-labelledby="checkin-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">Step 2</p>
            <h3 id="checkin-heading">Check-in</h3>
          </div>
        </div>
        <p class="hint">Coordinates are compared with the hospital's registered base point (500 m limit). The timestamp comes from the server.</p>
        <p class="record" data-checkin-record hidden></p>
        <form class="geo-form" data-checkin-form data-testid="checkin-form">
          <div class="field">
            <label for="checkin-lat">Latitude</label>
            <input id="checkin-lat" data-testid="checkin-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkin-distance">
          </div>
          <div class="field">
            <label for="checkin-lng">Longitude</label>
            <input id="checkin-lng" data-testid="checkin-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkin-distance">
          </div>
          <p class="distance-hint" id="checkin-distance" data-checkin-distance data-testid="distance-hint" aria-live="polite"></p>
          <div data-checkin-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkin-submit">Check in</button>
            <span class="hint" data-checkin-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="checkout-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">Step 4</p>
            <h3 id="checkout-heading">Check-out</h3>
          </div>
        </div>
        <p class="hint">Check-out closes the stay. The server derives the duration and re-evaluates both locations.</p>
        <p class="record" data-checkout-record hidden></p>
        <p class="duration-line">Derived duration: <strong class="duration-value" data-duration-value data-testid="duration-value">—</strong> <span class="hint" data-duration-note></span></p>
        <form class="geo-form" data-checkout-form data-testid="checkout-form">
          <div class="field">
            <label for="checkout-lat">Latitude</label>
            <input id="checkout-lat" data-testid="checkout-lat" type="number" step="any" min="-90" max="90" required aria-describedby="checkout-distance">
          </div>
          <div class="field">
            <label for="checkout-lng">Longitude</label>
            <input id="checkout-lng" data-testid="checkout-lng" type="number" step="any" min="-180" max="180" required aria-describedby="checkout-distance">
          </div>
          <p class="distance-hint" id="checkout-distance" data-checkout-distance data-testid="checkout-distance-hint" aria-live="polite"></p>
          <div data-checkout-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="checkout-submit">Check out</button>
            <span class="hint" data-checkout-hint></span>
          </div>
        </form>
      </section>

      <section class="step" aria-labelledby="report-heading">
        <div class="step-head">
          <div>
            <p class="step-kicker">Step 5</p>
            <h3 id="report-heading">Call report</h3>
          </div>
        </div>
        <form class="report-form" data-report-form data-testid="report-form">
          <div class="field">
            <label for="report-talking-points">Talking points</label>
            <textarea id="report-talking-points" data-testid="report-talking-points" rows="3" maxlength="4000"></textarea>
          </div>
          <div class="field">
            <label for="report-feedback">HCP feedback</label>
            <textarea id="report-feedback" data-testid="report-feedback" rows="3" maxlength="4000"></textarea>
          </div>
          <label class="checkbox">
            <input type="checkbox" data-testid="report-materials-distributed" data-materials-distributed>
            <span>Material distributed</span>
          </label>
          <div class="materials" data-materials-block hidden>
            <div class="materials-head">
              <span class="materials-title">Materials</span>
              <button class="btn btn-small" type="button" data-testid="report-material-add" data-material-add>Add material</button>
            </div>
            <div class="materials-list" data-material-rows></div>
          </div>
          <div data-report-banner></div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-testid="report-submit">Submit call report</button>
            <span class="hint" data-report-hint></span>
          </div>
        </form>
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
    return 'Enter both coordinates to see the distance from the hospital base.';
  }
  const lat = Number.parseFloat(latInput.value);
  const lng = Number.parseFloat(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Enter valid numeric coordinates to see the distance.';
  }
  if (!Number.isFinite(visit.baseLat) || !Number.isFinite(visit.baseLng)) {
    return 'Hospital base coordinates are unavailable.';
  }
  const meters = haversineMeters({ lat, lng }, { lat: visit.baseLat, lng: visit.baseLng });
  if (meters > LOCATION_LIMIT_METERS) {
    return `Distance from hospital base: ${formatDistance(meters)} — outside the ${LOCATION_LIMIT_METERS} m limit.`;
  }
  return `Distance from hospital base: ${formatDistance(meters)} — within the ${LOCATION_LIMIT_METERS} m limit.`;
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

  const detailBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-detail-banner]').append(detailBanner.element);
  const checkinBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-checkin-banner]').append(checkinBanner.element);
  const checkoutBanner = createErrorBanner();
  must<HTMLElement>(host, '[data-checkout-banner]').append(checkoutBanner.element);
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
        item.append(el('span', 'flag-detail', 'The server marked this visit abnormal.'));
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
      complianceNote.textContent = 'No compliance flags were raised at check-out.';
    } else {
      complianceNote.hidden = false;
      complianceNote.className = 'compliance-note';
      complianceNote.textContent = 'Compliance is evaluated when the visit is checked out.';
    }

    renderTimeline(visit.status);
    metaLine.textContent = `Planned ${formatDateTime(visit.plannedAt)} · MR ${visit.mrName}`;

    if (visit.checkin) {
      renderRecord(checkinRecord, 'Checked in', visit.checkin);
    } else {
      checkinRecord.hidden = true;
      checkinRecord.textContent = '';
    }

    if (visit.checkout) {
      renderRecord(checkoutRecord, 'Checked out', visit.checkout);
      durationValue.textContent = formatDuration(visit.durationSeconds ?? 0);
      durationNote.textContent = 'computed by the server';
    } else {
      checkoutRecord.hidden = true;
      checkoutRecord.textContent = '';
      durationValue.textContent = 'Not yet available';
      durationNote.textContent = 'derived at check-out';
    }

    checkinLat.disabled = !visit.capabilities.canCheckIn;
    checkinLng.disabled = !visit.capabilities.canCheckIn;
    checkoutLat.disabled = !visit.capabilities.canCheckOut;
    checkoutLng.disabled = !visit.capabilities.canCheckOut;
    checkinSubmit.disabled = !visit.capabilities.canCheckIn || busy;
    checkoutSubmit.disabled = !visit.capabilities.canCheckOut || busy;
    reportSubmit.disabled = !visit.capabilities.canReport || busy;

    if (visit.capabilities.canCheckIn) {
      checkinHint.textContent = 'Uses the server clock; coordinates are stored as entered.';
    } else if (visit.checkin) {
      checkinHint.textContent = 'Check-in already recorded.';
    } else {
      checkinHint.textContent = 'Check-in is unavailable in this state.';
    }

    if (visit.capabilities.canCheckOut) {
      checkoutHint.textContent = 'Uses the server clock; duration is derived server-side.';
    } else if (visit.checkout) {
      checkoutHint.textContent = 'Check-out already recorded.';
    } else {
      checkoutHint.textContent = 'Available after check-in.';
    }

    if (visit.capabilities.canReport) {
      reportHint.textContent = 'Submitting files the report and marks the visit REPORTED.';
    } else if (visit.status === 'REPORTED') {
      reportHint.textContent = 'Report filed.';
    } else {
      reportHint.textContent = 'Available after check-out.';
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

  reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentVisit === null || busy || !currentVisit.capabilities.canReport) return;
    if (!reportForm.reportValidity()) return;

    const distributed = materialsDistributed.checked;
    let payloadMaterials: Material[] = [];
    if (distributed) {
      if (materials.length === 0) {
        reportBanner.showText('Add at least one material, or untick “Material distributed”.');
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
            ? 'This visit could not be loaded.'
            : 'Select a visit from the list to see its details and compliance evidence.';
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
