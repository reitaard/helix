# Project State

## Current phase

**Preparation / foundation, with a validated Production execution slice and a narrow Telegram operator surface.**

The high-level Helix system division is established. Production execution is now hardened enough to pause as a stable checkpoint while the project returns to the main Helix brain path.

## Primary system direction

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream connected later through stable creative/variant briefs. Generation technology must not shape the Intelligence or Helix Director contracts.

## Project divisions

- Foundation / Preparation
- Intelligence
- Director
- Experiment Engine
- Production
- Distribution
- Analytics / Feedback

## Active Production checkpoint

Current status as of 2026-08-23:

```text
caller / n8n
    ↓
helix-runtime :8787
    ├── helix-db
    ├── TelegramCommandService
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── OutboxRepository
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
Telegram original document + caption
```

Current worker identity/runtime facts:

```text
durable worker ID: helix-rtx4060-01
display name: Christopher Nolan
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
GPU: RTX 4060
max GPU jobs: 1
```

The VPS-side runtime supports:

- durable media-job acceptance and PostgreSQL state;
- raw Comfy API-workflow submission;
- Comfy `prompt_id` persistence as backend job ID;
- queue/history reconciliation and restart recovery;
- race-safe terminal transitions;
- prompt-specific cancellation and running-job timeout;
- artifact discovery/retrieval and ffprobe metadata;
- durable Telegram original-file delivery;
- delivery retry/backoff, stale-claim recovery and terminal retry limits;
- immediate VPS spool cleanup after delivery attempts;
- human-friendly worker naming without changing durable IDs;
- live Comfy/Python/Torch/GPU/VRAM/RAM diagnostics;
- read-only pinned-Comfy revision comparison against upstream `master`;
- durable operator alerts and debug views;
- one deliberately narrow write-capable Telegram action: confirmed job cancellation.

## Telegram operator checkpoint

Current advertised commands:

```text
/status      diagnostics
/queue       current Comfy + Helix queue state
/jobs        five most recent jobs with full durable IDs
/job <id>    one job plus its Outbox/send state
/outbox      send work still needing attention
/errors      recent generation/terminal-delivery failures
/events <id> complete durable event timeline
/cancel <id> confirmed job cancellation
/help        command list
```

Hidden aliases:

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

The service accepts messages only from the configured Telegram chat ID. It does not expose restart, shell, package update, or arbitrary worker mutation actions.

### Read-only inspection

`/jobs` shows full durable job IDs. `/job` and `/events` accept full IDs or unique short prefixes and reject ambiguous prefixes.

`/outbox` is presentation-only. It reads `media_deliveries` without claiming, retrying, resetting, or mutating delivery state. `DeliveryWorker` remains responsible for delivery execution.

`/errors` shows the five most recent failed/timed-out generation jobs and terminal Outbox failures. Cancelled jobs are excluded.

`/events <id>` shows the complete durable `media_job_events` timeline, newest first, with sequence numbers, Helix-local timestamps, and the actual technical event names.

### Operational alerts

`TelegramAlertService` proactively sends alerts for:

```text
job.failed
job.timed_out
terminal delivery.failed
worker offline
worker recovered
```

Event-derived alerts are persisted in `operator_alerts`, deduplicated by durable keys, and delivered with bounded retry. `operator_alert_cursors` starts at the latest existing event during migration so historical failures are not replayed on deployment.

Worker liveness alerts require consecutive observations. `Christopher Nolan` is not declared offline on a single failed check, and a recovery alert is only emitted after a real offline transition. A transition cooldown reduces flapping.

### Safe cancellation

`/cancel <id>` and hidden alias `/cc` are the only write-capable Telegram actions.

The flow is deliberately terminal-style:

```text
/cancel <id>
      ↓
durable pending action
      ↓
60-second confirmation window
      ↓
yes / no
```

Rules:

