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

  memory?: {
    total: number;
    free: number;
  };

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

export interface AdapterProgressNode {
  nodeId: string;
  displayNodeId: string | null;
  realNodeId: string | null;
  parentNodeId: string | null;
  state: string;
  value: number;
  max: number;
}

export type AdapterExecutionEvent =
  | {
      kind: "execution_start";
      backendJobId: string;
    }
  | {
      kind: "executing";
      backendJobId: string;
      nodeId: string | null;
      displayNodeId: string | null;
    }
  | {
      kind: "progress";
      backendJobId: string;
      nodeId: string | null;
      value: number;
      max: number;
    }
  | {
      kind: "progress_state";
      backendJobId: string;
      nodes: AdapterProgressNode[];
    }
  | {
      kind: "execution_success";
      backendJobId: string;
    }
  | {
      kind: "execution_interrupted";
      backendJobId: string;
    }
  | {
      kind: "execution_error";
      backendJobId: string;
      message: string | null;
    };

export type AdapterExecutionEventListener =
  (event: AdapterExecutionEvent) => void;

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

  cancel(
    backendJobId: string
  ): Promise<boolean>;

  downloadArtifact(
    artifact: AdapterArtifact,
    destinationPath: string
  ): Promise<void>;

  subscribeExecutionEvents(
    listener: AdapterExecutionEventListener
  ): () => void;
}
