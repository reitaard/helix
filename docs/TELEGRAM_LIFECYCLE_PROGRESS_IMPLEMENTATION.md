# Telegram lifecycle progress implementation

Status: **feature branch implemented; VPS build/test, migration 0014, runtime deployment, and Telegram smoke test still pending.**

Branch:

```text
feature/telegram-lifecycle-progress
```

This document records the implementation checkpoint for the locked Telegram lifecycle decision in `docs/DECISIONS.md`. It is intentionally explicit about what is implemented in code versus what is actually deployed.

## Operator behavior

Telegram-originated `/t2v` and `/t2i` generations own one operator-facing message for their whole lifecycle:

```text
confirmation
    ↓ yes
queued
    ↓
generating
    ↓
complete / uploading
    ↓
primary final artifact
```

The confirmation message is not deleted and replaced. Its Telegram `message_id` is captured durably and the same message is edited in place.

If the operator answers `no`, workflow preparation fails, or submission fails before a real backend execution exists, the same confirmation message is edited to the corresponding cancelled/failed state when possible.

## Dual progress model

Running cards expose two separate measurements:

```text
Workflow  █████░░░░░  50%
Sampling  ██░░░░░░░░  25%
```

`Workflow` is completed submitted API-workflow nodes divided by the number of submitted API-workflow nodes. Expanded/internal Comfy execution nodes do not inflate the denominator or completed count. Cached submitted nodes are reported as finished by the pinned Comfy progress registry and therefore contribute correctly.

`Sampling` is the current numeric node progress (`value / max`). It can restart when a different sampler/progress-bearing node begins. It is not averaged with Workflow progress.

Nodes without meaningful numeric progress show a stage label such as `Loading`, `VAE Decode`, or `Finalizing` with `Running` instead of a fabricated percentage.

Workflow percentage is execution-node progress, not a wall-clock completion estimate.

## Comfy event transport

The pinned Comfy revision is:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

Helix keeps one persistent execution WebSocket per physical worker. The current worker uses a restart-stable client identity derived from its durable worker ID:

```text
helix-runtime-helix-rtx4060-01
```

Every Helix `/prompt` submission includes that same `client_id`, allowing Comfy to route execution events for the submitted Prompt ID to the Helix listener.

Helix also sends:

```json
{
  "extra_data": {
    "preview_method": "none"
  }
}
```

so the progress connection does not need latent preview image traffic.

The existing readiness WebSocket probe remains separate and uses an ephemeral `helix-probe-*` client ID. A `/status` call therefore cannot displace the persistent execution socket.

The exact pinned Comfy source was checked before implementation: `/prompt.client_id` is copied into execution `extra_data`, `execute_async()` reads `extra_data.preview_method`, and `progress_state` is sent to the initiating `client_id`.

## Event normalization

Comfy-specific WebSocket JSON is normalized inside the adapter boundary before Telegram sees it. The normalized event stream covers:

```text
execution_start
executing
progress
progress_state
execution_success
execution_interrupted
execution_error
```

Progress events are presentation telemetry only. They do not change durable Helix job truth.

Authoritative state remains:

```text
PostgreSQL media_jobs
        +
Comfy /queue and /history reconciliation
```

A WebSocket disconnect must not stop or invalidate generation.

## Telegram update throttling

Ordinary live edits are coalesced. A visible progress edit occurs when at least one of these is true:

- stage/node label changed;
- Workflow changed by at least 5 percentage points;
- current-node progress changed by at least 5 percentage points;
- roughly 10 seconds passed since the previous visible update.

Execution start, success, and durable terminal transitions are not held behind the normal percentage throttle.

## Durable lifecycle identity

Migration `0014_telegram_job_lifecycle.sql` adds:

```text
operator_pending_t2v.confirmation_message_id
operator_pending_t2i.confirmation_message_id
telegram_job_lifecycles
```

