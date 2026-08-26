# Helix Media Runtime

Execution service used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit raw Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, expose a narrow Telegram operator surface, and keep the worker/runtime boundary reliable while workflow experiments continue changing.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the focused worker checkpoint and roadmap.

## Current deployed path

```text
caller / n8n / Telegram
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
    │     ├── operator_pending_actions
    │     ├── operator_pending_t2v
    │     ├── operator_pending_t2i
    │     └── production_profile_tool_settings
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
    ├── TelegramT2VService / TelegramT2IService
    │     ↓
    │   durable prompt capture + confirmation
    │
    ├── TelegramDownloadsService
    │     ↓
    │   paginated live Comfy history
    │
    └── TelegramCommandService
          ↓
        operator + debug commands
```

## Current worker

- Durable ID: `helix-rtx4060-01`
- Physical-worker name: `Helix RTX 4060`
- Adapter: `comfy`
- Production profile `nolan`: Christopher Nolan; validated `video.i2v`, `video.t2v`
- Production profile `leibovitz`: Annie Leibovitz; validated `image.t2i`
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

`POST /v1/media/jobs` accepts a Comfy API-format workflow and a media tool (`video.i2v`, `video.t2v`, or `image.t2i`) and returns immediately after durable acceptance/submission. Long-running generation is asynchronous.

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

Comfy's `prompt_id` is stored as `backend_job_id`. Internal Helix IDs remain `job_...` primary keys. Migration `0011_job_numbers.sql` adds a unique, non-null sequential `BIGINT job_number`, chronologically backfills existing jobs, and owns the sequence used for later inserts. Telegram uses this number everywhere while API/internal foreign-key relationships remain unchanged.

Correctness comes from Comfy `/history/{prompt_id}` plus `/queue`. The reconciler runs inside `helix-runtime`, so unfinished jobs can be recovered after a runtime restart. Persistent WebSocket tracking remains an optional latency optimization.

Terminal job transitions are race-safe: once Helix records `cancelled` or another terminal state, a late reconciler tick cannot overwrite it with `running`, `succeeded`, or `failed`.

## Worker readiness semantics

Execution readiness is based on the checks needed to actually execute and reconcile work:

- Comfy runtime/system stats;
- queue access;
- capability/object-info access.

The Comfy WebSocket events probe is diagnostic/advisory. A transient `Comfy WebSocket timeout` is still displayed in `/status`, but it does not by itself change an otherwise executable worker from `Busy`/`Idle` to `Degraded`.

This avoids status flapping while preserving visibility into the event channel. Durable job correctness continues to come from queue/history reconciliation.

## Telegram operator commands

`TelegramCommandService` is a narrow operator surface inside `helix-runtime`. It uses Telegram `getUpdates` long polling. `HELIX_TELEGRAM_CHAT_ID` remains the private operator route. An optional all-or-none forum configuration enables two production-only forum routes:

```text
HELIX_TELEGRAM_FORUM_CHAT_ID=-1004369617758
HELIX_TELEGRAM_T2I_THREAD_ID=5
HELIX_TELEGRAM_T2V_THREAD_ID=7
```

Forum traffic is accepted only from those exact supergroup topics; private operator commands and T2V developer settings remain unavailable there. Generated artifacts carry a durable Telegram destination and are returned to their originating topic after restart.

Diagnostics and debugging remain read-only. The only write-capable media actions in this checkpoint are explicitly confirmed cancellation, native T2V generation, the Distilled-FP8 T2I workflow integration, and explicit artifact retrieval through Downloads.

Current advertised commands:

```text
/status        - Diagnostics
/queue         - Queue check
/j             - Jobs, 20 per page
/j p <page>    - Jobs page
/jb <number>   - Job details
/dl            - Downloads, 20 per page
/dl p <page>   - Downloads page
/dl i <number> - Inspect artifact
/dl g <number> - Get artifact
/outbox        - Send queue
/errors        - Recent failures
/ev <number>   - Job events
/t2v           - Generate video
/t2i           - Generate image
/cc <number>   - Cancel job
```

`/help` remains available. Additional short aliases are:

```text
/st, /stat   -> /status
/qu, /que    -> /queue
/j, /jbs     -> /jobs
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

### `/j` / `/jobs`

Shows 20 recent media jobs per page as compact quote blocks. `/j p <page>` provides previous/next pagination. Each row uses the durable sequential Job number, bold square-bracket status, tool/profile context, finish time where available, and italic runtime.

### `/jb <number>` / `/job <number>`

Numeric Job lookup is exact. Full legacy Helix IDs, unique UUID prefixes, and copied short values ending in `...` remain accepted for compatibility; ambiguous legacy prefixes are rejected rather than guessed.

The detail view includes Job number, state, Production Profile, tool, runtime, timestamps, associated Outbox/send state, and an expandable semantic generation snapshot. Internal Helix and Comfy identifiers are confined to technical detail where useful.

### `/dl` / `/downloads`

Reads live Comfy history without creating a permanent artifact catalog. It shows 20 completed artifacts per page, uses `/dl p <page>` for pagination, `/dl i <number>` for expandable inspection, and `/dl g <number>` for explicit original-file retrieval. Mapped history uses the same numeric Job reference as every other Telegram view. Legacy Comfy Prompt prefixes remain accepted, and unmapped live history is clearly labelled as Comfy-only. Valid-empty history is distinct from unavailable or malformed history.

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

Durable numeric Job references are shown. Each error is rendered in a compact Telegram quote.

### `/ev <number>` / `/events <number>`

Uses the same numeric-first, legacy-compatible reference rules as `/job` and shows the complete durable `media_job_events` timeline newest first.

Each event includes its sequence number, Helix-local timestamp, and actual technical event name such as `job.running`, `job.succeeded`, or `delivery.failed`. The history is not silently truncated to ten rows.

## Confirmed Telegram cancellation

`/cancel <number>` and alias `/cc` use durable terminal-style confirmation.

Migration `0004_operator_actions.sql` adds `operator_pending_actions`, with one pending action per configured operator chat.

```text
/cancel <number>
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

