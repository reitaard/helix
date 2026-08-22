import {
  createApp
} from "./app.js";

import {
  config
} from "./config.js";

import {
  WorkerRegistry
} from "./workers/registry.js";

const registry =
  new WorkerRegistry(
    config.workers
  );

const app =
  createApp(registry);

async function shutdown(
  signal: string
) {
  app.log.info(
    { signal },
    "shutting down"
  );

  await app.close();

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

  process.exit(1);
}
