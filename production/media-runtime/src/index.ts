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
  ArtifactSourceRepository
} from "./repositories/artifact-source-repository.js";

import {
  JobReconciler
} from "./jobs/reconciler.js";

import {
  JobService
} from "./jobs/service.js";

import { JobDispatcher } from "./jobs/dispatcher.js";
import { DispatchRepository } from "./repositories/dispatch-repository.js";
import { FaceFusionConversationRepository } from "./repositories/facefusion-conversation-repository.js";
import { FaceFusionSettingsRepository } from "./repositories/facefusion-settings-repository.js";
import { FaceFusionJobCatalog } from "./repositories/facefusion-job-catalog.js";

import {
  DeliveryRepository
} from "./repositories/delivery-repository.js";

import {
  TelegramJobLifecycleRepository
} from "./repositories/telegram-job-lifecycle-repository.js";

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
  T2VResetPendingRepository
} from "./repositories/t2v-reset-pending-repository.js";

import {
  T2VSettingsRepository
} from "./repositories/t2v-settings-repository.js";

import {
  T2IPendingRepository
} from "./repositories/t2i-pending-repository.js";

import {
  T2IResetPendingRepository
} from "./repositories/t2i-reset-pending-repository.js";

import {
  T2ISettingsRepository
} from "./repositories/t2i-settings-repository.js";

import {
  TelegramPollOffsetRepository
} from "./repositories/telegram-poll-offset-repository.js";

import {
  T2VModeService
} from "./t2v/mode-service.js";

import {
  T2VProfileService
} from "./t2v/profile-service.js";

import {
  T2IProfileService
} from "./t2i/profile-service.js";

import {
  DeliveryWorker
} from "./delivery/worker.js";

import {
  TelegramDelivery
} from "./delivery/telegram.js";
import { TelegramDeliveryRouter } from "./delivery/telegram-router.js";

import {
  TelegramCommandService
} from "./telegram/command-service.js";

import {
  TelegramDebugService
} from "./telegram/debug-service.js";

import {
  TelegramDownloadsService
} from "./telegram/downloads-service.js";

import {
  TelegramCancelService
} from "./telegram/cancel-service.js";

import {
  TelegramProgressService
} from "./telegram/progress-service.js";

import {
  TelegramT2VService
} from "./telegram/t2v-service.js";

import {
  TelegramT2IService
} from "./telegram/t2i-service.js";

import {
  TelegramT2ISettingsService
} from "./telegram/t2i-settings-service.js";

import {
  TelegramT2IResetService
} from "./telegram/t2i-reset-service.js";

import {
  TelegramT2VModeService
} from "./telegram/t2v-mode-service.js";

import {
  TelegramT2VSettingsService
} from "./telegram/t2v-settings-service.js";

import {
  TelegramT2VResetService
} from "./telegram/t2v-reset-service.js";

import {
  TelegramAlertService
} from "./telegram/alert-service.js";
import { TelegramFaceFusionService } from "./telegram/facefusion-service.js";

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

for (const resource of config.executionResources) {
  await workerRepository.upsertExecutionResource({
    id: resource.id,
    capacity: resource.maxConcurrentGpuJobs
  });
}