The operator has five minutes to provide the prompt. Once captured, the prompt is shown back with a frozen semantic settings/mode snapshot. Confirmation lasts 60 seconds. Three invalid responses abort the action. A new slash command abandons it. No GPU job is submitted before `yes`.

The vetted T2V workflow is deployment-managed at `/opt/helix-runtime/workflows/video_ltx2_5_t2v.api.json` and bind-mounted read-only as `/app/workflows/video_ltx2_5_t2v.api.json`.

The vetted binder now applies the persisted semantic T2V contract: aspect, quality/effective megapixels, duration, Prompt Enhance, FPS, Stage 1/2 seeds, negative prompt, sampler, and guidance. Advanced controls require explicit `-dev`; model identity, sigmas, decode tiling, and other graph internals remain outside the operator contract. Manual/Fast/Quality Mode overlays are resolved before the frozen generation snapshot and never rewrite stored manual settings.

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

Delivered-file captions are tool-aware. A T2V result uses `[video.t2v]`, the configured Production Profile name `Christopher Nolan`, bold field labels, and a bold non-italic numeric Job reference in monospace.

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

Actual image upload/staging, broader Director/Prompt Relay bindings, persistent WebSocket tracking, and worker output-retention deletion infrastructure remain deferred.

## Runtime checkpoint

Workflow-independent runtime hardening and the Telegram operational-control surface are complete enough to pause here.

Completed:

- durable submission and restart recovery;
- artifact capture/retrieval;
- durable original-file Telegram delivery and bounded retry;
- cancellation and running timeout;
- race-safe terminal job states;
- human-friendly worker presentation name;
- `/status`, `/queue`, `/jobs`, `/job`, `/downloads`, `/outbox`, `/errors`, `/events`, `/t2v`, `/t2i`, `/cancel`, `/help`;
- durable numeric Job references with safe legacy UUID-prefix compatibility;
- 20-item paginated Jobs and Downloads views;
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
- broader Director/Prompt Relay workflow bindings;
- persistent WebSocket execution tracking;
- broader Telegram write actions.

## Next direction

The next main Helix phase is **Niche Intelligence**. The Production runtime should remain stable while Intelligence defines platform-first evidence, content features, niche structure, trend/saturation/novelty signals, and the `NicheModel` contract consumed later by the Director.

When Production workflow work resumes, calibrate the existing semantic settings and Manual/Fast/Quality modes with controlled runs before expanding the contract.

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

## Production profiles and experimental T2I foundation

`helix-rtx4060-01` remains the single physical Comfy worker: one endpoint, one
Comfy adapter, one queue, one RTX 4060, and `maxConcurrentGpuJobs: 1`. Production
profiles are logical identities on that worker, not additional workers:

```text
nolan      -> Christopher Nolan -> video.t2v, video.i2v -> LTX (validated)
leibovitz  -> Annie Leibovitz   -> image.t2i            -> FLUX.2 (validated)
```

Jobs persist both `worker_id` and `profile_id`. Migration
`0010_production_profiles_t2i.sql` backfilled existing video jobs to `nolan`
and added durable T2I settings/pending state; it is applied in production.
Callers that omit `profileId` remain compatible when a single profile supplies
the requested tool.

## T2I Distilled FP8 integration

`/t2i` is wired for Annie Leibovitz after migration/deployment. It has exactly
these settings: `aspect` and `seed`; there are no image modes, model choices,
or sampler/CFG/step controls.

```text
/t2i
/t2i settings        /t2i s
/t2i set asp <ratio>
/t2i set seed <random|integer>
/t2i reset
```

Set `HELIX_T2I_WORKFLOW_PATH` to the supplied API workflow. Its deployment
default is:

```text
/app/workflows/image_flux2_klein_4b_distilled_fp8_t2i_v2.api.json
```

The runtime reads it only after a confirmed `yes`; compilation does not require
the file. It validates and mutates only prompt, width, height, and a concrete
seed. The provisional V1 dimensions are 1024×1024 (1:1), 832×1248 (2:3),
1248×832 (3:2), 896×1120 (4:5), 1120×896 (5:4), 720×1280 (9:16), and 1280×720
(16:9). The only initial variant is `klein4b-distilled-fp8-v1`, model identity
`FLUX.2 Klein 4B Distilled FP8`; Base is reserved for later testing.

Images use the generic artifact/delivery path and Telegram `sendDocument`, not
`sendPhoto`; captions omit video duration/audio. `image.t2i` is validated by
successful RTX 4060 Telegram submissions, generations, and original-file
deliveries. The narrow V1 settings/binder contract remains intentionally
experimental and may evolve only through explicit workflow validation.
