import { el, must } from '../dom';
import { formatMonthLabel, formatPercent } from '../format';
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
  done: number;
  cancelled: number;
  voided: number;
  visits: number;
  abnormal: number;
}

const TEMPLATE = `
  <section class="card dashboard-card" aria-labelledby="dashboard-heading">
    <div class="card-head">
      <div>
        <h2 id="dashboard-heading">按产品的月度拜访</h2>
        <p class="hint">月份来自服务端。每格为拜访次数（括号内为异常占比）。</p>
      </div>
      <button class="btn btn-small" type="button" data-testid="dashboard-refresh" data-dashboard-refresh>刷新</button>
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
  const productHead = el('th', undefined, '药品');
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
    monthTotals.set(month, { visits: 0, done: 0, cancelled: 0, voided: 0, abnormal: 0 });
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
      const done = data?.done ?? 0;
      const cancelled = data?.cancelled ?? 0;
      const voided = data?.voided ?? 0;

      const totals = monthTotals.get(month);
      if (totals) {
        totals.visits += visits;
        totals.done += done;
        totals.cancelled += cancelled;
        totals.voided += voided;
        totals.abnormal += abnormal;
      }

      const cell = el('td', 'dashboard-cell', `${done} / ${formatPercent(share)}`);
      if (share > 0) cell.classList.add('has-abnormal');
      cell.title =
        `${month}：完成 ${done}（有效 ${data?.effective ?? 0} · 异常 ${abnormal}）` +
        ` · 取消 ${cancelled} · 作废 ${voided}`;
      cell.dataset.month = month;
      cell.dataset.visits = String(visits);
      cell.dataset.abnormal = String(abnormal);
      row.append(cell);
    }
    tbody.append(row);
  }

  const tfoot = el('tfoot');
  const totalRow = el('tr', 'total-row');
  const totalLabel = el('th', undefined, '合计');
  totalLabel.scope = 'row';
  totalRow.append(totalLabel);
  for (const month of dashboard.months) {
    const totals = monthTotals.get(month) ?? { visits: 0, done: 0, cancelled: 0, voided: 0, abnormal: 0 };
    const share = totals.done > 0 ? totals.abnormal / totals.done : 0;
    const cell = el('td', 'dashboard-cell', `${totals.done} / ${formatPercent(share)}`);
    if (share > 0) cell.classList.add('has-abnormal');
    cell.title = `${month}：完成 ${totals.done} · 异常 ${totals.abnormal} · 取消 ${totals.cancelled} · 作废 ${totals.voided}`;
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

    // The five numbers the baseline defines, in one line. The denominator of the
    // share is "done", not "visits": cancelling more must not improve the rate.
    const overallShare = dashboard.totalDone > 0 ? dashboard.totalAbnormal / dashboard.totalDone : 0;
    const totals = el('p', 'totals-line');
    totals.append(
      document.createTextNode(
        `近 ${dashboard.months.length} 个月 · 完成 ${dashboard.totalDone}` +
          `（有效 ${dashboard.totalEffective} · 异常 ${dashboard.totalAbnormal}）· ` +
          `取消 ${dashboard.totalCancelled} · 作废 ${dashboard.totalVoided} · 异常率 `,
      ),
      el('strong', undefined, formatPercent(overallShare)),
      document.createTextNode('（删除不计入任何一项）'),
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
          renderEmpty('看板数据加载失败。');
        } else {
          renderEmpty('暂无看板数据。');
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
