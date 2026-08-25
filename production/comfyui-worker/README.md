# ComfyUI Worker

This folder records the active ComfyUI execution workstream only.

The goal is to keep the dedicated ComfyUI GPU worker reliable while workflow experiments continue changing. It does not define the rest of Helix.

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
Telegram original document + caption
```

## Stable worker

```text
workerId: helix-rtx4060-01
physical-worker display name: Helix RTX 4060
Production Profile: nolan / Christopher Nolan
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
GPU: RTX 4060
VRAM: 8188 MiB
ComfyUI: 0.33.0
Python: 3.12.11
PyTorch: 2.10.0+cu130
validated capabilities: video.i2v, video.t2v
max concurrent GPU jobs: 1
```

The durable ID remains `helix-rtx4060-01`; `Christopher Nolan` is a configurable human-facing name.

LTX 2.3 and 2.5 assets are available. LTX 2.5 is the validated generation path.

## Installation/update model

The worker is a standalone manual Git + Python virtual-environment ComfyUI install at:

```text
C:\AI\ComfyUI-CLI
```

The folder name is historical/convenience naming. The separate `comfy-cli` Python package is not installed, and ComfyUI-Manager is not enabled on this worker.

The production worker is intentionally pinned at a detached Git revision. Read-only update awareness and actual worker updates are separate operations.

Safe check-only flow:

```powershell
cd C:\AI\ComfyUI-CLI
git fetch origin
git status
git log HEAD..origin/master --oneline
```

A real update should be deliberate rather than automatic:

```text
record current pin
    ↓
git fetch + inspect upstream changes
    ↓
move to the chosen revision
    ↓
refresh requirements if needed
    ↓
restart ComfyUI
    ↓
validate LTX/custom nodes/models
    ↓
change the Helix production revision pin only after validation
```

`helix-runtime` reports upstream drift through `/status` by comparing the configured pinned revision with official `Comfy-Org/ComfyUI` `master`. This is informational only and never mutates the worker.

## Live diagnostics

Comfy `/system_stats` is the source of the live backend/system data displayed by Helix. The runtime currently surfaces:

- ComfyUI version;
- Python version;
- PyTorch version;
- GPU name;
- dedicated VRAM total/free;
- host RAM total/free.

Windows Task Manager shared-GPU-memory usage is not exposed by Comfy `/system_stats`, so Helix does not invent or estimate a shared-memory value.

The current Telegram presentation maps internal `cold_ready` to the operator-friendly state `Idle` while preserving the internal state model.

A transient WebSocket events-probe timeout is advisory. Runtime reachability, queue access and capability inspection determine whether the worker is execution-ready.

## Completed foundation

- standalone pinned ComfyUI worker on Windows;
- private Tailscale connectivity from VPS to Comfy;
- HTTP and WebSocket connectivity;
- `helix-runtime` container on `127.0.0.1:8787`;
- dedicated PostgreSQL `helix-db`;
- worker registration and readiness persistence;
- human-friendly configurable worker name;
- cheap `/live` and heavier `/readiness` probes;
- live system diagnostics including host RAM and VRAM;
- direct queue summary for lightweight operator checks;
- read-only pinned-revision/upstream drift reporting;
- `MediaAdapter -> ComfyAdapter -> ComfyClient` boundary;
- durable media jobs/events;
- Comfy `POST /prompt` submission;
- Comfy `prompt_id` persisted as backend job ID;
- asynchronous job API;
- queue/history reconciliation;
- restart recovery;
- live `queued -> running -> succeeded` tracking;
- artifact metadata capture from Comfy history;
- semantic `LoadImage` override source;
- artifact file retrieval through Comfy `/view`;
- durable `media_deliveries` state;
- Telegram original MP4 document delivery with metadata in the same caption;
- ffprobe metadata inspection for resolution/duration/size/audio state;
- delivery retries with durable claim state;
- immediate VPS spool cleanup after every attempt;
- prompt-specific cancellation through the pinned Comfy job API;
- race-safe cancelled terminal state;
- configurable running-job timeout;
- delivery state exposed through the media-job API;
- maximum five Telegram delivery attempts;
- permanent malformed-artifact failures stop without retrying forever;
- Telegram diagnostics/debug/operator commands;
- durable confirmed Telegram cancellation;
- durable confirmed native LTX 2.5 T2V submission;
- tool-aware Telegram artifact captions.

## Proven generations

First runtime-controlled replay:

```text
job_d305b8b3b4aa4336a455b35043e3060a
  -> af67e3be-d307-4757-89fd-6606304c4c4d
  -> succeeded
  -> video/LTX-2.5_i2v_00004_.mp4
