# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

## Current execution path

```text
n8n / caller
    ↓
helix-runtime
    ↓
helix-db + worker/job/delivery state
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
Telegram delivery
```

The worker/runtime boundary is now a stable checkpoint. It supports durable job acceptance, raw Comfy workflow submission, `prompt_id` persistence, queue/history reconciliation, restart recovery, artifact capture/retrieval, cancellation, running-job timeout, Telegram delivery, bounded delivery retry, delivery observability, and immediate VPS spool cleanup.

See [`production/comfyui-worker/`](comfyui-worker/) for the focused worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 I2V generation and exposes the pinned ComfyUI/custom-node stack only through the private Tailscale path.

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

- worker identity and health;
- durable job IDs/state/events;
- Comfy submission and backend job ID persistence;
- execution reconciliation and restart recovery;
- prompt-specific cancellation;
- configurable running-job timeout;
- generated artifact metadata and retrieval;
- temporary spooling and media probing;
- durable Telegram delivery state;
- bounded retry/backoff and terminal delivery failures;
- delivery state returned from the media-job API.

ComfyUI owns:

- workflow graph execution;
- model/custom-node execution;
- worker-local input/output files;
- native queue/history/WebSocket execution state.

## Current checkpoint

Workflow-independent runtime hardening is complete enough to pause here.

Completed after the first delivery milestone:

- `POST /v1/media/jobs/:jobId/cancel`;
- race-safe terminal job transitions;
- configurable running-job timeout (`HELIX_JOB_TIMEOUT_SECONDS`, deployed as 3600 seconds);
- delivery state embedded in `GET /v1/media/jobs/:jobId`;
- maximum five delivery attempts with exponential backoff;
- permanent malformed-artifact failures stop immediately;
- terminal delivery failures use `status = failed` with no next retry time.

Controlled worker-output deletion remains deferred. The normal Comfy output path does not currently give this runtime a sufficiently clean per-artifact delete primitive, so adding a worker-side deletion service only for retention is not justified at this checkpoint.

Persistent WebSocket execution tracking also remains optional because queue/history reconciliation already provides correctness.

## Next direction

Return to Comfy/LTX workflow development. Build and optimize the I2V and simple T2V graphs in ComfyUI, continue exposing whatever controls prove useful, and keep submitting raw API-format graphs through Helix when runtime execution is needed.

Only freeze workflow packages and semantic input bindings after the workflow families are stable enough to deserve a contract.
