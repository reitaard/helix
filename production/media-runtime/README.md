# Helix Media Runtime

Execution service used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit raw Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, expose read-only operator diagnostics, and keep the worker/runtime boundary reliable while workflow experiments continue changing.

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
    │     └── media_deliveries
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
    └── TelegramCommandService
          ↓
        read-only operator commands
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

`TelegramCommandService` is a read-only operator surface inside `helix-runtime`. It uses Telegram `getUpdates` long polling and accepts commands only from the configured `HELIX_TELEGRAM_CHAT_ID`; other chats are ignored.

Current commands:

- `/status` — runtime/database/worker diagnostics;
- `/queue` — direct Comfy queue plus active Helix jobs;
- `/help` — compact command list.

Hidden aliases are accepted but intentionally not advertised:

- `/st`, `/stat` -> `/status`
- `/qu`, `/que` -> `/queue`

The service clears Telegram's registered command list on startup, so it does not force a Telegram Menu button.

`/status` combines:

- runtime uptime;
- independently timed PostgreSQL `SELECT 1` health;
- human-friendly worker name and friendly state (`cold_ready` is displayed as `Idle`);
- direct Comfy queue counts;
- ComfyUI/Python/PyTorch versions;
- GPU name, VRAM and host RAM from live Comfy `/system_stats`;
- read-only Comfy upstream drift awareness.

Windows shared-GPU-memory usage is not shown because Comfy `/system_stats` does not expose the Task Manager shared-memory value. It is not estimated or mislabeled.

`/queue` stays lightweight: it reads Comfy `/queue` directly and combines that with active Helix database jobs. It does not run the heavier readiness checks.

The current command checkpoint is deliberately read-only. It does not expose restart, shell, package-update, or worker-mutation actions.

## Read-only Comfy update awareness

The current worker pin is configured as `HELIX_WORKER_RTX4060_REVISION`.

`ComfyUpdateChecker` compares that revision with official `Comfy-Org/ComfyUI` `master` using GitHub's compare API. Results are cached for 15 minutes; temporary failures are retried sooner and render as unavailable rather than breaking `/status`.

The status is informational only:

```text
Current
```

or:

```text
Available (N commits)
```

When drift exists, Telegram links `Available` to the official ComfyUI releases page for review. The worker is never updated automatically.

This is commit-level upstream drift, not a claim that every upstream commit is a new stable release.

## Cancellation and timeout

The pinned Comfy worker exposes prompt-specific cancellation through:

```text
POST /api/jobs/{prompt_id}/cancel
```

Helix exposes this through:

```text
POST /v1/media/jobs/:jobId/cancel
```

Cancelling an already-terminal Helix job is a no-op and reports the existing status.

Running-job timeout uses the same cancellation path. It is configured with `HELIX_JOB_TIMEOUT_SECONDS`; the deployed value is currently `3600` seconds. Only jobs already in `running` state consume this timeout, so queued jobs waiting for the single GPU are not timed out by this policy.

A timed-out job is persisted as `timed_out` with a durable `job.timed_out` event.

## Durable Telegram output delivery

The current delivery path is:

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
    ├── width / height
    ├── duration
    ├── size
    └── audio present / absent
    ↓
Telegram sendDocument
    ├── original MP4 file
    └── metadata as HTML caption
          └── expandable blockquote
    ↓
persist Telegram document message ID
    ↓
