# LTX Director / ComfyUI Automation Research

**Checked:** 2026-08-21  
**Status:** Production research input, not a permanent architecture commitment.

## Question

How much of LTX Director-style control can be driven by Helix agents/headless APIs while humans keep manual creative control where it is useful?

## Sources checked

- `https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI`
- `https://github.com/CGlide/LTX-2.5-Director`
- Director Python/JS implementation files
- upstream example workflows
- local LTX 2.5 runtime logs and generated outputs

## Direct observations

The Director node is not only a visual editor. Its backend accepts structured state including:

- `global_prompt`;
- `timeline_data`;
- `local_prompts` and `segment_lengths`;
- image guide strengths;
- start/end/duration in frames or seconds;
- frame rate and output dimensions;
- resize/compression settings;
- custom audio/motion flags.

Timeline state can represent image/video, motion, and audio segments. Retake-capable variants also carry base video, retake range, prompt and strength.

The browser editor serializes machine-readable state into workflow/node inputs, so direct state compilation is a better automation target than mouse/drag automation of the visual timeline.

## Two-stage wiring validated locally

The current local Director adaptation uses:

```text
LTX Director
    ↓
LTXVConditioning
    ↓
LTX Director Guide (scale_by = 0.5)
    ↓
Stage 1 sampler
    ↓
LTX Director Crop Guides
    ↓
x2 latent upscaler
    ↓
LTX Director Guide (scale_by = 1.0)
    ↓
Stage 2 sampler
    ↓
decode / save
```

The local path keeps the already-working LTX 2.5 transformer, Gemma 4 encoder, BF16 VAEs, latent upscaler and two-stage sampling/decode stack.

## Local runtime evidence

### D0 — PASS

Single-image + single-global-prompt Director generation completed successfully.

Observed output/runtime:

- playable LTX 2.5 video;
- roughly 8 seconds at 24 fps;
- generation time about `403.6 s`;
- successful small Director target with actual latent around `1248x704` for the 16:9 source.

A failed earlier configuration left Director width/height at zero. That inherited the 3200x1800 source and generated a `3168x1792` latent, causing extreme memory pressure. Explicit dimensions are required on this workstation.

### D1 — Prompt Relay PASS

Prompt Relay with three timed local prompts was confirmed active by runtime logs showing:

```text
Global token range
Segment 0 token range
Segment 1 token range
Segment 2 token range
Latent temporal segments: [8, 9, 8]
Prompt Relay penalty matrices built in both sampling stages
```

This confirms the workflow was not taking the single-prompt bypass.

### D2 — extreme Prompt Relay stress test

An intentionally large daylight -> thunderstorm -> neon-tunnel progression caused the model to attempt temporal changes, but an 8-second window was not sufficient for clean radical scene transformation.

Conclusion: Prompt Relay is validated as a within-window temporal control mechanism. It is not, by itself, a long-scene continuity solution.

## CGlide long-scene finding

`CGlide/LTX-2.5-Director` is now the next candidate because it already implements long-video chunking instead of requiring Helix to invent frame chaining immediately.

Its 2.5 package exposes:

```text
LTX Director CS (2.5)
LTX Director Guide CS (2.5)
LTX Director Crop Guides CS (2.5)
Clean Latent Slice CS (2.5)
LTX Chunk Writer CS (2.5)
LTX Chunk Assembler CS (2.5)
```

The chunk writer can save the final N frames of each chunk as lossless PNG handoff frames, snap handoff length to an 8-frame temporal stride, and assemble later chunks with explicit seam modes and audio handling.

This is the first existing implementation to validate before creating a broader Helix scene-continuity abstraction.

See `research/LTX_SCENE_CONTINUITY.md` and `production/ltx-director/CGLIDE_CHUNKING.md`.

## Helix inference

LTX Director remains a Production adapter/control surface, not Helix Director itself.

A useful provisional boundary remains:

```text
ContentSpec + VariantPlan
        ↓
Production planning
        ↓
ProductionPlan
        ↓
Backend adapter
   ├── native LTX
   ├── LTX Director / ComfyUI
   ├── CGlide long-scene Director
   ├── hosted provider
   └── future backend
        ↓
MediaAsset
```

`ProductionPlan` remains only a working internal name. Helix should not adopt one tool's timeline/chunk JSON as its canonical cross-system schema.

## Agent opportunities after the execution primitives are proven

Agents can plausibly automate:

- creative beats -> timed prompt segments;
- start/middle/end keyframe selection;
- reference/motion guidance selection;
- timeline/audio/motion compilation;
- continuation/chunk planning if CGlide proves reliable;
- seed/parameter sweeps;
- ComfyUI job submission/monitoring;
- failure diagnosis and targeted retry/retake suggestions;
- manifests, lineage, cost and latency metadata.

Human review remains important for subjective pacing, continuity judgment, ambiguous failures and final approval.

## Current validation order

1. Install CGlide safely as an alternate Director package without losing the proven WhatDreamsCost setup.
2. Prove one CGlide-controlled LTX 2.5 render on the current workstation.
3. Prove `LTX Chunk Writer CS (2.5)` creates the intended 8 PNG handoff frames.
4. Prove a two-chunk continuation is more coherent than an independent second chunk.
5. Only then attempt a four-chunk approximately 32-second continuous scene.
6. After chaining is useful, test long-term identity reinforcement and official LTX 2.5 IC-LoRA/motion controls separately.
7. Only after the execution path is reliable should Helix expose a broader agent-facing continuity contract.
