# Helix Media Runtime

Execution service used to control the dedicated ComfyUI GPU worker and expose the bounded Helix Production operator/generation surface.

Its active scope is intentionally narrow: durably accept media jobs, submit vetted Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, expose Telegram controls, and keep backend-specific behavior behind semantic Production boundaries.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the physical worker checkpoint.

## Runtime architecture

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── WorkerService + JobService
    │     ↓
    │   helix-db
    │     ├── workers + observations
    │     ├── media_jobs
    │     ├── media_references
    │     ├── media_job_events
    │     ├── media_deliveries
    │     ├── operator / pending state
    │     ├── production profile/settings state
    │     └── Telegram routing/lifecycle state
    │
    ├── WorkerRegistry
    │     ↓
    │   ComfyAdapter / ComfyClient
    │     ↓ Tailscale
    │   helix-rtx4060-01
    │     ↓
    │   ComfyUI :8188
    │
    ├── DeliveryWorker
    ├── Telegram operator/generation services
    └── persistent execution-event telemetry
```

## Current worker

- Durable ID: `helix-rtx4060-01`
- Physical-worker name: `Helix RTX 4060`
- Adapter: `comfy`
- Profile `nolan`: Christopher Nolan; validated `video.i2v`, `video.t2v`
- Profile `leibovitz`: Annie Leibovitz; `image.t2i`
- GPU: RTX 4060, 8188 MiB VRAM
- ComfyUI: 0.33.0
- Pinned Comfy revision: `7dde56176efa71fd74ef7b3930ab5882d1926288`
- Python: 3.12.11
- PyTorch: 2.10.0+cu130
- Physical GPU concurrency: 1

Profiles are logical Production identities on one physical worker, not separate workers or queues.

## API

Worker/runtime:

- `GET /v1/health`
- `GET /v1/workers`
- `GET /v1/workers/:workerId`
- `GET /v1/workers/:workerId/live`
- `GET /v1/workers/:workerId/readiness`
- `GET /v1/workers/:workerId/health` compatibility route

Media jobs:

- `POST /v1/media/jobs`
- `GET /v1/media/jobs/:jobId`
- `POST /v1/media/jobs/:jobId/cancel`

Generation is asynchronous. Job correctness remains grounded in durable PostgreSQL state plus Comfy queue/history reconciliation.

## Execution identity

Helix deliberately separates:

```text
internal Helix ID
job_...

operator media reference
52

Comfy backend execution ID
prompt_id / backend_job_id
```

Migrations `0011_job_numbers.sql` and `0012_media_references.sql` established one global numeric media-reference namespace.

The invariant is:

```text
one number -> one media execution
```

Helix-managed jobs retain real `media_jobs` rows. Direct/manual ComfyUI generations receive durable `media_references.kind = comfy_artifact` mappings and do **not** become fake jobs.

The same numeric reference therefore works across Jobs/Downloads/media detail:

```text
/jb 52
/dl i 52
/dl g 52
```

## Execution lifecycle

Normal Helix-managed success path:

```text
accepted
  ↓
queued
  ↓
running
  ↓
succeeded
```

Additional terminal paths include `cancelled`, `timed_out`, and `failed`.

Comfy's Prompt ID is stored as `backend_job_id`. Queue/history reconciliation remains authoritative for durable execution truth once that ID is persisted.

## Persistent Comfy execution telemetry

The runtime contains persistent WebSocket execution tracking for presentation telemetry.

The runtime uses one stable client identity per physical worker and supplies it with `/prompt` submissions so Comfy execution events can be correlated to the backend Prompt ID. Normalized events include execution start/node/progress/success/interrupted/error families.

This WebSocket is **not** durable job truth. A disconnect must not invalidate a generation; PostgreSQL plus queue/history reconciliation remain authoritative.

## Telegram surfaces

Private operator chat remains the full bounded operator surface, including:

```text
/status
/queue
/j
/j p <page>
/jb <number>
/dl
/dl p <page>
/dl i <number>
/dl g <number>
/outbox
/errors
/ev <number>
/t2v
/t2i
/cc <number>
/help
```

T2V includes persisted semantic settings, reset behavior, and Manual/Fast/Quality modes. T2I intentionally remains narrow around prompt/aspect/seed.

The repository supports forum routing for one Image topic and one Video topic. Forum pending interactions are isolated by `(chatId, threadId, userId)`. **ForceReply is not used.** A bare `/t2i` or `/t2v` enters scoped `awaiting_prompt` state, sends an ordinary prompt card, and accepts the next plain-text message from that exact conversation while the state remains active. Confirmation/reset actions use inline buttons; operator-only commands and T2V developer settings remain private-chat-only.

The current repository transport includes a regression assertion that prompt-card delivery emits no `force_reply` or `selective` markup.

## Telegram lifecycle/progress deployment

The one-message lifecycle implementation is **verified deployed on the VPS as of 2026-09-01**:

```text
confirmation
    ↓
