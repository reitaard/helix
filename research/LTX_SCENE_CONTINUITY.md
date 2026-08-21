# LTX Scene Continuity Research

**Checked:** 2026-08-21  
**Status:** Production research input. Do not treat as a frozen Helix architecture.

## Research question

How should a long logical scene be generated when the practical LTX generation window is much shorter, without assuming every chunk will preserve the same subject, camera, world state and motion automatically?

The immediate motivating failure case is simple: two independently generated motorcycle clips can contain a different bike/rider or an implausible camera/motion reset even if the prompts describe the same scene.

## Main finding

Existing long-video work consistently points toward two kinds of continuity memory:

```text
short-term state
  = what was happening immediately before the boundary
  = recent frames / pose / camera / motion

long-term state
  = what must remain the same across the scene
  = subject identity / wardrobe / vehicle / world / persistent constraints
```

Do not rely on prompt text alone, and do not let the immediately previous generated chunk become the only long-term source of truth, because drift can accumulate.

This is consistent with research systems such as StreamingT2V, FreeNoise, FIFO-Diffusion and FreeLong, which use different mechanisms to preserve information beyond a short diffusion context.

## Practical techniques ranked for the current stack

### 1. Existing CGlide chunk handoff — test first

Repository:

`https://github.com/CGlide/LTX-2.5-Director`

The fork is specifically presented as an LTX 2.5 Director build and already includes a `LTX Chunk Writer CS (2.5)` plus `LTX Chunk Assembler CS (2.5)`.

The writer's important behavior is directly visible in source:

- default `handoff_frames = 8`;
- handoff is snapped to a multiple of the LTX temporal stride of 8 pixel frames;
- handoff frames are saved as PNG because they are fed back as generation guides;
- chunk frames and audio can be assembled into a longer output;
- seam modes include an early shared-state cut and very short blend/S-curve options;
- the code explicitly warns that long blends reach into regions where independently generated chunks have already diverged.

This should be tested before Helix invents its own scene-chaining implementation.

### 2. Single-frame handoff — useful baseline

Use a clean late frame from chunk A as the start guide for chunk B.

Likely benefit:

- strong immediate appearance/composition continuity.

Likely weakness:

- a single still carries little velocity/camera-motion information;
- motion can reset or stagnate after the boundary.

Use as an A/B baseline, not the presumed final method.

### 3. Multi-frame handoff / overlap — primary continuation candidate

A short sequence of recent frames carries both appearance and motion clues. Eight frames at 24 fps span about 0.33 seconds; sixteen frames span about 0.67 seconds.

The existing CGlide primitive already centers on this idea, so begin with 8 rather than implementing a separate overlap mechanism.

### 4. Persistent identity/reference conditioning — later

For long scenes, previous generated frames alone can gradually mutate the subject. A separate canonical reference package may be useful later for the bike/rider/world.

Possible backends include:

- viewpoint-compatible image anchors;
- first/last keyframes;
- official LTX 2.5 IC-LoRA/reference workflows;
- Motion Track/structural guidance where useful.

Do not enable every reference mechanism at once. Establish whether chunk handoff works first.

## Important LTX 2.5 distinction

Native LTX 2.5 multi-shot generation and cross-inference chaining solve different problems.

Use native multi-shot where a reasonable single generation can contain deliberate editorial cuts while preserving character/scene/style.

Use chunk continuation where one logical continuous scene is longer than the practical generation window.

Do not chain every shot simply because a chunk writer exists.

## What CGlide adds beyond the currently validated Director

The current WhatDreamsCost-based local path has already proved:

- single-prompt Director execution;
- two-stage Director Guide wiring;
- Prompt Relay with three active temporal segments;
- appended image/keyframe guidance;
- local LTX 2.5 generation at practical 8-second scale.

CGlide adds a concrete long-video implementation candidate:

```text
render chunk
    ↓
write final N frames as clean handoff PNGs
    ↓
feed handoff into next Director window
    ↓
repeat
    ↓
assemble chunks/audio with explicit seam policy
```

That is more valuable right now than building automatic identity metrics or a new scene-manifest system from scratch.

## CGlide source facts verified

CGlide README states that the 2.5 build supports:

- timeline image/text/audio/video segments;
- Prompt Relay;
- image anchors and end frames;
- chunk rendering for long videos with audio;
- packed timelines.

Its 2.5 package registers:

```text
LTXDirectorCS25
LTXDirectorGuideCS25
LTXDirectorCropGuidesCS25
CleanLatentSliceCS25
LTXChunkWriterCS25
LTXChunkAssemblerCS25
```

with user-facing names ending in `CS (2.5)`.

Its chunk writer:

- writes handoffs under `input/ltx_director_handoff/<run>`;
- defaults to 8 handoff frames;
- always stores handoff frames losslessly as PNG;
- writes normal chunk frames separately;
- supports automatic final assembly and h264 output;
- exposes `early_cut`, `early_scurve`, `early_blend`, `dissolve`, and `hard_cut` seam modes;
- can level-match assembled chunks;
- supports chunk audio writing and joining.

## 2.5 reference-feature warning

CGlide intentionally disables older 2.3 `@ref`, Ghost Mask, Licon MSR and related reference modes in this 2.5 build because the author reports that those 2.3-trained behaviors corrupt LTX 2.5 output.

This warning is specific to those fork mechanisms. It does not prove that all official LTX 2.5 IC-LoRA/reference conditioning is unusable.

## Local constraints already learned

The current workstation proved that an implicit source-size Director configuration is dangerous. A 3200x1800 source was inherited and produced a `3168x1792` latent, causing severe memory pressure.

Successful Director runs used a much smaller legal latent around `1248x704` / target `1280x704`, 193 pixel frames and 25 temporal latent frames at 24 fps.

Prompt Relay was confirmed active by logs showing:

```text
Global token range
Segment 0 token range
Segment 1 token range
Segment 2 token range
Latent temporal segments: [8, 9, 8]
Prompt Relay penalty matrices built in both sampling stages
```

Therefore the next experiment should not be another proof that Prompt Relay executes. The next experiment should be continuation/chunk handoff.

## Recommended minimal experiment order

```text
C0  CGlide one-chunk smoke test
    prove the fork works with the known-good local LTX 2.5 backend

C1  Chunk Writer test
    prove 8 lossless handoff frames are created correctly

C2  Two-chunk continuation
    compare against an independent second chunk

C3  Four-chunk ~32-second scene
    only after C2 demonstrates believable continuity

C4  identity/reference reinforcement
    only if long-range subject drift remains the dominant failure
```

Do not build optical-flow evaluation, DINO/LPIPS scoring, automated retake logic or agent mutation until C2 establishes that the existing chaining primitive is worth adopting.

## Acceptance questions for C2/C3

Human review is enough initially:

1. Does the motorcycle remain recognizably the same?
2. Does the rider/helmet remain the same?
3. Does camera position/velocity feel continuous at the boundary?
4. Does the bike's lean/speed continue rather than restart?
5. Is the seam visible?
6. Does identity drift become worse several seconds after each handoff?
7. Does stronger conditioning freeze the motion?

These questions are more useful at this stage than a single numeric continuity score.

## Architectural implication if CGlide works

If the chunk writer proves reliable, scene continuity can remain a Production adapter concern for now:

```text
long scene intent
      ↓
CGlide/LTX adapter
      ↓
chunk windows + handoff frames + seam policy
      ↓
assembled MediaAsset
```

Helix does not need a large global scene-continuity schema merely to exploit this feature. A broader scene model should be introduced only when real experiments prove which continuity state must be represented upstream.
