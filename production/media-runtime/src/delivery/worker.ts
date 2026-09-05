import {
  basename,
  join
} from "node:path";

import {
  mkdir,
  rm
} from "node:fs/promises";

import type {
  AdapterArtifact
} from "../domain/media-adapter.js";

import {
  DeliveryRepository
} from "../repositories/delivery-repository.js";

import {
  TelegramJobLifecycleRepository
} from "../repositories/telegram-job-lifecycle-repository.js";

import {
  deliveryFailedProgressHtml,
  deliveryRetryProgressHtml
} from "../telegram/progress-presentation.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  TelegramDeliveryRouter
} from "./telegram-router.js";

import type {
  TelegramDestination,
  TelegramForumConfig
} from "../telegram/context.js";

import {
  formatBytes,
  formatDuration,
  formatRuntime,
  probeMedia
} from "./media-probe.js";

class PermanentDeliveryError
  extends Error {}

export function telegramBotKey(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "primary";
  const key = (value as Record<string, unknown>).botKey;
  return typeof key === "string" && key.length > 0 ? key : "primary";
}

export function parseDestination(
  value: unknown,
  tool: string,
  privateChatId: string,
  forum: TelegramForumConfig | null
): TelegramDestination {
  if (value === null) return { chatId: privateChatId, threadId: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PermanentDeliveryError("Invalid Telegram delivery destination");
  }
  const destination = value as Record<string, unknown>;
  if (destination.provider !== "telegram" || typeof destination.chatId !== "string" || (destination.threadId !== null && typeof destination.threadId !== "string")) {
    throw new PermanentDeliveryError("Invalid Telegram delivery destination");
  }
  const parsed = { chatId: destination.chatId, threadId: destination.threadId as string | null };
  if (parsed.chatId === privateChatId && parsed.threadId === null) return parsed;
  if (!forum || parsed.chatId !== forum.chatId) throw new PermanentDeliveryError("Unapproved Telegram delivery destination");
  const expectedThread = tool === "image.t2i"
    ? forum.imageThreadId
    : tool === "video.t2v"
      ? forum.videoThreadId
      : tool === "face.swap"
        ? forum.faceFusionThreadId
        : null;
  if (!expectedThread || parsed.threadId !== expectedThread) {
    throw new PermanentDeliveryError("Telegram delivery destination does not match job tool");
  }
  return parsed;
}

