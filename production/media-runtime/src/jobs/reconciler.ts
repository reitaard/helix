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
      3000,

    private readonly deliveryProviders:
      string[] = [],

    private readonly runningTimeoutMs =
      60 * 60 * 1000
  ) {}

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
          if (
            job.status === "running" &&
            job.startedAt
          ) {
            const elapsedMs =
              Date.now() -
              new Date(
                job.startedAt
              ).getTime();

            if (
              elapsedMs >=
              this.runningTimeoutMs
            ) {
              const cancelled =
                await this.workers
                  .cancel(
                    job.workerId,
                    job.backendJobId
                  );

              if (cancelled === true) {
                await this.cleanupFaceFusionInputs(job);
                const marked =
                  await this.jobs
                    .markTimedOut(
                      job.id,
                      job.backendJobId,
                      this.runningTimeoutMs
                    );

                if (marked) {
                  console.log(
                    `[jobs] ${job.id} -> timed_out`
                  );

                  continue;
                }
              }
            }
          }

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
            await this.cleanupFaceFusionInputs(job);
            await this.jobs
              .markSucceeded(
                job.id,
                {
                  backendJobId:
                    job.backendJobId,

                  artifacts:
                    backend.artifacts
                },

                backend.artifacts,

                this.deliveryProviders
              );

            console.log(
              `[jobs] ${job.id} -> succeeded`
            );

            continue;
          }

          if (
            backend.state ===
            "cancelled"
          ) {
            await this.cleanupFaceFusionInputs(job);
            await this.jobs
              .markCancelled(
                job.id,
                job.backendJobId
              );

            console.log(
              `[jobs] ${job.id} -> cancelled`
            );

            continue;
          }

          if (
            backend.state ===
            "failed"
          ) {
            await this.cleanupFaceFusionInputs(job);
            await this.jobs
              .markBackendFailed(
                job.id,
                backend.error ??
                  "Backend execution failed"
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
