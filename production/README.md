# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

## Current active execution workstream

```text
n8n / caller
    ↓
helix-runtime
    ↓
helix-db + worker/job/delivery state
    ↓
ComfyAdapter
    ↓
ComfyUI over Tailscale
    ↓
helix-rtx4060-01
    ↓
generated asset
    ↓
VPS temporary spool
    ↓
Telegram delivery
```

The worker/runtime path now supports durable job acceptance, Comfy submission, `prompt_id` tracking, queue/history reconciliation, restart recovery, artifact capture, artifact retrieval, media probing, durable Telegram delivery, retry state, and temporary spool cleanup.

See [`production/comfyui-worker/`](comfyui-worker/) for the focused worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 generation and exposes the known-good ComfyUI/custom-node stack through the private API on port `8188`.

LTX/Director workflow experiments remain execution research, not a frozen runtime contract. Existing findings include:

- native LTX 2.5 I2V;
- native full-resolution LTX 2.5 I2V;
- CGlide Director-style controls;
- Prompt Relay temporal regions;
- CGlide chunk continuation;
- Lightricks LoopingSampler temporal extension.

See [`production/ltx-director/`](ltx-director/) for those experiment notes.

## Current rule for workflow integration

Do not make the runtime wait for a final workflow abstraction, but also do not hard-code a large semantic input contract while the workflows are still changing.

```text
raw Comfy API workflow
        ↓
prove execution + outputs
        ↓
continue workflow optimization in ComfyUI
        ↓
choose stable I2V / T2V workflow families
        ↓
freeze/version those graphs
        ↓
add semantic bindings around stable controls
```

The current raw workflow submission path is intentionally useful while I2V controls, Prompt Relay behavior, sampler settings, prompt surfaces, and future T2V graphs are still evolving.

## Worker/runtime ownership

The runtime owns:

- worker identity and health;
- durable job IDs/state/events;
- submission to ComfyUI;
- execution tracking/reconciliation;
- generated artifact metadata;
- artifact retrieval and temporary spooling;
- delivery state/retry and Telegram transport;
- next: controlled artifact retention and later cancellation/timeouts.

ComfyUI owns:

- workflow graph execution;
- model/custom-node execution;
- worker-local input/output files;
- native queue/history/WebSocket execution state.

## Immediate next work

Input staging and semantic prompt/sampler/relay bindings are intentionally deferred until the workflow control surface stabilizes.

The next workflow-independent runtime milestone is controlled worker output retention cleanup: retain Helix-managed worker artifacts for an initial 24-hour safety window, then remove only known Helix outputs rather than sweeping the whole Comfy output tree.

After retention cleanup, harden generation timeout/cancellation and delivery observability. Persistent WebSocket execution tracking remains optional because queue/history reconciliation already provides correctness.
