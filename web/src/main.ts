import {
  checkIn,
  checkOut,
  createVisit,
  getCatalog,
  getDashboard,
  getVisit,
  listVisits,
  submitReport,
  toApiError,
} from './api';
import type { ApiError, CreateVisitInput, Position, ReportInput } from './api';
import { must } from './dom';
import { createStore } from './state';
import type { AppState, ErrorState, Filters } from './state';
import type { Visit } from './types';
import { mountDashboardView } from './views/dashboard';
import { mountDetailView } from './views/detail';
import { mountListView } from './views/list';
import { mountPlanView } from './views/plan';

type MutationKey = 'checkin' | 'checkout' | 'report';

const store = createStore();

const planHost = must<HTMLElement>(document, '#plan-root');
const listHost = must<HTMLElement>(document, '#list-root');
const detailHost = must<HTMLElement>(document, '#detail-root');
const dashboardHost = must<HTMLElement>(document, '#dashboard-root');
const refreshButton = must<HTMLButtonElement>(document, '#refresh');

const planView = mountPlanView(planHost, { onCreate: handleCreate });
const listView = mountListView(listHost, {
  onSelect: selectVisit,
  onFiltersChange: setFilters,
});
const detailView = mountDetailView(detailHost, {
  onCheckIn: handleCheckIn,
  onCheckOut: handleCheckOut,
  onSubmitReport: handleSubmitReport,
});
const dashboardView = mountDashboardView(dashboardHost, {
  onRefresh: () => {
    void loadDashboard();
  },
});

let catalogSeq = 0;
let listSeq = 0;
let visitSeq = 0;
let dashboardSeq = 0;

function render(state: AppState): void {
  planView.update(state);
  listView.update(state);
  detailView.update(state);
  dashboardView.update(state);

  refreshButton.disabled = state.loading.mutation;
  refreshButton.setAttribute(
    'aria-busy',
    String(
      state.loading.catalog ||
        state.loading.visits ||
        state.loading.dashboard ||
        state.loading.selected,
    ),
  );
}

async function loadCatalog(): Promise<void> {
  const seq = ++catalogSeq;
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, catalog: true },
    errors: { ...state.errors, catalog: null },
  }));
  try {
    const catalog = await getCatalog();
    if (seq !== catalogSeq) return;
    store.update((state) => ({
      ...state,
      catalog,
      loading: { ...state.loading, catalog: false },
    }));
  } catch (error) {
    if (seq !== catalogSeq) return;
    store.update((state) => ({
      ...state,
      loading: { ...state.loading, catalog: false },
      errors: { ...state.errors, catalog: toApiError(error) },
    }));
  }
}

async function loadVisits(): Promise<void> {
  const seq = ++listSeq;
  const filters = store.getState().filters;
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, visits: true },
    errors: { ...state.errors, list: null },
  }));
  try {
    const response = await listVisits(filters);
    if (seq !== listSeq) return;
    store.update((state) => ({
      ...state,
      visits: response.visits,
      loading: { ...state.loading, visits: false },
    }));
  } catch (error) {
    if (seq !== listSeq) return;
    store.update((state) => ({
      ...state,
      loading: { ...state.loading, visits: false },
      errors: { ...state.errors, list: toApiError(error) },
    }));
  }
}

async function loadDashboard(): Promise<void> {
  const seq = ++dashboardSeq;
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, dashboard: true },
    errors: { ...state.errors, dashboard: null },
  }));
  try {
    const dashboard = await getDashboard();
    if (seq !== dashboardSeq) return;
    store.update((state) => ({
      ...state,
      dashboard,
      loading: { ...state.loading, dashboard: false },
    }));
  } catch (error) {
    if (seq !== dashboardSeq) return;
    store.update((state) => ({
      ...state,
      loading: { ...state.loading, dashboard: false },
      errors: { ...state.errors, dashboard: toApiError(error) },
    }));
  }
}

/**
 * Re-fetches one visit. A `provisional` copy (from the list response) is shown
 * while the authoritative single-visit request is in flight.
 */
