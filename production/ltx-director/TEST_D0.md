# D0 runtime test — PASS

**Goal:** prove that LTX Director can control the existing local LTX 2.5 two-stage generation path.

**Result:** PASS on 2026-08-21.

## Validated topology

```text
outer manual prompt
    ↓
LTX Director global prompt
    +
Director timeline starting image
    ↓
LTX Director Guide scale 0.5
    ↓
existing LTX 2.5 Stage 1
    ↓
Crop Guides -> x2 latent upscale
    ↓
LTX Director Guide scale 1.0
    ↓
existing LTX 2.5 Stage 2
    ↓
decode / SaveVideo
```

This follows the current upstream distilled Director two-stage topology while retaining the already-working local LTX 2.5 backend.

## Attempt 1 — stopped

Director width/height were left at zero. Because zero means derive dimensions from the guide, the 3200x1800 source image caused:

```text
Auto-generated LTXV latent: 3168x1792, 193 pixel frames (25 latent frames)
```

The workflow reached Director Guide and sampler model initialization, but memory pressure became excessive. This run was stopped.

## Attempt 2 — PASS

Director target dimensions were fixed explicitly:

```text
custom_width  = 1280
custom_height = 704
divisible_by  = 32
resize_method = maintain aspect ratio
```

Observed result:

```text
Output: LTX-2.5_i2v_00017_.mp4
Generation time: ~403.6 s / 6m43s
Resolution: 1280x704
Frame rate: 24 fps
Duration: ~8 s
Starting image respected: yes
Director executed: yes
Stage 1 completed: yes
Stage 2 completed: yes
Playable video saved: yes
```

The visual result still showed some late-shot motorcycle geometry/ghosting degradation. D0 does not attempt to solve that; its purpose was execution-path validation.

## What D0 proves

```text
outer prompt -> Director                          PASS
Director timeline image                           PASS
single-prompt Director encoding                   PASS
Director Guide Stage 1                            PASS
Crop Guides / x2 upscale                          PASS
Director Guide Stage 2                            PASS
LTX 2.5 decode/save                               PASS
explicit Director dimension requirement discovered PASS
```

D0 does **not** prove Prompt Relay timing, additional keyframes, motion/IC-LoRA, custom audio, extension, retake, or automated QA.

Next runtime test: `TEST_D1.md`.
