# Helix Media Runtime

Execution service used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit raw Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, expose a narrow Telegram operator surface, and keep the worker/runtime boundary reliable while workflow experiments continue changing.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the focused worker checkpoint and roadmap.

## Current deployed path

```text
caller / n8n
    ↓
helix-runtime :8787
    ├── WorkerService + JobService
    │     ↓
    │   helix-db
    │     ├── workers
    │     ├── worker_observations
    │     ├── media_jobs
    │     ├── media_job_events
    │     ├── media_deliveries
    │     ├── operator_alerts
    │     ├── operator_alert_cursors
    │     ├── operator_worker_alert_state
    │     └── operator_pending_actions
    │
    ├── WorkerRegistry
    │     ↓
    │   ComfyAdapter / ComfyClient
    │     ↓ Tailscale
    │   helix-rtx4060-01
    │     ↓
    │   ComfyUI :8188
    │
    ├── DeliveryWorker
    │     ↓
    │   Telegram original-file delivery
    │
    ├── OutboxRepository
    │     ↓
    │   read-only delivery attention view
    │
    ├── TelegramAlertService
    │     ↓
    │   durable operational alerts
    │
    ├── TelegramCancelService
    │     ↓
    │   confirmed job cancellation
    │
    └── TelegramCommandService
          ↓
        operator + debug commands
```

## Current worker

- Durable ID: `helix-rtx4060-01`
- Human-facing name: `Christopher Nolan`
- Profile: `comfy-video-ltx-stable`
- Adapter: `comfy`
- Capability currently validated: `video.i2v`
- GPU: RTX 4060, 8188 MiB VRAM
- ComfyUI: 0.33.0
- Pinned Comfy revision: `7dde56176efa71fd74ef7b3930ab5882d1926288`
- Python: 3.12.11
- PyTorch: 2.10.0+cu130
- LTX 2.5: available and validated
- Max concurrent GPU jobs: 1

The worker name is presentation/configuration only. Durable references continue to use `helix-rtx4060-01`.

## Current API

Worker/runtime:

- `GET /v1/health`
- `GET /v1/workers`
- `GET /v1/workers/:workerId`
- `GET /v1/workers/:workerId/live`
- `GET /v1/workers/:workerId/readiness`
- `GET /v1/workers/:workerId/health` compatibility route

Media jobs:

- `POST /v1/media/jobs`
- `GET /v1/media/jobs/:jobId`
- `POST /v1/media/jobs/:jobId/cancel`

`POST /v1/media/jobs` accepts a Comfy API-format workflow and returns immediately after durable acceptance/submission. Long-running generation is asynchronous.

`GET /v1/media/jobs/:jobId` returns compact job state plus durable delivery rows and does not echo the stored workflow request.

## Execution lifecycle

Normal success path:

```text
accepted
  ↓
queued
  ↓
running
  ↓
succeeded
```

Additional terminal paths:

```text
running -> cancelled
running -> timed_out
backend error -> failed
```

Comfy's `prompt_id` is stored as `backend_job_id`.

Correctness comes from Comfy `/history/{prompt_id}` plus `/queue`. The reconciler runs inside `helix-runtime`, so unfinished jobs can be recovered after a runtime restart. Persistent WebSocket tracking remains an optional latency optimization.

Terminal job transitions are race-safe: once Helix records `cancelled` or another terminal state, a late reconciler tick cannot overwrite it with `running`, `succeeded`, or `failed`.

## Telegram operator commands

`TelegramCommandService` is a narrow operator surface inside `helix-runtime`. It uses Telegram `getUpdates` long polling and accepts messages only from the configured `HELIX_TELEGRAM_CHAT_ID`; other chats are ignored.

Diagnostics and debugging remain read-only. Confirmed job cancellation is the only write-capable Telegram action in this checkpoint.

Current advertised commands:

```text
/status      - Diagnostics
/queue       - Queue check
/jobs        - Recent jobs
/job <id>    - Job details
/outbox      - Send queue
/errors      - Recent failures
/events <id> - Job events
/cancel <id> - Cancel job
```

`/help` remains available. Hidden aliases are intentionally not advertised:

```text
/st, /stat   -> /status
/qu, /que    -> /queue
/jbs         -> /jobs
/jb          -> /job
/ob          -> /outbox
/err         -> /errors
/ev          -> /events
/cc          -> /cancel
/h           -> /help
```

