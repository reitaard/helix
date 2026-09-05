import type {
  AdapterExecutionEvent
} from "../domain/media-adapter.js";

import {
  TelegramJobLifecycleRepository,
  type TelegramLifecycleJob
} from "../repositories/telegram-job-lifecycle-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  TelegramDeliveryRouter
} from "../delivery/telegram-router.js";
import type { TelegramDelivery } from "../delivery/telegram.js";

import {
  faceFusionDeliveringProgressHtml,
  faceFusionQueuedProgressHtml,
  faceFusionRunningProgressHtml,
  faceFusionTerminalProgressHtml
} from "./facefusion-progress-presentation.js";

import {
  deliveringProgressHtml,
  nodeStageLabel,
  queuedProgressHtml,
  runningProgressHtml,
  terminalProgressHtml,
  workflowProgressPercent,
  type ProgressSnapshot
} from "./progress-presentation.js";

interface LiveProgress {
  lifecycle: TelegramLifecycleJob;
  snapshot: ProgressSnapshot;
  lastRenderedWorkflow: number | null;
  lastRenderedNode: number | null;
  lastRenderedStage: string | null;
  lastRenderedAt: number;
  rendering: boolean;
  renderPending: boolean;
  forcePending: boolean;
}

function percentage(
  value: number,
  max: number
) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      value / max * 100
    )
  );
}

export class TelegramProgressService {
  private timer:
    NodeJS.Timeout | null = null;

  private unsubscribe:
    (() => void) | null = null;

  private ticking = false;

  private readonly progress =
    new Map<string, LiveProgress>();

  /** FaceFusion has no trustworthy structured percent; this only rate-limits durable loader edits. */
  private readonly faceFusionRenderedAt = new Map<string, number>();

  constructor(
    private readonly workerId: string,
    private readonly workers: WorkerRegistry,
    private readonly lifecycles:
      TelegramJobLifecycleRepository,
    private readonly telegram:
      TelegramDeliveryRouter | TelegramDelivery,
    private readonly intervalMs = 3000,
    private readonly minPercentDelta = 10,
    private readonly maxSilenceMs = 15000,
    private readonly minEditIntervalMs = 5000
  ) {}

  start() {
    if (this.timer || this.unsubscribe) {
      return;
    }

    this.unsubscribe =
      this.workers
        .subscribeExecutionEvents(
          this.workerId,
          event => {
            void this.handleEvent(event);
          }
        );

    if (!this.unsubscribe) {
      console.error(
        `[telegram-progress] worker adapter unavailable: ${this.workerId}`
      );
    }

    void this.syncStatuses();

    this.timer = setInterval(
      () => {
        void this.syncStatuses();
      },
      this.intervalMs
    );

    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.progress.clear();
    this.faceFusionRenderedAt.clear();
  }

  private deliveryFor(lifecycle: TelegramLifecycleJob) {
    if ("get" in this.telegram) {
      const route = this.telegram.get(lifecycle.botKey ?? "primary");
      if (!route) throw new Error(`Telegram bot is not configured: ${lifecycle.botKey}`);
      return route.delivery;
    }
    return this.telegram;
  }

  private workerName(
    lifecycle: TelegramLifecycleJob
  ) {
    return this.workers
      .profileDisplayName(
        lifecycle.workerId,
        lifecycle.profileId
      );
  }

  private async resolveProgress(
    backendJobId: string
  ) {
    const existing =
      this.progress.get(backendJobId);

    if (existing) {
      return existing;
    }

    const lifecycle =
      await this.lifecycles
        .findByBackendJobId(
          backendJobId
        );

    if (!lifecycle) {
      return null;
    }

    const state: LiveProgress = {
      lifecycle,
      snapshot: {
        workflowPercent: null,
        nodePercent: null,
        stage: null
      },
      lastRenderedWorkflow: null,
      lastRenderedNode: null,
      lastRenderedStage: null,
      lastRenderedAt: 0,
      rendering: false,
      renderPending: false,
      forcePending: false
    };

    this.progress.set(
      backendJobId,
      state
    );

    return state;
  }

  private shouldRender(
    state: LiveProgress,
    force = false
  ) {
    if (force) return true;

    const now = Date.now();
    const snapshot = state.snapshot;

    if (
      state.lastRenderedAt > 0 &&
      now - state.lastRenderedAt <
        this.minEditIntervalMs
    ) {
      return false;
    }

    if (
      snapshot.stage !==
      state.lastRenderedStage
    ) {
      return true;
    }

    if (
      snapshot.workflowPercent !== null &&
      (
        state.lastRenderedWorkflow === null ||
        Math.abs(
          snapshot.workflowPercent -
          state.lastRenderedWorkflow
        ) >= this.minPercentDelta
      )
    ) {
      return true;
    }

    if (
      snapshot.nodePercent !== null &&
      (
        state.lastRenderedNode === null ||
        Math.abs(
          snapshot.nodePercent -
          state.lastRenderedNode
        ) >= this.minPercentDelta
      )
    ) {
      return true;
    }

    return (
      now - state.lastRenderedAt >=
      this.maxSilenceMs
    );
  }

