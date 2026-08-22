# Infrastructure

Infrastructure should support proven execution needs rather than speculative architecture.

As of 2026-08-22 the active Production infrastructure is a dedicated ComfyUI GPU worker plus the VPS-side `helix-runtime` and its dedicated PostgreSQL database.

For the focused worker roadmap, see [`production/comfyui-worker/README.md`](../production/comfyui-worker/README.md).

## Dedicated ComfyUI GPU worker

Current private execution path:

```text
n8n / caller
    ↓
helix-runtime :8787
    ↓
WorkerService
    ├── helix-db
    ↓
WorkerRegistry
    ↓
MediaAdapter
    ↓
ComfyAdapter
    ↓
ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
    ↓
media output
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
- current capability: `video.i2v`
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

The captured worker currently exposes 1219 ComfyUI node classes.

## Startup

Windows Task Scheduler contains:

```text
Task name: Helix ComfyUI Worker
Trigger: AtStartup
Account: SYSTEM
Run level: Highest
Restart on failure: 1 minute
```

It launches `C:\AI\start-comfy.ps1`, which starts the standalone ComfyUI CLI installation on port `8188`.

Manual scheduled-task startup has been validated. An actual Windows reboot/AtStartup validation is still pending and should not be claimed as complete until tested.

## Connectivity validation

Validated paths:

- worker-local HTTP;
- worker-local WebSocket;
- main Windows PC -> worker over Tailscale;
- VPS host -> worker over Tailscale;
- n8n container -> VPS runtime;
- `helix-runtime` -> worker HTTP + WebSocket.

Validated Comfy surfaces include:

```text
GET /system_stats
GET /queue
GET /history
GET /object_info
WS  /ws
```

The next execution surfaces to implement through the runtime are:

```text
POST /prompt
GET  /history/{prompt_id}
GET  /view
POST /upload/image
```

## VPS runtime

The temporary `helix-probe` used during connectivity validation has been removed.

The real runtime now runs as:

```text
container: helix-runtime
host binding: 127.0.0.1:8787
network: n8n_default + helix-network
runtime: Node 24 container
```

The current runtime exposes:

```text
GET /v1/health
GET /v1/workers
GET /v1/workers/:workerId
GET /v1/workers/:workerId/live
GET /v1/workers/:workerId/readiness
GET /v1/workers/:workerId/health
```

`/live` is the cheap liveness path and has been observed around `410 ms`.

`/readiness` checks `/system_stats`, `/queue`, `/object_info`, and `/ws`; it has been observed around `3.2 s` with 1219 node classes and an idle worker state of `cold_ready`.

## Dedicated runtime database

The VPS also runs:

```text
container: helix-db
image: postgres:16-alpine
database: helix
private Docker network only
```

Migration `0001_runtime_core.sql` has been applied successfully and currently creates:

```text
workers
worker_observations
media_jobs
media_job_events
```

Worker readiness observations are already persisted. The job tables are present but runtime job submission/execution is the next implementation target.

## Current adapter boundary

```text
WorkerService
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

`ComfyClient` should own raw HTTP/WebSocket mechanics. `ComfyAdapter` should normalize Comfy execution into runtime job semantics. The worker/runtime should not require n8n to parse Comfy node events directly.

## Current generation status

The standalone worker has completed successful native LTX 2.5 generations. Existing workflow experiments are documented under `production/ltx-director/`.

The important missing milestone is no longer local generation itself. It is the first generation submitted and tracked through `helix-runtime`.

Target path:

```text
caller
  ↓
durable runtime job
  ↓
Comfy POST /prompt
  ↓
prompt_id
  ↓
WebSocket/history tracking
  ↓
output discovery
  ↓
persisted asset metadata
```

## Operational rules

1. Keep ComfyUI Desktop installed but normally closed. Desktop and CLI should not run heavy generations simultaneously.
2. Avoid competing GPU inference workloads such as LM Studio during LTX generation.
3. Do not auto-update ComfyUI or custom nodes.
4. Before any worker upgrade, record commits/packages and run a known smoke generation afterward.
5. Keep raw ComfyUI private over Tailscale; do not expose `8188` publicly.
6. Keep `maxConcurrentGpuJobs: 1` on this RTX 4060 worker until deliberate concurrency testing says otherwise.
7. Keep Comfy API workflow JSON as the execution asset. Do not rewrite workflow graphs as Python.
8. For the next milestone, prefer a direct raw API-workflow submission path over a large workflow/package abstraction.
9. Do not move model storage or delete migration backups while this execution path is being stabilized.

## Immediate infrastructure target

Only build what is required for this worker to accept a job and produce a retrievable asset:

```text
job acceptance
→ /prompt submission
→ prompt tracking
→ output capture
→ input staging
→ cancellation/recovery
→ freeze first stable workflow
```
