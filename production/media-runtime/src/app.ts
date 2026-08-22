import Fastify from "fastify";
import { z } from "zod";

import type {
  WorkerService
} from "./workers/service.js";

import {
  JobSubmissionError,
  WorkerNotFoundError
} from "./jobs/service.js";

import type {
  JobService
} from "./jobs/service.js";

const createJobSchema =
  z.object({
    workerId:
      z.string().min(1),

    workflow:
      z.record(
        z.string(),
        z.unknown()
      ),

    idempotencyKey:
      z.string()
        .min(1)
        .max(200)
        .optional()
  });

export function createApp(
  workers: WorkerService,
  jobs: JobService
) {
  const app =
    Fastify({
      logger: true,

      requestIdHeader:
        "x-request-id"
    });

  app.get(
    "/v1/health",
    async () => ({
      service:
        "helix-runtime",

      status: "ok",

      timestamp:
        new Date()
          .toISOString()
    })
  );

  app.get(
    "/v1/workers",
    async () => ({
      workers:
        workers.list()
    })
  );

  app.get<{
    Params: {
      workerId: string;
    };
  }>(
    "/v1/workers/:workerId",
    async (
      request,
      reply
    ) => {
      const worker =
        workers.get(
          request.params
            .workerId
        );

      if (!worker) {
        return reply
          .code(404)
          .send({
            error:
              "worker_not_found"
          });
      }

      return worker;
    }
  );

  app.get<{
    Params: {
      workerId: string;
    };
  }>(
    "/v1/workers/:workerId/live",
    async (
      request,
      reply
    ) => {
      const result =
        await workers
          .liveness(
            request.params
              .workerId
          );

      if (!result) {
        return reply
          .code(404)
          .send({
            error:
              "worker_not_found"
          });
      }

      return result;
    }
  );

  app.get<{
    Params: {
      workerId: string;
    };
  }>(
    "/v1/workers/:workerId/readiness",
    async (
      request,
      reply
    ) => {
      const result =
        await workers
          .readiness(
            request.params
              .workerId
          );

      if (!result) {
        return reply
          .code(404)
          .send({
            error:
              "worker_not_found"
          });
      }

      return result;
    }
  );

  app.get<{
    Params: {
      workerId: string;
    };
  }>(
    "/v1/workers/:workerId/health",
    async (
      request,
      reply
    ) => {
      const result =
        await workers.health(
          request.params
            .workerId
        );

      if (!result) {
        return reply
          .code(404)
          .send({
            error:
              "worker_not_found"
          });
      }

      return result;
    }
  );

  app.post(
    "/v1/media/jobs",
    async (
      request,
      reply
    ) => {
      const parsed =
        createJobSchema
          .safeParse(
            request.body
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid_request",

            issues:
              parsed.error.issues
          });
      }

      try {
        const job =
          await jobs.create({
            workerId:
              parsed.data
                .workerId,

            workflow:
              parsed.data
                .workflow,

            idempotencyKey:
              parsed.data
                .idempotencyKey ??
              null
          });

        return reply
          .code(202)
          .send(job);
      }
      catch (error) {
        if (
          error instanceof
          WorkerNotFoundError
        ) {
          return reply
            .code(404)
            .send({
              error:
                "worker_not_found",

              workerId:
                error.workerId
            });
        }

        if (
          error instanceof
          JobSubmissionError
        ) {
          return reply
            .code(502)
            .send({
              error:
                "backend_submission_failed",

              jobId:
                error.jobId,

              message:
                error.message
            });
        }

        throw error;
      }
    }
  );

  app.get<{
    Params: {
      jobId: string;
    };
  }>(
    "/v1/media/jobs/:jobId",
    async (
      request,
      reply
    ) => {
      const job =
        await jobs.get(
          request.params.jobId
        );

      if (!job) {
        return reply
          .code(404)
          .send({
            error:
              "job_not_found"
          });
      }

      const {
        request:
          storedRequest,
        ...summary
      } = job;

      void storedRequest;

      return summary;
    }
  );

  return app;
}