queued
    ↓
generating
    ↓
uploading
    ↓
primary final artifact
```

Running presentation can show separate Workflow and Sampling progress. The primary successful Telegram artifact can replace the original lifecycle text message through `editMessageMedia`; delivery retry/failure presentation remains attached to the lifecycle target.

The live production schema contains the effects of:

```text
0014_telegram_job_lifecycle.sql
```

including:

```text
telegram_job_lifecycles
operator_pending_t2i.confirmation_message_id
operator_pending_t2v.confirmation_message_id
```

The inspected `helix-runtime:dev` image was also verified to contain compiled lifecycle/progress code:

```text
/app/dist/telegram/progress-service.js
/app/dist/delivery/telegram.js
/app/dist/repositories/telegram-job-lifecycle-repository.js
/app/dist/adapters/comfy/events.js
```

This verifies deployment of both lifecycle schema and runtime implementation. It does **not** prove that commits `d81e78f` (scoped prompt capture) and `02c2aa1` (callback keyboard cleanup) are in the currently running container, because those commits were pushed after the container checkpoint and the inspected container had already been running for several days.

The sampled runtime log also showed a Telegram command-poll `TypeError: fetch failed`; investigate Telegram transport health separately before closing the live forum/lifecycle smoke.

## T2V and T2I workflow binding

T2V uses semantic Helix settings rather than exposing Comfy node IDs. Current concepts include aspect, quality, duration, prompt enhancement, FPS, seeds, negative prompt, megapixel override, sampler, guidance, and explicit Manual/Fast/Quality modes.

T2I uses FLUX.2 Klein 4B INT8 W8A8 as the active workflow candidate. Its V1 semantic surface is deliberately narrow: prompt, aspect, and seed. The earlier Distilled FP8 path remains available for rollback.

## Artifact delivery

Generation and delivery remain separate durable states.

```text
job succeeded
    ↓
media_deliveries
    ↓
Comfy /view
    ↓
VPS temporary spool
    ↓
Telegram original document/media target
    ↓
persist Telegram result
    ↓
remove temporary copy
```

Delivery claims use PostgreSQL state, stale-claim recovery, bounded retries, and backoff. Original media is handled as document/file media so Telegram does not intentionally transcode the generated artifact.

For lifecycle-owned primary Telegram deliveries, the deployed lifecycle implementation can replace the existing lifecycle message rather than append a new bottom-of-chat artifact message.

## Database migrations

Repository migrations currently include at least:

```text
0011_job_numbers.sql
0012_media_references.sql
0013_telegram_forum_topics.sql
0014_telegram_job_lifecycle.sql
```

The 2026-09-01 VPS verification confirmed `0014` effects are present in the live production schema.

## Validation policy

Use the project-owned runtime suite for regression validation:

```bash
cd production/media-runtime
npm run typecheck
npm test
```

Post-rebase checkpoint on 2026-09-01:

```text
57 tests
57 pass
0 fail
```

Exact counts are dated checkpoints, not permanent invariants.

## Runtime stack

- TypeScript
- Fastify
- Zod
- `ws`
- PostgreSQL via `pg`
- Node 24 production container
- ffprobe/FFmpeg in the production image
- strict TypeScript
- multi-stage Docker build

## Operational rules

- Keep raw ComfyUI private over Tailscale.
- Keep physical GPU concurrency at one for the current RTX 4060 worker.
- Preserve the durable worker ID even when display names change.
- Treat the Comfy revision as a production pin; update only after explicit validation.
- Keep Telegram scope narrow; no shell/restart/package-update actions.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram/database credentials in Git.
- Preserve one global numeric media-reference namespace.
- Do not create fake `media_jobs` rows for direct ComfyUI generations.
- Keep raw node IDs behind Production binders.
- Treat WebSocket progress as advisory presentation telemetry, not durable job truth.
- Keep forum prompt capture state-scoped by chat/topic/user; do not reintroduce reply-bound ForceReply behavior.

## Next direction

Continue Production feature-by-feature behind the stable worker/runtime boundary. Current hardening priorities include the submission-before-`backend_job_id` recovery window, concurrent API idempotency, service authentication before broader network trust, CI/integration enforcement, migration governance, explicit delivery semantics, deployment/smoke of the latest scoped prompt-capture fixes, and investigation of the current Telegram polling transport failure.

The main Helix brain direction remains Niche Intelligence.
