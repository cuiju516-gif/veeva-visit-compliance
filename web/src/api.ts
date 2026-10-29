import type {
  ApiErrorEnvelope,
  Catalog,
  Dashboard,
  ErrorDetails,
  Material,
  Visit,
  VisitListResponse,
  VisitStatus,
} from './types';

export interface VisitFilters {
  status: VisitStatus | '';
  productId: string;
}

export interface Position {
  lat: number;
  lng: number;
}

export interface CreateVisitInput {
  mrId: string;
  hcpId: string;
  productId: string;
  plannedAt: string;
}

export interface ReportInput {
  talkingPoints: string;
  hcpFeedback: string;
  materialsDistributed: boolean;
  materials: Material[];
}

/**
 * Error thrown for every failed API call. `code` is the server's stable error
 * code; transport failures use the client-side code `network_error`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The server's `error.details.field`, when it named one. */
  get field(): string | undefined {
    return this.details?.field;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError(0, 'internal_error', error.message);
  }
  return new ApiError(0, 'internal_error', 'An unexpected error occurred.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorEnvelope(value: unknown): ApiErrorEnvelope['error'] | null {
  if (!isRecord(value) || !isRecord(value['error'])) return null;
  const raw = value['error'];
  if (typeof raw['code'] !== 'string' || typeof raw['message'] !== 'string') {
    return null;
  }
  let details: ErrorDetails | undefined;
  if (isRecord(raw['details'])) {
    details = {};
    for (const [key, item] of Object.entries(raw['details'])) {
      if (typeof item === 'string') details[key] = item;
    }
  }
  return { code: raw['code'], message: raw['message'], details };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed.';
    throw new ApiError(0, 'network_error', message);
  }

  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const envelope = readErrorEnvelope(body);
    throw new ApiError(
      response.status,
      envelope?.code ?? 'internal_error',
      envelope?.message ?? `Request failed with HTTP ${response.status}.`,
      envelope?.details,
    );
  }

  // Response shapes are fixed by the API contract; callers name the type.
  return body as T;
}

function jsonRequest<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getCatalog(): Promise<Catalog> {
  return request<Catalog>('/api/catalog');
}

export function listVisits(filters: VisitFilters): Promise<VisitListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.productId) params.set('productId', filters.productId);
  // The server caps a page at 200; showing one page is enough for this app.
  params.set('limit', '200');
  return request<VisitListResponse>(`/api/visits?${params.toString()}`);
}

export function getVisit(id: string): Promise<Visit> {
  return request<Visit>(`/api/visits/${encodeURIComponent(id)}`);
}

export function createVisit(input: CreateVisitInput): Promise<Visit> {
  return jsonRequest<Visit>('/api/visits', 'POST', input);
}

export function checkIn(id: string, position: Position): Promise<Visit> {
  return jsonRequest<Visit>(`/api/visits/${encodeURIComponent(id)}/checkin`, 'POST', position);
}

export function checkOut(id: string, position: Position): Promise<Visit> {
  return jsonRequest<Visit>(`/api/visits/${encodeURIComponent(id)}/checkout`, 'POST', position);
}

export function submitReport(id: string, report: ReportInput): Promise<Visit> {
  return jsonRequest<Visit>(`/api/visits/${encodeURIComponent(id)}/report`, 'PUT', report);
}

export function getDashboard(months = 6): Promise<Dashboard> {
  return request<Dashboard>(`/api/dashboard/monthly?months=${months}`);
}
