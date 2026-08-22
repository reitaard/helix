import { z } from "zod";

import type {
  WorkerDefinition
} from "./domain/worker.js";

const envSchema = z.object({
  HELIX_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(8787),

  HELIX_WORKER_RTX4060_URL:
    z.string().url(),

  HELIX_DATABASE_URL:
    z.string().min(1)
});

const env =
  envSchema.parse(process.env);

export const config = {
  port: env.HELIX_PORT,

  database: {
    connectionString:
      env.HELIX_DATABASE_URL
  },

  workers: [
    {
      id: "helix-rtx4060-01",

      profile:
        "comfy-video-ltx-stable",

      adapter: "comfy",

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
