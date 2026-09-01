# Infrastructure

Infrastructure should support proven execution needs rather than speculative architecture.

As of the 2026-09-01 documentation reconciliation, the active Production infrastructure consists of one standalone ComfyUI RTX 4060 worker plus the VPS-side `helix-runtime`, dedicated PostgreSQL state, durable Telegram artifact delivery, and one shared operator-facing numeric media-reference namespace.

For detailed runtime/worker state, see:

- [`../production/comfyui-worker/README.md`](../production/comfyui-worker/README.md)
- [`../production/media-runtime/README.md`](../production/media-runtime/README.md)
- [`../docs/PROJECT_STATE.md`](../docs/PROJECT_STATE.md)

## Current Production path

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ↓
WorkerService + JobService
    ├── helix-db
    │   ├── workers + observations
    │   ├── media_jobs
    │   ├── media_references
    │   ├── media_job_events
    │   ├── media_deliveries
    │   ├── operator / Telegram state
    │   └── Production settings
    ↓
WorkerRegistry
    ↓
MediaAdapter
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
```

Raw ComfyUI is private over Tailscale and must not be publicly exposed.

## Physical worker

- OS: Windows
- GPU: NVIDIA GeForce RTX 4060
- VRAM: 8188 MiB
- system RAM: about 32 GB
- ComfyUI: `0.33.0`
- Python: `3.12.11`
- PyTorch: `2.10.0+cu130`
- worker ID: `helix-rtx4060-01`
- physical GPU concurrency: `1`

Logical Production Profiles share this one worker:

```text
nolan / Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz / Annie Leibovitz
-> image.t2i
```

LTX 2.5 is the validated standalone video execution family. FLUX.2 Klein 4B INT8 W8A8 is the current narrow T2I workflow candidate; the earlier Distilled FP8 path remains available for rollback.

## Worker filesystem

```text
C:\AI\ComfyUI-CLI\
├── .venv\
├── custom_nodes\
├── user\
├── input\
├── output\
└── extra_model_paths.yaml

C:\AI\start-comfy.ps1

C:\AI\HelixWorker\
├── config\worker.yaml
├── scripts\
├── inventory\
├── logs\
└── state\
```

Heavy model assets are consolidated under `C:\AI\Models\...` and exposed through `extra_model_paths.yaml`.

## Frozen known-good environment

ComfyUI core is pinned at:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

The worker stack is intentionally pinned. Upstream drift may be inspected, but worker mutation requires explicit update/restart/validation.

## Worker startup

Windows Task Scheduler contains the `Helix ComfyUI Worker` AtStartup task launching `C:\AI\start-comfy.ps1`.

Manual scheduled-task startup has been validated. A real Windows reboot/AtStartup validation is still pending.

## Private connectivity

Validated paths include:

- worker-local HTTP/WebSocket;
- main Windows PC -> worker over Tailscale;
- VPS host -> worker over Tailscale;
- n8n container -> VPS runtime;
- `helix-runtime` -> worker HTTP/WebSocket.

Validated Comfy surfaces include `/system_stats`, `/queue`, `/history`, `/history/{prompt_id}`, `/object_info`, `/view`, `/prompt`, prompt-specific cancellation, and `/ws`.

Image upload/staging remains deliberately deferred until broader I2V/reference input contracts stabilize.

## VPS runtime

Production runtime:

```text
container: helix-runtime
image: helix-runtime:dev
host binding: 127.0.0.1:8787
runtime target: Node 24 container
```

Dedicated database:

```text
container: helix-db
database family: PostgreSQL 16
private Docker network
persistent volume: helix-db-data
```

The 2026-09-01 verification observed `helix-runtime` up for four days and `helix-db` up for nine days with the database healthy.

The runtime exposes worker/readiness routes and asynchronous media-job create/read/cancel routes. n8n does not own low-level Comfy polling or node-event interpretation.

## Database / migration state

The repository contains Production migrations through at least:

```text
0011_job_numbers.sql
0012_media_references.sql
0013_telegram_forum_topics.sql
0014_telegram_job_lifecycle.sql
```

`0011` and `0012` established one durable numeric media-reference namespace shared by Helix jobs and direct ComfyUI artifacts.

The operator invariant is:

```text
one number -> one media execution
```

Direct ComfyUI generations do not create fake `media_jobs` rows; they receive durable reference mappings to their Comfy Prompt IDs.

### Verified live schema — 2026-09-01

The production PostgreSQL schema contains:

```text
telegram_job_lifecycles
operator_pending_t2i.confirmation_message_id
operator_pending_t2v.confirmation_message_id
```

This verifies that the effects of `0014_telegram_job_lifecycle.sql` are applied in Production.

## Execution/recovery model

Durable correctness comes from:

```text
PostgreSQL job
    ↓
backend_job_id / prompt_id
    ↓
Comfy /history + /queue
    ↓
reconcile durable state
```

The deployed runtime also contains persistent Comfy WebSocket execution telemetry using a stable Helix client identity. This improves progress presentation but does not replace queue/history reconciliation.

## Lifecycle runtime verification

The running `helix-runtime:dev` image was verified to contain the compiled lifecycle/progress implementation:

```text
/app/dist/telegram/progress-service.js
/app/dist/delivery/telegram.js
/app/dist/repositories/telegram-job-lifecycle-repository.js
/app/dist/adapters/comfy/events.js
```

This proves that the lifecycle/progress code and `0014` schema are both deployed. A successful fresh Telegram lifecycle smoke remains a separate validation step.

The sampled 24-hour runtime logs showed:

```text
[telegram] command poll failed [TypeError: fetch failed]
```

That error should be treated as a Telegram transport/health issue, not as evidence that the migration or lifecycle code is absent.

## Cancellation and timeout

The pinned worker exposes prompt-specific cancellation. Helix delegates cancellation through `JobService`, and running-job timeout reuses the same backend cancellation path.

Terminal state transitions are guarded against late reconciler overwrites.

## Artifact delivery

Generation and delivery remain separate durable states.

```text
Comfy artifact
    ↓
/view retrieval
    ↓
VPS temporary spool
    ↓
ffprobe / metadata
    ↓
Telegram delivery
    ↓
persist result
    ↓
remove temporary copy
```

Delivery uses PostgreSQL claim/retry state with bounded retries and stale-claim recovery.

The deployed Telegram lifecycle implementation can target an existing lifecycle message for primary artifact replacement through the runtime delivery path.

## Deferred infrastructure work

- worker output-retention cleanup;
- broader image/reference upload staging;
- service authentication before broader remote-client exposure;
- migration ledger/checksum automation;
- CI/integration-test enforcement;
- stronger submission-window recovery and idempotency hardening;
- investigate current Telegram polling transport failure and complete a live lifecycle smoke;
- real Windows reboot/AtStartup proof.

Persistent WebSocket execution telemetry is no longer listed as deferred because the implementation is deployed.

## Operational rules

1. Keep raw ComfyUI private over Tailscale.
2. Keep physical GPU concurrency at one until deliberate concurrency testing says otherwise.
3. Preserve durable worker identity independently from presentation names.
4. Do not auto-update ComfyUI/custom nodes.
5. Record/validate the worker stack before and after any upgrade.
6. Do not let n8n own low-level Comfy tracking.
7. Keep workflow JSON as execution assets; do not expose raw graph structure as the stable Helix contract.
8. Do not commit runtime/database/Telegram secrets.
9. Preserve one global numeric media-reference namespace.
10. Do not represent direct ComfyUI history as fake Helix lifecycle jobs.
11. Treat WebSocket execution events as advisory presentation telemetry rather than durable job truth.