async function loadVisit(id: string, provisional?: Visit): Promise<void> {
  const seq = ++visitSeq;
  store.update((state) => ({
    ...state,
    selected:
      provisional?.id === id ? provisional : state.selected?.id === id ? state.selected : null,
    loading: { ...state.loading, selected: true },
    errors: { ...state.errors, detail: null },
  }));
  try {
    const visit = await getVisit(id);
    if (seq !== visitSeq) return;
    store.update((state) => ({
      ...state,
      selected: visit,
      loading: { ...state.loading, selected: false },
    }));
  } catch (error) {
    if (seq !== visitSeq) return;
    const apiError = toApiError(error);
    store.update((state) => ({
      ...state,
      selected: apiError.code === 'not_found' ? null : state.selected,
      loading: { ...state.loading, selected: false },
      errors: { ...state.errors, detail: apiError },
    }));
  }
}

function selectVisit(id: string): void {
  const provisional = store.getState().visits.find((visit) => visit.id === id);
  store.update((state) => ({
    ...state,
    errors: {
      ...state.errors,
      checkin: null,
      checkout: null,
      report: null,
    },
  }));
  void loadVisit(id, provisional);
}

function setFilters(filters: Filters): void {
  const current = store.getState().filters;
  if (current.status === filters.status && current.productId === filters.productId) return;
  store.update((state) => ({ ...state, filters }));
  void loadVisits();
}

function withFormError(errors: ErrorState, key: MutationKey, error: ApiError | null): ErrorState {
  return { ...errors, [key]: error };
}

/**
 * After a mutation the UI never trusts its own optimistic copy: the list, the
 * selected visit and (for check-in/out/report) the dashboard are re-fetched.
 * The selected visit is only replaced if it is still the one on screen.
 */
async function refreshAfterMutation(visitId: string): Promise<void> {
  const tasks: Array<Promise<void>> = [loadVisits(), loadDashboard()];
  if (store.getState().selected?.id === visitId) {
    tasks.push(loadVisit(visitId));
  }
  await Promise.all(tasks);
}

async function runVisitMutation(
  key: MutationKey,
  visitId: string,
  action: () => Promise<Visit>,
): Promise<void> {
  if (store.getState().loading.mutation) return;
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, mutation: true },
    errors: withFormError(state.errors, key, null),
  }));

  try {
    await action();
  } catch (error) {
    const apiError = toApiError(error);
    store.update((state) => ({
      ...state,
      errors: withFormError(state.errors, key, apiError),
    }));
    if (
      apiError.code === 'invalid_state' ||
      apiError.code === 'conflict' ||
      apiError.code === 'not_found'
    ) {
      await refreshAfterMutation(visitId);
    }
    store.update((state) => ({
      ...state,
      loading: { ...state.loading, mutation: false },
    }));
    return;
  }

  await refreshAfterMutation(visitId);
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, mutation: false },
  }));
}

function handleCheckIn(visitId: string, position: Position): Promise<void> {
  return runVisitMutation('checkin', visitId, () => checkIn(visitId, position));
}

function handleCheckOut(visitId: string, position: Position): Promise<void> {
  return runVisitMutation('checkout', visitId, () => checkOut(visitId, position));
}

function handleSubmitReport(visitId: string, report: ReportInput): Promise<void> {
  return runVisitMutation('report', visitId, () => submitReport(visitId, report));
}

async function handleCreate(input: CreateVisitInput): Promise<boolean> {
  if (store.getState().loading.mutation) return false;
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, mutation: true },
    errors: { ...state.errors, plan: null },
  }));

  let created: Visit;
  try {
    created = await createVisit(input);
  } catch (error) {
    store.update((state) => ({
      ...state,
      loading: { ...state.loading, mutation: false },
      errors: { ...state.errors, plan: toApiError(error) },
    }));
    return false;
  }

  await loadVisits();
  await loadVisit(created.id);
  store.update((state) => ({
    ...state,
    loading: { ...state.loading, mutation: false },
  }));
  return true;
}

async function refreshAll(): Promise<void> {
  if (store.getState().loading.mutation) return;
  const tasks: Array<Promise<void>> = [loadCatalog(), loadVisits(), loadDashboard()];
  const selectedId = store.getState().selected?.id;
  if (selectedId !== undefined) tasks.push(loadVisit(selectedId));
  await Promise.all(tasks);
}

refreshButton.addEventListener('click', () => {
  void refreshAll();
});

store.update((state) => ({
  ...state,
  loading: { ...state.loading, catalog: true, visits: true, dashboard: true },
}));
store.subscribe(render);
render(store.getState());

void Promise.all([loadCatalog(), loadVisits(), loadDashboard()]);
