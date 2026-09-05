import { ComfyAdapter } from "../adapters/comfy/adapter.js";
import { FaceFusionAdapter } from "../adapters/facefusion/adapter.js";
import type {
  AdapterArtifact,
  AdapterExecutionEventListener,
  MediaAdapter
} from "../domain/media-adapter.js";
import type {
  ProductionProfileDefinition,
  WorkerDefinition,
  WorkerState
} from "../domain/worker.js";

export type ProfileResolution =
  | { kind: "resolved"; profile: ProductionProfileDefinition }
  | { kind: "worker_not_found" }
  | { kind: "profile_not_found"; profileId: string }
  | { kind: "profile_tool_mismatch"; profileId: string; tool: string }
  | { kind: "profile_ambiguous"; tool: string; profileIds: string[] };

export class WorkerRegistry {
  private readonly definitions = new Map<string, WorkerDefinition>();
  private readonly adapters = new Map<string, MediaAdapter>();

  constructor(workers: WorkerDefinition[], suppliedAdapters: ReadonlyMap<string, MediaAdapter> = new Map()) {
    for (const worker of workers) {
      this.definitions.set(worker.id, worker);
      const supplied = suppliedAdapters.get(worker.id);
      const adapter = supplied ?? (worker.adapter === "comfy"
        ? new ComfyAdapter(worker.endpoint, `helix-runtime-${worker.id}`)
        : new FaceFusionAdapter(worker.endpoint, worker.authToken));
      if (adapter.kind !== worker.adapter) {
        throw new Error(`Adapter kind mismatch for ${worker.id}: expected ${worker.adapter}, got ${adapter.kind}`);
      }
      this.adapters.set(worker.id, adapter);
    }

    // Read-only compatibility for jobs accepted before the physical-worker ID
    // was split into a backend ID and an execution-resource ID.
    if (!this.adapters.has("helix-rtx4060-01")) {
      const comfy = workers.find(worker => worker.id === "helix-comfy-rtx4060-01");
      const adapter = comfy ? this.adapters.get(comfy.id) : null;
      if (adapter) this.adapters.set("helix-rtx4060-01", adapter);
    }
  }

  private summary(worker: WorkerDefinition) {
    return {
      id: worker.id,
      name: worker.name,
      revision: worker.revision,
      runtime: worker.adapter,
      resourceId: worker.resourceId,
      productionProfiles: worker.productionProfiles,
      capabilities: worker.productionProfiles.flatMap(profile => profile.capabilities),
      maxConcurrentGpuJobs: worker.maxConcurrentGpuJobs
    };
  }

  list() { return [...this.definitions.values()].map(worker => this.summary(worker)); }
  get(id: string) {
    const worker = this.definitions.get(id) ?? (id === "helix-rtx4060-01"
      ? [...this.definitions.values()].find(candidate => candidate.id === "helix-comfy-rtx4060-01")
      : undefined);
    return worker ? this.summary(worker) : null;
  }
  getDefinition(id: string) { return this.definitions.get(id) ?? null; }
  getAdapter(id: string) { return this.adapters.get(id) ?? null; }
  listProfiles(workerId: string) { return this.definitions.get(workerId)?.productionProfiles ?? null; }
  getProfile(workerId: string, profileId: string) { return this.definitions.get(workerId)?.productionProfiles.find(profile => profile.id === profileId) ?? null; }
  profileSupportsTool(workerId: string, profileId: string, tool: string) { return this.getProfile(workerId, profileId)?.capabilities.includes(tool) ?? false; }
  profileDisplayName(workerId: string | null, profileId: string | null) {
    if (!workerId) return "Unassigned";
    const effectiveId = workerId === "helix-rtx4060-01" ? "helix-comfy-rtx4060-01" : workerId;
    return this.getProfile(effectiveId, profileId ?? "")?.displayName ?? this.get(workerId)?.name ?? workerId;
  }

  resolveProfile(workerId: string, tool: string, profileId?: string): ProfileResolution {
    const worker = this.definitions.get(workerId);
    if (!worker) return { kind: "worker_not_found" };
    if (profileId) {
      const profile = worker.productionProfiles.find(candidate => candidate.id === profileId);
      if (!profile) return { kind: "profile_not_found", profileId };
      return profile.capabilities.includes(tool)
        ? { kind: "resolved", profile }
        : { kind: "profile_tool_mismatch", profileId, tool };
    }
    const matches = worker.productionProfiles.filter(profile => profile.capabilities.includes(tool));
    return matches.length === 1
      ? { kind: "resolved", profile: matches[0]! }
      : { kind: "profile_ambiguous", tool, profileIds: matches.map(profile => profile.id) };
  }

  async liveness(id: string) {
    const worker = this.definitions.get(id); const adapter = this.adapters.get(id);
    return worker && adapter ? { workerId: worker.id, name: worker.name, revision: worker.revision, ...(await adapter.liveness()) } : null;
  }

  async readiness(id: string) {
    const worker = this.definitions.get(id); const adapter = this.adapters.get(id);
    if (!worker || !adapter) return null;
    const result = await adapter.readiness();
    const executionReady = result.checks.runtime && result.checks.queue && result.checks.capabilities;
    const state: WorkerState = !result.checks.runtime ? "offline" : executionReady ? (result.queue?.running ?? 0) > 0 ? "busy" : "cold_ready" : "degraded";
    return { workerId: worker.id, name: worker.name, revision: worker.revision, state, ...result };
  }

  async queue(id: string) {
    const adapter = this.adapters.get(id);
    return adapter instanceof ComfyAdapter ? adapter.queueSummary() : null;
  }
  async history(id: string, maxItems = 20) {
    const adapter = this.adapters.get(id);
    return adapter instanceof ComfyAdapter ? adapter.history(maxItems) : null;
  }
  async submit(id: string, workflow: Record<string, unknown>, context?: { jobId: string; dispatchToken?: string }) { return this.adapters.get(id)?.submit(workflow, context) ?? null; }
  subscribeExecutionEvents(id: string, listener: AdapterExecutionEventListener) { return this.adapters.get(id)?.subscribeExecutionEvents(listener) ?? null; }
  async cancel(id: string, backendJobId: string) { return this.adapters.get(id)?.cancel(backendJobId) ?? null; }
  async downloadArtifact(id: string, artifact: AdapterArtifact, destinationPath: string) {
    const adapter = this.adapters.get(id); if (!adapter) return false;
    await adapter.downloadArtifact(artifact, destinationPath); return true;
  }
  async status(id: string, backendJobId: string) { return this.adapters.get(id)?.status(backendJobId) ?? null; }
  async uploadInput(id: string, filePath: string, input: { filename: string; mediaKind: "image" | "video"; role: "source" | "target" }) {
    const adapter = this.adapters.get(id); return adapter?.uploadInput ? adapter.uploadInput(filePath, input) : null;
  }
  async deleteInput(id: string, handle: string) {
    const adapter = this.adapters.get(id); return adapter?.deleteInput ? adapter.deleteInput(handle) : null;
  }
  async health(id: string) { return this.readiness(id); }
}
