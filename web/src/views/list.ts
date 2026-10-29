import { el, must, option } from '../dom';
import { formatShortDate, formatShortTime, formatStatus, isVisitStatus, pluralize } from '../format';
import type { AppState, Filters } from '../state';
import type { Catalog, Visit } from '../types';
import { createErrorBanner } from './errorBanner';

export interface ListHandlers {
  onSelect(id: string): void;
  onFiltersChange(filters: Filters): void;
}

export interface ListView {
  update(state: AppState): void;
}

const TEMPLATE = `
  <section class="card list-card" aria-labelledby="visits-heading">
    <div class="card-head">
      <div>
        <h2 id="visits-heading">Visits</h2>
        <p class="hint">Newest planned first.</p>
      </div>
      <span class="count" data-count data-testid="visit-count"></span>
    </div>
    <div class="filters">
      <div class="field">
        <label for="filter-status">Status</label>
        <select id="filter-status" data-status-filter data-testid="visit-filter-status">
          <option value="">All statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="CHECKED_IN">Checked in</option>
          <option value="CHECKED_OUT">Checked out</option>
          <option value="REPORTED">Reported</option>
        </select>
      </div>
      <div class="field">
        <label for="filter-product">Product</label>
        <select id="filter-product" data-product-filter data-testid="visit-filter-product">
          <option value="">All products</option>
        </select>
      </div>
      <button class="btn btn-small filter-clear" type="button" data-clear hidden>Clear filters</button>
    </div>
    <div data-list-banner></div>
    <div class="table-wrap" data-table-wrap>
      <table class="visits-table" data-testid="visit-table">
        <thead>
          <tr>
            <th scope="col">Planned</th>
            <th scope="col">HCP</th>
            <th scope="col">Hospital</th>
            <th scope="col">Product</th>
            <th scope="col">Status</th>
            <th scope="col">Abnormal</th>
          </tr>
        </thead>
        <tbody data-rows></tbody>
      </table>
    </div>
    <div class="empty-state" data-empty hidden>
      <p data-empty-title></p>
      <button class="btn btn-small" type="button" data-empty-clear hidden>Clear filters</button>
    </div>
  </section>
`;

function statusClass(status: Visit['status']): string {
  return status.toLowerCase().replaceAll('_', '-');
}

function rowSignature(visits: Visit[]): string {
  return visits.map((visit) => `${visit.id}:${visit.status}:${visit.abnormal}:${visit.updatedAt}`).join('|');
}

