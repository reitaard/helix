# Infrastructure

Infrastructure should support proven execution needs rather than speculative architecture.

As of 2026-08-26 the active Production infrastructure is a dedicated standalone ComfyUI GPU worker plus the VPS-side `helix-runtime`, its dedicated PostgreSQL database, durable Telegram artifact delivery, and one durable operator-facing media-reference namespace shared by Helix jobs and Comfy-only artifacts.

For the focused worker/runtime roadmap, see:

- [`production/comfyui-worker/README.md`](../production/comfyui-worker/README.md)
- [`production/media-runtime/README.md`](../production/media-runtime/README.md)

## Current Production execution path

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ↓
WorkerService + JobService
    ├── helix-db
    │   ├── workers
    │   ├── worker_observations
    │   ├── media_jobs
    │   ├── media_references
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
- Production profiles: `nolan` / Christopher Nolan and `leibovitz` / Annie Leibovitz
- validated capabilities: `video.i2v`, `video.t2v`, `image.t2i`
- max concurrent GPU jobs: `1`

LTX `2.3` and `2.5` model-family assets are available. LTX `2.5` is the validated standalone video execution path. FLUX.2 Klein 4B Distilled FP8 is the validated narrow T2I path.

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

Heavy model assets are consolidated under:

```text
C:\AI\Models\LTX
C:\AI\Models\WAN
C:\AI\Models\FLUX
```

and exposed to the standalone runtime through `extra_model_paths.yaml`.

## Frozen known-good environment

ComfyUI core:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

Important known-good package pins include:

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

Validated Comfy surfaces include:

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

Applied runtime migrations through `0012_media_references.sql` currently provide:

```text
workers + worker_observations
media_jobs + media_job_events + media_deliveries
operator alerts/cursors/worker transition state
operator cancellation, T2V, T2I, and reset pending state
persisted T2V/T2I settings and T2V generation modes
logical Production Profile identity on jobs
unique sequential media_jobs.job_number
media_references sharing media_jobs_job_number_seq
```

Migration `0011_job_numbers.sql` introduced the public `BIGINT` sequence and backfilled the first 51 Helix jobs chronologically. Migration `0012_media_references.sql` reserves those existing Job numbers in `media_references`, registers future Helix jobs automatically, and lets completed Comfy-only history entries allocate from the same sequence when Helix first discovers them.

The operator-facing invariant is:

```text
one number -> one media execution
```

A number cannot identify a Helix job in one command and a different Comfy artifact in another. Helix-managed jobs remain truthful `media_jobs` rows. Direct ComfyUI generations do not create fake jobs; they persist only a `kind = 'comfy_artifact'` reference mapping to the Comfy Prompt ID.

This allows the same numeric reference to work across Downloads and Job/media detail:

```text
/dl i 52
/dl g 52
/jb 52
```

Legacy Comfy Prompt prefixes remain accepted for compatibility, but they are no longer the operator-facing identity once an artifact has been registered.

PostgreSQL is the durable Helix state. Comfy queue/history remain the execution source of truth used for reconciliation and live artifact discovery.

Before migration `0012` was applied, a custom-format PostgreSQL backup was created at the VPS and the migration backfilled 51 existing `job` references successfully.

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

The runtime supports:

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

Restart recovery has been proven by reconciling unfinished/completed jobs after `helix-runtime` restarted.

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
Telegram original file/document
    ↓
persist message ID
    ↓
remove VPS temporary copy
```

Delivery uses PostgreSQL claiming/retry state, stale-delivery recovery, and exponential backoff. Retries are capped at five attempts. Malformed artifact metadata is treated as a permanent failure immediately. Terminal delivery failures remain visible with no future retry time.

Secrets remain outside Git in deployment environment files.

## Deferred infrastructure

The following remain deliberately deferred:

- worker output retention cleanup;
- `/upload/image` staging;
- persistent WebSocket execution tracking;
- production service authentication before broader remote-client exposure;
- migration ledger/checksum automation and CI enforcement.

Worker-output retention is deferred because the traditional Comfy output path does not currently provide a clean runtime-controlled per-artifact delete primitive. Do not sweep the whole Comfy output tree, because manual/experimental outputs may coexist with Helix outputs.

Persistent WebSocket execution tracking remains optional because queue/history reconciliation already provides correctness after a backend Prompt ID has been persisted.

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
11. Preserve one global numeric media-reference namespace; never introduce a second independent operator ID sequence.
12. Do not represent direct ComfyUI history as fake Helix lifecycle jobs.
