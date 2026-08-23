# Infrastructure

Infrastructure should support proven execution needs rather than speculative architecture.

As of 2026-08-23 the active Production infrastructure is a dedicated standalone ComfyUI GPU worker plus the VPS-side `helix-runtime`, its dedicated PostgreSQL database, and durable Telegram artifact delivery.

For the focused worker/runtime roadmap, see:

- [`production/comfyui-worker/README.md`](../production/comfyui-worker/README.md)
- [`production/media-runtime/README.md`](../production/media-runtime/README.md)

## Current Production execution path

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
MediaAdapter
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
    ↓
generated artifact
    ↓
VPS temporary spool
    ↓
ffprobe
    ↓
Telegram metadata + original document
```

Raw ComfyUI is not exposed publicly.

## Worker machine/runtime

- OS: Windows
- GPU: NVIDIA GeForce RTX 4060
- VRAM: 8188 MiB
- system RAM: about 32 GB
- ComfyUI: `0.33.0`
- Python: `3.12.11`
- PyTorch: `2.10.0+cu130`
- CUDA build used by PyTorch: `13.0`
- production API port: `8188`
- listen address: `0.0.0.0`
- worker ID: `helix-rtx4060-01`
- worker profile: `comfy-video-ltx-stable`
- currently validated capability: `video.i2v`
- max concurrent GPU jobs: `1`

LTX `2.3` and `2.5` model-family assets are available. LTX `2.5` is the validated standalone execution path.

## Worker filesystem

```text
C:\AI\ComfyUI-CLI\
├── .venv\
├── custom_nodes\
├── user\
├── input\
├── output\
└── extra_model_paths.yaml

C:\AI\start-comfy.ps1

C:\AI\HelixWorker\
├── config\worker.yaml
├── scripts\
├── inventory\
├── logs\
└── state\

C:\ComfyMigrationBackup\
```

Keep `C:\ComfyMigrationBackup` until the standalone worker has been stable for a sustained period and rollback is no longer needed.

The CLI worker currently reads models through `extra_model_paths.yaml` from:

```text
C:\Users\MSP-PC\AppData\Local\Comfy-Desktop\ComfyUI-Shared\models
C:\ComfyUI\models
```

Do not move these model roots while the worker/workflows are still being validated.

## Frozen known-good environment

ComfyUI core:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

Custom nodes:

```text
ComfyUI-KJNodes
3f20054214fec9f9234fd3841ae6f1e4287948f6

ComfyUI-LTXVideo
15d09abb5a187a8dcaea2fc31fe51ee96e6c9d0d

CGlide/LTX-2.5-Director
17aa8bc3e6dcebb8ebcd7265a04f3750c12ee1d7
```

Important package pins include:

```text
torch==2.10.0+cu130
torchvision==0.25.0+cu130
torchaudio==2.10.0+cu130
kornia==0.8.2
kornia_rs==0.1.10
transformers==5.0.0
diffusers==0.40.0
einops==0.8.2
ninja==1.11.1.4
```

Kornia `0.8.3` previously broke the LTXVideo import; `0.8.2` is the known-good pin.

Triton is intentionally not installed. `PatchTritonVAE` is therefore unavailable, but the validated LTX path does not require it.

Frozen inventory under `C:\AI\HelixWorker\inventory` includes:

```text
comfy-commit.txt
custom-nodes.txt
gpu.txt
pip-freeze.txt
scheduled-task.xml
node-classes.txt
```

The captured worker exposes 1219 ComfyUI node classes.

## Worker startup

Windows Task Scheduler contains:

```text
Task name: Helix ComfyUI Worker
Trigger: AtStartup
Account: SYSTEM
Run level: Highest
Restart on failure: 1 minute
```

It launches `C:\AI\start-comfy.ps1`, which starts the standalone ComfyUI CLI installation on port `8188`.

Manual scheduled-task startup has been validated. A real Windows reboot/AtStartup validation is still pending and must not be claimed as complete until tested.

## Private connectivity

Validated paths:

- worker-local HTTP;
- worker-local WebSocket;
- main Windows PC -> worker over Tailscale;
- VPS host -> worker over Tailscale;
- n8n container -> VPS runtime;
- `helix-runtime` -> worker HTTP + WebSocket.

Validated Comfy surfaces now include:

```text
GET  /system_stats
GET  /queue
GET  /history
GET  /history/{prompt_id}
GET  /object_info
GET  /view
POST /prompt
POST /api/jobs/{prompt_id}/cancel
WS   /ws
```

`POST /upload/image` is deliberately not wired into Helix yet because semantic image staging is deferred until the workflow input contract stabilizes.

## VPS runtime

The Production runtime runs as:

```text
container: helix-runtime
image: helix-runtime:dev
host binding: 127.0.0.1:8787
networks: helix-network + n8n_default
runtime: Node 24 container
```

The current runtime API exposes:

```text
GET  /v1/health
GET  /v1/workers
GET  /v1/workers/:workerId
GET  /v1/workers/:workerId/live
GET  /v1/workers/:workerId/readiness
GET  /v1/workers/:workerId/health
POST /v1/media/jobs
GET  /v1/media/jobs/:jobId
POST /v1/media/jobs/:jobId/cancel
```

`POST /v1/media/jobs` accepts a raw Comfy API-format workflow and returns after durable acceptance/submission. Generation continues asynchronously.

`GET /v1/media/jobs/:jobId` returns compact generation state plus durable delivery rows and intentionally omits the stored workflow request.

## Dedicated runtime database

The VPS runs a dedicated private PostgreSQL database:

```text
container: helix-db
image: postgres:16-alpine
database: helix
private Docker network only
volume: helix-db-data
```

Applied runtime migrations currently provide:

```text
workers
worker_observations
media_jobs
media_job_events
media_deliveries
```

PostgreSQL is the durable Helix state. Comfy queue/history remain the execution source of truth used for reconciliation.

## Current adapter boundary

```text
WorkerService / JobService
        ↓
