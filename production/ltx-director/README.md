# LTX Director

This folder is the Helix Production workspace for evaluating and integrating WhatDreamsCost's LTX Director as a controllable ComfyUI/LTX backend.

It is not the Helix Director. Helix Director remains model/provider agnostic and produces creative intent. This folder covers how Production can translate a small machine-readable shot description into LTX Director / ComfyUI execution state.

## Current objective

Build the smallest successful vertical slice:

```text
manual test input
  -> DirectorShot
  -> LTX Director adapter/compiler
  -> ComfyUI API
  -> LTX 2.5 generation
  -> result + generation metadata
  -> human review
```

Initial scope:

- manual trigger kept separate from shot input;
- global prompt;
- timed local prompt segments;
- one starting image;
- optional additional image keyframes once the baseline works;
- duration / fps / seed;
- direct ComfyUI execution first;
- no n8n dependency in the first path.

Later scope:

- IC-LoRA/reference and motion-guide tracks;
- retake;
- extension;
- audio timeline;
- automated QA/retry;
- n8n orchestration after the direct path is proven.

See `INSTALL.md` for installation/validation notes and `DIRECTOR_SHOT.md` for the first tiny shot contract.
