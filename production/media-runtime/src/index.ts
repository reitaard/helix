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
  DeliveryRepository
} from "./repositories/delivery-repository.js";

import {
  OutboxRepository
} from "./repositories/outbox-repository.js";

import {
  EventRepository
} from "./repositories/event-repository.js";

import {
  OperatorAlertRepository
} from "./repositories/operator-alert-repository.js";

import {
  OperatorActionRepository
} from "./repositories/operator-action-repository.js";

import {
  T2VPendingRepository
} from "./repositories/t2v-pending-repository.js";

import {
  DeliveryWorker
} from "./delivery/worker.js";

import {
  TelegramDelivery
} from "./delivery/telegram.js";

import {
  TelegramCommandService
} from "./telegram/command-service.js";

import {
  TelegramDebugService
} from "./telegram/debug-service.js";

import {
  TelegramCancelService
} from "./telegram/cancel-service.js";

import {
  TelegramT2VService
} from "./telegram/t2v-service.js";

import {
  TelegramAlertService
} from "./telegram/alert-service.js";

import {
  ComfyUpdateChecker
} from "./workers/comfy-update-checker.js";

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

const deliveryRepository =
  new DeliveryRepository(db);

const outboxRepository =
  new OutboxRepository(db);

const eventRepository =
  new EventRepository(db);

const operatorAlertRepository =
  new OperatorAlertRepository(
    db
  );

const operatorActionRepository =
  new OperatorActionRepository(
    db
  );

const t2vPendingRepository =
  new T2VPendingRepository(
    db
  );

const telegramDebugService =
  new TelegramDebugService(
    jobRepository,
    eventRepository
  );

const jobs =
  new JobService(
    jobRepository,
    registry,
    deliveryRepository
  );

const telegramCancelService =
  config.telegram &&
  config.workers[0]
    ? new TelegramCancelService(
        config.telegram.chatId,
        operatorActionRepository,
        jobRepository,
        jobs,
        config.workers[0].id,
        config.workers[0].name
      )
    : null;

const telegramT2VService =
  config.telegram &&
  config.workers[0]
    ? new TelegramT2VService(
        config.telegram.chatId,
        config.workers[0].id,
        config.workers[0].name,
        config.t2vWorkflowPath,
        jobs,
        t2vPendingRepository
      )
    : null;

const reconciler =
  new JobReconciler(
    jobRepository,
    registry,
    3000,
    config.telegram
      ? ["telegram"]
      : [],

    config.jobTimeoutMs
  );

const deliveryWorker =
  config.telegram
    ? new DeliveryWorker(
        deliveryRepository,
        registry,
        new TelegramDelivery(
          config.telegram.botToken,
          config.telegram.chatId
        ),
        config.spoolDir
      )
    : null;

const comfyUpdateChecker =
  config.workers[0]
    ? new ComfyUpdateChecker(
        config.workers[0]
          .revision
      )
    : null;

const telegramAlertService =
  config.telegram &&
  config.workers[0]
    ? new TelegramAlertService(
        config.telegram.botToken,
        config.telegram.chatId,
        config.workers[0].id,
        config.workers[0].name,
        operatorAlertRepository,
        registry
      )
    : null;

const telegramCommandService =
  config.telegram &&
  config.workers[0] &&
  comfyUpdateChecker &&
  telegramCancelService &&
  telegramT2VService
    ? new TelegramCommandService(
        config.telegram.botToken,
        config.telegram.chatId,
        config.workers[0].id,
        comfyUpdateChecker,
        db,
        registry,
        jobRepository,
        deliveryRepository,
        outboxRepository,
        telegramDebugService,
        telegramCancelService,
        telegramT2VService
      )
    : null;

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
  deliveryWorker?.stop();
  telegramAlertService?.stop();
  telegramCancelService?.stop();
  telegramT2VService?.stop();
  telegramCommandService?.stop();

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
  deliveryWorker?.start();
  telegramAlertService?.start();
  telegramCancelService?.start();
  telegramT2VService?.start();
  telegramCommandService?.start();
}
catch (error) {
  app.log.error(error);

  reconciler.stop();
  deliveryWorker?.stop();
  telegramAlertService?.stop();
  telegramT2VService?.stop();
  telegramCommandService?.stop();

  await db.end();

  process.exit(1);
}
