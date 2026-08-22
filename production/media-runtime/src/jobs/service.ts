import crypto from "node:crypto";

import {
  JobRepository
} from "../repositories/job-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  applyImageInput
} from "./workflow-inputs.js";

export interface CreateMediaJobInput {
  workerId: string;

  workflow:
    Record<
      string,
      Record<string, unknown>
    >;

  inputs: {
    image?: string;
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

export class JobSubmissionError
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
      WorkerRegistry
  ) {}

  get(id: string) {
    return this.jobs.get(id);
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

        workerId:
          input.workerId,

        adapter:
          worker.runtime,

        idempotencyKey:
          input.idempotencyKey,

        request: {
          workerId:
            input.workerId,

          inputs:
            input.inputs,

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
