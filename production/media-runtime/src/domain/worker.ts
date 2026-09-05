import type { MediaAdapterKind } from "./media-adapter.js";

export type WorkerAdapter = MediaAdapterKind;

export interface ExecutionResourceDefinition {
  id: string;
  maxConcurrentGpuJobs: number;
}

export interface ProductionProfileDefinition {
  id: string;
  displayName: string;
  capabilities: string[];
  modelFamilies: Record<string, {
    available: string[];
    validated: string[];
  }>;
}

/** A worker is a software backend endpoint associated with one physical execution resource. */
export interface WorkerDefinition {
  id: string;
  name: string;
  revision: string;
  adapter: WorkerAdapter;
  endpoint: string;
  /** Runtime-only credential; never persisted or returned by registry summaries. */
  authToken?: string;
  resourceId: string;
  productionProfiles: ProductionProfileDefinition[];
  /** Compatibility summary; physical resource capacity is authoritative. */
  maxConcurrentGpuJobs: number;
}

export type WorkerState =
  | "offline"
  | "starting"
  | "cold_ready"
  | "ready"
  | "busy"
  | "degraded";

export interface WorkerChecks {
  systemStats: boolean;
  queue: boolean;
  objectInfo: boolean;
  websocket: boolean;
}

export interface WorkerHealth {
  workerId: string;
  state: WorkerState;
  checks: WorkerChecks;
  latencyMs: number;
  comfy?: { version?: string; python?: string; pytorch?: string };
  device?: unknown;
  queue?: { running: number; pending: number };
  nodeClassCount?: number;
  errors: string[];
}
