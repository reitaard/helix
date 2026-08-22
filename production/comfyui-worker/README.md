# ComfyUI Worker

This folder records the active ComfyUI execution workstream only.

The goal is to keep the dedicated ComfyUI GPU worker reliable while workflow experiments continue changing. It does not define the rest of Helix.

## Current path

```text
caller / n8n
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
Telegram
```

## Stable worker

```text
workerId: helix-rtx4060-01
profile: comfy-video-ltx-stable
GPU: RTX 4060
VRAM: 8188 MiB
ComfyUI: 0.33.0
Python: 3.12.11
PyTorch: 2.10.0+cu130
validated capability: video.i2v
max concurrent GPU jobs: 1
```

LTX 2.3 and 2.5 assets are available. LTX 2.5 is the validated generation path.

## Completed foundation

- standalone pinned ComfyUI worker on Windows;
- private Tailscale connectivity from VPS to Comfy;
- HTTP and WebSocket connectivity;
- `helix-runtime` container on `127.0.0.1:8787`;
- dedicated PostgreSQL `helix-db`;
- worker registration and readiness persistence;
- cheap `/live` and heavier `/readiness` probes;
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
- Telegram metadata message + original MP4 document delivery;
- ffprobe metadata inspection for resolution/duration/size/audio state;
- delivery retries with durable claim state;
- immediate VPS spool cleanup after every attempt;
- prompt-specific cancellation through the pinned Comfy job API;
- race-safe cancelled terminal state;
- configurable running-job timeout;
- delivery state exposed through the media-job API;
- maximum five Telegram delivery attempts;
- permanent malformed-artifact failures stop without retrying forever.

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

The C6 run started `2026-08-22T09:37:16.915Z` and finished `2026-08-22T09:46:04.486Z`.

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

The complete output path is validated:

```text
Comfy artifact
    ↓
/view retrieval
    ↓
VPS temporary spool
    ↓
ffprobe
    ↓
Telegram metadata
    ↓
Telegram document
    ↓
durable message IDs
    ↓
spool removed
```

Generation success and delivery success remain separate states.

`GET /v1/media/jobs/:jobId` now returns the durable delivery rows alongside the generation state, including provider, status, attempt count, Telegram message IDs, errors, retry time, and delivery timestamps.

Delivery retries are bounded:

```text
attempt 1 failure -> retry after 30s
attempt 2 failure -> retry after 60s
attempt 3 failure -> retry after 120s
attempt 4 failure -> retry after 240s
attempt 5 failure -> terminal failed
```

Malformed artifact metadata is treated as a permanent delivery error immediately. A terminal delivery failure remains visible as `status = failed` with `nextAttemptAt = null` and is not claimed again.

The proven C6 delivery completed in one attempt, persisted Telegram metadata/document message IDs `12` and `13`, and left the VPS spool empty.

## Input state: defer semantic expansion

The existing semantic image override remains useful, but actual `/upload/image` staging and broader workflow bindings are postponed while the LTX graphs are still being optimized.

This is deliberate. Future I2V graphs may expose more prompt, Prompt Relay, sampler, Director, or temporal controls, and a T2V workflow will have a different input surface.

Keep raw Comfy API workflow submission available and avoid hard-coding an unstable large input schema.

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
POST /prompt                           DONE
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

Worker retention cleanup              DEFERRED
Image upload / staging                DEFERRED
Prompt / relay / sampler bindings     DEFERRED
T2V semantic bindings                 DEFERRED
Persistent WS tracking                OPTIONAL LATER
Freeze workflow package               ONLY AFTER BASELINE IS CHOSEN
```

## Current pause point

The workflow-independent runtime work is complete enough to pause.

Worker-output retention is intentionally deferred rather than adding a worker-side deletion service just for cleanup. VPS temporary copies are already removed after every delivery attempt.

Return to Comfy/LTX workflow work next: continue I2V optimization, add the simple T2V graph, and discover the final useful input controls before defining a semantic Helix contract.

## Operational rules

- Raw ComfyUI remains private over Tailscale; do not expose port `8188` publicly.
- Keep `maxConcurrentGpuJobs: 1` for the RTX 4060 worker.
- Do not alter the pinned ComfyUI/custom-node/model stack casually.
- Avoid competing GPU workloads during LTX generation.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not package/freeze experimental LTX workflows yet.
- Do not force semantic input work while the workflow control surface is still changing.
