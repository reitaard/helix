# Production

Production is the execution layer. This area contains the currently active ComfyUI worker/runtime work as well as model/workflow experiments.

## Current active execution workstream

The immediate implementation focus is the dedicated ComfyUI GPU worker:

```text
n8n / caller
    ↓
helix-runtime
    ↓
helix-db + worker/job state
    ↓
ComfyAdapter
    ↓
ComfyUI over Tailscale
    ↓
helix-rtx4060-01
    ↓
generated asset
```

The worker and runtime are already connected and healthy. Readiness is persisted in PostgreSQL. The next milestone is to accept a durable job through `helix-runtime`, submit a Comfy API workflow through `/prompt`, track the resulting `prompt_id`, and return generated asset metadata.

See [`production/comfyui-worker/`](comfyui-worker/) for the focused worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 generation and currently exposes the known-good ComfyUI/custom-node stack through the private API on port `8188`.

LTX/Director workflow experiments remain execution research, not a frozen runtime contract. Existing findings include:

- native LTX 2.5 I2V;
- native full-resolution LTX 2.5 I2V;
- CGlide Director-style controls;
- Prompt Relay temporal regions;
- CGlide chunk continuation;
- Lightricks LoopingSampler temporal extension.

See [`production/ltx-director/`](ltx-director/) for those experiment notes.

## Current rule for workflow integration

Do not make the runtime wait for a final workflow abstraction before proving API execution.

The first runtime-controlled generation may accept a raw Comfy API-format workflow graph and an already-staged worker input. Once a graph is selected as a stable baseline, it can be frozen into a versioned workflow package with semantic bindings.

```text
raw API workflow first
        ↓
prove /prompt + tracking + outputs
        ↓
freeze known-good workflow
        ↓
add bindings/versioning
```

## Worker/runtime ownership

The runtime owns:

- worker identity and health;
- durable job IDs/state/events;
- submission to ComfyUI;
- execution tracking/reconciliation;
- generated output metadata;
- later cancellation/recovery and asset retention.

ComfyUI owns:

- workflow graph execution;
- model/custom-node execution;
- worker-local input/output files;
- native queue/history/WebSocket execution state.

For the current milestone, keep this workstream limited to getting the ComfyUI worker to accept jobs and produce retrievable assets reliably.