```

C6 hybrid run:

```text
job_e2a4a9efff7a47b8b70cd41c068073ac
  -> cc8e51f4-1799-4600-8ff0-6226c2e291e4
  -> running observed live
  -> succeeded
  -> video/LTX-2.5_i2v_00005_.mp4
```

Native LTX 2.5 T2V production run:

```text
job_b270eea4177746d881c0c96d0f2f4b35
  -> video.t2v
  -> succeeded
  -> video/LTX_2.5_t2v_00001_.mp4
  -> 1280×704 / 5.0s / audio present
  -> Telegram delivered in 1 attempt
  -> 4m 10s runtime
```

The T2V run proved the complete Telegram intent -> durable Helix job -> native LTX generation -> reconciliation -> original-file Telegram delivery path.

## Execution/recovery model

Correctness comes from Comfy history and queue state:

```text
PostgreSQL job
    ↓
backend_job_id / prompt_id
    ↓
/history/{prompt_id}
    +
/queue
    ↓
reconcile durable state
```

This means `helix-runtime` can restart and recover unfinished/completed jobs. Persistent WebSocket tracking can be added later for lower latency, but is not required for correctness.

Running jobs can also be cancelled through the prompt-specific Comfy cancellation endpoint. Helix persists `cancelled` as a terminal state and protects it from late reconciler transitions.

A configurable running timeout reuses the same cancellation path. The deployed value is currently 3600 seconds; queued jobs do not consume this timeout.

## Output delivery state

The current output path is:

```text
Comfy artifact
    ↓
/view retrieval
    ↓
VPS temporary spool
    ↓
ffprobe
    ↓
Telegram sendDocument
    ├── original MP4 file
    └── metadata caption
    ↓
durable document message ID
    ↓
spool removed
```

Generation success and delivery success remain separate states.

Delivery retries are bounded:

```text
attempt 1 failure -> retry after 30s
attempt 2 failure -> retry after 60s
attempt 3 failure -> retry after 120s
attempt 4 failure -> retry after 240s
attempt 5 failure -> terminal failed
```

Malformed artifact metadata is treated as a permanent delivery error immediately. A terminal delivery failure remains visible as `status = failed` with `nextAttemptAt = null` and is not claimed again.

## Current T2V input state

Telegram `/t2v` now provides a guarded native LTX 2.5 T2V path:

```text
/t2v
  ↓
awaiting prompt
  ↓
prompt preview
  ↓
yes / no
  ↓ yes
