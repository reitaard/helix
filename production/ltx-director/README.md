# LTX Director

This folder is the Helix Production workspace for evaluating and integrating LTX Director-style control surfaces and long-video continuation backends.

It is **not** the Helix Director. Helix Director remains model/provider agnostic. This folder is about how Production can compile explicit generation intent into LTX/ComfyUI execution state.

## Proven local foundation

The workstation has already validated:

- native/local LTX 2.5 two-stage I2V generation;
- CGlide LTX Director 2.5 wiring inside the native LTX 2.5 graph;
- Prompt Relay with multiple temporal regions;
- appended image/keyframe guidance;
- explicit dimensions to avoid accidental source-size latents;
- CGlide chunk writing, handoff PNGs, audio joining and final assembly;
- official Lightricks `LTXVLoopingSampler` running locally over both LTX 2.5 stages.

## Long-video findings so far

### CGlide baseline

CGlide produced a real two-chunk continuation:

```text
193-frame chunk 1
193-frame chunk 2
8-frame overlap
378-frame final @ 24 fps
~15.75 s assembled video + aligned audio
```

The bike/rider/world remained broadly coherent. The main weakness was the boundary: motion/camera velocity was perceptibly less smooth, and later-chunk realism may degrade.

### Lightricks baseline

The first Lightricks-only test produced:

```text
361 frames
24 fps
1280 × 704
~15.04 s
566.36 s runtime
```

Both low- and high-resolution generation stages used overlapping temporal windows. Subject consistency and motion continuity were better than the CGlide handoff test, with no obvious hard seam. The remaining weakness was gradual scene-state drift: lighting/background/world state could feel as if the scene or weather was subtly changing between temporal windows.

The next standalone optimization would use fewer/larger temporal windows (`120 / 40`) and stronger overlap conditioning.

## Active comparison: Hybrid B

The comparison is now:

```text
A. CGlide only       proven baseline
B. Lightricks only   proven baseline, stronger temporal continuity
C. Hybrid B          ACTIVE NEXT TEST
```

Hybrid B v1 intentionally combines only the pieces that have demonstrated value:

```text
CGlide Director
Prompt Relay / timed local prompts
        ↓
Lightricks LTXVLoopingSampler
real temporal overlap / continuation
        ↓
portrait long-scene output
```

The first Hybrid B test also introduces a controlled second visual keyframe, so it is the postponed multi-frame experiment as well.

Important correction: CGlide's dedicated LTX 2.5 `@ref` / reference-sheet modes are disabled upstream. Hybrid B therefore uses Lightricks keyframe conditioning for the secondary visual reference rather than pretending the old CGlide reference system works on 2.5.

See:

- `LONG_VIDEO_COMPARISON.md` — decision tracks, metrics and updated test order;
- `HYBRID_B_V1.md` — locked Hybrid B portrait test;
- `CGLIDE_CHUNKING.md` — proven CGlide baseline and limitations;
- `LIGHTRICKS_LOOPING.md` — Lightricks install and long-video notes;
- `INSTALL.md` — confirmed workstation setup;
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

Backend-specific continuation details should remain behind a Production adapter until experiments show which controls deserve to become stable Helix concepts.
