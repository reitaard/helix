# ComfyUI Worker

This folder records the active ComfyUI execution workstream only.

The goal of this workstream is narrow: make Helix able to submit a job to the dedicated ComfyUI worker, track it, and return generated assets reliably.

It does not define the rest of Helix.

## Current deployed path

```text
n8n / caller
    ↓
helix-runtime :8787
    ↓
WorkerService
    ├── helix-db
    │   ├── workers
    │   ├── worker_observations
    │   ├── media_jobs
    │   └── media_job_events
    │
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
    ↓
C:\AI\ComfyUI-CLI\output
```

## Current worker

```text
workerId: helix-rtx4060-01
profile: comfy-video-ltx-stable
GPU: RTX 4060
VRAM: 8188 MiB
ComfyUI: 0.33.0
Python: 3.12.11
PyTorch: 2.10.0+cu130
capability: video.i2v
max concurrent GPU jobs: 1
```

LTX 2.3 and 2.5 assets are available. LTX 2.5 is the validated standalone generation path.

## What already works

- standalone ComfyUI worker on Windows;
- pinned known-good ComfyUI/custom-node environment;
- worker startup task and diagnostics;
- private Tailscale connectivity from the VPS;
- HTTP and WebSocket access to ComfyUI;
- n8n -> helix-runtime connectivity;
- `GET /v1/workers/:workerId/live` cheap liveness probe;
- `GET /v1/workers/:workerId/readiness` full Comfy readiness probe;
- worker readiness persistence in dedicated PostgreSQL `helix-db`;
- `MediaAdapter -> ComfyAdapter -> ComfyClient` boundary;
- successful native LTX 2.5 generations on the standalone worker.

Observed on 2026-08-22:

```text
/live       ~410 ms
/readiness  ~3.2 s
node classes: 1219
worker state: cold_ready
```

`/readiness` is intentionally heavier because it checks `/system_stats`, `/queue`, `/object_info`, and `/ws`.

## Immediate target

The next milestone is the first generation submitted through `helix-runtime`, not manually from the ComfyUI UI.

For the first implementation, keep the contract close to ComfyUI instead of inventing a large workflow abstraction prematurely.

```text
caller
  ↓
create job
  ↓
persist accepted job
  ↓
submit Comfy API workflow JSON to /prompt
  ↓
store Comfy prompt_id
  ↓
track queue/execution over WebSocket + history
  ↓
discover output files
  ↓
record artifacts
  ↓
return completed job + assets
```

## Focused roadmap

### 1. Job acceptance

Implement a small durable job API in `production/media-runtime`.

Initial requirements:

- create a job ID;
- persist the request in `media_jobs`;
- create the first `media_job_events` record;
- accept a Comfy API-format workflow graph;
- optionally accept an idempotency key;
- return the job immediately instead of holding the HTTP request open for the full generation.

Do not add multi-provider routing or a general scheduler for this first worker.

### 2. Comfy prompt submission

Extend `ComfyClient` with the execution surfaces actually needed by the worker:

```text
POST /prompt
GET  /history/{prompt_id}
GET  /view
WS   /ws
```

`ComfyAdapter` should translate these into the runtime's job lifecycle and keep raw Comfy response/event shapes below the adapter boundary.

The first successful submission should store Comfy's `prompt_id` as `backend_job_id`.

### 3. Execution tracking

Track one GPU job at a time and persist state changes.

Target lifecycle for this worker:

```text
accepted
  ↓
queued
  ↓
running
  ↓
finalizing
  ↓
succeeded
```

Terminal failures:

```text
failed
cancelled
```

Use WebSocket events for live execution tracking and `/history/{prompt_id}` as the authoritative completion/output reconciliation path.

### 4. Output/artifact capture

When Comfy finishes:

- inspect the prompt history outputs;
- capture filename, subfolder, type and node source where available;
- keep the original file in the worker output directory initially;
- persist artifact metadata against the Helix job;
- expose the asset through a runtime endpoint or controlled `/view` proxy.

Do not introduce object storage until the basic worker job path is proven.

### 5. Input assets for I2V

After raw workflow submission works, add input staging for image-to-video jobs.

Expected Comfy surface:

```text
POST /upload/image
```

The runtime should upload/stage an image once, receive the worker-side filename, and inject that filename into the submitted API workflow.

For the first smoke generation it is acceptable to reference an image already present in the worker input directory.

### 6. Recovery and cancellation

After one complete job succeeds:

- reconcile jobs after runtime restart using stored `backend_job_id`;
- distinguish queued versus running jobs;
- add cancellation/interrupt behavior deliberately;
- mark jobs failed when the worker becomes unavailable or Comfy reports execution errors;
- preserve error/event details in `media_job_events`.

### 7. Freeze the first workflow only when ready

The currently tested LTX graphs remain experimental.

Do not package node bindings until one workflow is selected as the first worker execution baseline.

When that happens, move from raw API JSON submission to a versioned workflow package containing at minimum:

```text
workflow.api.json
manifest.yaml
bindings.yaml
smoke-test.json
```

The existing `production/ltx-director/` notes remain research/test history until that freeze point.

## Current non-goals

For this workstream, do not spend time on:

- other Helix subsystems;
- multi-provider generation;
- general-purpose scheduling;
- Redis/RabbitMQ/Kubernetes;
- public exposure of ComfyUI;
- moving model directories while the worker is stable;
- auto-updating ComfyUI/custom nodes;
- large workflow abstractions before the first API-submitted generation succeeds.

## Operational rules

- Raw ComfyUI remains private over Tailscale; do not expose port `8188` publicly.
- Keep ComfyUI Desktop closed while the standalone CLI worker is running.
- Avoid competing GPU workloads such as LM Studio during LTX generation.
- Keep `maxConcurrentGpuJobs: 1` for the RTX 4060 worker.
- Keep the known-good pinned environment until a deliberate upgrade test is performed.
- Treat `C:\AI\ComfyUI-CLI\input` and `output` as worker-local scratch/staging until artifact retention is implemented.

## Naming

Keep these names for now:

```text
helix-runtime          VPS execution API/service
helix-db               runtime PostgreSQL
helix-rtx4060-01       physical ComfyUI worker
ComfyAdapter           Comfy-specific runtime adapter
ComfyClient            raw Comfy HTTP/WebSocket transport
```

`production/media-runtime` should also stay unchanged for now because it is already deployed and contains the execution service. Renaming it just to make it Comfy-specific would create churn without helping the first generation milestone.

One later cleanup is worth considering: once the LTX workflow experiments are frozen, move `production/ltx-director/` under a ComfyUI workflow area such as `production/comfyui-worker/workflows/ltx-director/`. Do not move it while the experiment notes and links are still active.
