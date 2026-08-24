import { z } from "zod";

import type {
  WorkerDefinition
} from "./domain/worker.js";

function preferComfyEnv(
  name: string,
  legacyName = name
) {
  return process.env[`COMFY_${name}`] ??
    process.env[`HELIX_${legacyName}`];
}

const envSchema = z.object({
  COMFY_RUNTIME_PORT:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(8787),

  COMFY_WORKER_RTX4060_URL:
    z.string().url(),

  COMFY_WORKER_RTX4060_NAME:
    z.string()
      .min(1)
      .default(
        "Christopher Nolan"
      ),

  COMFY_WORKER_RTX4060_REVISION:
    z.string()
      .min(7)
      .default(
        "7dde56176efa71fd74ef7b3930ab5882d1926288"
      ),

  COMFY_DATABASE_URL:
    z.string().min(1),

  COMFY_TELEGRAM_BOT_TOKEN:
    z.string().min(1).optional(),

  COMFY_TELEGRAM_CHAT_ID:
    z.string().min(1).optional(),

  COMFY_SPOOL_DIR:
    z.string()
      .min(1)
      .default("/tmp/comfy-spool"),

  COMFY_T2V_WORKFLOW_PATH:
    z.string()
      .min(1)
      .default(
        "/app/workflows/video_ltx2_5_t2v.api.json"
      ),

  COMFY_JOB_TIMEOUT_SECONDS:
    z.coerce
      .number()
      .int()
      .min(60)
      .default(3600)
});

const env =
  envSchema.parse({
    COMFY_RUNTIME_PORT:
      preferComfyEnv(
        "RUNTIME_PORT",
        "PORT"
      ),

    COMFY_WORKER_RTX4060_URL:
      preferComfyEnv("WORKER_RTX4060_URL"),

    COMFY_WORKER_RTX4060_NAME:
      preferComfyEnv("WORKER_RTX4060_NAME"),

    COMFY_WORKER_RTX4060_REVISION:
      preferComfyEnv("WORKER_RTX4060_REVISION"),

    COMFY_DATABASE_URL:
      preferComfyEnv("DATABASE_URL"),

    COMFY_TELEGRAM_BOT_TOKEN:
      preferComfyEnv("TELEGRAM_BOT_TOKEN"),

    COMFY_TELEGRAM_CHAT_ID:
      preferComfyEnv("TELEGRAM_CHAT_ID"),

    COMFY_SPOOL_DIR:
      preferComfyEnv("SPOOL_DIR"),

    COMFY_T2V_WORKFLOW_PATH:
      preferComfyEnv("T2V_WORKFLOW_PATH"),

    COMFY_JOB_TIMEOUT_SECONDS:
      preferComfyEnv("JOB_TIMEOUT_SECONDS")
  });

if (
  Boolean(
    env.COMFY_TELEGRAM_BOT_TOKEN
  ) !==
  Boolean(
    env.COMFY_TELEGRAM_CHAT_ID
  )
) {
  throw new Error(
    "Telegram token and chat ID must be configured together"
  );
}

export const config = {
  port:
    env.COMFY_RUNTIME_PORT,

  database: {
    connectionString:
      env.COMFY_DATABASE_URL
  },

  telegram:
    env.COMFY_TELEGRAM_BOT_TOKEN &&
    env.COMFY_TELEGRAM_CHAT_ID
      ? {
          botToken:
            env.COMFY_TELEGRAM_BOT_TOKEN,

          chatId:
            env.COMFY_TELEGRAM_CHAT_ID
        }
      : null,

  spoolDir:
    env.COMFY_SPOOL_DIR,

  t2vWorkflowPath:
    env.COMFY_T2V_WORKFLOW_PATH,

  jobTimeoutMs:
    env.COMFY_JOB_TIMEOUT_SECONDS *
    1000,

  workers: [
    {
      id:
        "comfy-rtx4060-01",

      name:
        env.COMFY_WORKER_RTX4060_NAME,

      revision:
        env.COMFY_WORKER_RTX4060_REVISION,

      profile:
        "comfy-video-ltx-stable",

      adapter:
        "comfy",

      endpoint:
        env.COMFY_WORKER_RTX4060_URL,

      capabilities: [
        "video.i2v",
        "video.t2v"
      ],

      modelFamilies: {
        ltx: {
          available: [
            "2.3",
            "2.5"
          ],

          validated: [
            "2.5"
          ]
        }
      },

      maxConcurrentGpuJobs: 1
    }
  ] satisfies WorkerDefinition[]
};
