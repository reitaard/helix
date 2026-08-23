export type WorkerAdapter = "comfy";

export type WorkerState =
  | "offline"
  | "starting"
  | "cold_ready"
  | "ready"
  | "busy"
  | "degraded";

export interface WorkerDefinition {
  id: string;
  name: string;
  profile: string;
  revision: string;

  adapter: WorkerAdapter;
  endpoint: string;

  capabilities: string[];

  modelFamilies: Record<
    string,
    {
      available: string[];
      validated: string[];
    }
  >;

  maxConcurrentGpuJobs: number;
}

export interface WorkerChecks {
  systemStats: boolean;
  queue: boolean;
  objectInfo: boolean;
  websocket: boolean;
}

export interface WorkerHealth {
  workerId: string;
  profile: string;
  state: WorkerState;

  checks: WorkerChecks;

  latencyMs: number;

  comfy?: {
    version?: string;
    python?: string;
    pytorch?: string;
  };

  device?: unknown;

  queue?: {
    running: number;
    pending: number;
  };

  nodeClassCount?: number;

  errors: string[];
}
