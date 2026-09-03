# ComfyUI Worker

This folder records the active physical ComfyUI execution worker. It does not define the rest of Helix.

## Current path

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ↓
helix-db
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
    ↓
C:\AI\ComfyUI-CLI\output
    ↓
VPS temporary spool
    ↓
Telegram original artifact delivery
```

## Stable physical worker

```text
workerId: helix-rtx4060-01
physical display name: Helix RTX 4060
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
GPU: RTX 4060
VRAM: 8188 MiB
ComfyUI: 0.33.0
Python: 3.12.11
PyTorch: 2.10.0+cu130
physical GPU concurrency: 1
```

Logical Production Profiles share this one endpoint/queue/GPU:

```text
nolan / Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz / Annie Leibovitz
-> image.t2i
```

The durable worker ID is infrastructure identity. Christopher Nolan and Annie Leibovitz are logical Production/operator identities, not separate workers.

`lowry / John D. Lowry` is currently only an **upscaling research candidate**. It is not registered as a Production profile and does not own a runtime capability yet.

## Installation/update model

The worker is a standalone manual Git + Python virtual-environment ComfyUI installation at:

```text
C:\AI\ComfyUI-CLI
```

The production worker is intentionally pinned at a detached Git revision. Read-only upstream awareness and actual worker updates are separate operations.

Safe check-only flow:

```powershell
cd C:\AI\ComfyUI-CLI
git fetch origin
git status
git log HEAD..origin/master --oneline
```

A real update remains deliberate:

```text
record current pin
    ↓
fetch + inspect upstream
    ↓
move to chosen revision
    ↓
refresh dependencies if required
    ↓
restart ComfyUI
    ↓
validate known workflows/custom nodes/models
    ↓
update the Helix production pin only after validation
```

Helix update awareness is informational only and must never auto-mutate the worker.

## Current validated execution foundation

Completed worker/runtime capabilities include:

- standalone pinned ComfyUI worker on Windows;
- private Tailscale connectivity from the VPS;
- HTTP and WebSocket connectivity;
- runtime liveness/readiness diagnostics;
- durable media jobs/events/delivery state in PostgreSQL;
- Comfy `/prompt` submission and Prompt-ID persistence;
- queue/history reconciliation and restart recovery;
- artifact discovery and `/view` retrieval;
- cancellation and running-job timeout;
- original-file Telegram delivery with bounded retry;
- Telegram operator diagnostics and guarded actions;
- durable native LTX 2.5 T2V generation;
- persisted semantic T2V settings and reset behavior;
- Manual/Fast/Quality T2V modes;
- logical Annie Leibovitz T2I generation;
- one shared numeric media-reference namespace for Helix and direct Comfy artifacts;
- forum-topic generation code and newer lifecycle/progress code in the repository;
- persistent Comfy execution WebSocket telemetry in the repository implementation.

The old roadmap statements that T2V settings were "NEXT" and persistent WebSocket tracking was only optional future work are obsolete.

## Proven Production paths

### Native LTX 2.5 T2V

The end-to-end path has been proven:

```text
Telegram intent
    ↓
confirmed Helix job
    ↓
native LTX 2.5 T2V
    ↓
queue/history reconciliation
    ↓
artifact retrieval
    ↓
