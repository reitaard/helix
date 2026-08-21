# LTX Director

This folder is the Helix Production workspace for evaluating and integrating WhatDreamsCost's LTX Director as a controllable ComfyUI/LTX backend.

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
- generation time observed in ComfyUI: about `403.6 s` / `6m43s`;
- output observed at `1280x704`, 24 fps, ~8 seconds.

### Important D0 lesson: Director dimensions must be explicit

Leaving `LTXDirector.custom_width = 0` and `custom_height = 0` made Director inherit the original 3200x1800 guide image. It produced a `3168x1792` latent and extreme memory pressure.

For the validated local path we explicitly set:

```text
custom_width  = 1280
custom_height = 704
divisible_by  = 32
resize_method = maintain aspect ratio
```

Do not leave these at zero when the source guide is much larger than the intended generation size.

## D1: Prompt Relay — next runtime test

D1 keeps the same LTX 2.5 backend, image and seed but changes Director from one prompt to:

```text
global prompt
+
0.0-2.5 s local prompt
2.5-5.5 s local prompt
5.5-8.0 s local prompt
```

This is the first test where Prompt Relay temporal attention should be visibly distinguishable from ordinary single-prompt I2V.

See `TEST_D1.md`.

## Architecture note for the future control surface

The current ComfyUI graph is an execution prototype, **not** the final agent-facing interface.

The final Production control surface should make the useful Director controls explicit and machine-writable while keeping LTX-specific serialization inside the adapter. Candidate controls include:

- global prompt;
- timed local prompts / Prompt Relay segments;
- duration / fps / output dimensions;
- image keyframes and per-guide strengths;
- start/end-frame behavior;
- motion / IC-LoRA guidance and strengths;
- audio timeline / inpainting / override behavior;
- extension;
- retake range, prompt and strength;
- model/backend execution settings;
- seed and reproducibility metadata.

An AI agent may later propose replacements or mutations to these controls, but the execution contract should remain explicit so humans can inspect and override exactly what will be sent.

See `INSTALL.md` for the confirmed workstation setup, `DIRECTOR_SHOT.md` for the temporary input contract, and the D0/D1 test notes for current validation evidence.