`telegram_job_lifecycles` maps one real Helix job to one Telegram chat/message identity and tracks presentation ownership (`active`, `terminal`, `delivered`). Progress percentages themselves are not persisted.

Pending T2V/T2I state clears any old confirmation message ID whenever a new prompt flow begins, preventing stale-message ownership.

**Migration 0014 is not applied to Production at this checkpoint.** Production remains at migration 0012 until branch validation is complete.

## Final artifact behavior

For a Telegram-originated successful job, artifact index `0` is the primary lifecycle artifact.

Instead of appending a new Telegram file message, the DeliveryWorker uses `editMessageMedia` and converts the existing lifecycle text message into the original document/file with the existing Helix artifact metadata caption.

```text
old conversation position
[ GENERATING ]
     ↓
[ COMPLETE / Uploading ]
     ↓
[ final original document ]
```

This keeps a finished video/image from suddenly appearing at the bottom of an unrelated later operator conversation.

Additional artifacts, if any, keep the existing normal extra-message path. Jobs without a Telegram lifecycle mapping (for example API-created jobs) also retain the existing `sendDocument` fallback.

There is deliberately no automatic fallback from a failed lifecycle media edit to a surprise new primary file message. The existing durable delivery retry machinery remains responsible for retrying the same in-place delivery target.

Telegram's `message is not modified` response is treated as an idempotent success for edit retries, which protects the crash-after-Telegram-success/before-local-recording window.

## Delivery failure presentation

When primary automatic artifact delivery fails transiently, the same lifecycle card changes to a retry state with the attempt and retry delay. The general progress status sweep excludes delivery-owned retry/failure presentation states so it cannot overwrite that card back to `Uploading artifact…`.

If the automatic delivery retry budget is exhausted, the same card becomes `DELIVERY FAILED` and gives the operator the durable manual retrieval command:

```text
/dl g <job-number>
```

The completed media remains represented by the existing durable Job/media reference.

## Runtime composition

New/changed runtime responsibilities are intentionally narrow:

```text
ComfyClient
    persistent WS + stable client_id
        ↓
ComfyAdapter / WorkerRegistry
    normalized execution events
        ↓
TelegramProgressService
    transient progress + throttled edits
        ↓
TelegramDelivery
    editMessageText / editMessageMedia

T2V/T2I pending state
    confirmation message_id
        ↓
telegram_job_lifecycles
    durable lifecycle target
        ↓
DeliveryWorker
    primary artifact replaces lifecycle message
```

`TelegramCommandService` was intentionally not rewritten for this feature. T2V/T2I are already Telegram-specific services and own their confirmation/lifecycle card directly, reducing the blast radius for `/status`, `/j`, `/jb`, `/dl`, diagnostics, cancellation, and other commands.

## Regression coverage added on the feature branch

Tests now cover:

- normalized Comfy `progress` and `progress_state` parsing;
- malformed/unrelated WebSocket event rejection;
- stable `/prompt.client_id` on repeated submissions;
- `preview_method: none` submission metadata;
- submitted-workflow node counting;
- expanded internal-node exclusion from Workflow progress;
- human sampler-stage labeling;
- dual Workflow/current-node rendering;
- one confirmation message being sent and its `message_id` captured by T2I;
- migration 0014 durability contract;
- lifecycle status sweep exclusion for delivery-owned retry/failure cards;
- Telegram text edit targeting the original message;
- idempotent `message is not modified` handling;
- text-message to document-message replacement through `editMessageMedia`;
- delivery retry and terminal-delivery failure rendering.

## Validation/deployment checkpoint

Not yet completed:

```text
VPS npm build/test for feature branch
PostgreSQL backup before 0013
migration 0014 apply + verification
merge/fast-forward to main
runtime image rebuild/restart
live /t2v smoke test
live /t2i smoke test
same-message final artifact confirmation
WebSocket reconnect observation
```

Do not describe this feature as live until those steps have passed.
