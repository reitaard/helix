import { z } from "zod";

import type {
  WorkerDefinition
} from "./domain/worker.js";

const envSchema = z.object({
  HELIX_PORT:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(8787),

  HELIX_WORKER_RTX4060_URL:
    z.string().url(),

  HELIX_WORKER_RTX4060_NAME:
    z.string()
      .min(1)
      .default(
        "Helix RTX 4060"
      ),

  HELIX_NOLAN_DISPLAY_NAME:
    z.string().min(1).default("Christopher Nolan"),

  HELIX_LEIBOVITZ_DISPLAY_NAME:
    z.string().min(1).default("Annie Leibovitz"),

  HELIX_WORKER_RTX4060_REVISION:
    z.string()
      .min(7)
      .default(
        "7dde56176efa71fd74ef7b3930ab5882d1926288"
      ),

  HELIX_DATABASE_URL:
    z.string().min(1),

  HELIX_TELEGRAM_BOT_TOKEN:
    z.string().min(1).optional(),

  HELIX_TELEGRAM_CHAT_ID:
    z.string().min(1).optional(),

  HELIX_TELEGRAM_FORUM_CHAT_ID:
    z.string().regex(/^-\d+$/).optional(),

  HELIX_TELEGRAM_T2I_THREAD_ID:
    z.string().regex(/^\d+$/).optional(),

  HELIX_TELEGRAM_T2V_THREAD_ID:
    z.string().regex(/^\d+$/).optional(),

  HELIX_SPOOL_DIR:
    z.string()
      .min(1)
      .default("/tmp/helix-spool"),

  HELIX_T2V_WORKFLOW_PATH:
    z.string()
      .min(1)
      .default(
        "/app/workflows/video_ltx2_5_t2v.api.json"
      ),

  HELIX_T2I_WORKFLOW_PATH:
    z.string()
      .min(1)
      .default(
        "/app/workflows/image_flux2_klein_4b_int8_w8a8_t2i_v1.api.json"
      ),

  HELIX_JOB_TIMEOUT_SECONDS:
    z.coerce
      .number()
      .int()
      .min(60)
      .default(3600)
});

const env =
  envSchema.parse(process.env);

if (Boolean(env.HELIX_TELEGRAM_BOT_TOKEN) !== Boolean(env.HELIX_TELEGRAM_CHAT_ID)) {
  throw new Error("Telegram token and chat ID must be configured together");
}

const forumValues = [
  env.HELIX_TELEGRAM_FORUM_CHAT_ID,
  env.HELIX_TELEGRAM_T2I_THREAD_ID,
  env.HELIX_TELEGRAM_T2V_THREAD_ID
];

if (forumValues.some(Boolean) && !forumValues.every(Boolean)) {
  throw new Error("Telegram forum chat and both topic IDs must be configured together");
}

if (forumValues.every(Boolean)) {
  if (!env.HELIX_TELEGRAM_BOT_TOKEN || !env.HELIX_TELEGRAM_CHAT_ID) {
    throw new Error("Telegram forum routing requires the Telegram bot and private operator chat");
  }
  if (env.HELIX_TELEGRAM_T2I_THREAD_ID === "0" || env.HELIX_TELEGRAM_T2V_THREAD_ID === "0") {
    throw new Error("Telegram forum thread IDs must be positive");
  }
  if (env.HELIX_TELEGRAM_T2I_THREAD_ID === env.HELIX_TELEGRAM_T2V_THREAD_ID) {
    throw new Error("Telegram image and video thread IDs must differ");
  }
  if (env.HELIX_TELEGRAM_FORUM_CHAT_ID === env.HELIX_TELEGRAM_CHAT_ID) {
    throw new Error("Telegram forum and private operator chat IDs must differ");
  }
}

export const config = {
  port:
    env.HELIX_PORT,

  database: {
    connectionString:
      env.HELIX_DATABASE_URL
  },

  telegram:
    env.HELIX_TELEGRAM_BOT_TOKEN &&
    env.HELIX_TELEGRAM_CHAT_ID
      ? {
          botToken:
            env.HELIX_TELEGRAM_BOT_TOKEN,

          chatId:
            env.HELIX_TELEGRAM_CHAT_ID,

          forum: env.HELIX_TELEGRAM_FORUM_CHAT_ID && env.HELIX_TELEGRAM_T2I_THREAD_ID && env.HELIX_TELEGRAM_T2V_THREAD_ID
            ? {
                chatId: env.HELIX_TELEGRAM_FORUM_CHAT_ID,
                imageThreadId: env.HELIX_TELEGRAM_T2I_THREAD_ID,
                videoThreadId: env.HELIX_TELEGRAM_T2V_THREAD_ID
              }
            : null
        }
      : null,

  spoolDir:
    env.HELIX_SPOOL_DIR,

  t2vWorkflowPath:
    env.HELIX_T2V_WORKFLOW_PATH,

  t2iWorkflowPath:
    env.HELIX_T2I_WORKFLOW_PATH,

  jobTimeoutMs:
    env.HELIX_JOB_TIMEOUT_SECONDS *
    1000,

  workers: [
    {
      id:
        "helix-rtx4060-01",

      name:
        env.HELIX_WORKER_RTX4060_NAME,

      revision:
        env.HELIX_WORKER_RTX4060_REVISION,

      adapter:
        "comfy",

      endpoint:
        env.HELIX_WORKER_RTX4060_URL,

      productionProfiles: [
        {
          id: "nolan",
          displayName: env.HELIX_NOLAN_DISPLAY_NAME,
          capabilities: ["video.i2v", "video.t2v"],
          modelFamilies: {
            ltx: { available: ["2.3", "2.5"], validated: ["2.5"] }
          }
        },
        {
          id: "leibovitz",
          displayName: env.HELIX_LEIBOVITZ_DISPLAY_NAME,
          capabilities: ["image.t2i"],
          modelFamilies: {
            flux2: { available: ["Klein 4B INT8 W8A8"], validated: [] }
          }
        }
      ],

      maxConcurrentGpuJobs: 1
    }
  ] satisfies WorkerDefinition[]
};