for (const worker of config.workers) {
  await workerRepository.upsertWorker({
    id: worker.id,
    profile: worker.productionProfiles.map(profile => profile.id).join(","),
    adapter: worker.adapter,
    resourceId: worker.resourceId
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

const comfyWorker = config.workers.find(worker => worker.adapter === "comfy") ?? null;
const facefusionWorker = config.workers.find(worker => worker.adapter === "facefusion") ?? null;

const nolanProfile = comfyWorker?.productionProfiles.find(
  profile => profile.id === "nolan"
) ?? null;

const leibovitzProfile = comfyWorker?.productionProfiles.find(
  profile => profile.id === "leibovitz"
) ?? null;

const jobRepository =
  new JobRepository(db);

const artifactSourceRepository =
  new ArtifactSourceRepository(db);

const deliveryRepository =
  new DeliveryRepository(db);

const telegramJobLifecycleRepository =
  new TelegramJobLifecycleRepository(db);

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

const t2iPendingRepository =
  new T2IPendingRepository(db);

const t2iResetPendingRepository =
  new T2IResetPendingRepository(db);

const t2iSettingsRepository =
  new T2ISettingsRepository(db);

const t2vResetPendingRepository =
  new T2VResetPendingRepository(
    db
  );

const t2vSettingsRepository =
  new T2VSettingsRepository(
    db
  );

const telegramPollOffsetRepository =
  new TelegramPollOffsetRepository(db);

const telegramDelivery = config.telegram
  ? new TelegramDelivery(config.telegram.botToken, config.telegram.chatId)
  : null;
const facefusionTelegramDelivery = config.facefusionTelegram
  ? new TelegramDelivery(config.facefusionTelegram.botToken, config.facefusionTelegram.chatId)
  : null;
const telegramDeliveryRouter = new TelegramDeliveryRouter([
  ...(telegramDelivery && config.telegram ? [{ key: "primary", delivery: telegramDelivery, privateChatId: config.telegram.chatId, forum: config.telegram.forum }] : []),
  ...(facefusionTelegramDelivery && config.facefusionTelegram ? [{
    key: "facefusion",
    delivery: facefusionTelegramDelivery,
    privateChatId: config.facefusionTelegram.chatId,
    forum: config.facefusionTelegram.forum
      ? { chatId: config.facefusionTelegram.forum.chatId, faceFusionThreadId: config.facefusionTelegram.forum.threadId }
      : null
  }] : [])
]);

const t2vModeService =
  new T2VModeService(
    t2vSettingsRepository
  );

const t2vProfileService =
  comfyWorker
    ? new T2VProfileService(
        t2vSettingsRepository,
        comfyWorker.endpoint
      )
    : null;

const t2iProfileService =
  leibovitzProfile
    ? new T2IProfileService(t2iSettingsRepository)
    : null;

const telegramT2ISettingsService =
  t2iProfileService && leibovitzProfile
    ? new TelegramT2ISettingsService(
        t2iProfileService,
        leibovitzProfile.displayName
      )
    : null;

const telegramT2IResetService =
  config.telegram && t2iProfileService
    ? new TelegramT2IResetService(
        config.telegram.chatId,
        t2iProfileService,
        t2iSettingsRepository,
        t2iResetPendingRepository
      )
    : null;

const telegramT2VModeService =
  nolanProfile
    ? new TelegramT2VModeService(
        t2vModeService,
        nolanProfile.displayName
      )
    : null;

const telegramT2VSettingsService =
  t2vProfileService
    ? new TelegramT2VSettingsService(
        t2vProfileService,
        nolanProfile?.displayName
      )
    : null;

const telegramT2VResetService =
  config.telegram &&
  comfyWorker &&
  nolanProfile &&
  t2vProfileService
    ? new TelegramT2VResetService(
        config.telegram.chatId,
        nolanProfile.displayName,
        t2vProfileService,
        t2vSettingsRepository,
        t2vResetPendingRepository
      )
    : null;

const telegramDebugService =
  new TelegramDebugService(
    jobRepository,
    eventRepository,
    registry
  );

const jobs =
  new JobService(
    jobRepository,
    registry,
    deliveryRepository
  );

const dispatcher = new JobDispatcher(
  new DispatchRepository(db),
  registry
);

const telegramCancelService =
  config.telegram &&
  comfyWorker &&
  nolanProfile
    ? new TelegramCancelService(
        config.telegram.chatId,
        operatorActionRepository,
        jobRepository,
        jobs,
        registry
      )
    : null;

const telegramT2VService =
  config.telegram &&
  telegramDelivery &&
  comfyWorker &&
  nolanProfile &&
  t2vProfileService &&
  telegramT2VModeService &&
  telegramT2VSettingsService &&
  telegramT2VResetService
    ? new TelegramT2VService(
        config.telegram.chatId,
        comfyWorker.id,
        nolanProfile.displayName,
        config.t2vWorkflowPath,
        jobs,
        t2vPendingRepository,
        telegramJobLifecycleRepository,
        telegramDelivery,
        t2vProfileService,
        t2vModeService,
        telegramT2VModeService,
        telegramT2VSettingsService,
        telegramT2VResetService
      )
    : null;

const telegramT2IService =
  config.telegram &&
  telegramDelivery &&
  comfyWorker &&
  leibovitzProfile &&
  t2iProfileService &&
  telegramT2ISettingsService &&
  telegramT2IResetService
    ? new TelegramT2IService(
        config.telegram.chatId,
        comfyWorker.id,
        leibovitzProfile.displayName,
        config.t2iWorkflowPath,
        jobs,
        t2iPendingRepository,
        telegramJobLifecycleRepository,
        telegramDelivery,
        t2iProfileService,
        telegramT2ISettingsService,
        telegramT2IResetService
      )
    : null;

const reconciler =
  new JobReconciler(
    jobRepository,
    registry,
    3000,
    config.telegram || config.facefusionTelegram
      ? ["telegram"]
      : [],

    config.jobTimeoutMs
  );

const deliveryWorker = telegramDeliveryRouter.keys().length > 0
  ? new DeliveryWorker(
      deliveryRepository,
      telegramJobLifecycleRepository,
      registry,
      telegramDeliveryRouter,
      config.spoolDir
    )
  : null;

const telegramProgressService =
  telegramDelivery &&
  comfyWorker
    ? new TelegramProgressService(
        comfyWorker.id,
        registry,
        telegramJobLifecycleRepository,
        telegramDeliveryRouter
      )
    : null;

const telegramDownloadsService =
  telegramDelivery &&
  comfyWorker
    ? new TelegramDownloadsService(
        comfyWorker.id,
        config.spoolDir,
        registry,
        artifactSourceRepository,
        telegramDelivery
      )
    : null;

const comfyUpdateChecker =
  comfyWorker
    ? new ComfyUpdateChecker(
        comfyWorker
          .revision
      )
    : null;

const telegramAlertService =
  config.telegram &&
  comfyWorker
    ? new TelegramAlertService(
        config.telegram.botToken,
        config.telegram.chatId,
        comfyWorker.id,
        comfyWorker.name,
        operatorAlertRepository,
        registry
      )
    : null;

const telegramCommandService =
  config.telegram &&
  comfyWorker &&
  comfyUpdateChecker &&
  telegramCancelService &&
  telegramT2VService &&
  telegramT2IService &&
  telegramDownloadsService
    ? new TelegramCommandService(
        config.telegram.botToken,
        config.telegram.chatId,
        comfyWorker.id,
        comfyUpdateChecker,
        db,
        registry,
        jobRepository,
        deliveryRepository,
        outboxRepository,
        telegramDebugService,
        telegramDownloadsService,
        telegramCancelService,
        telegramT2VService,
        telegramT2IService,
        config.telegram.forum,
        telegramPollOffsetRepository
      )
    : null;

const facefusionConversationRepository = new FaceFusionConversationRepository(db);
const facefusionSettingsRepository = new FaceFusionSettingsRepository(db);
const facefusionJobCatalog = new FaceFusionJobCatalog(db);
const telegramFaceFusionService =
  config.facefusionTelegram && facefusionTelegramDelivery && facefusionWorker
    ? new TelegramFaceFusionService(
        config.facefusionTelegram.botToken,
        config.facefusionTelegram.chatId,
        facefusionWorker.id,
        jobs,
        facefusionConversationRepository,
        facefusionSettingsRepository,
        telegramJobLifecycleRepository,
        telegramPollOffsetRepository,
        registry,
        facefusionTelegramDelivery,
        config.spoolDir,
        config.facefusionInputMaxBytes,
        facefusionJobCatalog,
        config.facefusionTelegram.forum
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

  telegramCommandService?.stop();
  telegramFaceFusionService?.stop();
  dispatcher.stop();
  telegramProgressService?.stop();
  telegramT2VService?.stop();
  telegramT2IService?.stop();
  telegramCancelService?.stop();
  telegramAlertService?.stop();
  deliveryWorker?.stop();
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

  telegramProgressService?.start();
  dispatcher.start();
  reconciler.start();
  deliveryWorker?.start();
  telegramAlertService?.start();
  telegramCancelService?.start();
  telegramT2VService?.start();
  telegramT2IService?.start();
  telegramCommandService?.start();
  void telegramFaceFusionService?.start();
}
catch (error) {
  app.log.error(error);

  telegramCommandService?.stop();
  telegramFaceFusionService?.stop();
  dispatcher.stop();
  telegramProgressService?.stop();
  telegramT2VService?.stop();
  telegramT2IService?.stop();
  telegramCancelService?.stop();
  telegramAlertService?.stop();
  deliveryWorker?.stop();
  reconciler.stop();

  await db.end();

  process.exit(1);
}