  private async renderLive(
    state: LiveProgress,
    force = false
  ) {
    if (state.rendering) {
      state.renderPending = true;
      state.forcePending =
        state.forcePending || force;
      return;
    }

    if (!this.shouldRender(state, force)) {
      return;
    }

    state.rendering = true;
    let forceNext = force;

    try {
      do {
        const effectiveForce =
          forceNext ||
          state.forcePending;

        forceNext = false;
        state.renderPending = false;
        state.forcePending = false;

        if (
          !this.shouldRender(
            state,
            effectiveForce
          )
        ) {
          continue;
        }

        const renderedSnapshot: ProgressSnapshot = {
          workflowPercent:
            state.snapshot.workflowPercent,
          nodePercent:
            state.snapshot.nodePercent,
          stage:
            state.snapshot.stage
        };

        await this.deliveryFor(state.lifecycle).editHtml(
          state.lifecycle.messageId,
          runningProgressHtml(
            state.lifecycle,
            this.workerName(state.lifecycle),
            renderedSnapshot
          ),
          {
            chatId:
              state.lifecycle.chatId,
            threadId: state.lifecycle.threadId
          }
        );

        state.lastRenderedWorkflow =
          renderedSnapshot.workflowPercent;
        state.lastRenderedNode =
          renderedSnapshot.nodePercent;
        state.lastRenderedStage =
          renderedSnapshot.stage;
        state.lastRenderedAt =
          Date.now();
      }
      while (
        state.renderPending ||
        state.forcePending
      );
    }
    catch (error) {
      console.error(
        `[telegram-progress] edit ${state.lifecycle.jobId} failed`,
        error
      );
    }
    finally {
      state.rendering = false;
    }
  }

  private async handleEvent(
    event: AdapterExecutionEvent
  ) {
    const state =
      await this.resolveProgress(
        event.backendJobId
      );

    if (!state) {
      return;
    }

    switch (event.kind) {
      case "execution_start":
        state.snapshot.stage =
          "Starting";
        state.snapshot.nodePercent =
          null;
        await this.renderLive(
          state,
          true
        );
        return;

      case "executing":
        if (event.nodeId === null) {
          state.snapshot.stage =
            "Finalizing";
          state.snapshot.nodePercent =
            null;
        }
        else {
          state.snapshot.stage =
            nodeStageLabel(
              state.lifecycle.request,
              event.nodeId,
              event.displayNodeId
            );
          state.snapshot.nodePercent =
            null;
        }

        await this.renderLive(state);
        return;

      case "progress":
        state.snapshot.nodePercent =
          percentage(
            event.value,
            event.max
          );

        if (event.nodeId) {
          state.snapshot.stage =
            nodeStageLabel(
              state.lifecycle.request,
              event.nodeId
            );
        }

        await this.renderLive(state);
        return;

      case "progress_state": {
        state.snapshot.workflowPercent =
          workflowProgressPercent(
            state.lifecycle.request,
            event.nodes
          );

        const running =
          event.nodes.find(
            node =>
              node.state === "running"
          );

        if (running) {
          state.snapshot.stage =
            nodeStageLabel(
              state.lifecycle.request,
              running.nodeId,
              running.displayNodeId
            );
          state.snapshot.nodePercent =
            percentage(
              running.value,
              running.max
            );
        }

        await this.renderLive(state);
        return;
      }

      case "execution_success":
        state.snapshot.workflowPercent =
          100;
        state.snapshot.nodePercent =
          null;
        state.snapshot.stage =
          "Finalizing";
        await this.renderLive(state, true);
        return;

      case "execution_error":
      case "execution_interrupted":
        // Durable job reconciliation owns the terminal state. The status
        // sweep below will render the authoritative result within one tick.
        return;
    }
  }

