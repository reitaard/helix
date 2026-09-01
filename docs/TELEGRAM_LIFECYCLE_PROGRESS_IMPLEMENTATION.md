# Telegram lifecycle progress implementation

Status: **implemented, merged to `main`, and verified deployed on the VPS on 2026-09-01. A fresh end-to-end lifecycle smoke is still pending.**

This document records the implementation contract for the Telegram one-message generation lifecycle. It is not the canonical production-deployment ledger; use `docs/PROJECT_STATE.md` for the current verified project checkpoint.

## Core operator behavior

Telegram-originated `/t2v` and `/t2i` generations can own one operator-facing message for their lifecycle:

```text
confirmation
    ↓
queued
    ↓
generating
    ↓
complete / uploading
    ↓
primary final artifact
```

The durable lifecycle target is the Telegram message identity. The primary final artifact can replace the lifecycle text message in place rather than appearing later at the bottom of the conversation.

## Dual progress model

Running cards expose separate measurements:

```text
Workflow  █████░░░░░  50%
Sampling  ██░░░░░░░░  25%
```

`Workflow` represents submitted-workflow node completion. Expanded/internal Comfy execution nodes must not inflate the denominator.

`Sampling` represents the current numeric progress-bearing node (`value / max`). It can restart for a later sampler/progress-bearing node and is not averaged with Workflow progress.

Stages without meaningful numeric progress show a stage label such as Loading, VAE Decode, or Finalizing rather than a fabricated percentage.

Workflow percentage is execution progress, not a wall-clock completion estimate.

## Comfy event transport

Pinned Comfy revision:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

The repository implementation keeps one persistent execution WebSocket per physical worker with a stable Helix client identity. `/prompt` submissions use that same client identity so Comfy can route execution events for the submitted Prompt ID to the Helix listener.

Normalized event families include execution start/node/progress/success/interrupted/error behavior.

Progress transport is presentation telemetry only. Durable job truth remains:

```text
PostgreSQL media_jobs
        +
Comfy /queue and /history reconciliation
```

A WebSocket disconnect must not invalidate generation.

## Telegram update throttling

Visible progress edits are coalesced. Stage changes and terminal transitions should update promptly; routine percentage changes should be throttled so Helix does not issue one Telegram API call per sampler step.

The implementation uses meaningful progress/stage deltas plus elapsed time to decide when to edit.

## Durable lifecycle identity

Migration:

```text
0014_telegram_job_lifecycle.sql
```

adds lifecycle ownership state including the confirmation-message identity and `telegram_job_lifecycles` mapping.

Progress percentages themselves are transient and are not the durable recovery record.

## Final artifact behavior

For Telegram-originated successful jobs, artifact index `0` is the primary lifecycle artifact.

The lifecycle implementation uses `editMessageMedia` so the existing lifecycle text message can become the original document/file with the Helix artifact caption:

```text
[ GENERATING ]
     ↓
[ COMPLETE / Uploading ]
     ↓
[ final original document ]
```

Additional artifacts can use the ordinary extra-message path. Jobs without a lifecycle mapping retain normal new-message delivery behavior.

There is deliberately no semantic fallback that silently changes the identity model. Delivery retry remains durable and targets the same intended lifecycle delivery path.

## Delivery failure presentation

Transient primary delivery failure can update the lifecycle card to a retry state. Terminal delivery failure should leave a durable retrieval reference, for example:

```text
/dl g <media-reference>
```

The media/job identity remains valid even if automatic Telegram delivery fails.

## Forum interaction updates after the initial lifecycle merge

Later forum work refined how lifecycle confirmation interacts with group privacy and Telegram UI:

- bare `/t2i` and `/t2v` use selective ForceReply only for free-text prompt capture;
- Image also supports inline `/t2i <prompt>` capture;
- forum prompt confirmation uses inline `[ Generate ] [ Cancel ]` buttons;
- forum reset uses `[ Reset ] [ Cancel ]`;
- callbacks are bound to the exact conversation/user/message/action;
- consumed ForceReply cards are deleted after successful prompt capture so Telegram cannot reactivate them when the user switches topics;
- T2I ForceReply capture and inline prompt handling received follow-up fixes after the initial forum/lifecycle merge.

Private operator chat retains its direct text-confirmation model.

These later fixes are part of the current repository behavior and must not be omitted when reasoning about the lifecycle UX.

## Runtime composition

```text
ComfyClient
    persistent WS + stable client identity
        ↓
ComfyAdapter / WorkerRegistry
    normalized execution events
        ↓
TelegramProgressService
    transient progress + throttled edits
        ↓
Telegram delivery/presentation
    editMessageText / editMessageMedia

T2V/T2I pending state
    confirmation message identity
        ↓
telegram_job_lifecycles
    durable lifecycle target
        ↓
DeliveryWorker
    primary artifact replaces lifecycle message
```

## Regression coverage

Repository tests cover lifecycle/progress and forum integration areas including normalized Comfy progress events, stable submission client identity, workflow-node counting, lifecycle text/media edits, delivery retry behavior, forum routing/buttons, and related Telegram state transitions.

Do not freeze a historical total test count in this document as if it remains permanently current. Exact counts belong in deployment/test checkpoints.

## Verified deployment checkpoint — 2026-09-01

The VPS verification established both required production layers.

### Database

The live `helix-db` schema contains:

```text
telegram_job_lifecycles
operator_pending_t2i.confirmation_message_id
operator_pending_t2v.confirmation_message_id
```

This confirms the effects of `0014_telegram_job_lifecycle.sql` are applied.

### Running runtime image

The running `helix-runtime:dev` container contains compiled lifecycle/progress code including:

```text
/app/dist/telegram/progress-service.js
/app/dist/delivery/telegram.js
/app/dist/repositories/telegram-job-lifecycle-repository.js
/app/dist/adapters/comfy/events.js
```

This confirms the newer lifecycle/progress runtime is deployed, including the delivery path and Comfy execution-event layer.

### What this verification does not prove

The verification did not include a successful fresh `/t2i` or `/t2v` end-to-end lifecycle run. The sampled 24-hour runtime logs instead showed:

```text
[telegram] command poll failed [TypeError: fetch failed]
```

Treat this as a separate Telegram transport/health issue to investigate. Deployment of the migration/runtime code is verified; current end-to-end operator-path health is not yet re-proven by this checkpoint.
