export type MediaAdapterKind =
  | "comfy";

export interface AdapterLiveness {
  adapter: MediaAdapterKind;
  reachable: boolean;
  latencyMs: number;

  backendVersion?: string;
  error?: string;
}

export interface AdapterReadinessChecks {
  runtime: boolean;
  queue: boolean;
  capabilities: boolean;
  events: boolean;
}

export interface AdapterReadiness {
  adapter: MediaAdapterKind;

  transportReady: boolean;

  checks: AdapterReadinessChecks;

  latencyMs: number;

  backend?: {
    version?: string;
    python?: string;
    runtime?: string;
  };

  device?: unknown;

  queue?: {
    running: number;
    pending: number;
  };

  capabilityCount?: number;

  errors: string[];
}

export interface MediaAdapter {
  readonly kind: MediaAdapterKind;

  liveness():
    Promise<AdapterLiveness>;

  readiness():
    Promise<AdapterReadiness>;
}
