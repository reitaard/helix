# Helix Media Runtime

Execution service currently used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit raw Comfy API workflows, reconcile execution, capture artifacts, deliver generated media, and keep the worker/runtime boundary reliable while workflow experiments continue changing.

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

`POST /v1/media/jobs` accepts a Comfy API-format workflow and returns immediately after durable acceptance/submission. Long-running generation is asynchronous.

## Proven execution lifecycle

The runtime persists and reconciles:

```text
accepted
  ↓
queued
  ↓
running
  ↓
succeeded
```

Comfy's `prompt_id` is stored as `backend_job_id`.

Correctness comes from Comfy `/history/{prompt_id}` plus `/queue`. The reconciler runs inside `helix-runtime`, so unfinished jobs can be recovered after a runtime restart. WebSocket tracking remains an optional latency optimization.

Artifact discovery walks Comfy history outputs and records filename, subfolder, type, and source node where available.

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

## Durable Telegram output delivery

Implemented and validated in checkpoint `301be69`.

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

Generation state and delivery state are separate. A successful generation stays `succeeded` even if a delivery attempt fails.

Delivery claims use durable PostgreSQL state, retry/backoff, `FOR UPDATE SKIP LOCKED`, and stale-delivery recovery. Telegram metadata and document message IDs are persisted separately so retries do not need to resend already-completed steps.

The delivery path was validated against the existing C6 artifact without another GPU generation. The final delivery completed in one attempt and the VPS spool was empty afterward.

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

Full LTX semantic input bindings are also intentionally deferred because the workflow is still changing. Current/future graphs may expose additional prompt paths, Prompt Relay controls, sampler controls, image inputs, and separate T2V behavior.

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

Known future bindings include image, main prompt, chunk prompts, Prompt Relay-related prompts, and other workflow-specific controls discovered during optimization.

## Next workflow-independent work

Prioritize work that does not depend on the final I2V/T2V input schema:

1. controlled worker output retention cleanup;
2. generation timeout and cancellation semantics;
3. delivery failure/terminal-state hardening and observability;
4. optional faster WebSocket event tracking after correctness paths remain stable.

The first item is the immediate next milestone because VPS spool cleanup is already proven but worker originals are still retained indefinitely.

Initial retention policy: keep worker outputs for a 24-hour safety window, then delete only Helix-managed artifacts. Never blindly clear the entire Comfy output tree.

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
- Do not freeze/package the experimental LTX workflow until a stable baseline is chosen.
- Do not force semantic input bindings while workflow controls are still moving.