WorkerRegistry
        ↓
MediaAdapter
        ↓
ComfyAdapter
        ↓
ComfyClient
        ↓
ComfyUI
```

`ComfyClient` owns raw HTTP/WebSocket mechanics. `ComfyAdapter` normalizes Comfy execution into runtime semantics. n8n does not own Comfy polling or parse low-level node events.

## Proven job execution

The old "first runtime-controlled generation" milestone is complete.

The runtime now supports:

```text
durable job acceptance
        ↓
POST /prompt
        ↓
prompt_id persisted
        ↓
queue/history reconciliation
        ↓
running/completion state
        ↓
artifact discovery
        ↓
GET /view retrieval
        ↓
durable delivery state
```

Proven runtime-controlled generations include:

```text
job_d305b8b3b4aa4336a455b35043e3060a
  -> af67e3be-d307-4757-89fd-6606304c4c4d
  -> succeeded
  -> video/LTX-2.5_i2v_00004_.mp4
```

and:

```text
job_e2a4a9efff7a47b8b70cd41c068073ac
  -> cc8e51f4-1799-4600-8ff0-6226c2e291e4
  -> running observed live
  -> succeeded
  -> video/LTX-2.5_i2v_00005_.mp4
```

Restart recovery was proven by reconciling an unfinished/completed job after `helix-runtime` restarted.

## Cancellation and timeout

The pinned worker provides prompt-specific cancellation:

```text
POST /api/jobs/{prompt_id}/cancel
```

Helix exposes it through:

```text
POST /v1/media/jobs/:jobId/cancel
```

Terminal transitions are guarded so a late reconciler tick cannot overwrite a recorded `cancelled`, `succeeded`, `failed`, or `timed_out` state.

Running-job timeout reuses the cancellation path and is configured with:

```text
HELIX_JOB_TIMEOUT_SECONDS=3600
```

Only jobs already in `running` state consume this timeout. Queued jobs waiting for the single GPU are not timed out by this policy.

## Artifact delivery

Generation success and delivery success are separate durable states.

Validated delivery path:

```text
Comfy artifact
    ↓
/view retrieval
    ↓
VPS temporary spool
    ↓
ffprobe
    ↓
Telegram metadata message
    ↓
Telegram original MP4 as document
    ↓
persist message IDs
    ↓
remove VPS temporary copy
```

Delivery uses PostgreSQL claiming/retry state, stale-delivery recovery, and exponential backoff. Retries are capped at five attempts. Malformed artifact metadata is treated as a permanent failure immediately. Terminal delivery failures remain visible with no future retry time.

The proven C6 artifact completed Telegram delivery in one attempt and persisted both metadata and document message IDs.

Secrets remain outside Git in deployment environment files.

## Deferred infrastructure

The following are intentionally deferred rather than missing blockers:

- worker output retention cleanup;
- `/upload/image` staging;
- broad semantic prompt/relay/sampler bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking.

Worker-output retention is deferred because the traditional Comfy output path does not currently provide a clean runtime-controlled per-artifact delete primitive. Do not sweep the whole Comfy output tree, because manual/experimental outputs may coexist with Helix outputs.

Persistent WebSocket execution tracking remains optional because queue/history reconciliation already provides correctness and restart recovery.

## Current infrastructure checkpoint

Workflow-independent runtime infrastructure is complete enough to pause.

The next Production work is not another infrastructure layer. It is:

```text
continue I2V workflow optimization
        ↓
validate simple LTX 2.5 T2V
        ↓
discover the useful controls
        ↓
freeze stable workflow families later
        ↓
add semantic Helix bindings afterward
```

Raw Comfy API-format graphs remain the temporary execution contract while workflow research continues.

## Operational rules

1. Keep ComfyUI Desktop installed but normally closed. Desktop and CLI should not run heavy generations simultaneously.
2. Avoid competing GPU inference workloads during LTX generation.
3. Do not auto-update ComfyUI or custom nodes.
4. Before any worker upgrade, record commits/packages and run a known smoke generation afterward.
5. Keep raw ComfyUI private over Tailscale; do not expose `8188` publicly.
6. Keep `maxConcurrentGpuJobs: 1` on this RTX 4060 worker until deliberate concurrency testing says otherwise.
7. Keep Comfy API workflow JSON as the execution asset. Do not rewrite workflow graphs as Python.
8. Do not move model storage or delete migration backups while this execution path is being stabilized.
9. Do not let n8n own low-level Comfy job tracking.
10. Do not commit runtime/database/Telegram secrets.
11. Do not freeze/package the experimental I2V graph until a stable baseline is explicitly chosen.
12. Do not force semantic input bindings while the workflow control surface is still changing.
