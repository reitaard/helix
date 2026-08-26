# Helix Media Runtime

Execution service used to control the dedicated ComfyUI GPU worker.

The active scope is intentionally narrow: accept durable media jobs, submit vetted Comfy API workflows, reconcile execution, support cancellation/timeouts, capture artifacts, deliver generated media, expose a narrow Telegram operator surface, and keep the worker/runtime boundary reliable while Production experiments continue evolving.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the worker checkpoint.

## Current deployed path

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── WorkerService + JobService
    │     ↓
    │   helix-db
    │     ├── workers
    │     ├── worker_observations
    │     ├── media_jobs
    │     ├── media_references
    │     ├── media_job_events
    │     ├── media_deliveries
    │     ├── operator alerts / pending actions
    │     └── production profile settings
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
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── TelegramT2VService / TelegramT2IService
    ├── TelegramDownloadsService
    └── TelegramCommandService
```

## Current worker

- Durable ID: `helix-rtx4060-01`
- Physical-worker name: `Helix RTX 4060`
- Adapter: `comfy`
- Production profile `nolan`: Christopher Nolan; validated `video.i2v`, `video.t2v`
- Production profile `leibovitz`: Annie Leibovitz; validated `image.t2i`
- GPU: RTX 4060, 8188 MiB VRAM
- ComfyUI: 0.33.0
- Pinned Comfy revision: `7dde56176efa71fd74ef7b3930ab5882d1926288`
- Python: 3.12.11
- PyTorch: 2.10.0+cu130
- Max concurrent GPU jobs: 1

Profiles are logical Production identities on one physical worker, not separate hardware workers.

## Current API

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

Generation is asynchronous. `POST /v1/media/jobs` durably accepts the Helix job and submits the workflow to the selected Production profile/worker.

## Execution identity

Helix deliberately keeps three identities separate:

```text
internal Helix ID
job_...

operator media reference
52

Comfy backend execution ID
prompt_id / backend_job_id
```

The internal `job_...` ID remains the database primary key. Comfy Prompt IDs remain backend execution identities. The short numeric reference is the operator-facing identity.

### One global numeric media-reference namespace

Migration `0011_job_numbers.sql` introduced `media_jobs.job_number BIGINT` and the sequence `media_jobs_job_number_seq`.

Migration `0012_media_references.sql` extends that same sequence into a global operator namespace:

```text
media_references.reference_number
        ↓
same media_jobs_job_number_seq
```

Existing Helix jobs are reserved as `kind = 'job'`. Future Helix jobs are registered automatically by a database trigger. Completed Comfy-only artifacts discovered in live history allocate `kind = 'comfy_artifact'` references from the same sequence.

The invariant is:

```text
one number -> one media execution
```

There is no separate Download-ID sequence and no separate Job-ID sequence exposed to Telegram.

Example:

```text
51 -> Helix image.t2i job
52 -> direct ComfyUI T2V artifact
53 -> Telegram /t2v Helix job
54 -> direct ComfyUI artifact
55 -> Telegram /t2i Helix job
```

PostgreSQL sequences are monotonic allocators, not gapless counters. Gaps are acceptable and must not be repaired by renumbering.

### Direct ComfyUI generations are not fake Helix jobs

A direct/manual ComfyUI generation has no Helix lifecycle row. Helix therefore does **not** insert a synthetic `media_jobs` record for it.

Instead:

```text
media_references
kind = comfy_artifact
reference_number = 52
backend_job_id = <Comfy Prompt ID>
job_id = NULL
```

This preserves truthful lifecycle semantics while still giving the operator one durable number.

The number is allocated when Helix first discovers the completed Comfy artifact in history. Once allocated, the Prompt ID -> numeric reference mapping is durable.

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

Additional terminal paths:

```text
running -> cancelled
running -> timed_out
backend error -> failed
```

Comfy's `prompt_id` is stored as `backend_job_id` for Helix-managed jobs. Queue/history reconciliation provides durable backend-state recovery once that backend ID is persisted.

## Telegram operator commands

`TelegramCommandService` is a narrow operator surface inside `helix-runtime`. It accepts messages only from the configured `HELIX_TELEGRAM_CHAT_ID`.

Current primary commands:

```text
/status        - Diagnostics
/queue         - Queue check
/j             - Helix jobs, 20 per page
/j p <page>    - Jobs page
/jb <number>   - Job/media details
/dl            - Completed GPU artifacts, 20 per page
/dl p <page>   - Downloads page
/dl i <number> - Inspect artifact
/dl g <number> - Get artifact
/outbox        - Send queue
/errors        - Recent failures
/ev <number>   - Job events
/t2v           - Generate video
/t2i           - Generate image
/cc <number>   - Cancel Helix job
```

Short aliases include `/st`, `/qu`, `/jbs`, `/jb`, `/ob`, `/err`, `/ev`, `/cc`, and `/h`.

### `/j` / `/jobs`

Shows Helix-managed `media_jobs` only, 20 items per page. Each row uses the durable numeric reference.

Direct ComfyUI runs are intentionally not inserted into this lifecycle list because they are not Helix jobs.

### `/jb <number>` / `/job <number>`

Numeric lookup first resolves the shared media-reference namespace.

For a Helix-managed reference, the detail view includes lifecycle state, Production Profile, tool, runtime, timestamps, Outbox/send state, and the semantic generation snapshot.

For a Comfy-only reference, `/jb <number>` resolves the same underlying Comfy execution used by Downloads and exposes the same numeric inspect/get commands instead of returning `Job not found`.

Therefore:

```text
/dl i 52
/jb 52
```

refer to the same media execution.

Legacy full Helix IDs and unique Helix UUID prefixes remain accepted where previously supported.

### `/dl` / `/downloads`

Reads live completed Comfy history and presents every discovered artifact with a numeric media reference.

Helix-managed history reuses that job's existing `job_number`. Direct ComfyUI history receives a durable `media_references.reference_number` from the same allocator.

The old operator-facing Prompt-prefix fallback is no longer used for discovered artifacts. Legacy Prompt prefixes remain accepted as input for compatibility, including historical workflows and copied references.

This fixes the previous ambiguity where a six-character Comfy Prompt prefix such as `161023` could be mistaken for a numeric Helix Job ID.

Commands converge on the same mapping:

```text
/dl
→ 52 · artifact.mp4

