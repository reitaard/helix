# LTX Director

This folder is the Helix Production workspace for evaluating and integrating LTX Director-style control surfaces and long-video continuation backends.

It is **not** the Helix Director. Helix Director remains model/provider agnostic. This folder is about how Production can compile explicit generation intent into LTX/ComfyUI execution state.

## Proven local foundation

The workstation has already validated:

- native/local LTX 2.5 two-stage I2V generation;
- WhatDreamsCost/CGlide-style Director wiring inside the LTX 2.5 subgraph;
- Prompt Relay with multiple temporal regions;
- appended image/keyframe guidance;
- explicit dimensions to avoid accidental source-size latents;
- CGlide chunk writing, handoff PNGs, audio joining and final assembly.

## Current long-video finding

CGlide produced a real two-chunk continuation:

```text
193-frame chunk 1
193-frame chunk 2
8-frame overlap
378-frame final @ 24 fps
~15.75 s assembled video + aligned audio
```

The bike/rider/world remained broadly coherent, so chaining is considered a successful mechanism test. The remaining concerns are:

- motion/camera-velocity smoothness at the seam;
- possible realism/detail degradation in later chunks;
- unknown drift over more than two chunks.

## Active comparison: three tracks

Do not declare a winner yet. Production will compare:

```text
A. CGlide only
B. Lightricks ComfyUI-LTXVideo only
C. hybrid, only after A and B are understood
```

The official Lightricks `LTXVLoopingSampler` is the next test because it uses overlapping temporal tiles and previous-tile conditioning rather than CGlide's current single-handoff-image continuation.

See:

- `LONG_VIDEO_COMPARISON.md` — decision tracks, metrics and test order;
- `CGLIDE_CHUNKING.md` — proven CGlide baseline and limitations;
- `LIGHTRICKS_LOOPING.md` — official package install and next test plan;
- `INSTALL.md` — confirmed original workstation setup;
- `DIRECTOR_SHOT.md` — temporary Production-side test contract.

## Architecture boundary

The current ComfyUI graphs are execution prototypes, not the final agent-facing interface.

Useful Production controls may eventually include:

- global prompt;
- timed local prompts;
- duration/fps/dimensions;
- image keyframes and strengths;
- motion / IC-LoRA controls;
- retake/extension controls;
- long-video continuation policy;
- seed/backend execution settings.

But backend-specific continuation details should remain behind a Production adapter until experiments show which controls deserve to become stable Helix concepts.