Telegram original-file delivery
```

Current semantic baseline includes aspect, quality, duration, prompt enhancement, FPS, two seeds, negative prompt, megapixel override, sampler, and guidance. Prompt Enhance is generally kept OFF for directed Helix prompts.

### FLUX.2 Klein T2I

The current runtime workflow candidate is FLUX.2 Klein 4B INT8 W8A8. The prior Distilled FP8 workflow remains installed as a rollback path and was validated earlier.

The narrow T2I binder mutates only prompt, width, height, and seed from semantic prompt/aspect/seed inputs.

## Experimental upscaling research state

The worker currently contains experimental assets used only for controlled upscaling research.

SeedVR2 custom node:

```text
numz/ComfyUI-SeedVR2_VideoUpscaler
version: v2.5.23
commit: 5a4bf428f3735cc72ac760d40f372f94dec28422
```

Research models include:

```text
seedvr2_ema_7b_fp16.safetensors
seedvr2_ema_7b_sharp_fp16.safetensors
ema_vae_fp16.safetensors
```

The 7B FP16 model has been proven runnable on the 8 GB worker with aggressive CPU offload/BlockSwap and tiled VAE operation. That is an experimental feasibility result, **not** a Production validation.

Video tests showed too little benefit on clean LTX output for the compute cost, so video integration is halted. Image tests also showed SeedVR2 behaving conservatively on clean FLUX images.

Current image research has therefore moved to controlled generative enhancement with the already-working FLUX.2 Klein 4B INT8 W8A8 stack before adding another model family.

Canonical research details and benchmark instructions live in:

- [`../upscaling/README.md`](../upscaling/README.md)
- [`../upscaling/KLEIN4B_ENHANCEMENT_TEST.md`](../upscaling/KLEIN4B_ENHANCEMENT_TEST.md)

Do not infer `image.upscale` or `video.upscale` Production capability from these installed research assets.

## Execution/recovery model

Durable correctness remains:

```text
PostgreSQL media job
    ↓
backend_job_id / prompt_id
    ↓
Comfy /history/{prompt_id}
    +
/queue
    ↓
reconcile durable state
```

The newer persistent WebSocket path improves execution presentation/latency but does not replace this correctness model.

## Persistent execution WebSocket

The repository runtime now maintains a persistent execution WebSocket with a stable Helix client identity and submits the same client identity with `/prompt`. This allows normalized Comfy execution/progress events to feed Telegram lifecycle presentation.

WebSocket progress is advisory. Queue/history plus PostgreSQL remain authoritative, and a WebSocket disconnect must not invalidate a running job.

## Worker startup

Windows Task Scheduler contains an AtStartup task that launches the standalone ComfyUI worker.

Manual task startup has been validated. A **real Windows reboot -> automatic AtStartup validation is still pending** and must not be claimed complete until tested.

## Filesystem and model storage

Worker root:

```text
C:\AI\ComfyUI-CLI\
```

Heavy model assets are consolidated under paths such as:

```text
C:\AI\Models\LTX
C:\AI\Models\WAN
C:\AI\Models\FLUX
```

Keep migration/rollback backups until the standalone worker has been stable long enough that an explicit cleanup decision is made.

## Known-good environment

Pinned Comfy core:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

Important known-good package pins include the current PyTorch/CUDA stack and the validated Kornia compatibility pin. Do not casually upgrade the worker environment while workflow compatibility is still being actively researched.

## Current deferred worker work

- output-retention cleanup;
- broader `/upload/image` staging and I2V/reference ingestion;
- real reboot/AtStartup proof;
- deliberate Comfy/custom-node upgrade validation when needed;
- Production integration of any upscale capability until the research benchmark is closed.

Do not sweep the whole Comfy output directory: manual/experimental artifacts may coexist with Helix outputs.

## Operational rules

- Keep raw ComfyUI private over Tailscale; do not expose `8188` publicly.
- Keep physical GPU concurrency at one until deliberate concurrency testing says otherwise.
- Preserve durable ID `helix-rtx4060-01` independently from presentation names.
- Keep the Comfy revision pinned until an update is explicitly inspected and validated.
- Do not auto-update ComfyUI/custom nodes from Telegram or runtime code.
- Avoid competing GPU workloads during generation.
- Do not let n8n own low-level Comfy tracking.
- Do not store tokens or secrets in Git.
- Keep operator-facing workflow controls semantic; raw node IDs belong inside binders/adapters.
- Treat persistent WebSocket events as presentation telemetry, not durable execution truth.
- Keep experimental research assets distinct from Production capabilities.

For current system-wide Production state, see [`../README.md`](../README.md) and [`../../docs/PROJECT_STATE.md`](../../docs/PROJECT_STATE.md).
