# LTX Director

This folder is the Helix Production workspace for evaluating and integrating WhatDreamsCost's LTX Director as a controllable ComfyUI/LTX backend.

It is **not** the Helix Director. Helix Director stays model/provider agnostic. This folder is about how Production translates a small machine-readable shot description into LTX Director / ComfyUI execution state.

## Current objective

Build the smallest successful vertical slice:

```text
manual test input
  -> DirectorShot
  -> LTX Director adapter/compiler
  -> ComfyUI API/workflow
  -> LTX 2.5 generation
  -> result + generation metadata
  -> human review
```

The trigger remains separate from the shot input. n8n is intentionally not required for the first direct path.

## Current D0 status

As of 2026-08-21:

- WhatDreamsCost-ComfyUI is installed and `LTX Director` / `LTX Director Guide` load successfully;
- ComfyUI-KJNodes is installed because upstream Director example workflows use KJNodes components;
- the active workstation uses ComfyUI Desktop code under AppData but `C:\Users\MSP-PC\Documents\ComfyUI` as the active base directory, custom-node directory, user data root, and Python venv;
- a PyAV compatibility error was fixed by upgrading the active venv to `av>=16.0.0`;
- the known-good native LTX 2.5 I2V workflow remains preserved separately;
- a D0 Director-enabled LTX 2.5 workflow has been built and structurally checked, but **runtime generation is not yet validated**.

## D0 workflow architecture

The upstream Director distilled example uses a two-stage pattern. We keep that pattern while retaining the already-working LTX 2.5 model/sampler/upscale/decode backend:

```text
LTX 2.5 model + CLIP + audio VAE
            ↓
        LTX Director
            ↓
      LTXVConditioning
            ↓
LTX Director Guide (scale 0.5)
            ↓
      Stage 1 sampler
            ↓
   separate AV latent
            ↓
 LTX Director Crop Guides
            ↓
      x2 latent upscale
            ↓
LTX Director Guide (scale 1.0)
            ↓
      Stage 2 sampler
            ↓
       decode / save
```

This matches the topology of upstream `LTX_Director_2_Workflow_Distilled.json`: the 0.5 Guide is Stage 1, its sampled video latent is cropped for guide alignment, the latent is upscaled, and the 1.0 Guide is applied for Stage 2.

## Why Director is inside the LTX 2.5 subgraph

The current ComfyUI LTX 2.5 template wraps the real model, CLIP, VAE, samplers, latent upscale, and decode nodes inside `Image to Video (LTX-2.5)`.

Therefore the D0 integration places LTX Director **inside that subgraph**, next to the execution nodes it must control. This is an implementation detail of this ComfyUI template, not a Helix contract. Workflows that expose their LTX execution graph at the top level can place Director at the top level instead.

Production should eventually hide either layout behind the same adapter.

## D0 scope

The first runtime test contains only:

- one starting image;
- one global prompt;
- 8 seconds at 24 fps;
- Director image guidance;
- existing LTX 2.5 two-stage generation;
- no Prompt Relay transitions yet;
- no IC-LoRA/motion track;
- no custom audio track;
- no retake or extension;
- no automated QA;
- no n8n dependency.

See `INSTALL.md` for the confirmed local setup, `DIRECTOR_SHOT.md` for the temporary input contract, and `TEST_D0.md` for the current runtime test procedure.
