export type MediaAdapterKind =
  | "comfy";

export type AdapterWorkflow =
  Record<string, unknown>;

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

export interface AdapterSubmission {
  backendJobId: string;
  backendResponse: unknown;
}

export interface AdapterArtifact {
  filename: string;
  subfolder: string;
  type: string;

  nodeId?: string;
}

export type AdapterExecutionState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "unknown";

export interface AdapterExecutionStatus {
  state: AdapterExecutionState;

  artifacts: AdapterArtifact[];

  error?: string;
}

export interface MediaAdapter {
  readonly kind: MediaAdapterKind;

  liveness():
    Promise<AdapterLiveness>;

  readiness():
    Promise<AdapterReadiness>;

  submit(
    workflow: AdapterWorkflow
  ): Promise<AdapterSubmission>;

  status(
    backendJobId: string
  ): Promise<AdapterExecutionStatus>;

  downloadArtifact(
    artifact: AdapterArtifact,
    destinationPath: string
  ): Promise<void>;
}