/dl i 52
→ inspect artifact 52

/dl g 52
→ retrieve artifact 52

/jb 52
→ resolve the same execution
```

Valid-empty Comfy history remains distinct from unavailable/malformed history.

## Cancellation and timeout

The pinned Comfy worker exposes prompt-specific cancellation through:

```text
POST /api/jobs/{prompt_id}/cancel
```

Helix exposes this through:

```text
POST /v1/media/jobs/:jobId/cancel
```

Telegram `/cancel <number>` / `/cc <number>` uses durable yes/no confirmation and delegates to `JobService`; Telegram does not control Comfy directly.

Running-job timeout is configured with `HELIX_JOB_TIMEOUT_SECONDS`.

## T2V and T2I operator generation

`/t2v` and `/t2i` separate prompt entry from GPU execution. Prompt/setting snapshots are captured before confirmation and no media job is submitted until the operator confirms `yes`.

Current logical profiles:

```text
Christopher Nolan
└── video.i2v / video.t2v

Annie Leibovitz
└── image.t2i
```

The current T2V surface includes persisted semantic settings plus Manual/Fast/Quality modes. The current T2I surface intentionally remains narrow: prompt, aspect and seed around the validated FLUX.2 Klein 4B Distilled FP8 workflow.

## Durable Telegram output delivery

Generation and delivery remain separate durable states.

```text
job succeeded
    ↓
media_deliveries row
    ↓
Comfy /view
    ↓
VPS temporary spool
    ↓
Telegram sendDocument
    ↓
persist Telegram message ID
    ↓
remove temporary copy
```

Delivery claims use PostgreSQL state, `FOR UPDATE SKIP LOCKED`, stale-claim recovery, bounded retries, and exponential backoff.

Original media is sent as a Telegram document/file so Telegram does not intentionally recompress the artifact.

## Database migrations

Current applied Production migration checkpoint is through:

```text
0012_media_references.sql
```

`0012` was applied after a custom-format `pg_dump` backup. It reserved 51 existing Helix Job numbers successfully before the updated runtime was deployed.

The migration creates:

- `media_references`;
- unique Job and Comfy-artifact mappings;
- backfill of existing `media_jobs.job_number` values;
- `register_media_job_reference()`;
- an `AFTER INSERT` trigger for future Helix jobs.

Do not run runtime code that expects `media_references` against a database where `0012` has not been applied.

## Validation checkpoint

The media-reference change is covered by the runtime test suite. The VPS host test run after pulling the change completed:

```text
32 tests
32 passed
0 failed
```

Coverage includes:

- numeric allocation for Comfy-only artifacts;
- `/dl` list/inspect/get resolution;
- legacy Prompt-prefix input with numeric presentation;
- exact numeric Job lookup;
- Comfy-only numeric `/jb` representation;
- the shared-sequence migration contract;
- the all-digit Comfy Prompt-prefix collision class that caused the original bug.

The VPS host currently uses Node 26 for local test commands and therefore emits an `EBADENGINE` warning because the package declares `>=24 <25`. The deployed runtime image remains the intended Node 24 production environment.

## Runtime stack

- TypeScript
- Fastify
- Zod
- ws
- PostgreSQL via `pg`
- Node 24 production container
- ffprobe/FFmpeg in the production image
- strict TypeScript
- multi-stage Docker build

## Operational rules

- Keep raw ComfyUI private over Tailscale.
- Keep `maxConcurrentGpuJobs: 1` for the current RTX 4060 worker.
- Preserve the durable worker ID even when display names change.
- Treat the Comfy revision as a production pin; update deliberately after validation.
- Keep Telegram write scope narrow; no shell/restart/package-update actions.
- Do not let n8n own low-level Comfy polling/tracking.
- Do not store Telegram/database credentials in Git.
- Preserve one global numeric media-reference namespace.
- Do not create fake `media_jobs` rows for direct ComfyUI generations.
- Keep raw node IDs behind Production binders rather than exposing them as long-term Helix semantics.

## Next direction

Production runtime work should now proceed feature-by-feature without reopening the numeric identity model. The next main Helix brain direction remains Niche Intelligence, while Production-specific features can continue as a separate workstream behind the stable worker/runtime boundary.
