import {
  basename,
  join
} from "node:path";

import {
  rm
} from "node:fs/promises";

import type {
  AdapterArtifact
} from "../domain/media-adapter.js";

import {
  DeliveryRepository
} from "../repositories/delivery-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  TelegramDelivery
} from "./telegram.js";

import {
  formatBytes,
  formatDuration,
  formatRuntime,
  probeMedia
} from "./media-probe.js";

function parseArtifact(
  value: unknown
): AdapterArtifact {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Invalid artifact metadata"
    );
  }

  const artifact =
    value as
      Record<string, unknown>;

  if (
    typeof artifact.filename !==
      "string" ||
    typeof artifact.subfolder !==
      "string" ||
    typeof artifact.type !==
      "string"
  ) {
    throw new Error(
      "Artifact is missing filename, subfolder, or type"
    );
  }

  return {
    filename:
      artifact.filename,

    subfolder:
      artifact.subfolder,

    type:
      artifact.type,

    ...(
      typeof artifact.nodeId ===
        "string"
        ? {
            nodeId:
              artifact.nodeId
          }
        : {}
    )
  };
}

export class DeliveryWorker {
  private timer:
    NodeJS.Timeout | null =
      null;

  private ticking = false;

  constructor(
    private readonly deliveries:
      DeliveryRepository,

    private readonly workers:
      WorkerRegistry,

    private readonly telegram:
      TelegramDelivery,

    private readonly spoolDir:
      string,

    private readonly intervalMs =
      3000
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    void this.tick();

    this.timer =
      setInterval(
        () => {
          void this.tick();
        },
        this.intervalMs
      );
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer
    );

    this.timer = null;
  }

  private retryDelay(
    attemptCount: number
  ) {
    return Math.min(
      3600,

      30 *
      Math.pow(
        2,
        Math.max(
          0,
          attemptCount - 1
        )
      )
    );
  }

  private async tick() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      while (true) {
        const delivery =
          await this.deliveries
            .claimDue(
              "telegram"
            );

        if (!delivery) {
          break;
        }

        const artifact =
          parseArtifact(
            delivery.artifact
          );

        const safeFilename =
          basename(
            artifact.filename
              .replaceAll(
                "\\",
                "/"
              )
          );

        const destination =
          join(
            this.spoolDir,
            `${delivery.id}-${safeFilename}`
          );

        try {
          const downloaded =
            await this.workers
              .downloadArtifact(
                delivery.workerId,
                artifact,
                destination
              );

          if (!downloaded) {
            throw new Error(
              `Worker unavailable: ${delivery.workerId}`
            );
          }

          const media =
            await probeMedia(
              destination
            );

          const resolution =
            media.width !== null &&
            media.height !== null
              ? `${media.width}×${media.height}`
              : "Unknown";

          const video =
            `${resolution} · ` +
            `${formatDuration(
              media.durationSeconds
            )} · ` +
            `${formatBytes(
              media.sizeBytes
            )}`;

          let metadataMessageId =
            delivery
              .metadataMessageId;

          if (!metadataMessageId) {
            const metadata =
              await this.telegram
                .sendMetadata({
                  filename:
                    safeFilename,

                  runtime:
                    formatRuntime(
                      delivery.startedAt,
                      delivery.finishedAt
                    ),

                  video,

                  audio:
                    media.audioPresent
                      ? "Present"
                      : "Absent",

                  workerId:
                    delivery.workerId,

                  jobId:
                    delivery.jobId,

                  completedAt:
                    delivery.finishedAt
                });

            metadataMessageId =
              metadata.messageId;

            await this.deliveries
              .markMetadataSent({
                id:
                  delivery.id,

                jobId:
                  delivery.jobId,

                messageId:
                  metadataMessageId
              });
          }

          const document =
            await this.telegram
              .sendDocument({
                filePath:
                  destination,

                filename:
                  safeFilename
              });

          await this.deliveries
            .markDelivered({
              id:
                delivery.id,

              jobId:
                delivery.jobId,

              artifactIndex:
                delivery.artifactIndex,

              provider:
                delivery.provider,

              documentMessageId:
                document.messageId
            });

          console.log(
            `[delivery] ${delivery.jobId} -> telegram metadata ${metadataMessageId}, document ${document.messageId}`
          );
        }
        catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          await this.deliveries
            .markFailed({
              id:
                delivery.id,

              jobId:
                delivery.jobId,

              artifactIndex:
                delivery.artifactIndex,

              provider:
                delivery.provider,

              message,

              retryAfterSeconds:
                this.retryDelay(
                  delivery.attemptCount
                )
            });

          console.error(
            `[delivery] ${delivery.jobId} failed`,
            message
          );
        }
        finally {
          await rm(
            destination,
            {
              force: true
            }
          );
        }
      }
    }
    catch (error) {
      console.error(
        "[delivery] worker tick failed",
        error
      );
    }
    finally {
      this.ticking = false;
    }
  }
}