- one pending cancellation per configured Telegram operator chat;
- `yes` / `no` are case-insensitive;
- three invalid responses abort the request;
- a new slash command silently abandons the pending confirmation;
- expiry is quiet;
- pending state survives runtime restart until expiry;
- no inline destructive buttons, message edits, or message deletion.

Operator intent is recorded separately from state transition:

```text
operator.telegram.cancel_requested
operator.telegram.cancel_confirmed
operator.telegram.cancel_aborted
operator.telegram.cancel_expired
```

Confirmed cancellation delegates to the existing `JobService.cancel()` path. Telegram does not call ComfyUI directly.

The safe confirmation state machine was validated with a synthetic running job that had no backend job ID, so the tests could not interrupt a real generation. Terminal-job protection, `no`, invalid-response limits, command abandonment, expiry, confirmed intent, and durable audit events were exercised. The next naturally running real generation can provide the final end-to-end proof of an actual backend interruption.

## Proven Production runs

Two runtime-controlled LTX 2.5 I2V generations have been proven, including:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

The C6 artifact was delivered through the durable Telegram path with generation state and delivery state persisted separately.

## Production workflow policy

The runtime is intentionally not being expanded into a large semantic workflow API while the generation graphs are still changing.

```text
raw Comfy API workflow
        ↓
helix-runtime execution
        ↓
continue I2V / T2V workflow research in ComfyUI
        ↓
choose stable workflow families
        ↓
freeze/version those graphs
        ↓
add semantic Helix bindings around proven controls
```

Still deferred:

- actual image upload/staging through `/upload/image`;
- broad prompt/chunk-prompt bindings;
- Prompt Relay/sampler/Director semantic bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking;
- worker output-retention deletion infrastructure;
- broader Telegram mutation commands beyond confirmed job cancellation.

One operational validation remains pending: the Windows scheduled task has been started successfully by hand, but a real reboot -> automatic ComfyUI worker startup has not yet been proven.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define draft contracts for `Niche`, `ResearchFinding`, `NicheModel`, `ContentIdea`, `ContentSpec`, `Experiment`, `Variant`, `MediaAsset`, `PublishedPost`, and `PerformanceSnapshot`.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [x] Establish durable Production state outside n8n for the active ComfyUI execution path.
- [x] Validate native LTX 2.5 I2V generation on the standalone worker.
- [x] Pin the standalone ComfyUI/custom-node execution stack.
- [x] Submit, track, recover and deliver a real generation through `helix-runtime`.
- [x] Add Telegram system status, queue, job, and Outbox visibility.
- [x] Add durable Telegram operational alerts and deduplication.
- [x] Add `/errors` and complete timestamped `/events` debug views.
- [x] Add safe durable `/cancel` + `/cc` confirmation flow.
- [x] Add live worker RAM/VRAM diagnostics and read-only Comfy upstream-drift awareness.
- [ ] Validate a simple T2V workflow before defining T2V semantic bindings.
- [ ] Validate real Windows reboot/AtStartup behavior for the ComfyUI worker.

## Next Helix brain phase

**Niche Intelligence design.**

The next phase should define:

1. what exactly a `Niche` means in Helix;
2. which platform observations enter the Intelligence system;
3. what raw evidence is persisted from posts/reels/shorts/accounts/tags;
4. which structured features are extracted from each content example;
5. how hooks, formats, topics, pacing, visuals, narrative structure, audience signals, saturation, novelty and temporal trends are represented;
6. how observed facts are separated from inferred patterns;
7. what a `NicheModel` contains;
8. how the Director queries and consumes that model.

The intended research direction is platform-first rather than web-search-first: YouTube/Facebook/Reels-style data should provide primary behavioral evidence, scoped by niche/tags/accounts/content clusters, while broader web research supplements rather than replaces platform observations.

## Later

After the Intelligence contract is coherent:

1. Director skill design;
2. Experiment Engine algorithms;
3. connect the stable Production execution/workflow boundary;
4. Distribution;
5. closed-loop Analytics/Feedback.
