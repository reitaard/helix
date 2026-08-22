# Helix Media Runtime

Execution service used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit raw Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, and keep the worker/runtime boundary reliable while workflow experiments continue changing.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the focused worker checkpoint and roadmap.

## Current deployed path

```text
caller / n8n
    ↓
helix-runtime :8787
    ↓
WorkerService + JobService
    ├── helix-db
    │   ├── workers
    │   ├── worker_observations
    │   ├── media_jobs
    │   ├── media_job_events
    │   └── media_deliveries
    ↓
WorkerRegistry
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
    ↓
artifact
    ↓
VPS temporary spool
    ↓
TelegramDelivery
```

## Current worker

- ID: `helix-rtx4060-01`
- Profile: `comfy-video-ltx-stable`
- Adapter: `comfy`
- Capability currently validated: `video.i2v`
- GPU: RTX 4060, 8188 MiB VRAM
- ComfyUI: 0.33.0
- LTX 2.5: available and validated
- Max concurrent GPU jobs: 1

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

`GET /v1/media/jobs/:jobId` returns the compact job state plus durable delivery rows. It does not echo the stored workflow request.

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

Running-job timeout uses the same cancellation path. It is configured with:

```text
HELIX_JOB_TIMEOUT_SECONDS
```

The deployed value is currently `3600` seconds. Only jobs already in `running` state consume this timeout; queued jobs waiting for the single GPU are not timed out by this policy.

A timed-out job is persisted as `timed_out` with a durable `job.timed_out` event.

## Proven runs on 2026-08-22

First runtime-controlled replay:

```text
Helix job:    job_d305b8b3b4aa4336a455b35043e3060a
Comfy prompt: af67e3be-d307-4757-89fd-6606304c4c4d
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00004_.mp4
```

This was deliberately reconciled after completion to prove restart/recovery behavior.

C6 hybrid runtime run:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Started:      2026-08-22T09:37:16.915Z
Finished:     2026-08-22T09:46:04.486Z
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

This proved live `queued -> running -> succeeded` reconciliation and artifact capture.

Cancellation plumbing was validated safely against this already-completed C6 job: Comfy and Helix both returned a no-op rather than mutating the succeeded job.

## Durable Telegram output delivery

The complete current delivery path is validated:

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
Telegram metadata message
    ↓
Telegram original MP4 as document
    ↓
persist metadata + document message IDs
    ↓
remove VPS temporary copy
```

Generation state and delivery state are separate. A successful generation stays `succeeded` even if delivery fails.

Delivery claims use PostgreSQL state, `FOR UPDATE SKIP LOCKED`, stale-delivery recovery, and exponential backoff. Telegram metadata/document message IDs are persisted separately so retries do not need to repeat already-completed metadata delivery.

Retries are bounded to five attempts:

```text
attempt 1 failure -> retry after 30s
attempt 2 failure -> retry after 60s
attempt 3 failure -> retry after 120s
attempt 4 failure -> retry after 240s
attempt 5 failure -> terminal failed
```

Malformed artifact metadata is a permanent delivery error and stops immediately. Terminal delivery failures remain `failed` with `next_attempt_at = NULL`, so they are visible but no longer claimed again.

The proven C6 delivery completed in one attempt. The final durable state includes Telegram metadata message ID `12`, document message ID `13`, and an empty VPS spool afterward.

`GET /v1/media/jobs/:jobId` now exposes delivery information such as:

```json
{
  "deliveries": [
    {
      "artifactIndex": 0,
      "provider": "telegram",
      "status": "delivered",
      "attemptCount": 1,
      "metadataMessageId": "12",
      "documentMessageId": "13",
      "error": null,
      "nextAttemptAt": null,
      "deliveredAt": "2026-08-22T20:45:13.962Z"
    }
  ]
}
```

The Telegram bot token and chat ID remain deployment secrets outside Git.

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

Do not spend time hard-coding a large unstable input schema now.

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

- durable submission and recovery;
- artifact capture/retrieval;
- Telegram delivery;
- durable delivery retry/state;
- VPS spool cleanup;
- cancellation;
- running timeout;
- race-safe terminal job states;
- delivery status observability;
- bounded retry/backoff;
- permanent delivery failure handling.

Deferred:

- worker output retention cleanup;
- actual image upload/staging;
- prompt/relay/sampler semantic bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking.

Worker output retention is intentionally deferred. The current traditional Comfy output path does not give this runtime a clean enough per-artifact delete primitive, and adding a worker-side deletion service only for retention is not justified at this checkpoint. VPS temporary copies are already deleted after every delivery attempt.

## Next direction

Return to Comfy/LTX workflow work:

1. continue I2V workflow optimization;
2. add and validate a simple T2V workflow;
3. discover the final prompt/relay/sampler/Director controls that actually matter;
4. keep using raw API-format graphs through Helix when runtime execution is needed;
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
- Do not alter the pinned ComfyUI/custom-node/model stack casually.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not freeze/package experimental LTX workflows until a stable baseline is chosen.
- Do not force semantic input bindings while workflow controls are still moving.
