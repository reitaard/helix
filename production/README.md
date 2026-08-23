# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

## Current execution path

```text
n8n / caller
    ↓
helix-runtime
    ├── helix-db + worker/job/delivery/operator state
    ├── TelegramCommandService (operator/debug surface)
    ├── TelegramAlertService (durable operational alerts)
    ├── TelegramCancelService (confirmed cancellation)
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

The worker/runtime boundary is a stable checkpoint. It supports durable job acceptance, raw Comfy workflow submission, `prompt_id` persistence, queue/history reconciliation, restart recovery, artifact capture/retrieval, cancellation, running-job timeout, durable Telegram delivery, bounded delivery retry, delivery observability, immediate VPS spool cleanup, live diagnostics, operator inspection, proactive alerts, durable debug views, and guarded Telegram cancellation.

See [`production/comfyui-worker/`](comfyui-worker/) for the focused worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 I2V generation and exposes the pinned ComfyUI/custom-node stack only through the private Tailscale path.

The durable worker ID is `helix-rtx4060-01`; the human-facing display name is `Christopher Nolan`. The current Comfy revision is pinned at `7dde56176efa71fd74ef7b3930ab5882d1926288`.

LTX/Director workflow experiments remain execution research, not a frozen runtime contract. Existing findings include native LTX 2.5 I2V, full-resolution I2V, CGlide Director-style controls, Prompt Relay temporal regions, CGlide chunk continuation, and Lightricks LoopingSampler temporal extension.

See [`production/ltx-director/`](ltx-director/) for those experiment notes.

## Workflow integration policy

Do not hard-code a large semantic input contract while workflows are still changing.

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

Image staging, prompt/chunk-prompt bindings, Prompt Relay controls, sampler controls, and T2V-specific semantic inputs remain deferred until the chosen workflow families settle.

## Runtime ownership

The runtime owns:

- worker identity, durable ID, presentation name, and health;
- durable job IDs/state/events;
- Comfy submission and backend job ID persistence;
- execution reconciliation and restart recovery;
- prompt-specific cancellation and running-job timeout;
- generated artifact metadata and retrieval;
- temporary spooling and media probing;
- durable Telegram delivery state;
- bounded retry/backoff and terminal delivery failures;
- Telegram diagnostics, inspection, alerts, debug views, and guarded cancellation;
- live Comfy/Python/Torch/GPU/VRAM/RAM diagnostics;
- read-only comparison of the pinned Comfy revision with upstream `master`.

ComfyUI owns workflow graph execution, model/custom-node execution, worker-local input/output files, native queue/history/WebSocket execution state, and live `/system_stats` data.

## Telegram operational checkpoint

The Telegram operational checkpoint is complete.

Current advertised help surface:

```text
/status      - Diagnostics
/queue       - Queue check
/jobs        - Recent jobs
/job <id>    - Job details
/outbox      - Send queue
/errors      - Recent failures
/events <id> - Job events
/cancel <id> - Cancel job
```

`/help` remains available. Hidden aliases are intentionally not advertised:

```text
/st, /stat   -> /status
/qu, /que    -> /queue
/jbs         -> /jobs
/jb          -> /job
/ob          -> /outbox
/err         -> /errors
/ev          -> /events
/cc          -> /cancel
/h           -> /help
```

The service accepts only the configured Telegram chat ID and clears Telegram's registered command list on startup so it does not force a Menu button.

`/status` reports runtime/database health, worker presentation name/state, queue state, backend versions, GPU/VRAM/RAM, and cached upstream Comfy drift.

`/jobs` shows the five most recent jobs with full durable IDs. `/job` accepts a full ID or unique short prefix and tolerates copied trailing dots.

`/outbox` excludes already-delivered items and summarizes `pending`, `sending`, `retrying`, and terminal `failed` states. `OutboxRepository` is read-only; `DeliveryWorker` remains the only delivery executor.

`/errors` shows recent failed/timed-out generation jobs and terminal Outbox failures using full durable IDs.

`/events <id>` shows the complete durable event timeline with local timestamps and actual technical event names.

### Operational alerts

`TelegramAlertService` proactively sends durable, deduplicated alerts for failed jobs, timed-out jobs, terminal Outbox failures, and worker offline/recovered transitions.

A migration-time cursor prevents historical failure replay. Event-derived alerts use durable dedupe keys and bounded Telegram retry. Worker liveness alerts require consecutive observations and use a cooldown so transient failures do not spam the operator.

### Confirmed cancellation

`/cancel <id>` and `/cc <id>` are the only write-capable Telegram actions.

A request creates one durable pending action for the configured operator chat and requires terminal-style `yes` or `no` confirmation. The window is 60 seconds, three invalid responses abort the request, a new slash command silently abandons the pending confirmation, and expiry is quiet.

Operator intent is recorded separately from job state through:

```text
operator.telegram.cancel_requested
operator.telegram.cancel_confirmed
operator.telegram.cancel_aborted
operator.telegram.cancel_expired
```

Confirmed intent delegates to the existing `JobService.cancel()` path. Telegram never calls ComfyUI directly for cancellation. No restart, shell, package-update, arbitrary mutation, destructive inline buttons, message edits, or message deletion are exposed.

## Current checkpoint

The Production runtime and Telegram operator surface are locked as a stable checkpoint.

Completed after the first delivery milestone:

- `POST /v1/media/jobs/:jobId/cancel`;
- race-safe terminal job transitions;
- configurable running-job timeout;
- delivery state embedded in job reads;
- maximum five delivery attempts with exponential backoff;
- permanent malformed-artifact failure handling;
- original-file Telegram delivery with same-message metadata caption;
- human-friendly worker naming without changing durable IDs;
- live host RAM/VRAM diagnostics;
- `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/errors`, `/events`, `/cancel`, `/help`;
- full durable IDs and safe prefix lookup;
- durable operational alerts and deduplication;
- worker offline/recovered transition monitoring;
- complete timestamped event inspection;
- durable 60-second yes/no cancellation confirmation;
- read-only pinned-revision/upstream Comfy update awareness.

Still deferred:

- worker output-retention cleanup;
- actual image upload/staging;
- prompt/relay/sampler semantic bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking;
- broader Telegram mutation commands.

A real Windows reboot -> automatic ComfyUI worker startup remains to be proven. A future naturally running generation can also provide the final end-to-end proof of actual backend interruption through the now-tested Telegram confirmation path.

## Next direction

The next main Helix phase is **Niche Intelligence**, not additional Telegram/runtime expansion.

The immediate design goal is to define the platform-first research model: what a niche is, which YouTube/Facebook/Reels-style observations enter the system, what raw evidence is stored, which content features are extracted, how trends/saturation/novelty are inferred, and what a `NicheModel` must expose to the Director.

Production workflow work can resume separately later with I2V optimization and a simple native LTX 2.5 T2V baseline, while raw API-format graphs remain usable until stable workflow families are ready to freeze.
