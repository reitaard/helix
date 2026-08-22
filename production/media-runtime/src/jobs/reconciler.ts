import {
  JobRepository
} from "../repositories/job-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

export class JobReconciler {
  private timer:
    NodeJS.Timeout | null =
      null;

  private ticking = false;

  constructor(
    private readonly jobs:
      JobRepository,

    private readonly workers:
      WorkerRegistry,

    private readonly intervalMs =
      3000
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    void this.tick();

    this.timer =
      setInterval(
        () => {
          void this.tick();
        },
        this.intervalMs
      );
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer
    );

    this.timer = null;
  }

  private async tick() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      const jobs =
        await this.jobs
          .listActive();

      for (const job of jobs) {
        if (
          !job.workerId ||
          !job.backendJobId
        ) {
          continue;
        }

        try {
          const backend =
            await this.workers
              .status(
                job.workerId,
                job.backendJobId
              );

          if (!backend) {
            continue;
          }

          if (
            backend.state ===
              "running" &&
            job.status !==
              "running"
          ) {
            await this.jobs
              .markRunning(
                job.id
              );

            console.log(
              `[jobs] ${job.id} -> running`
            );

            continue;
          }

          if (
            backend.state ===
            "succeeded"
          ) {
            await this.jobs
              .markSucceeded(
                job.id,
                {
                  backendJobId:
                    job.backendJobId,

                  artifacts:
                    backend.artifacts
                }
              );

            console.log(
              `[jobs] ${job.id} -> succeeded`
            );

            continue;
          }

          if (
            backend.state ===
            "failed"
          ) {
            await this.jobs
              .markBackendFailed(
                job.id,
                backend.error ??
                  "Comfy execution failed"
              );

            console.log(
              `[jobs] ${job.id} -> failed`
            );
          }
        }
        catch (error) {
          console.error(
            `[jobs] reconcile ${job.id} failed`,
            error
          );
        }
      }
    }
    finally {
      this.ticking = false;
    }
  }
}
