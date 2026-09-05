import type {
  AdapterArtifact,
  AdapterExecutionStatus,
  AdapterLiveness,
  AdapterReadiness,
  MediaAdapter
} from "../../domain/media-adapter.js";
import { faceFusionAdapterRequest } from "../../facefusion/settings.js";
import {
  FACEFUSION_WORKER_VERSION,
  FaceFusionClient,
  type FaceFusionJobResponse
} from "./client.js";

function errorText(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

function executionStatus(body: FaceFusionJobResponse, backendJobId: string): AdapterExecutionStatus {
  if (body.status === "succeeded") {
    if (!body.artifact) throw new Error("FaceFusion succeeded job has no artifact metadata");
    return {
      state: "succeeded",
      artifacts: [{
        filename: body.artifact.filename,
        type: "output",
        artifactId: backendJobId,
        mediaKind: body.artifact.mediaKind
      }]
    };
  }
  if (body.status === "failed") {
    return { state: "failed", artifacts: [], error: "FaceFusion execution failed" };
  }
  if (body.status === "cancelled") {
    return { state: "cancelled", artifacts: [] };
  }
  return { state: body.status, artifacts: [] };
}

export class FaceFusionAdapter implements MediaAdapter {
  readonly kind = "facefusion" as const;
  private readonly client: FaceFusionClient;

  constructor(endpoint: string, bearerToken?: string) {
    this.client = new FaceFusionClient(endpoint, bearerToken);
  }

  async liveness(): Promise<AdapterLiveness> {
    const started = performance.now();
    try {
      const response = await this.client.health();
      return {
        adapter: this.kind,
        reachable: response.body.ok,
        latencyMs: Math.round(performance.now() - started),
        backendVersion: response.body.version
      };
    }
    catch (error) {
      return { adapter: this.kind, reachable: false, latencyMs: Math.round(performance.now() - started), error: errorText(error) };
    }
  }

  async readiness(): Promise<AdapterReadiness> {
    const started = performance.now();
    try {
      const { body } = await this.client.readiness();
      const failedChecks = Object.entries(body.checks).filter(([, passed]) => !passed).map(([name]) => name);
      const executionReady = body.ready && body.apiAuthConfigured && failedChecks.length === 0;
      const errors = [
        ...(!body.apiAuthConfigured ? ["FaceFusion worker API authentication is not configured"] : []),
        ...(!body.ready ? ["FaceFusion worker reported ready=false"] : []),
        ...failedChecks.map(check => `FaceFusion readiness check failed: ${check}`)
      ];
      return {
        adapter: this.kind,
        transportReady: executionReady,
        checks: {
          runtime: executionReady,
          queue: executionReady && body.capacity.maxActiveJobs === 1,
          capabilities: executionReady,
          events: false
        },
        latencyMs: Math.round(performance.now() - started),
        backend: { version: FACEFUSION_WORKER_VERSION, runtime: body.worker },
        queue: { running: body.capacity.activeJobId === null ? 0 : 1, pending: 0 },
        capabilityCount: body.capabilities.length,
        errors
      };
    }
    catch (error) {
      const message = errorText(error);
      return {
        adapter: this.kind,
        transportReady: false,
        checks: { runtime: false, queue: false, capabilities: false, events: false },
        latencyMs: Math.round(performance.now() - started),
        errors: [message]
      };
    }
  }

  async submit(workflow: Record<string, unknown>, context?: { jobId: string; dispatchToken?: string }) {
    if (!context?.jobId) throw new Error("FaceFusion submission requires durable job context");
    const response = await this.client.createJob(faceFusionAdapterRequest(workflow, context.jobId));
    return { backendJobId: context.jobId, backendResponse: response.body };
  }

  async status(backendJobId: string) {
    return executionStatus((await this.client.job(backendJobId)).body, backendJobId);
  }

  async cancel(backendJobId: string) {
    return (await this.client.cancelJob(backendJobId)).body.status === "cancelled";
  }

  async downloadArtifact(artifact: AdapterArtifact, destinationPath: string) {
    if (!artifact.artifactId) throw new Error("FaceFusion artifact is missing its job identifier");
    if (!artifact.mediaKind) throw new Error("FaceFusion artifact is missing its media kind");
    await this.client.downloadArtifact(artifact.artifactId, artifact.mediaKind, destinationPath);
  }

  subscribeExecutionEvents() { return null; }

  async uploadInput(filePath: string, input: { filename: string; mediaKind: "image" | "video"; role: "source" | "target" }) {
    const response = await this.client.uploadInput(filePath, input.filename, input.role);
    if (response.body.mediaKind !== input.mediaKind) {
      throw new Error(`FaceFusion worker detected ${response.body.mediaKind}, expected ${input.mediaKind}`);
    }
    return { handle: response.body.id, response: response.body };
  }

  async deleteInput(handle: string) {
    if (!/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/i.test(handle)) {
      throw new Error("FaceFusion input id must be 32-character UUID4 hex");
    }
    await this.client.deleteInput(handle);
    return true;
  }
}

export const faceFusionNormalization = { executionStatus };
