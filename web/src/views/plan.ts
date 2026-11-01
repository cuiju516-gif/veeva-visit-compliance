import type { CreateVisitInput } from '../api';
import { must, option } from '../dom';
import { defaultPlannedLocal, toRFC3339WithOffset } from '../format';
import type { AppState } from '../state';
import type { Catalog } from '../types';
import { createErrorBanner } from './errorBanner';

export interface PlanHandlers {
  /** Resolves true when the visit was created and the form should reset. */
  onCreate(input: CreateVisitInput): Promise<boolean>;
}

export interface PlanView {
  update(state: AppState): void;
  reset(): void;
}

// Static markup only: every value that comes from the API is written with
// textContent, never interpolated into HTML.
const TEMPLATE = `
  <section class="card plan-card" aria-labelledby="plan-heading">
    <div class="card-head">
      <div>
        <h2 id="plan-heading">新建拜访计划</h2>
        <p class="hint">第 1 步 —— 约见医生。</p>
      </div>
    </div>
    <form class="plan-form" data-plan-form data-testid="plan-form">
      <div class="field">
        <label for="plan-mr">医药代表</label>
        <select id="plan-mr" name="mrId" data-testid="plan-mr" required>
          <option value="">正在加载目录…</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-hcp">医生</label>
        <select id="plan-hcp" name="hcpId" data-testid="plan-hcp" required>
          <option value="">正在加载目录…</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-product">药品</label>
        <select id="plan-product" name="productId" data-testid="plan-product" required>
          <option value="">正在加载目录…</option>
        </select>
      </div>
      <div class="field">
        <label for="plan-at">计划时间</label>
        <input id="plan-at" name="plannedAt" data-testid="plan-planned-at" type="datetime-local" step="60" required>
      </div>
      <div class="plan-actions">
        <button class="btn btn-primary" type="submit" data-testid="plan-submit" disabled>创建计划</button>
      </div>
      <div class="plan-error" data-plan-banner></div>
    </form>
  </section>
`;

function fillSelect(
  select: HTMLSelectElement,
  placeholder: string,
  choices: Array<{ value: string; label: string }>,
): void {
  const previous = select.value;
  select.replaceChildren(option('', placeholder));
  for (const choice of choices) {
    select.append(option(choice.value, choice.label));
  }
  select.value = choices.some((choice) => choice.value === previous) ? previous : '';
}

export function mountPlanView(host: HTMLElement, handlers: PlanHandlers): PlanView {
  host.innerHTML = TEMPLATE;

  const form = must<HTMLFormElement>(host, '[data-plan-form]');
  const mrSelect = must<HTMLSelectElement>(host, '#plan-mr');
  const hcpSelect = must<HTMLSelectElement>(host, '#plan-hcp');
  const productSelect = must<HTMLSelectElement>(host, '#plan-product');
  const plannedInput = must<HTMLInputElement>(host, '#plan-at');
  const submit = must<HTMLButtonElement>(host, 'button[type="submit"]');
  const banner = createErrorBanner();
  must<HTMLElement>(host, '[data-plan-banner]').append(banner.element);

  plannedInput.value = defaultPlannedLocal();

  let current: AppState | null = null;
  let renderedCatalog: Catalog | null | undefined;

  function syncSubmit(): void {
    const ready =
      current !== null &&
      current.catalog !== null &&
      !current.loading.mutation &&
      mrSelect.value !== '' &&
      hcpSelect.value !== '' &&
      productSelect.value !== '' &&
      plannedInput.value !== '';
    submit.disabled = !ready;
  }

  function populateCatalog(catalog: Catalog | null): void {
    fillSelect(
      mrSelect,
      catalog === null ? '正在加载目录…' : '请选择代表…',
      (catalog?.mrs ?? []).map((mr) => ({ value: mr.id, label: `${mr.name} — ${mr.region}` })),
    );
    fillSelect(
      hcpSelect,
      catalog === null ? '正在加载目录…' : '请选择医生…',
      (catalog?.hcps ?? []).map((hcp) => ({
        value: hcp.id,
        label: `${hcp.name} — ${hcp.hospitalName}`,
      })),
    );
    fillSelect(
      productSelect,
      catalog === null ? '正在加载目录…' : '请选择药品…',
      (catalog?.products ?? []).map((product) => ({
        value: product.id,
        label: `${product.name} (${product.code})`,
      })),
    );
    hcpSelect.disabled = catalog === null;
    productSelect.disabled = catalog === null;
    syncSubmit();
  }

  /**
   * A rep can only plan their own visits, so the selector is locked to them.
   *
   * This runs on every update, not just when the catalog loads: switching actor
   * does not change the catalog, so hanging the lock off the catalog diff meant
   * it was applied once at boot and never again — the dropdown stayed unlocked
   * for whoever was selected. The server refuses the request anyway, but the UI
   * should not offer it in the first place.
   */
  function applyActorLock(): void {
    const actor = current === null ? '' : current.actor;
    const locked = current !== null && current.catalog !== null && actor !== '';
    mrSelect.disabled = current === null || current.catalog === null || actor !== '';
    if (locked) {
      if (mrSelect.value !== actor) mrSelect.value = actor;
      const option = Array.from(mrSelect.options).find((o) => o.value === actor);
      if (option !== undefined) option.textContent = `${option.textContent?.replace('（我）', '') ?? ''}（我）`;
    }
    syncSubmit();
  }

  function reset(): void {
    mrSelect.value = '';
    hcpSelect.value = '';
    productSelect.value = '';
    plannedInput.value = defaultPlannedLocal();
    banner.clear();
    syncSubmit();
  }

  function readForm(): CreateVisitInput | null {
    const mrId = mrSelect.value;
    const hcpId = hcpSelect.value;
    const productId = productSelect.value;
    if (mrId === '' || hcpId === '' || productId === '' || plannedInput.value === '') {
      return null;
    }
    const planned = new Date(plannedInput.value);
    if (Number.isNaN(planned.getTime())) return null;
    return {
      mrId,
      hcpId,
      productId,
      plannedAt: toRFC3339WithOffset(planned),
    };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const input = readForm();
    if (input === null) {
      banner.showText('请选择代表、医生、药品与计划时间。');
      return;
    }
    void handlers.onCreate(input).then((created) => {
      if (created) reset();
    });
  });

  for (const control of [mrSelect, hcpSelect, productSelect, plannedInput]) {
    control.addEventListener('input', syncSubmit);
    control.addEventListener('change', syncSubmit);
  }

  return {
    update(state) {
      current = state;
      if (state.catalog !== renderedCatalog) {
        renderedCatalog = state.catalog;
        populateCatalog(state.catalog);
      }
      form.setAttribute('aria-busy', String(state.loading.catalog));
      banner.show(state.errors.plan ?? state.errors.catalog);
      applyActorLock();
    },
    reset,
  };
}