The service clears Telegram's registered command list on startup, so it does not force a Telegram Menu button.

All operator titles use the same Telegram HTML treatment: bold + italic outer title with only the command word underlined.

### `/status`

Combines runtime uptime, independently timed PostgreSQL health, human-friendly worker state, direct Comfy queue counts, backend versions, GPU/VRAM/RAM from `/system_stats`, and read-only Comfy upstream drift awareness.

Windows shared-GPU-memory usage is not shown because Comfy `/system_stats` does not expose the Task Manager shared-memory value.

### `/queue`

Reads Comfy `/queue` directly and combines it with active Helix database jobs. It does not run the heavier readiness checks.

### `/jobs`

Shows the five most recent media jobs with full durable `job_...` identifiers in monospace. Status is presented in bold square brackets and runtime units remain italic.

### `/job <id>`

Accepts a full durable ID, a unique short prefix, or a copied short display value with trailing dots such as `e2a4a9...`. Ambiguous prefixes are rejected rather than guessed.

The detail view includes job state, worker presentation name, tool, runtime, timestamps, and associated Outbox/send state.

### `/outbox`

Already-delivered rows are excluded. Presentation states are:

```text
pending                         -> pending
delivering                      -> sending
failed + next_attempt_at set    -> retrying
failed + next_attempt_at null   -> failed
```

The view shows at most five actionable items and prioritizes terminal failures. `OutboxRepository` is read-only; `DeliveryWorker` remains the only component responsible for delivery execution/retry progression.

### `/errors`

Shows the five most recent generation failures/timeouts and terminal Outbox failures. Cancelled jobs are excluded.

Full durable job IDs are shown. Each error is rendered in a compact Telegram quote.

### `/events <id>`

Uses the same safe job-reference rules as `/job` and shows the complete durable `media_job_events` timeline newest first.

Each event includes its sequence number, Helix-local timestamp, and actual technical event name such as `job.running`, `job.succeeded`, or `delivery.failed`. The history is not silently truncated to ten rows.

## Operational Telegram alerts

`TelegramAlertService` proactively notifies the configured operator without taking ownership of execution.

Current alerts:

```text
job.failed
job.timed_out
terminal delivery.failed
worker offline
worker recovered
```

Generation success does not create a separate alert because the generated artifact already arrives through normal Telegram delivery.

Migration `0003_operator_alerts.sql` adds `operator_alerts`, `operator_alert_cursors`, and `operator_worker_alert_state`.

The domain-event cursor is initialized at the latest existing event so deployment does not replay historical failures. Event-derived alerts use durable dedupe keys and bounded Telegram send retry.

Worker monitoring requires consecutive observations before an offline/recovered transition is emitted. Initial successful reachability establishes the worker as online without emitting a false recovery alert. A cooldown reduces transition flapping.

## Confirmed Telegram cancellation

`/cancel <id>` and hidden alias `/cc` are the only write-capable Telegram commands in this checkpoint.

Migration `0004_operator_actions.sql` adds `operator_pending_actions`, with one pending action per configured operator chat.

The flow is terminal-style rather than button-driven:

```text
/cancel <id>
      ↓
durable pending action
      ↓
60-second confirmation
      ↓
yes / no
```

Rules:

- `yes` / `no` are case-insensitive;
- three invalid responses abort the request;
- a new slash command silently abandons the pending confirmation;
- expiry is quiet;
- pending state survives runtime restart until expiry;
- terminal jobs never enter the confirmation flow;
- no inline destructive buttons, message edits, or message deletion.

Durable operator-intent events:

```text
operator.telegram.cancel_requested
operator.telegram.cancel_confirmed
operator.telegram.cancel_aborted
operator.telegram.cancel_expired
```

A confirmed request delegates to the existing `JobService.cancel()` path. Telegram does not call ComfyUI directly.

The confirmation state machine was validated with a synthetic running job that had no backend job ID. That exercised confirmation, `no`, invalid-response limits, new-command abandonment, timeout expiry, terminal-job protection, confirmed intent, and durable audit events without risking a real generation.

## Read-only Comfy update awareness

The worker pin is configured as `HELIX_WORKER_RTX4060_REVISION`.

`ComfyUpdateChecker` compares that revision with official `Comfy-Org/ComfyUI` `master` using GitHub's compare API. Results are cached for 15 minutes and are informational only. The worker is never updated automatically.

## Cancellation and timeout

