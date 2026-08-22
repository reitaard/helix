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

  HELIX_DATABASE_URL:
    z.string().min(1),

  HELIX_TELEGRAM_BOT_TOKEN:
    z.string().min(1).optional(),

  HELIX_TELEGRAM_CHAT_ID:
    z.string().min(1).optional(),

  HELIX_SPOOL_DIR:
    z.string()
      .min(1)
      .default("/tmp/helix-spool"),

  HELIX_JOB_TIMEOUT_SECONDS:
    z.coerce
      .number()
      .int()
      .min(60)
      .default(3600)
});

const env =
  envSchema.parse(process.env);

if (
  Boolean(
    env.HELIX_TELEGRAM_BOT_TOKEN
  ) !==
  Boolean(
    env.HELIX_TELEGRAM_CHAT_ID
  )
) {
  throw new Error(
    "Telegram token and chat ID must be configured together"
  );
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
            env.HELIX_TELEGRAM_CHAT_ID
        }
      : null,

  spoolDir:
    env.HELIX_SPOOL_DIR,

  jobTimeoutMs:
    env.HELIX_JOB_TIMEOUT_SECONDS *
    1000,

  workers: [
    {
      id:
        "helix-rtx4060-01",

      profile:
        "comfy-video-ltx-stable",

      adapter:
        "comfy",

      endpoint:
        env.HELIX_WORKER_RTX4060_URL,

      capabilities: [
        "video.i2v"
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