  private async editStatus(
    lifecycle: TelegramLifecycleJob,
    html: string,
    terminal = false
  ) {
    try {
      await this.deliveryFor(lifecycle).editHtml(
        lifecycle.messageId,
        html,
        {
          chatId: lifecycle.chatId,
          threadId: lifecycle.threadId
        }
      );

      if (terminal) {
        await this.lifecycles
          .markTerminal(
            lifecycle.jobId,
            lifecycle.status
          );
      }
      else {
        await this.lifecycles
          .markRenderedStatus(
            lifecycle.jobId,
            lifecycle.status
          );
      }

      return true;
    }
    catch (error) {
      console.error(
        `[telegram-progress] state ${lifecycle.jobId} failed`,
        error
      );
      return false;
    }
  }

  private async syncStatuses() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      const lifecycles =
        await this.lifecycles
          .listActive();

      for (const lifecycle of lifecycles) {
        if (lifecycle.backendJobId) {
          const live =
            this.progress.get(
              lifecycle.backendJobId
            );

          if (live) {
            live.lifecycle = lifecycle;
          }
        }

        const workerName =
          this.workerName(lifecycle);

        if (lifecycle.tool === "face.swap") {
          await this.syncFaceFusionStatus(lifecycle);
          continue;
        }

        if (
          lifecycle.status === "accepted" ||
          lifecycle.status === "queued"
        ) {
          if (
            lifecycle.lastJobStatus ===
            lifecycle.status
          ) {
            continue;
          }

          await this.editStatus(
            lifecycle,
            queuedProgressHtml(
              lifecycle,
              workerName
            )
          );
          continue;
        }

        if (
          lifecycle.status === "running" ||
          lifecycle.status === "finalizing"
        ) {
          if (
            lifecycle.lastJobStatus ===
              lifecycle.status
          ) {
            continue;
          }

          const live =
            lifecycle.backendJobId
              ? this.progress.get(
                  lifecycle.backendJobId
                )
              : null;

          const snapshot =
            live?.snapshot ?? {
              workflowPercent: null,
              nodePercent: null,
              stage:
                lifecycle.status ===
                  "finalizing"
                  ? "Finalizing"
                  : "Starting"
            };

          const updated =
            await this.editStatus(
              lifecycle,
              runningProgressHtml(
                lifecycle,
                workerName,
                snapshot
              )
            );

          if (updated && live) {
            live.lastRenderedWorkflow =
              snapshot.workflowPercent;
            live.lastRenderedNode =
              snapshot.nodePercent;
            live.lastRenderedStage =
              snapshot.stage;
            live.lastRenderedAt =
              Date.now();
          }
          continue;
        }

        if (lifecycle.status === "succeeded") {
          if (
            lifecycle.lastJobStatus ===
            "succeeded"
          ) {
            continue;
          }

          await this.editStatus(
            lifecycle,
            deliveringProgressHtml(
              lifecycle,
              workerName
            )
          );
          continue;
        }

        if (
          [
            "failed",
            "cancelled",
            "timed_out"
          ].includes(
            lifecycle.status
          )
        ) {
          await this.editStatus(
            lifecycle,
            terminalProgressHtml(
              lifecycle,
              workerName
            ),
            true
          );
        }
      }
    }
    catch (error) {
      console.error(
        "[telegram-progress] status sweep failed",
        error
      );
    }
    finally {
      this.ticking = false;
    }
  }

  private async syncFaceFusionStatus(lifecycle: TelegramLifecycleJob) {
    const previous = lifecycle.lastJobStatus;
    const lastRendered = this.faceFusionRenderedAt.get(lifecycle.jobId) ?? 0;
    const shouldAnimate = (lifecycle.status === "running" || lifecycle.status === "finalizing") && Date.now() - lastRendered >= this.minEditIntervalMs;
    if ((lifecycle.status === "accepted" || lifecycle.status === "queued") && previous === lifecycle.status) return;
    if ((lifecycle.status === "running" || lifecycle.status === "finalizing") && previous === lifecycle.status && !shouldAnimate) return;

    if (lifecycle.status === "accepted" || lifecycle.status === "queued") {
      await this.editStatus(lifecycle, faceFusionQueuedProgressHtml(lifecycle));
      return;
    }
    if (lifecycle.status === "running" || lifecycle.status === "finalizing") {
      const updated = await this.editStatus(lifecycle, faceFusionRunningProgressHtml(lifecycle));
      if (updated) this.faceFusionRenderedAt.set(lifecycle.jobId, Date.now());
      return;
    }
    if (lifecycle.status === "succeeded") {
      if (previous !== "succeeded") await this.editStatus(lifecycle, faceFusionDeliveringProgressHtml(lifecycle));
      return;
    }
    if (["failed", "cancelled", "timed_out"].includes(lifecycle.status)) {
      await this.editStatus(lifecycle, faceFusionTerminalProgressHtml(lifecycle), true);
    }
  }
}
