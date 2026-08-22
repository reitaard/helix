# ComfyUI Worker

This folder records the active ComfyUI execution workstream only.

The goal is to make Helix control the dedicated ComfyUI worker reliably from job submission through generation, durable tracking, artifact delivery, retention, and recovery. It does not define the rest of Helix.

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
VPS spool
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
- immediate VPS spool cleanup after each attempt.

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

Correctness currently comes from Comfy history and queue state:

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

This means `helix-runtime` can restart and recover unfinished/completed jobs. WebSocket event tracking can be added later for lower latency, but is not required for correctness.

## Output delivery state

Checkpoint `301be69` added and validated the complete current output path:

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

The final delivery test used the already-generated C6 artifact, completed in one attempt, persisted both Telegram message IDs, and left the spool empty.

Generation success and delivery success are intentionally separate states.

## Input state: defer semantic expansion

The current semantic image override is useful, but actual `/upload/image` staging and broader workflow bindings are postponed while LTX workflows are still being optimized.

This is deliberate. Future I2V graphs may expose more prompt/sampler/relay controls, and a T2V workflow will have a different input surface.

Keep raw Comfy API workflow submission available and avoid hard-coding an unstable large input schema.

When workflow families stabilize, add semantic bindings around the chosen graphs rather than around temporary node layouts.

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

Worker retention cleanup              NEXT
Generation timeout/cancellation       AFTER RETENTION
Delivery observability hardening      AFTER RETENTION
Image upload / staging                DEFERRED
Prompt / relay / sampler bindings     DEFERRED
T2V semantic bindings                 DEFERRED
Persistent WS tracking                OPTIONAL LATER
Freeze workflow package               ONLY AFTER BASELINE IS CHOSEN
```

## Immediate next milestone: worker retention cleanup

VPS temporary copies are already removed. Worker originals are not.

Implement controlled cleanup with an initial 24-hour safety window and delete only artifacts known to Helix. Do not blindly sweep the entire Comfy output tree because the worker can also contain manual/experimental outputs.

## Operational rules

- Raw ComfyUI remains private over Tailscale; do not expose port `8188` publicly.
- Keep `maxConcurrentGpuJobs: 1` for the RTX 4060 worker.
- Do not alter the pinned ComfyUI/custom-node/model stack casually.
- Avoid competing GPU workloads during LTX generation.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not package/freeze the current experimental LTX workflow yet.
- Do not force semantic input work while the workflow control surface is still changing.
