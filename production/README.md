# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

## Current execution path

```text
n8n / caller
    ↓
helix-runtime
    ├── helix-db + worker/job/delivery state
    ├── TelegramCommandService (read-only operator surface)
    ├── OutboxRepository (read-only send-state view)
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
Telegram original-file delivery
```

The worker/runtime boundary is now a stable checkpoint. It supports durable job acceptance, raw Comfy workflow submission, `prompt_id` persistence, queue/history reconciliation, restart recovery, artifact capture/retrieval, cancellation, running-job timeout, Telegram delivery, bounded delivery retry, delivery observability, immediate VPS spool cleanup, live system diagnostics, recent-job inspection, and a read-only Telegram outbox view.

See [`production/comfyui-worker/`](comfyui-worker/) for the focused worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 I2V generation and exposes the pinned ComfyUI/custom-node stack only through the private Tailscale path.

The durable worker ID is `helix-rtx4060-01`; the current human-facing display name is `Christopher Nolan`. The current Comfy revision is pinned at `7dde56176efa71fd74ef7b3930ab5882d1926288`.

LTX/Director workflow experiments remain execution research, not a frozen runtime contract. Existing findings include:

- native LTX 2.5 I2V;
- native full-resolution LTX 2.5 I2V;
- CGlide Director-style controls;
- Prompt Relay temporal regions;
- CGlide chunk continuation;
- Lightricks LoopingSampler temporal extension.

See [`production/ltx-director/`](ltx-director/) for those experiment notes.

## Workflow integration policy

Do not hard-code a large semantic input contract while the workflows are still changing.

```text
raw Comfy API workflow
        ↓
helix-runtime execution
        ↓
continue optimization in ComfyUI
        ↓
choose stable I2V / T2V workflow families
        ↓
freeze/version those graphs
        ↓
add semantic bindings around stable controls
```

This deliberately postpones image staging, prompt/chunk-prompt bindings, Prompt Relay controls, sampler controls, and T2V-specific semantic inputs until the chosen workflow families settle.

## Runtime ownership

The runtime currently owns:

- worker identity, durable ID, human-facing name and health;
- durable job IDs/state/events;
- Comfy submission and backend job ID persistence;
- execution reconciliation and restart recovery;
- prompt-specific cancellation;
- configurable running-job timeout;
- generated artifact metadata and retrieval;
- temporary spooling and media probing;
- durable Telegram delivery state;
- original-file Telegram document delivery with metadata in the same caption;
- bounded retry/backoff and terminal delivery failures;
- delivery state returned from the media-job API;
- read-only Telegram `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/help` commands;
- live Comfy/Python/Torch/GPU/VRAM/RAM diagnostics;
- read-only comparison of the pinned Comfy revision with upstream `master`.

ComfyUI owns:

- workflow graph execution;
- model/custom-node execution;
- worker-local input/output files;
- native queue/history/WebSocket execution state;
- live `/system_stats` data consumed by runtime diagnostics.

## Telegram operational checkpoint

The read-only operator-command checkpoint is now complete through job and outbox inspection.

`TelegramCommandService` uses `getUpdates` long polling inside `helix-runtime`, accepts messages only from the configured chat ID, and remains read-only.

Current advertised help surface:

```text
/status      - Diagnostics
/queue       - Queue check
/jobs        - Recent jobs
/job <id>    - Job details
/outbox      - Send queue
```

`/help` remains available. Hidden aliases are accepted but intentionally not advertised:

```text
/st, /stat   -> /status
/qu, /que    -> /queue
/jbs         -> /jobs
/jb          -> /job
/ob          -> /outbox
/h           -> /help
```

The service clears Telegram bot commands at startup so it does not force a Telegram Menu button.

`/status` reports runtime/database health, the `Christopher Nolan` worker presentation name, friendly worker state, queue state, backend versions, GPU/VRAM/RAM, and cached upstream Comfy drift. It does not update the worker.

`/jobs` shows the five most recent jobs with their full durable `job_...` IDs so an operator can copy the real identifier directly. `/job` accepts either a full job ID or a unique short prefix and tolerates copied trailing dots such as `e2a4a9...`. Ambiguous prefixes are rejected instead of guessed.

`/outbox` is the operator-facing name for the post-generation delivery queue. It excludes already-delivered items and summarizes `pending`, `sending`, `retrying`, and terminal `failed` states. Retry timing and compact terminal error text are shown only when useful. Internal database/state terminology remains `media_deliveries` and `DeliveryWorker`; “Outbox” is presentation language.

## Current checkpoint

Workflow-independent runtime hardening and the read-only operator surface are complete enough to pause here.

Completed after the first delivery milestone:

- `POST /v1/media/jobs/:jobId/cancel`;
- race-safe terminal job transitions;
- configurable running-job timeout (`HELIX_JOB_TIMEOUT_SECONDS`, deployed as 3600 seconds);
- delivery state embedded in `GET /v1/media/jobs/:jobId`;
- maximum five delivery attempts with exponential backoff;
- permanent malformed-artifact failures stop immediately;
- terminal delivery failures use `status = failed` with no next retry time;
- Telegram generation metadata collapsed into the same document caption;
- human-friendly worker naming without changing durable IDs;
- live host RAM/VRAM diagnostics from Comfy;
- read-only Telegram `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/help`;
- full durable IDs in `/jobs` plus unique-prefix resolution in `/job`;
- read-only outbox summary with retry and terminal-failure visibility;
- read-only pinned-revision/upstream Comfy update awareness.

Controlled worker-output deletion remains deferred. The normal Comfy output path does not currently give this runtime a sufficiently clean per-artifact delete primitive, so adding a worker-side deletion service only for retention is not justified at this checkpoint.

Persistent WebSocket execution tracking also remains optional because queue/history reconciliation already provides correctness.

## Next direction

Continue lightweight system/operator polish as useful, without expanding Telegram into an unrestricted control plane. When returning to generation work, build and optimize the I2V and simple native LTX 2.5 T2V graphs in ComfyUI and keep raw API-format graphs usable through Helix until the workflow families are stable enough to freeze.
