# LTX Director

This folder is the Helix Production workspace for evaluating and integrating LTX Director-style control surfaces as controllable ComfyUI/LTX backends.

It is **not** the Helix Director. Helix Director stays model/provider agnostic. This folder is about how Production can compile controlled shot/timeline intent into LTX Director / ComfyUI execution state.

## Current objective

Build and validate the smallest direct Production slice before adding n8n or agents:

```text
manual test input
  -> temporary Production/Director shot state
  -> LTX Director adapter/compiler
  -> ComfyUI workflow/API
  -> LTX 2.5 generation
  -> result + generation metadata
  -> human review
```

The trigger remains separate from creative/control input. n8n is intentionally not required for this first path.

## Current status — 2026-08-21

### D0: single-prompt Director path — PASS

Validated locally:

- WhatDreamsCost `LTX Director` and `LTX Director Guide` load successfully;
- the known-good native LTX 2.5 I2V backend is preserved separately;
- Director is integrated inside the LTX 2.5 subgraph because that template keeps the real model/CLIP/VAE/samplers/upscale/decode graph inside the subgraph;
- the Director topology follows the upstream two-stage pattern: Guide `0.5` -> Stage 1 -> Crop Guides -> x2 latent upscale -> Guide `1.0` -> Stage 2;
- one starting image + one global prompt completed end-to-end and saved a playable video;
- successful D0 output: `LTX-2.5_i2v_00017_.mp4`;
- generation time observed in ComfyUI: about `403.6 s` / `6m43s`.

### Critical dimension lesson

Leaving Director width/height at zero inherited the large source image and generated a `3168x1792` latent, causing extreme memory pressure.

The stable local tests explicitly constrain the Director target and observed an actual legal latent around `1248x704` for the 16:9 source.

Do not leave dimensions implicit when the source guide is much larger than the intended generation size.

### D1: Prompt Relay — PASS

Prompt Relay was verified with three timed local prompts. Runtime logs showed:

```text
PromptRelay Global token range
PromptRelay Segment 0 token range
PromptRelay Segment 1 token range
PromptRelay Segment 2 token range
Latent temporal segments: [8, 9, 8]
Prompt Relay penalty matrices built during both sampling stages
```

This proves the model was not using the single-prompt bypass path.

### D2: extreme Prompt Relay stress test — PASS as mechanism test

A deliberately extreme daylight -> thunderstorm -> neon-tunnel sequence caused the generation to attempt the temporal changes. The result also showed the practical limitation: an 8-second window is too short and too strongly anchored for radical world changes to become clean, production-ready transitions.

Conclusion: Prompt Relay works, but it should be used as within-window temporal control rather than assumed to solve long-scene continuity by itself.

## Next experiment: CGlide scene chaining

Research identified `CGlide/LTX-2.5-Director` as a promising existing implementation rather than building frame chaining from scratch.

The fork adds explicit 2.5-oriented nodes including:

```text
LTX Director CS (2.5)
LTX Director Guide CS (2.5)
LTX Director Crop Guides CS (2.5)
LTX Chunk Writer CS (2.5)
LTX Chunk Assembler CS (2.5)
```

Its chunk writer saves the final N frames of a generated chunk as lossless PNG handoffs for the next chunk, aligns handoff counts to multiples of 8, and can assemble long runs with explicit seam policies and audio.

The next validation sequence is:

```text
C0  CGlide one-chunk smoke test
C1  prove 8-frame handoff writing
C2  prove a two-chunk continuation
C3  attempt a four-chunk ~32-second logical scene
```

Do not jump directly to identity banks, Motion Track, automated metrics or agent mutation before C2 proves the existing chaining primitive is useful.

See `CGLIDE_CHUNKING.md` for install/rollback and the planned experiments.

## Architecture note for the future control surface

The current ComfyUI graphs are execution prototypes, **not** the final agent-facing interface.

The eventual Production control surface should make useful controls explicit and machine-writable while keeping LTX-specific serialization inside the adapter. Candidate controls include:

- global prompt;
- timed local prompts / Prompt Relay segments;
- duration / fps / output dimensions;
- image keyframes and per-guide strengths;
- start/end-frame behavior;
- motion / IC-LoRA guidance and strengths;
- audio timeline / inpainting / override behavior;
- long-scene chunk/handoff policy if CGlide proves reliable;
- extension;
- retake range, prompt and strength;
- model/backend execution settings;
- seed and reproducibility metadata.

An AI agent may later propose replacements or mutations to these controls, but the execution contract should remain explicit so humans can inspect and override exactly what will be sent.

See `INSTALL.md` for the confirmed WhatDreamsCost workstation setup, `CGLIDE_CHUNKING.md` for the alternate scene-chaining test path, `DIRECTOR_SHOT.md` for the temporary input contract, and the D0/D1 notes for validation evidence.
