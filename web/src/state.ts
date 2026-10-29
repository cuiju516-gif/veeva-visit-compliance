import type { ApiError } from './api';
import type { Catalog, Dashboard, Visit, VisitStatus } from './types';

type FormKey = 'plan' | 'checkin' | 'checkout' | 'report';

type ErrorScope =
  | 'catalog'
  | 'list'
  | 'detail'
  | 'dashboard'
  | FormKey;

export type ErrorState = Record<ErrorScope, ApiError | null>;

export interface Filters {
  status: VisitStatus | '';
  productId: string;
}

export interface LoadingState {
  catalog: boolean;
  visits: boolean;
  selected: boolean;
  dashboard: boolean;
  mutation: boolean;
}

export interface AppState {
  catalog: Catalog | null;
  visits: Visit[];
  selected: Visit | null;
  dashboard: Dashboard | null;
  filters: Filters;
  loading: LoadingState;
  errors: ErrorState;
}

export interface Store {
  getState: () => AppState;
  update: (updater: (state: AppState) => AppState) => void;
  subscribe: (listener: (state: AppState) => void) => () => void;
}

function createInitialState(): AppState {
  return {
    catalog: null,
    visits: [],
    selected: null,
    dashboard: null,
    filters: { status: '', productId: '' },
    loading: {
      catalog: false,
      visits: false,
      selected: false,
      dashboard: false,
      mutation: false,
    },
    errors: {
      catalog: null,
      list: null,
      detail: null,
      dashboard: null,
      plan: null,
      checkin: null,
      checkout: null,
      report: null,
    },
  };
}

export function createStore(): Store {
  let state = createInitialState();
  const listeners = new Set<(state: AppState) => void>();

  return {
    getState: () => state,
    update: (updater) => {
      state = updater(state);
      for (const listener of listeners) listener(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
