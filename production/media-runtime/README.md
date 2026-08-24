# Comfy Runtime

Comfy Services execution service used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit raw Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, expose a narrow Telegram operator surface, and keep the worker/runtime boundary reliable while workflow experiments continue changing.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the focused worker checkpoint and roadmap.

## Current deployed path

```text
caller / n8n / Telegram
    ↓
comfy-runtime :8787
    ├── WorkerService + JobService
    │     ↓
    │   comfy-db
    │     ├── workers
    │     ├── worker_observations
    │     ├── media_jobs
    │     ├── media_job_events
    │     ├── media_deliveries
    │     ├── operator_alerts
    │     ├── operator_alert_cursors
    │     ├── operator_worker_alert_state
    │     ├── operator_pending_actions
    │     └── operator_pending_t2v
    │
    ├── WorkerRegistry
    │     ↓
    │   ComfyAdapter / ComfyClient
    │     ↓ Tailscale
    │   comfy-rtx4060-01
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
    ├── TelegramT2VService
    │     ↓
    │   durable prompt capture + confirmation
    │
    └── TelegramCommandService
          ↓
        operator + debug commands
```

## Current worker

- Durable ID: `comfy-rtx4060-01`
- Human-facing name: `Christopher Nolan`
- Profile: `comfy-video-ltx-stable`
- Adapter: `comfy`
- Validated capabilities: `video.i2v`, `video.t2v`
- GPU: RTX 4060, 8188 MiB VRAM
- ComfyUI: 0.33.0
- Pinned Comfy revision: `7dde56176efa71fd74ef7b3930ab5882d1926288`
- Python: 3.12.11
- PyTorch: 2.10.0+cu130
- LTX 2.5: available and validated
- Max concurrent GPU jobs: 1

The worker name is presentation/configuration only. Durable references use `comfy-rtx4060-01`.

### Durable ID migration

Migration `0006_rename_comfy_worker.sql` changes the existing `workers.id` in place from the legacy worker ID to `comfy-rtx4060-01`. It first makes the direct worker foreign keys (`worker_observations.worker_id`, `media_jobs.worker_id`, and `operator_worker_alert_state.worker_id`) cascade on update, then updates the parent primary key in one transaction. `media_job_events`, `media_deliveries`, operator actions, alerts, and pending confirmations remain attached through their unchanged job IDs. Apply this migration before deploying the runtime configured with the new worker ID; it rejects a split state where both IDs exist.

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

`POST /v1/media/jobs` accepts a Comfy API-format workflow and a media tool (`video.i2v` or `video.t2v`) and returns immediately after durable acceptance/submission. Long-running generation is asynchronous.

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

Correctness comes from Comfy `/history/{prompt_id}` plus `/queue`. The reconciler runs inside `comfy-runtime`, so unfinished jobs can be recovered after a runtime restart. Persistent WebSocket tracking remains an optional latency optimization.

Terminal job transitions are race-safe: once Helix records `cancelled` or another terminal state, a late reconciler tick cannot overwrite it with `running`, `succeeded`, or `failed`.

## Worker readiness semantics

Execution readiness is based on the checks needed to actually execute and reconcile work:

- Comfy runtime/system stats;
- queue access;
- capability/object-info access.

The Comfy WebSocket events probe is diagnostic/advisory. A transient `Comfy WebSocket timeout` is still displayed in `/status`, but it does not by itself change an otherwise executable worker from `Busy`/`Idle` to `Degraded`.

This avoids status flapping while preserving visibility into the event channel. Durable job correctness continues to come from queue/history reconciliation.

## Telegram operator commands

`TelegramCommandService` is a narrow operator surface inside `comfy-runtime`. It uses Telegram `getUpdates` long polling and accepts messages only from the configured `COMFY_TELEGRAM_CHAT_ID`; other chats are ignored.

Diagnostics and debugging remain read-only. The only write-capable media actions in this checkpoint are explicitly confirmed cancellation and explicitly confirmed native T2V generation.

Current advertised commands:

```text
/status      - Diagnostics
/queue       - Queue check
/jobs        - Recent jobs
/job <id>    - Job details
/outbox      - Send queue
/errors      - Recent failures
/events <id> - Job events
/t2v         - Generate video
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

## Confirmed Telegram cancellation

`/cancel <id>` and hidden alias `/cc` use durable terminal-style confirmation.

Migration `0004_operator_actions.sql` adds `operator_pending_actions`, with one pending action per configured operator chat.

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

Confirmed cancellation delegates to `JobService.cancel()`. Telegram does not call ComfyUI directly.

## Confirmed Telegram T2V generation

`/t2v` is the first narrow semantic Production input exposed through Telegram.

```text
/t2v
  ↓
awaiting_prompt
  ↓
prompt preview
  ↓
awaiting_confirmation
  ↓ yes
