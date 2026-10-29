import { el, must } from '../dom';
import { formatMonthLabel, formatPercent, pluralize } from '../format';
import type { AppState } from '../state';
import type { Dashboard, MonthlyRow } from '../types';
import { createErrorBanner } from './errorBanner';

export interface DashboardHandlers {
  onRefresh(): void;
}

export interface DashboardView {
  update(state: AppState): void;
}

interface ProductAggregate {
  productId: string;
  productName: string;
  byMonth: Map<string, MonthlyRow>;
}

interface MonthTotals {
  visits: number;
  abnormal: number;
}

const TEMPLATE = `
  <section class="card dashboard-card" aria-labelledby="dashboard-heading">
    <div class="card-head">
      <div>
        <h2 id="dashboard-heading">Monthly visits by product</h2>
        <p class="hint">Check-in months from the server. Each cell is visits (abnormal share).</p>
      </div>
      <button class="btn btn-small" type="button" data-testid="dashboard-refresh" data-dashboard-refresh>Refresh</button>
    </div>
    <div data-dashboard-banner></div>
    <div data-dashboard-content></div>
  </section>
`;

function buildTable(dashboard: Dashboard): HTMLElement {
  const products = new Map<string, ProductAggregate>();
  for (const row of dashboard.rows) {
    let aggregate = products.get(row.productId);
    if (aggregate === undefined) {
      aggregate = { productId: row.productId, productName: row.productName, byMonth: new Map() };
      products.set(row.productId, aggregate);
    }
    aggregate.byMonth.set(row.month, row);
  }

  const ordered = [...products.values()].sort((a, b) => a.productName.localeCompare(b.productName));

  const wrapper = el('div', 'table-wrap');
  const table = el('table', 'dashboard-table');
  table.dataset.testid = 'dashboard-table';

  const thead = el('thead');
  const headRow = el('tr');
  const productHead = el('th', undefined, 'Product');
  productHead.scope = 'col';
  headRow.append(productHead);
  for (const month of dashboard.months) {
    const cell = el('th', undefined, formatMonthLabel(month));
    cell.scope = 'col';
    cell.title = month;
    headRow.append(cell);
  }
  thead.append(headRow);

  const monthTotals = new Map<string, MonthTotals>();
  for (const month of dashboard.months) {
    monthTotals.set(month, { visits: 0, abnormal: 0 });
  }

  const tbody = el('tbody');
  for (const aggregate of ordered) {
    const row = el('tr');
    const product = el('th', 'row-heading', aggregate.productName);
    product.scope = 'row';
    row.append(product);

    for (const month of dashboard.months) {
      const data = aggregate.byMonth.get(month);
      const visits = data?.visits ?? 0;
      const abnormal = data?.abnormal ?? 0;
      const share = data?.abnormalShare ?? 0;

      const totals = monthTotals.get(month);
      if (totals) {
        totals.visits += visits;
        totals.abnormal += abnormal;
      }

      const cell = el('td', 'dashboard-cell', `${visits} (${formatPercent(share)})`);
      if (share > 0) cell.classList.add('has-abnormal');
      cell.title = `${month}: ${pluralize(visits, 'visit')}, ${abnormal} abnormal`;
      cell.dataset.month = month;
      cell.dataset.visits = String(visits);
      cell.dataset.abnormal = String(abnormal);
      row.append(cell);
    }
    tbody.append(row);
  }

  const tfoot = el('tfoot');
  const totalRow = el('tr', 'total-row');
  const totalLabel = el('th', undefined, 'Total');
  totalLabel.scope = 'row';
  totalRow.append(totalLabel);
  for (const month of dashboard.months) {
    const totals = monthTotals.get(month) ?? { visits: 0, abnormal: 0 };
    const share = totals.visits > 0 ? totals.abnormal / totals.visits : 0;
    const cell = el('td', 'dashboard-cell', `${totals.visits} (${formatPercent(share)})`);
    if (share > 0) cell.classList.add('has-abnormal');
    cell.title = `${month}: ${pluralize(totals.visits, 'visit')}, ${totals.abnormal} abnormal`;
    totalRow.append(cell);
  }
  tfoot.append(totalRow);

  table.append(thead, tbody, tfoot);
  wrapper.append(table);
  return wrapper;
}

export function mountDashboardView(host: HTMLElement, handlers: DashboardHandlers): DashboardView {
  host.innerHTML = TEMPLATE;

  const card = must<HTMLElement>(host, '.dashboard-card');
  const content = must<HTMLElement>(host, '[data-dashboard-content]');
  const refreshButton = must<HTMLButtonElement>(host, '[data-dashboard-refresh]');
  const banner = createErrorBanner();
  must<HTMLElement>(host, '[data-dashboard-banner]').append(banner.element);

  let rendered: Dashboard | null = null;

  refreshButton.addEventListener('click', () => handlers.onRefresh());

  function renderEmpty(message: string): void {
    const empty = el('div', 'empty-state');
    empty.append(el('p', undefined, message));
    content.replaceChildren(empty);
  }

  function renderDashboard(dashboard: Dashboard): void {
    if (dashboard.rows.length === 0) {
      renderEmpty('No check-ins recorded in the last 6 months.');
      return;
    }

    const overallShare =
      dashboard.totalVisits > 0 ? dashboard.totalAbnormal / dashboard.totalVisits : 0;
    const totals = el('p', 'totals-line');
    totals.append(
      document.createTextNode(
        `${dashboard.months.length} months · ${pluralize(dashboard.totalVisits, 'visit')} · ` +
          `${dashboard.totalAbnormal} abnormal · overall abnormal share `,
      ),
      el('strong', undefined, formatPercent(overallShare)),
      document.createTextNode('.'),
    );

    content.replaceChildren(buildTable(dashboard), totals);
  }

  return {
    update(state) {
      card.setAttribute('aria-busy', String(state.loading.dashboard));
      refreshButton.disabled = state.loading.dashboard;
      banner.show(state.errors.dashboard);

      if (state.dashboard === null) {
        if (state.loading.dashboard) {
          renderEmpty('Loading monthly dashboard…');
        } else if (state.errors.dashboard) {
          renderEmpty('Dashboard data could not be loaded.');
        } else {
          renderEmpty('No dashboard data available.');
        }
        rendered = null;
        return;
      }

      if (state.dashboard !== rendered) {
        rendered = state.dashboard;
        renderDashboard(state.dashboard);
      }
    },
  };
}
