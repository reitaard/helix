import Fastify from "fastify";

import type {
  WorkerRegistry
} from "./workers/registry.js";

export function createApp(
  registry: WorkerRegistry
) {
  const app = Fastify({
    logger: true,

    requestIdHeader:
      "x-request-id"
  });

  app.get(
    "/v1/health",
    async () => ({
      service: "helix-runtime",
      status: "ok",
      timestamp:
        new Date().toISOString()
    })
  );

  app.get(
    "/v1/workers",
    async () => ({
      workers:
        registry.list()
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
        registry.get(
          request.params.workerId
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
    "/v1/workers/:workerId/health",
    async (
      request,
      reply
    ) => {
      const health =
        await registry.health(
          request.params.workerId
        );

      if (!health) {
        return reply
          .code(404)
          .send({
            error:
              "worker_not_found"
          });
      }

      return health;
    }
  );

  return app;
}
