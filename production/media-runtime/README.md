# Helix Media Runtime

Execution service currently used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit them to ComfyUI, reconcile execution, capture artifacts, and build a reliable input/output boundary around the worker.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the focused worker checkpoint and resume plan.

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
    │   └── media_job_events
    ↓
WorkerRegistry
    ↓
ComfyAdapter
    ↓
ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
```

## Current worker

- ID: `helix-rtx4060-01`
- Profile: `comfy-video-ltx-stable`
- Adapter: `comfy`
- Capability: `video.i2v`
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

`POST /v1/media/jobs` accepts a Comfy API-format workflow and returns immediately after durable acceptance/submission. The long-running generation is asynchronous.

## Proven execution lifecycle

The runtime now persists and reconciles:

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

The current reconciler uses Comfy `/history/{prompt_id}` plus `/queue` as the correctness/source-of-truth path. It runs inside `helix-runtime`, so unfinished jobs can be recovered after a runtime restart. WebSocket tracking can be added later as a latency optimization; correctness does not depend on it.

Artifact discovery walks Comfy history outputs and records filename, subfolder, type, and source node where available.

## Validated runs on 2026-08-22

First runtime-controlled replay:

```text
Helix job:    job_d305b8b3b4aa4336a455b35043e3060a
Comfy prompt: af67e3be-d307-4757-89fd-6606304c4c4d
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00004_.mp4
```

This job was deliberately reconciled after completion to prove restart/recovery behavior.

C6 hybrid runtime run:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Started:      2026-08-22T09:37:16.915Z
Finished:     2026-08-22T09:46:04.486Z
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

This proved live `queued -> running -> succeeded` reconciliation and automatic artifact capture.

## C6 workflow note

The active experimental API graph is stored on the VPS at:

```text
/opt/helix-runtime/workflows/c6.api.json
```

It is intentionally not frozen into the repository yet.

The API export contained 54 executable nodes and `Load First Frame -> Ninja.jpg`.

A UI/API serialization mismatch was discovered for `LTXVLoopingSampler.temporal_overlap_cond_strength`: the UI workflow's named value said `0.35`, while the exported API graph contained `0.5`. The runtime test copy was explicitly corrected to `0.35` before the successful C6 run.

## Image override support

A semantic image override has now been implemented in source.

Request shape:

```json
{
  "workerId": "helix-rtx4060-01",
  "workflow": { "...": "..." },
  "inputs": {
    "image": "some-worker-input.png"
  }
}
```

The runtime:

1. clones the workflow;
2. finds `class_type = LoadImage`;
3. prefers the unique node titled `Load First Frame`;
4. validates that the requested image is a relative Comfy input filename;
5. changes only that node's `inputs.image`;
6. keeps the stored source workflow unchanged.

The helper was validated against the real C6 API graph: `Ninja.jpg` changed to a test filename, the original graph remained unchanged, and the node count remained 54.

Typecheck and build passed. Deployment of this image-override checkpoint should be confirmed after pulling it on the VPS/home continuation.

## LTX controls not exposed yet

Full LTX workflow control is not yet first-class in the Helix job API.

For the current hybrid graph, the next bindings that need explicit support are:

- `inputs.prompt` -> the main/global prompt node (`PrimitiveStringMultiline`, title `Prompt`);
- `inputs.chunkPrompts` -> `LTXV Multi Prompt Provider`;
- uploaded/staged image -> `inputs.image`.

The CGlide/Director authoring text is not the main execution control while Prompt Relay is disabled.

Until prompt and chunk-prompt bindings are implemented, use the Comfy WebUI for runs that need full prompt authoring control.

## Next milestone: output delivery

The next work item is not another generation test. Build the output boundary first:

```text
job succeeded
    ↓
artifact metadata
    ↓
GET artifact from Comfy /view
    ↓
VPS temporary spool
    ↓
Telegram delivery adapter
    ↓
durable delivery result / retry
    ↓
remove VPS temporary copy
    ↓
worker retention cleanup later
```

Telegram should be treated as a delivery adapter, not part of `ComfyAdapter`.

Do not store the Telegram bot token in Git. Put it in the VPS runtime environment/secret file when wiring resumes.

Initial retention policy discussed: delete the temporary VPS copy immediately after confirmed delivery, but retain the worker output for a safety window (initially 24 hours) before controlled cleanup.

After output delivery is reliable, add `POST /upload/image` input staging and then first-class prompt/chunk-prompt bindings.

## Runtime stack

- TypeScript
- Fastify
- Zod
- ws
- PostgreSQL via `pg`
- Node 24 production container
- strict TypeScript
- multi-stage Docker build

## Resume from home

1. `git pull --ff-only` in `/opt/helix`.
2. Run `npm run typecheck && npm run build` under `production/media-runtime`.
3. Rebuild `helix-runtime` and confirm `/v1/health`.
4. Continue with Comfy artifact retrieval (`/view`) and Telegram delivery wiring.
5. Add durable delivery/retry state and temporary spool cleanup.
6. Then implement Comfy image upload/staging and full LTX prompt bindings.

Do not change the pinned worker stack, model layout, Tailscale exposure, or Caddy configuration as part of this continuation.