JobService.create(tool = video.t2v)
```

Migration `0005_t2v_confirmations.sql` adds `operator_pending_t2v`.

The operator has five minutes to provide the prompt. Once captured, the prompt is shown back with the fixed baseline settings. Confirmation lasts 60 seconds. Three invalid responses abort the action. A new slash command abandons it. No GPU job is submitted before `yes`.

The vetted T2V workflow is deployment-managed at `/opt/comfy-runtime/workflows/video_ltx2_5_t2v.api.json` and bind-mounted read-only as `/app/workflows/video_ltx2_5_t2v.api.json`.

The current semantic mutation is intentionally limited to:

```text
405:376.inputs.value = prompt
```

Helix also verifies that prompt enhancement at node `405:383` remains disabled. The current workflow baseline keeps the following fixed:

```text
aspect:      16:9 widescreen
resolution:  0.9 MP selector baseline
output:      1280×704 in the proven run
fps:         24
duration:    5 seconds
negative:    fixed workflow negative prompt
sampler:     workflow-defined
models:      workflow-defined
```

Broader T2V settings are deliberately deferred until the settings contract is designed around stable Helix semantics rather than raw Comfy node IDs.

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

## Read-only Comfy update awareness

The worker pin is configured as `COMFY_WORKER_RTX4060_REVISION`.

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

Running-job timeout uses the same cancellation path and is configured with `COMFY_JOB_TIMEOUT_SECONDS`; the deployed value is currently `3600` seconds. Only jobs already in `running` state consume this timeout.

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

Delivered-file captions are tool-aware. A T2V result uses `[video.t2v]`, the configured worker display name `Christopher Nolan`, bold field labels, and a bold non-italic Job label with the short ID in monospace.

The Telegram bot token and chat ID remain deployment secrets outside Git.

## Proven production runs

C6 hybrid I2V runtime run:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Started:      2026-08-22T09:37:16.915Z
Finished:     2026-08-22T09:46:04.486Z
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

Native LTX 2.5 T2V Telegram production run:

```text
Helix job:    job_b270eea4177746d881c0c96d0f2f4b35
Tool:         video.t2v
Result:       succeeded
Runtime:      4m 10s
Artifact:     video/LTX_2.5_t2v_00001_.mp4
Video:        1280×704 · 5.0s
Audio:        present
Worker:       Christopher Nolan
Delivery:     Telegram delivered in 1 attempt
```

The T2V run proved the complete generation/delivery path: Telegram prompt -> Helix durable job -> native LTX 2.5 generation -> queue/history reconciliation -> artifact retrieval -> original-file Telegram delivery.

The durable pre-submit confirmation layer was added after that generation proof so future T2V prompt entry no longer immediately spends GPU time.

## Workflow policy

Raw Comfy API workflow remains the execution contract while workflow experiments continue.

```text
raw Comfy API workflow
        ↓
comfy-runtime execution
        ↓
workflow experiments continue in ComfyUI
        ↓
choose stable I2V / T2V families
        ↓
freeze/version graphs
        ↓
add semantic bindings
```

Actual image upload/staging, broad semantic prompt/relay/sampler bindings, T2V settings beyond the fixed prompt-only baseline, persistent WebSocket tracking, and worker output-retention deletion infrastructure remain deferred.

## Runtime checkpoint

Workflow-independent runtime hardening and the Telegram operational-control surface are complete enough to pause here.

Completed:

- durable submission and restart recovery;
- artifact capture/retrieval;
- durable original-file Telegram delivery and bounded retry;
- cancellation and running timeout;
- race-safe terminal job states;
- human-friendly worker presentation name;
- `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/errors`, `/events`, `/t2v`, `/cancel`, `/help`;
- full durable IDs and safe prefix lookup;
- durable operational alerts and deduplication;
- worker offline/recovered transition monitoring;
- complete timestamped durable event inspection;
- durable 60-second terminal-style cancellation confirmation;
- durable T2V prompt/confirmation state;
- validated native `video.t2v` generation and original-file Telegram return;
- tool-aware Telegram artifact presentation;
- advisory WebSocket-event readiness semantics;
- read-only pinned-revision/upstream update awareness.

Deferred:

- worker output retention cleanup;
- actual image upload/staging;
- broad semantic workflow bindings;
- T2V settings beyond the fixed prompt-only baseline;
- persistent WebSocket execution tracking;
- broader Telegram write actions.

## Next direction

The next main Helix phase is **Niche Intelligence**. The Production runtime should remain stable while Intelligence defines platform-first evidence, content features, niche structure, trend/saturation/novelty signals, and the `NicheModel` contract consumed later by the Director.

When Production workflow work resumes, the next T2V task is not another raw-workflow integration. It is the settings design around the proven baseline: define stable user-facing controls first, then map those controls onto the workflow.

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
- Keep Telegram write scope narrow: confirmed job cancellation and confirmed T2V generation are allowed, while restart, shell, update, and arbitrary worker mutation commands remain prohibited.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not freeze/package experimental LTX workflows until a stable baseline is chosen.
- Do not expose raw node IDs as the long-term T2V settings contract.