The pinned Comfy worker exposes prompt-specific cancellation through:

```text
POST /api/jobs/{prompt_id}/cancel
```

Helix exposes this through:

```text
POST /v1/media/jobs/:jobId/cancel
```

Cancelling an already-terminal job is a no-op and reports the existing status.

Running-job timeout uses the same cancellation path and is configured with `HELIX_JOB_TIMEOUT_SECONDS`; the deployed value is currently `3600` seconds. Only jobs already in `running` state consume this timeout.

A timed-out job is persisted as `timed_out` with a durable `job.timed_out` event.

## Durable Telegram output delivery

The delivery path is:

```text
job succeeded
    ↓
artifact metadata
    ↓
media_deliveries row
    ↓
Comfy /view
    ↓
VPS temporary spool
    ↓
ffprobe
    ↓
Telegram sendDocument
    ├── original MP4 file
    └── metadata as HTML caption
          └── expandable blockquote
    ↓
persist Telegram message ID
    ↓
remove VPS temporary copy
```

The original video is sent as a Telegram document/file so Telegram does not recompress it. Generation and delivery state remain separate.

Delivery claims use PostgreSQL state, `FOR UPDATE SKIP LOCKED`, stale-delivery recovery, and exponential backoff. Retries are bounded to five attempts. Permanent malformed-artifact failures stop immediately. Terminal delivery failures remain `failed` with `next_attempt_at = NULL`.

The Telegram bot token and chat ID remain deployment secrets outside Git.

## Proven runs on 2026-08-22

C6 hybrid runtime run:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Started:      2026-08-22T09:37:16.915Z
Finished:     2026-08-22T09:46:04.486Z
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

These runs proved durable acceptance, live reconciliation, artifact capture/retrieval, and the delivery path. Cancellation plumbing was also safely validated against completed jobs, and the Telegram confirmation state machine was validated with synthetic non-backend work.

## Workflow policy

Raw Comfy API workflow remains the execution contract while workflow experiments continue.

```text
raw Comfy API workflow
        ↓
helix-runtime execution
        ↓
workflow experiments continue in ComfyUI
        ↓
choose stable I2V / T2V families
        ↓
freeze/version graphs
        ↓
add semantic bindings
```

Actual image upload/staging, broad semantic prompt/relay/sampler bindings, T2V bindings, persistent WebSocket tracking, and worker output-retention deletion infrastructure remain deferred.

## Runtime checkpoint

Workflow-independent runtime hardening and the Telegram operational-control surface are complete enough to pause here.

Completed:

- durable submission and restart recovery;
- artifact capture/retrieval;
- durable original-file Telegram delivery and bounded retry;
- cancellation and running timeout;
- race-safe terminal job states;
- human-friendly worker presentation name;
- `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/errors`, `/events`, `/cancel`, `/help`;
- full durable IDs and safe prefix lookup;
- durable operational alerts and deduplication;
- worker offline/recovered transition monitoring;
- complete timestamped durable event inspection;
- durable 60-second terminal-style cancellation confirmation;
- read-only pinned-revision/upstream update awareness.

Deferred:

- worker output retention cleanup;
- actual image upload/staging;
- semantic workflow bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking;
- broader Telegram write actions beyond confirmed cancellation.

## Next direction

The next main Helix phase is **Niche Intelligence**. The Production runtime should remain stable while Intelligence defines platform-first evidence, content features, niche structure, trend/saturation/novelty signals, and the `NicheModel` contract consumed later by the Director.

When Production workflow work resumes separately, continue I2V optimization and establish a simple native LTX 2.5 T2V baseline before freezing semantic bindings.

## Runtime stack

- TypeScript
- Fastify
- Zod
- ws
- PostgreSQL via `pg`
- Node 24 production container
- ffprobe/FFmpeg in the production image
- strict TypeScript
- multi-stage Docker build

## Resume rules

- Keep raw ComfyUI private over Tailscale.
- Keep `maxConcurrentGpuJobs: 1` for the current RTX 4060 worker.
- Preserve the durable worker ID even when the display name changes.
- Treat the Comfy revision as a production pin; update only deliberately after validation.
- Keep Telegram write scope narrow: confirmed job cancellation is allowed, while restart, shell, update, and arbitrary mutation commands remain prohibited.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not freeze/package experimental LTX workflows until a stable baseline is chosen.
- Do not force semantic input bindings while workflow controls are still moving.
