// Wire types mirroring the Go API's DTOs. Nothing here is computed by the
// client: duration, flags and abnormal are always server-derived values.

export type VisitStatus = 'PLANNED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'REPORTED';

export type FlagCode = 'DURATION_TOO_SHORT' | 'LOCATION_DEVIATION';

export type MaterialKind = 'slide' | 'reprint' | 'document' | 'other';

export interface Mr {
  id: string;
  name: string;
  region: string;
}

export interface Hcp {
  id: string;
  name: string;
  hospitalName: string;
  department: string;
  baseLat: number;
  baseLng: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
}

export interface Catalog {
  mrs: Mr[];
  hcps: Hcp[];
  products: Product[];
}

export interface VisitPoint {
  at: string;
  lat: number;
  lng: number;
}

export interface VisitFlag {
  code: FlagCode;
  detail: string;
}

export interface Material {
  name: string;
  kind: MaterialKind;
}

export interface Capabilities {
  canCheckIn: boolean;
  canCheckOut: boolean;
  canReport: boolean;
}

export interface Visit {
  id: string;
  status: VisitStatus;
  mrId: string;
  mrName: string;
  hcpId: string;
  hcpName: string;
  productId: string;
  productName: string;
  hospitalName: string;
  department: string;
  baseLat: number;
  baseLng: number;
  plannedAt: string;
  checkin?: VisitPoint;
  checkout?: VisitPoint;
  durationSeconds?: number;
  abnormal: boolean;
  flags: VisitFlag[];
  talkingPoints: string;
  hcpFeedback: string;
  materialsDistributed: boolean;
  materials: Material[];
  capabilities: Capabilities;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VisitListResponse {
  visits: Visit[];
  count: number;
}

export interface MonthlyRow {
  month: string;
  productId: string;
  productName: string;
  visits: number;
  abnormal: number;
  /** Fraction in [0, 1], not a percentage. */
  abnormalShare: number;
}

export interface Dashboard {
  months: string[];
  rows: MonthlyRow[];
  totalVisits: number;
  totalAbnormal: number;
}

export interface ErrorDetails {
  [key: string]: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
  };
}
