import {
  createApp
} from "./app.js";

import {
  config
} from "./config.js";

import {
  createDatabasePool
} from "./db/client.js";

import {
  JobRepository
} from "./repositories/job-repository.js";

import {
  WorkerRepository
} from "./repositories/worker-repository.js";

import {
  JobReconciler
} from "./jobs/reconciler.js";

import {
  JobService
} from "./jobs/service.js";

import {
  WorkerRegistry
} from "./workers/registry.js";

import {
  WorkerService
} from "./workers/service.js";

const db =
  createDatabasePool(
    config.database
  );

await db.query(
  "SELECT 1"
);

const workerRepository =
  new WorkerRepository(db);

for (
  const worker of
  config.workers
) {
  await workerRepository
    .upsertWorker({
      id: worker.id,
      profile: worker.profile,
      adapter: worker.adapter
    });
}

const registry =
  new WorkerRegistry(
    config.workers
  );

const workers =
  new WorkerService(
    registry,
    workerRepository
  );

const jobRepository =
  new JobRepository(db);

const jobs =
  new JobService(
    jobRepository,
    registry
  );

const reconciler =
  new JobReconciler(
    jobRepository,
    registry
  );

const app =
  createApp(
    workers,
    jobs
  );

async function shutdown(
  signal: string
) {
  app.log.info(
    { signal },
    "shutting down"
  );

  reconciler.stop();

  await app.close();
  await db.end();

  process.exit(0);
}

process.on(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM"
    );
  }
);

process.on(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT"
    );
  }
);

try {
  await app.listen({
    host: "0.0.0.0",
    port: config.port
  });

  reconciler.start();
}
catch (error) {
  app.log.error(error);

  reconciler.stop();

  await db.end();

  process.exit(1);
}