function parseArtifact(
  value: unknown
): AdapterArtifact {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new PermanentDeliveryError(
      "Invalid artifact metadata"
    );
  }

  const artifact =
    value as
      Record<string, unknown>;

  if (
    typeof artifact.filename !==
      "string" ||
    (artifact.subfolder !== undefined && typeof artifact.subfolder !== "string") ||
    typeof artifact.type !==
      "string"
  ) {
    throw new PermanentDeliveryError(
      "Artifact is missing filename or type"
    );
  }

  return {
    filename:
      artifact.filename,

    ...(typeof artifact.subfolder === "string" ? { subfolder: artifact.subfolder } : {}),

    type:
      artifact.type,

    ...(typeof artifact.artifactId === "string" ? { artifactId: artifact.artifactId } : {}),
    ...(artifact.mediaKind === "image" || artifact.mediaKind === "video" ? { mediaKind: artifact.mediaKind } : {}),
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

    private readonly lifecycles:
      TelegramJobLifecycleRepository,

    private readonly workers:
      WorkerRegistry,

    private readonly telegram:
      TelegramDeliveryRouter,

    private readonly spoolDir:
      string,

    private readonly intervalMs =
      3000,

    private readonly maxAttempts =
      5
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

  private async showDeliveryFailure(
    delivery: {
      jobId: string;
      jobNumber: string;
      artifactIndex: number;
      workerId: string;
      profileId: string | null;
    },
    message: string,
    terminal: boolean,
    attemptCount: number,
    retryAfterSeconds: number | null
  ) {
    if (delivery.artifactIndex !== 0) {
      return;
    }

    try {
      const lifecycle =
        await this.lifecycles
          .get(delivery.jobId);

      if (
        !lifecycle ||
        lifecycle.presentationState !==
          "active"
      ) {
        return;
      }

      const workerName =
        this.workers.profileDisplayName(
          delivery.workerId,
          delivery.profileId
        );

      const route = this.telegram.get(lifecycle.botKey);
      if (!route) throw new Error(`Telegram bot is not configured: ${lifecycle.botKey}`);

      await route.delivery.editHtml(
        lifecycle.messageId,
        terminal
          ? deliveryFailedProgressHtml(lifecycle, workerName, message)
          : deliveryRetryProgressHtml(
              lifecycle,
              workerName,
              attemptCount,
              retryAfterSeconds ?? 0
            ),
        { chatId: lifecycle.chatId, threadId: lifecycle.threadId }
      );

      await this.lifecycles
        .markDeliveryPresentation(
          delivery.jobId,
          terminal
            ? "delivery_failed"
            : "delivery_retrying"
        );
    }
    catch (error) {
      console.error(
        `[delivery] ${delivery.jobId} lifecycle failure presentation failed`,
        error
      );
    }
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

        let destination:
          string | null =
            null;

        try {
          if (
            delivery.attemptCount >
            this.maxAttempts
          ) {
            throw new PermanentDeliveryError(
              "Delivery attempt limit already exceeded"
            );
          }

          const botKey = telegramBotKey(delivery.destination);
          const route = this.telegram.get(botKey);
          if (!route) throw new PermanentDeliveryError(`Telegram bot is not configured: ${botKey}`);
          const telegramDestination = parseDestination(
            delivery.destination,
            delivery.tool,
            route.privateChatId,
            route.forum
          );

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

          await mkdir(this.spoolDir, { recursive: true });

          destination =
            join(
              this.spoolDir,
              `${delivery.id}-${safeFilename}`
            );

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

          const isVideo = artifact.mediaKind === "video" ||
            (artifact.mediaKind !== "image" && (media.durationSeconds !== null || media.audioPresent));
          const mediaMetadata = isVideo
            ? { kind: "video" as const, value: `${resolution} · ${formatDuration(media.durationSeconds)} · ${formatBytes(media.sizeBytes)}`, audio: media.audioPresent ? "Present" : "Absent" }
            : { kind: "image" as const, value: `${resolution} · ${formatBytes(media.sizeBytes)}` };

          const workerName =
            this.workers.profileDisplayName(
              delivery.workerId,
              delivery.profileId
            );

          const metadata = {
            filename:
              safeFilename,

            runtime:
              formatRuntime(
                delivery.startedAt,
                delivery.finishedAt
              ),

            media: mediaMetadata,

            tool:
              delivery.tool,

            workerName,

            jobNumber:
              delivery.jobNumber,

            completedAt:
              delivery.finishedAt
          };

          const lifecycle =
            delivery.artifactIndex === 0
              ? await this.lifecycles
                  .get(delivery.jobId)
              : null;

          const replaceLifecycle =
            lifecycle?.presentationState ===
              "active";

          const document =
            replaceLifecycle
              ? await route.delivery.editDocument({
                  messageId: lifecycle.messageId,
                  filePath: destination,
                  filename: safeFilename,
                  metadata,
                  destination: { chatId: lifecycle.chatId, threadId: lifecycle.threadId }
                })
              : await route.delivery.sendDocument({
                  filePath: destination,
                  filename: safeFilename,
                  metadata,
                  destination: telegramDestination
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

          if (replaceLifecycle) {
            await this.lifecycles
              .markDelivered(
                delivery.jobId
              );
          }

          console.log(
            `[delivery] ${delivery.jobId} -> telegram ${replaceLifecycle ? "lifecycle media" : "document+caption"} ${document.messageId}`
          );
        }
        catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          const terminal =
            error instanceof
              PermanentDeliveryError ||
            delivery.attemptCount >=
              this.maxAttempts;

          const retryAfterSeconds =
            terminal
              ? null
              : this.retryDelay(
                  delivery.attemptCount
                );

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

              retryAfterSeconds
            });

          await this.showDeliveryFailure(
            delivery,
            message,
            terminal,
            delivery.attemptCount,
            retryAfterSeconds
          );

          console.error(
            `[delivery] ${delivery.jobId} ` +
            `${terminal
              ? "terminal failure"
              : "failed"}: ${message}`
          );
        }
        finally {
          if (destination) {
            await rm(
              destination,
              {
                force: true
              }
            );
          }
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
