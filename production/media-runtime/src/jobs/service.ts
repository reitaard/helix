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
  applyImageInput
} from "./workflow-inputs.js";

export interface CreateMediaJobInput {
  tool: string;

  workerId: string;

  workflow:
    Record<
      string,
      Record<string, unknown>
    >;

  inputs: {
    image?: string;
  };

  generation?:
    Record<string, unknown>;

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

    if (
      !job.workerId ||
      !job.backendJobId
    ) {
      return {
        jobId: id,
        cancelled: false,
        status: job.status
      };
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
          workflow,
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
          input.workerId,

        adapter:
          worker.runtime,

        idempotencyKey:
          input.idempotencyKey,

        request: {
          tool:
            input.tool,

          workerId:
            input.workerId,

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

    try {
      const submission =
        await this.workers
          .submit(
            input.workerId,
            workflow
          );

      if (!submission) {
        throw new Error(
          "Worker adapter unavailable"
        );
      }

      await this.jobs
        .markQueued({
          id,

          backendJobId:
            submission
              .backendJobId,

          backendResponse:
            submission
              .backendResponse
        });

      const created =
        await this.jobs.get(
          id
        );

      if (!created) {
        throw new Error(
          "Created job disappeared"
        );
      }

      return created;
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await this.jobs
        .markFailed(
          id,
          message
        );

      throw new JobSubmissionError(
        id,
        message
      );
    }
  }
}
