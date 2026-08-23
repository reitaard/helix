# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

## Current execution path

```text
n8n / caller / Telegram
    ↓
helix-runtime
    ├── helix-db + worker/job/delivery/operator state
    ├── TelegramCommandService (operator/debug surface)
    ├── TelegramAlertService (durable operational alerts)
    ├── TelegramCancelService (confirmed cancellation)
    ├── TelegramT2VService (prompt capture + confirmed T2V submission)
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

The worker/runtime boundary is a stable checkpoint. It supports durable job acceptance, raw Comfy workflow submission, `prompt_id` persistence, queue/history reconciliation, restart recovery, artifact capture/retrieval, cancellation, running-job timeout, durable Telegram delivery, bounded delivery retry, delivery observability, immediate VPS spool cleanup, live diagnostics, operator inspection, proactive alerts, complete debug views, guarded Telegram cancellation, and a narrow native T2V input path.

See [`production/comfyui-worker/`](comfyui-worker/) for the focused worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 I2V and T2V generation and exposes the pinned ComfyUI/custom-node stack only through the private Tailscale path.

The durable worker ID is `helix-rtx4060-01`; the human-facing display name is `Christopher Nolan`. The current Comfy revision is pinned at `7dde56176efa71fd74ef7b3930ab5882d1926288`.

Current validated media capabilities are:

```text
video.i2v
video.t2v
```

LTX/Director workflow experiments remain execution research, not a frozen runtime contract. Existing findings include native LTX 2.5 I2V, full-resolution I2V, native LTX 2.5 T2V, CGlide Director-style controls, Prompt Relay temporal regions, CGlide chunk continuation, and Lightricks LoopingSampler temporal extension.

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

The first native T2V runtime binding is deliberately narrow: Helix changes only the positive prompt at `405:376.inputs.value` in the vetted API-format workflow. Resolution, duration, FPS, prompt enhancement, negative prompt, model and sampler controls remain fixed for this checkpoint and will be designed as a separate settings surface.

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
- Telegram diagnostics, inspection, alerts, debug views, confirmed cancellation, and confirmed T2V submission;
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
/t2v         - Generate video
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

`/status` reports runtime/database health, worker presentation name/state, queue state, backend versions, GPU/VRAM/RAM, and cached upstream Comfy drift. Runtime, queue and capability checks define execution readiness; a transient WebSocket-events timeout remains visible as an advisory warning but does not by itself mark an otherwise executable worker `Degraded`.

`/jobs` shows the five most recent jobs with full durable IDs. `/job` accepts a full ID or unique short prefix and tolerates copied trailing dots.

`/outbox` excludes already-delivered items and summarizes `pending`, `sending`, `retrying`, and terminal `failed` states. `OutboxRepository` is read-only; `DeliveryWorker` remains the only delivery executor.

`/errors` shows recent failed/timed-out generation jobs and terminal Outbox failures using full durable IDs.

`/events <id>` shows the complete durable event timeline with local timestamps and actual technical event names.

### Confirmed cancellation

`/cancel <id>` and `/cc <id>` use durable terminal-style confirmation. The window is 60 seconds, three invalid responses abort the request, a new slash command silently abandons the pending confirmation, and expiry is quiet.

Confirmed intent delegates to the existing `JobService.cancel()` path. Telegram never calls ComfyUI directly for cancellation.

### Native T2V input

`/t2v` separates prompt entry from GPU execution:

```text
/t2v
  ↓
awaiting prompt
  ↓
prompt preview
  ↓
yes / no
  ↓ yes
video.t2v JobService submission
```

Migration `0005_t2v_confirmations.sql` adds `operator_pending_t2v`. The prompt-entry window is five minutes and the confirmation window is 60 seconds. Three invalid confirmation responses abort the action. A new slash command abandons the pending T2V action. No media job is created until `yes` is confirmed.

The current runtime workflow is deployment-managed at `/opt/helix-runtime/workflows/video_ltx2_5_t2v.api.json` and mounted read-only into the runtime container. It remains outside Git because the broader T2V workflow/settings contract is not frozen yet.

## Proven native T2V production run

The real production generation/delivery path was proven with:

```text
Helix job:    job_b270eea4177746d881c0c96d0f2f4b35
Tool:         video.t2v
Result:       succeeded
Runtime:      4m 10s
Artifact:     video/LTX_2.5_t2v_00001_.mp4
Video:        1280×704 · 5.0s
Audio:        present
Worker:       Christopher Nolan
Delivery:     Telegram, 1 attempt
```

This proved Telegram intent -> Helix durable job -> native LTX 2.5 generation -> durable reconciliation -> original-file Telegram return.

Delivered-file captions now use the actual Helix job tool, such as `[video.t2v]`, and the configured worker display name `Christopher Nolan`. The Job label is bold and the short durable ID remains monospace.

## Current checkpoint

The Production runtime and Telegram operator surface are locked as a stable checkpoint.

Completed:

- durable asynchronous submission and restart recovery;
- artifact capture/retrieval;
- original-file Telegram delivery and bounded retry;
- cancellation and running timeout;
- race-safe terminal job states;
- human-friendly worker presentation name;
- `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/errors`, `/events`, `/t2v`, `/cancel`, `/help`;
- full durable IDs and safe prefix lookup;
- durable operational alerts and deduplication;
- worker offline/recovered transition monitoring;
- complete timestamped event inspection;
- durable cancellation confirmation;
- durable T2V prompt/confirmation state;
- validated native `video.t2v` generation and Telegram delivery;
- tool-aware Telegram artifact captions;
- advisory WebSocket-event readiness semantics;
- read-only pinned-revision/upstream Comfy update awareness.

Still deferred:

- worker output-retention cleanup;
- actual image upload/staging;
- broader prompt/relay/sampler semantic bindings;
- T2V settings beyond the fixed prompt-only baseline;
- persistent WebSocket execution tracking;
- broader Telegram mutation commands.

A real Windows reboot -> automatic ComfyUI worker startup remains to be proven. A future naturally running generation can also provide an end-to-end proof of actual backend interruption through the confirmed cancellation path.

## Next direction

The next main Helix brain phase is **Niche Intelligence**, not additional Telegram/runtime expansion.

Production workflow work can resume separately with T2V settings design around the now-proven native LTX 2.5 baseline, plus continued I2V optimization. The settings work should expose stable Helix semantics rather than raw Comfy node controls.