video.t2v submission
```

Pending prompt/confirmation state is durable in `operator_pending_t2v`. No GPU job exists until the operator confirms `yes`.

The deployment-managed workflow lives at:

```text
/opt/helix-runtime/workflows/video_ltx2_5_t2v.api.json
```

It is intentionally not frozen into Git yet.

The first semantic binding changes only the positive prompt at `405:376.inputs.value`. Helix verifies that prompt enhancement at `405:383` remains disabled before submission.

Current fixed baseline:

```text
aspect:      16:9
resolution:  0.9 MP selector baseline
fps:         24
duration:    5 seconds
enhance:     off
negative:    workflow-defined
sampler:     workflow-defined
models:      workflow-defined
```

The next Production task is to add a small durable T2V settings layer without exposing raw Comfy node IDs. The initial semantic surface should concentrate on:

```text
aspect
quality / resolution preset
duration
prompt enhancement
```

FPS remains fixed at 24 for the initial settings surface. Seed, negative prompt, sampler/scheduler/model controls remain internal/advanced until experiments prove that they deserve stable user-facing semantics.

## Input state: keep semantic expansion narrow

The existing semantic image override remains useful, but actual `/upload/image` staging and broader I2V workflow bindings remain postponed while the LTX graphs are still being optimized.

Future I2V graphs may expose more prompt, Prompt Relay, sampler, Director, or temporal controls. Keep raw Comfy API workflow submission available and avoid hard-coding an unstable large input schema.

When workflow families stabilize, add semantic bindings around the chosen graphs rather than temporary node layouts.

## C6 workflow note

The experimental executable graph currently lives on the VPS at:

```text
/opt/helix-runtime/workflows/c6.api.json
```

It is not frozen into the repository.

The export had 54 nodes. A serialization mismatch was caught before generation: `temporal_overlap_cond_strength` exported as `0.5` even though the UI named value showed `0.35`. The test API copy was corrected to `0.35`, then successfully generated.

Do not freeze/package this workflow until a stable baseline is explicitly chosen.

## Focused roadmap

```text
Worker install/freeze                 DONE
Local LTX generation                  DONE
Private VPS connectivity              DONE
Runtime liveness/readiness            DONE
Dedicated DB + persistence            DONE
Durable job acceptance                DONE
POST /prompt                          DONE
prompt_id persistence                 DONE
Running/completion reconciliation     DONE
Restart recovery                      DONE
Artifact metadata capture             DONE
Semantic image override source        DONE
Artifact file retrieval               DONE
Telegram delivery                     DONE
Durable delivery retry/state          DONE
VPS temporary cleanup                 DONE
Media job cancellation                DONE
Running-job timeout                   DONE
Delivery status observability         DONE
Delivery retry cap                    DONE
Permanent delivery failure handling   DONE
Telegram runtime diagnostics          DONE
Live RAM/VRAM reporting               DONE
Read-only Comfy update awareness      DONE
Native LTX 2.5 T2V path               DONE
T2V pre-submit confirmation           DONE

T2V settings contract                 NEXT
Worker retention cleanup              DEFERRED
Image upload / staging                DEFERRED
Broader I2V prompt/relay/sampler       DEFERRED
Persistent WS tracking                OPTIONAL LATER
Freeze workflow package               ONLY AFTER BASELINE IS CHOSEN
```

## Current pause point

The workflow-independent runtime, Telegram operational checkpoint, and first native T2V production loop are proven.

The next Production task is the T2V settings contract and workflow binder. Keep it small and semantic: map operator concepts to vetted workflow controls without making Comfy node IDs part of the public interface.

Worker-output retention remains deferred rather than adding a worker-side deletion service just for cleanup. VPS temporary copies are already removed after every delivery attempt.

One operational validation remains pending: the Windows scheduled task has been started successfully by hand, but a real reboot -> automatic ComfyUI worker startup has not yet been proven.

## Operational rules

- Raw ComfyUI remains private over Tailscale; do not expose port `8188` publicly.
- Keep `maxConcurrentGpuJobs: 1` for the RTX 4060 worker.
- Preserve durable ID `helix-rtx4060-01`; presentation names may change independently.
- Keep the Comfy revision pinned until an update has been explicitly inspected and validated.
- Do not auto-update ComfyUI from Telegram or the runtime.
- Do not alter the pinned custom-node/model stack casually.
- Avoid competing GPU workloads during LTX generation.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not package/freeze experimental LTX workflows yet.
- Keep operator-facing T2V settings semantic; raw node IDs stay inside the Production workflow binder.

## Logical Production Profiles

`helix-rtx4060-01` is one physical RTX 4060/ComfyUI worker and remains limited
to one concurrent GPU job. Helix maps logical profiles onto that same endpoint:
`nolan` (Christopher Nolan, validated LTX video) and `leibovitz` (Annie
Leibovitz, future FLUX.2 Klein 4B Distilled image generation). Leibovitz does
not have a separate GPU, Comfy instance, queue, or validation claim. The
runtime expects the separately supplied Distilled FP8 API workflow at the
configured `HELIX_T2I_WORKFLOW_PATH` (default
`/app/workflows/image_flux2_klein_4b_distilled_fp8_t2i_v2.api.json`). The
operator must install it, apply migration `0010`, deploy, and complete a real
Telegram T2I generation before this model is considered validated.
