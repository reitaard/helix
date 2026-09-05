import crypto from "node:crypto";

import {
  JobRepository
} from "../repositories/job-repository.js";

import {
  DeliveryRepository
} from "../repositories/delivery-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  applyImageInput,
  type Workflow
} from "./workflow-inputs.js";

import type {
  TelegramDestination
} from "../telegram/context.js";

export interface CreateMediaJobInput {
  tool: string;

  workerId: string;

  profileId?: string;

  workflow:
    Record<string, unknown>;

  inputs: {
    image?: string;
  };

  generation?:
    Record<string, unknown>;

  deliveryContext?: TelegramDestination & {
    provider: "telegram";
    userId: string;
    botKey?: string;
  };

  idempotencyKey:
    string | null;
}

export class WorkerNotFoundError
  extends Error {

  constructor(
    readonly workerId: string
  ) {
    super(
      `Worker not found: ${workerId}`
    );
  }
}

export class ProfileResolutionError
  extends Error {

  constructor(
    readonly code:
      | "profile_not_found"
      | "profile_tool_mismatch"
      | "profile_ambiguous",
    readonly workerId: string,
    readonly tool: string,
    readonly profileId?: string
  ) {
    super(
      code === "profile_not_found"
        ? `Production profile not found: ${profileId}`
        : code === "profile_tool_mismatch"
          ? `Production profile ${profileId} does not support ${tool}`
          : `Production profile is ambiguous for ${tool}`
    );
  }
}

export class JobSubmissionError
  extends Error {

  constructor(
    readonly jobId: string,
    message: string
  ) {
    super(message);
  }
}

export class JobCancellationError
  extends Error {

  constructor(
    readonly jobId: string,
    message: string
  ) {
    super(message);
  }
}

export class JobService {
  private async cleanupFaceFusionInputs(job: { adapter: string | null; workerId: string | null; request: unknown }) {
    if (job.adapter !== "facefusion" || !job.workerId || !job.request || typeof job.request !== "object" || Array.isArray(job.request)) return;
    const workflow = (job.request as Record<string, unknown>).workflow;
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return;
    const payload = workflow as Record<string, unknown>;
    const handles = [payload.sourceInputId, payload.targetInputId].filter((handle): handle is string => typeof handle === "string");
    const results = await Promise.allSettled(handles.map(handle => this.workers.deleteInput(job.workerId!, handle)));
    for (const result of results) {
      if (result.status === "rejected") console.error("[jobs] FaceFusion input cleanup failed", result.reason);
    }
  }

  constructor(
    private readonly jobs:
      JobRepository,

    private readonly workers:
      WorkerRegistry,

    private readonly deliveries:
      DeliveryRepository
  ) {}

  async get(id: string) {
    const job =
      await this.jobs.get(id);

    if (!job) {
      return null;
    }

    const deliveries =
      await this.deliveries
        .listForJob(id);

    return {
      ...job,
      deliveries
    };
  }

  async cancel(
    id: string
  ) {
    const job =
      await this.jobs.get(id);

    if (!job) {
      return null;
    }

    if (
      [
        "succeeded",
        "failed",
        "cancelled",
        "timed_out"
      ].includes(job.status)
    ) {
      return {
        jobId: id,
        cancelled: false,
        status: job.status
      };
    }

    if (!job.backendJobId) {
      const cancelled = await this.jobs.cancelWaiting(id);
      if (cancelled) await this.cleanupFaceFusionInputs(job);
      const current = await this.jobs.get(id);
      return {
        jobId: id,
        cancelled,
        status: current?.status ?? (cancelled ? "cancelled" : job.status)
      };
    }

    if (!job.workerId) {
      return { jobId: id, cancelled: false, status: job.status };
    }

    try {
      const backendCancelled =
        await this.workers.cancel(
          job.workerId,
          job.backendJobId
        );

      if (backendCancelled === null) {
        throw new Error(
          "Worker adapter unavailable"
        );
      }

      if (!backendCancelled) {
        const current =
          await this.jobs.get(id);

        return {
          jobId: id,
          cancelled: false,
          status:
            current?.status ??
            job.status
        };
      }

      const marked =
        await this.jobs
          .markCancelled(
            id,
            job.backendJobId
          );

      if (marked) await this.cleanupFaceFusionInputs(job);

      const current =
        await this.jobs.get(id);

      return {
        jobId: id,
        cancelled: marked,
        status:
          current?.status ??
          (
            marked
              ? "cancelled"
              : job.status
          )
      };
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      throw new JobCancellationError(
        id,
        message
      );
    }
  }

  async create(
    input: CreateMediaJobInput
  ) {
    if (
      input.idempotencyKey
    ) {
      const existing =
        await this.jobs
          .findByIdempotencyKey(
            input.idempotencyKey
          );

      if (existing) {
        return existing;
      }
    }

    const worker =
      this.workers.get(
        input.workerId
      );

    if (!worker) {
      throw new WorkerNotFoundError(
        input.workerId
      );
    }

    const resolution =
      this.workers.resolveProfile(
        input.workerId,
        input.tool,
        input.profileId
      );

    if (resolution.kind !== "resolved") {
      if (resolution.kind === "worker_not_found") {
        throw new WorkerNotFoundError(input.workerId);
      }

      throw new ProfileResolutionError(
        resolution.kind,
        input.workerId,
        input.tool,
        "profileId" in resolution
          ? resolution.profileId
          : undefined
      );
    }

    const profile = resolution.profile;

    let workflow =
      structuredClone(
        input.workflow
      );

    if (
      input.inputs.image !==
      undefined
    ) {
      workflow =
        applyImageInput(
          workflow as Workflow,
          input.inputs.image
        );
    }

    const id =
      `job_${crypto
        .randomUUID()
        .replaceAll("-", "")}`;

    await this.jobs
      .createAccepted({
        id,

        tool:
          input.tool,

        workerId:
          worker.id,

        profileId:
          profile.id,

        adapter:
          worker.runtime,

        resourceId:
          worker.resourceId,

        idempotencyKey:
          input.idempotencyKey,

        ...(input.deliveryContext
          ? { deliveryContext: input.deliveryContext }
          : {}),

        request: {
          tool:
            input.tool,

          workerId:
            worker.id,

          profileId:
            profile.id,

          inputs:
            input.inputs,

          ...(input.generation
            ? {
                generation:
                  input.generation
              }
            : {}),

          workflow
        }
      });

    const created = await this.jobs.get(id);
    if (!created) throw new Error("Created job disappeared");
    return created;
  }
}
