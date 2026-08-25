import {
  ComfyAdapter
} from "../adapters/comfy/adapter.js";

import type {
  ProductionProfileDefinition,
  WorkerDefinition,
  WorkerState
} from "../domain/worker.js";

export type ProfileResolution =
  | {
      kind: "resolved";
      profile: ProductionProfileDefinition;
    }
  | {
      kind: "worker_not_found";
    }
  | {
      kind: "profile_not_found";
      profileId: string;
    }
  | {
      kind: "profile_tool_mismatch";
      profileId: string;
      tool: string;
    }
  | {
      kind: "profile_ambiguous";
      tool: string;
      profileIds: string[];
    };

export class WorkerRegistry {
  private readonly definitions =
    new Map<string, WorkerDefinition>();

  private readonly adapters =
    new Map<string, ComfyAdapter>();

  constructor(
    workers: WorkerDefinition[]
  ) {
    for (const worker of workers) {
      this.definitions.set(worker.id, worker);

      if (worker.adapter === "comfy") {
        this.adapters.set(
          worker.id,
          new ComfyAdapter(worker.endpoint)
        );
      }
    }
  }

  private summary(
    worker: WorkerDefinition
  ) {
    return {
      id: worker.id,
      name: worker.name,
      revision: worker.revision,
      runtime: worker.adapter,
      productionProfiles: worker.productionProfiles,
      // Compatibility aggregate; profile-level capabilities are authoritative.
      capabilities: worker.productionProfiles.flatMap(
        profile => profile.capabilities
      ),
      maxConcurrentGpuJobs:
        worker.maxConcurrentGpuJobs
    };
  }

  list() {
    return [
      ...this.definitions.values()
    ].map(worker => this.summary(worker));
  }

  get(id: string) {
    const worker = this.definitions.get(id);
    return worker ? this.summary(worker) : null;
  }

  getDefinition(id: string) {
    return this.definitions.get(id) ?? null;
  }

  listProfiles(workerId: string) {
    return this.definitions.get(workerId)
      ?.productionProfiles ?? null;
  }

  getProfile(
    workerId: string,
    profileId: string
  ) {
    return this.definitions.get(workerId)
      ?.productionProfiles.find(
        profile => profile.id === profileId
      ) ?? null;
  }

  profileSupportsTool(
    workerId: string,
    profileId: string,
    tool: string
  ) {
    return this.getProfile(
      workerId,
      profileId
    )?.capabilities.includes(tool) ?? false;
  }

  profileDisplayName(
    workerId: string | null,
    profileId: string | null
  ) {
    if (!workerId) {
      return "Unassigned";
    }

    return this.getProfile(
      workerId,
      profileId ?? ""
    )?.displayName ?? this.get(workerId)?.name ?? workerId;
  }

  resolveProfile(
    workerId: string,
    tool: string,
    profileId?: string
  ): ProfileResolution {
    const worker = this.definitions.get(workerId);

    if (!worker) {
      return { kind: "worker_not_found" };
    }

    if (profileId) {
      const profile = worker.productionProfiles.find(
        candidate => candidate.id === profileId
      );

      if (!profile) {
        return { kind: "profile_not_found", profileId };
      }

      return profile.capabilities.includes(tool)
        ? { kind: "resolved", profile }
        : {
            kind: "profile_tool_mismatch",
            profileId,
            tool
          };
    }

    const matches = worker.productionProfiles.filter(
      profile => profile.capabilities.includes(tool)
    );

    if (matches.length === 1) {
      return {
        kind: "resolved",
        profile: matches[0]!
      };
    }

    return {
      kind: "profile_ambiguous",
      tool,
      profileIds: matches.map(profile => profile.id)
    };
  }

  async liveness(id: string) {
    const worker = this.definitions.get(id);
    const adapter = this.adapters.get(id);

    if (!worker || !adapter) {
      return null;
    }

    return {
      workerId: worker.id,
      name: worker.name,
      revision: worker.revision,
      ...(await adapter.liveness())
    };
  }

  async readiness(id: string) {
    const worker = this.definitions.get(id);
    const adapter = this.adapters.get(id);

    if (!worker || !adapter) {
      return null;
    }

    const result = await adapter.readiness();
    const executionReady =
      result.checks.runtime &&
      result.checks.queue &&
      result.checks.capabilities;

    const state: WorkerState =
      !result.checks.runtime
        ? "offline"
        : executionReady
          ? (result.queue?.running ?? 0) > 0
            ? "busy"
            : "cold_ready"
          : "degraded";

    return {
      workerId: worker.id,
      name: worker.name,
      revision: worker.revision,
      state,
      ...result
    };
  }

  async queue(id: string) {
    return this.adapters.get(id)
      ?.queueSummary() ?? null;
  }

  async history(
    id: string,
    maxItems = 20
  ) {
    return this.adapters.get(id)
      ?.history(maxItems) ?? null;
  }

  async submit(
    id: string,
    workflow: Record<string, unknown>
  ) {
    return this.adapters.get(id)
      ?.submit(workflow) ?? null;
  }

  async cancel(
    id: string,
    backendJobId: string
  ) {
    return this.adapters.get(id)
      ?.cancel(backendJobId) ?? null;
  }

  async downloadArtifact(
    id: string,
    artifact: {
      filename: string;
      subfolder: string;
      type: string;
    },
    destinationPath: string
  ) {
    const adapter = this.adapters.get(id);

    if (!adapter) {
      return false;
    }

    await adapter.downloadArtifact(
      artifact,
      destinationPath
    );

    return true;
  }

  async status(
    id: string,
    backendJobId: string
  ) {
    return this.adapters.get(id)
      ?.status(backendJobId) ?? null;
  }

  async health(id: string) {
    return this.readiness(id);
  }
}