remove VPS temporary copy
```

The original video is sent as a Telegram document/file so Telegram does not recompress it. Filename/title stays outside the expandable caption metadata, and generation job IDs are displayed as the first six characters after `job_` plus `...`.

Current delivery persists the same Telegram message ID into both legacy `metadata_message_id` and `document_message_id` columns because metadata and document now live in one message.

Generation state and delivery state remain separate. A successful generation stays `succeeded` even if delivery fails.

Delivery claims use PostgreSQL state, `FOR UPDATE SKIP LOCKED`, stale-delivery recovery, and exponential backoff. Retries are bounded to five attempts:

```text
attempt 1 failure -> retry after 30s
attempt 2 failure -> retry after 60s
attempt 3 failure -> retry after 120s
attempt 4 failure -> retry after 240s
attempt 5 failure -> terminal failed
```

Malformed artifact metadata is a permanent delivery error and stops immediately. Terminal delivery failures remain visible as `failed` with `next_attempt_at = NULL` and are no longer claimed.

The Telegram bot token and chat ID remain deployment secrets outside Git.

## Proven runs on 2026-08-22

First runtime-controlled replay:

```text
Helix job:    job_d305b8b3b4aa4336a455b35043e3060a
Comfy prompt: af67e3be-d307-4757-89fd-6606304c4c4d
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00004_.mp4
```

C6 hybrid runtime run:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Started:      2026-08-22T09:37:16.915Z
Finished:     2026-08-22T09:46:04.486Z
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

These runs proved durable acceptance, live reconciliation, artifact capture/retrieval, and the delivery path. Cancellation plumbing was also validated safely against the already-completed C6 job as a no-op.

## C6 workflow note

The active experimental API graph is stored on the VPS at:

```text
/opt/helix-runtime/workflows/c6.api.json
```

It is intentionally not frozen into the repository.

The API export contained 54 executable nodes. A UI/API serialization mismatch was discovered for `LTXVLoopingSampler.temporal_overlap_cond_strength`: the UI workflow's named value said `0.35`, while the exported API graph contained `0.5`. The runtime test copy was corrected to `0.35` before the successful C6 run.

## Input state: intentionally deferred

A semantic image override already exists. It finds the unique `LoadImage` node, preferring title `Load First Frame`, validates a relative Comfy input filename, clones the graph, and changes only the clone.

Actual upload/staging through Comfy `/upload/image` is not implemented yet.

Full LTX semantic bindings are intentionally deferred because the workflow is still changing. Current/future graphs may expose additional prompt paths, Prompt Relay controls, sampler controls, Director controls, image inputs, and separate T2V behavior.

Current policy:

```text
raw Comfy API workflow remains the execution contract
        ↓
workflow experiments continue in ComfyUI
        ↓
I2V / T2V graphs can be submitted raw when needed
        ↓
freeze semantic bindings only after a workflow family stabilizes
```

## Runtime checkpoint

Workflow-independent runtime work is complete enough to pause here.

Completed:

- durable submission and restart recovery;
- artifact capture/retrieval;
- Telegram original-file delivery with same-message metadata caption;
- durable delivery retry/state and VPS spool cleanup;
- cancellation and running timeout;
- race-safe terminal job states;
- delivery status observability and bounded retry/backoff;
- permanent delivery failure handling;
- human-friendly worker presentation name;
- read-only `/status`, `/queue`, `/help` Telegram operator commands;
- live worker RAM/VRAM diagnostics;
- read-only pinned-revision/upstream update awareness.

Deferred:

- worker output retention cleanup;
- actual image upload/staging;
- prompt/relay/sampler semantic bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking;
- write-capable Telegram operations.

Worker output retention is intentionally deferred. The current traditional Comfy output path does not give this runtime a clean enough per-artifact delete primitive, and adding a worker-side deletion service only for retention is not justified at this checkpoint. VPS temporary copies are already deleted after every delivery attempt.

## Next direction

Return to Comfy/LTX workflow work:

1. continue I2V workflow optimization;
2. add and validate a simple native LTX 2.5 T2V workflow;
3. discover the final prompt/relay/sampler/Director controls that materially matter;
4. keep using raw API-format graphs through Helix during experimentation;
5. freeze/version workflow families only after they stabilize;
6. add semantic Helix bindings after that point.

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
- Keep Telegram diagnostics read-only unless a separate write-capability checkpoint is explicitly chosen.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not freeze/package experimental LTX workflows until a stable baseline is chosen.
- Do not force semantic input bindings while workflow controls are still moving.
