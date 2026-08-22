# ComfyUI Worker

This folder records the active ComfyUI execution workstream only.

The goal is to make Helix control the dedicated ComfyUI worker reliably from input staging through generation, durable tracking, artifact delivery, and cleanup. It does not define the rest of Helix.

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
capability: video.i2v
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
- compact job status response that does not dump the entire workflow.

Observed readiness baseline on 2026-08-22:

```text
/live       ~410 ms
/readiness  ~3.2 s
node classes: 1219
worker state: cold_ready
```

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

This means `helix-runtime` can restart and recover unfinished/completed jobs. WebSocket event tracking can be added later for faster updates, but it is not required for correctness.

## Artifact state

Helix currently captures artifact metadata such as:

```json
{
  "filename": "LTX-2.5_i2v_00005_.mp4",
  "subfolder": "video",
  "type": "output",
  "nodeId": "75"
}
```

The file itself still remains on the Windows worker. Artifact retrieval/delivery is the next milestone.

## Input state

Semantic `LoadImage` override code has been implemented and built.

It finds the unique `LoadImage` node, preferring title `Load First Frame`, validates a relative worker input filename, clones the workflow, and changes only that clone.

Functional check against the C6 API graph passed:

```text
original: Ninja.jpg
changed:  helix-test/example.jpg
original preserved: true
node count preserved: true
```

This source checkpoint is committed for continuation. Confirm deployment after pulling/rebuilding the VPS runtime.

Actual image upload/staging through Comfy `POST /upload/image` is not implemented yet.

## LTX hybrid workflow control gap

The C6 API graph proved that raw workflow submission works, but the user-facing LTX controls are not fully bound yet.

The minimum semantic bindings needed are:

```text
inputs.image
  -> LoadImage / Load First Frame

inputs.prompt
  -> PrimitiveStringMultiline / Prompt

inputs.chunkPrompts
  -> LTXV Multi Prompt Provider
```

For the hybrid workflow, changing only the outer/global prompt is insufficient when old tile/chunk prompts remain in `LTXV Multi Prompt Provider`.

CGlide/Director prompt authoring is not the main active prompt path while Prompt Relay is disabled.

Until `prompt` and `chunkPrompts` are exposed, use Comfy WebUI for runs that require full prompt control.

## C6 workflow note

The experimental executable graph currently lives on the VPS at:

```text
/opt/helix-runtime/workflows/c6.api.json
```

It is not frozen into the repository.

The export had 54 nodes. A serialization mismatch was caught before generation: `temporal_overlap_cond_strength` exported as `0.5` even though the UI named value showed `0.35`. The test API copy was corrected to `0.35`, then successfully generated.

Do not freeze/package this workflow until the user declares a stable baseline.

## Next milestone: Telegram output delivery

Resume here.

Build this path before spending GPU time on another end-to-end test:

```text
Comfy artifact
    ↓
controlled /view retrieval
    ↓
VPS temporary spool
    ↓
TelegramDelivery
    ↓
durable delivery success/failure + retry
    ↓
remove VPS temporary file after confirmed delivery
```

Keep generation status and delivery status separate: a successful generation remains `succeeded` even if Telegram delivery fails.

After Telegram delivery works, add controlled worker output retention cleanup. Initial discussion used a 24-hour safety window rather than immediate worker deletion.

Then implement Comfy input upload/staging and the missing prompt/chunk-prompt bindings.

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
Semantic image override source        DONE (deploy confirmation pending)

Artifact file retrieval               NEXT
Telegram delivery                     NEXT
Durable delivery retry/state          NEXT
VPS temporary cleanup                 NEXT
Worker retention cleanup              NEXT
Image upload / staging                AFTER OUTPUT
Prompt + chunkPrompt bindings         AFTER OUTPUT
Cancellation                          LATER
Freeze first workflow                 ONLY AFTER BASELINE IS CHOSEN
```

## Operational rules

- Raw ComfyUI remains private over Tailscale; do not expose port `8188` publicly.
- Keep `maxConcurrentGpuJobs: 1` for the RTX 4060 worker.
- Do not alter the pinned ComfyUI/custom-node/model stack casually.
- Avoid competing GPU workloads during LTX generation.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram tokens or other secrets in Git.
- Do not delete worker output immediately after delivery; use a controlled retention policy.
- Do not package/freeze the current experimental LTX workflow yet.
