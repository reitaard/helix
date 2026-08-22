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
  WorkerRepository
} from "./repositories/worker-repository.js";

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

const repository =
  new WorkerRepository(db);

for (
  const worker of
  config.workers
) {
  await repository.upsertWorker({
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
    repository
  );

const app =
  createApp(workers);

async function shutdown(
  signal: string
) {
  app.log.info(
    { signal },
    "shutting down"
  );

  await app.close();
  await db.end();

  process.exit(0);
}

process.on(
  "SIGTERM",
  () => {
    void shutdown("SIGTERM");
  }
);

process.on(
  "SIGINT",
  () => {
    void shutdown("SIGINT");
  }
);

try {
  await app.listen({
    host: "0.0.0.0",
    port: config.port
  });
}
catch (error) {
  app.log.error(error);

  await db.end();

  process.exit(1);
}