export function mountListView(host: HTMLElement, handlers: ListHandlers): ListView {
  host.innerHTML = TEMPLATE;

  const statusFilter = must<HTMLSelectElement>(host, '[data-status-filter]');
  const productFilter = must<HTMLSelectElement>(host, '[data-product-filter]');
  const clearButton = must<HTMLButtonElement>(host, '[data-clear]');
  const emptyClearButton = must<HTMLButtonElement>(host, '[data-empty-clear]');
  const banner = createErrorBanner();
  must<HTMLElement>(host, '[data-list-banner]').append(banner.element);

  const rowsBody = must<HTMLTableSectionElement>(host, '[data-rows]');
  const tableWrap = must<HTMLElement>(host, '[data-table-wrap]');
  const emptyState = must<HTMLElement>(host, '[data-empty]');
  const emptyTitle = must<HTMLElement>(host, '[data-empty-title]');
  const countEl = must<HTMLElement>(host, '[data-count]');
  const card = must<HTMLElement>(host, '.list-card');

  let renderedCatalog: Catalog | null = null;
  let renderedRows = '';

  function filtersActive(state: AppState): boolean {
    return state.filters.status !== '' || state.filters.productId !== '';
  }

  function clearFilters(): void {
    handlers.onFiltersChange({ status: '', productId: '' });
    statusFilter.focus();
  }

  clearButton.addEventListener('click', clearFilters);
  emptyClearButton.addEventListener('click', clearFilters);

  statusFilter.addEventListener('change', () => {
    const value = statusFilter.value;
    handlers.onFiltersChange({
      status: isVisitStatus(value) ? value : '',
      productId: productFilter.value,
    });
  });

  productFilter.addEventListener('change', () => {
    handlers.onFiltersChange({
      status: isVisitStatus(statusFilter.value) ? statusFilter.value : '',
      productId: productFilter.value,
    });
  });

  function buildProductFilter(catalog: Catalog | null): void {
    const previous = productFilter.value;
    productFilter.replaceChildren(option('', 'All products'));
    for (const product of catalog?.products ?? []) {
      productFilter.append(option(product.id, product.name));
    }
    if ([...productFilter.options].some((item) => item.value === previous)) {
      productFilter.value = previous;
    }
  }

  function selectRow(visitId: string): void {
    handlers.onSelect(visitId);
  }

  function buildRow(visit: Visit): HTMLTableRowElement {
    const row = el('tr', 'visit-row');
    row.dataset.visitId = visit.id;
    row.dataset.testid = 'visit-row';
    row.tabIndex = 0;
    row.addEventListener('click', () => selectRow(visit.id));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow(visit.id);
      }
    });

    const planned = el('td', 'planned-cell');
    const time = el('time');
    time.dateTime = visit.plannedAt;
    time.append(
      el('span', 'planned-date', formatShortDate(visit.plannedAt)),
      el('span', 'planned-time', formatShortTime(visit.plannedAt)),
    );
    planned.append(time);

    const hcp = el('td');
    hcp.append(el('span', 'cell-primary', visit.hcpName), el('span', 'cell-secondary', visit.department));

    const hospital = el('td', undefined, visit.hospitalName);
    const product = el('td', undefined, visit.productName);

    const status = el('td');
    status.append(el('span', `pill pill-${statusClass(visit.status)}`, formatStatus(visit.status)));

    const abnormal = el('td');
    if (visit.abnormal) {
      const badge = el('span', 'badge badge-abnormal', 'Abnormal');
      badge.title = visit.flags.map((flag) => `${flag.code}: ${flag.detail}`).join('\n');
      abnormal.append(badge);
    } else if (visit.status === 'CHECKED_OUT' || visit.status === 'REPORTED') {
      abnormal.append(el('span', 'badge badge-ok', 'OK'));
    } else {
      abnormal.append(el('span', 'cell-muted', '—'));
    }

    row.append(planned, hcp, hospital, product, status, abnormal);
    return row;
  }

  function updateSelection(state: AppState): void {
    for (const row of rowsBody.querySelectorAll<HTMLTableRowElement>('tr[data-visit-id]')) {
      const selected = row.dataset.visitId === state.selected?.id;
      row.classList.toggle('is-selected', selected);
      if (selected) {
        row.setAttribute('aria-current', 'true');
      } else {
        row.removeAttribute('aria-current');
      }
    }
  }

  function renderEmptyState(state: AppState): void {
    const hasVisits = state.visits.length > 0;
    tableWrap.hidden = !hasVisits;
    emptyState.hidden = hasVisits;
    const filtered = filtersActive(state);
    clearButton.hidden = !filtered;
    emptyClearButton.hidden = !filtered;

    if (hasVisits) {
      emptyTitle.textContent = '';
      return;
    }

    if (state.loading.visits) {
      emptyTitle.textContent = 'Loading visits…';
    } else if (state.errors.list) {
      emptyTitle.textContent = 'Visits could not be loaded.';
    } else if (filtered) {
      emptyTitle.textContent = 'No visits match the current filters.';
    } else {
      emptyTitle.textContent = 'No visits yet. Plan the first visit on the left.';
    }
  }

  return {
    update(state) {
      if (state.catalog !== renderedCatalog) {
        renderedCatalog = state.catalog;
        buildProductFilter(state.catalog);
      }

      statusFilter.value = state.filters.status;
      const productOptionExists = [...productFilter.options].some(
        (item) => item.value === state.filters.productId,
      );
      if (productOptionExists || state.filters.productId === '') {
        productFilter.value = state.filters.productId;
      }

      card.setAttribute('aria-busy', String(state.loading.visits));
      countEl.textContent = state.loading.visits
        ? 'Loading…'
        : pluralize(state.visits.length, 'visit');
      banner.show(state.errors.list);

      const signature = rowSignature(state.visits);
      if (signature !== renderedRows) {
        renderedRows = signature;
        rowsBody.replaceChildren(...state.visits.map(buildRow));
      }

      updateSelection(state);
      renderEmptyState(state);
    },
  };
}
