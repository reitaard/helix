# Long-Video Continuation Comparison

**Status:** active Production experiment  
**Started:** 2026-08-21

Helix will compare three existing LTX 2.5 continuation paths before choosing a long-scene Production backend. This is an implementation comparison, not a new Helix-wide schema.

## Decision tracks

### A. CGlide only

Use `CGlide/LTX-2.5-Director` for Director timeline control, chunk handoff, audio writing and final assembly.

Current baseline is already proven locally:

- one-chunk CGlide Director generation works;
- both Director Guide stages work;
- final Crop Guides after Stage 2 is required so appended guide frames do not leak into the decoded output;
- corrected 8-second render is 193 frames at 24 fps;
- Chunk Writer creates 8 lossless PNG handoff frames;
- a second 193-frame chunk was generated from the handoff and automatically assembled;
- assembled two-chunk result is 378 frames / 15.75 s plus aligned audio;
- motorcycle/rider/world continuity is promising;
- the boundary is still perceptible as a motion/camera-velocity change;
- the second chunk may look softer / more synthetic than the first, but that needs repeat testing before calling it systematic drift.

CGlide remains the working baseline, not the winner yet.

### B. Lightricks only

Use the official `Lightricks/ComfyUI-LTXVideo` long-video sampler without CGlide handoff logic.

Primary node under test:

```text
LTXVLoopingSampler
```

It processes a long latent as overlapping temporal tiles and uses `LTXVExtendSampler` for later tiles. Relevant controls include:

- `temporal_tile_size`;
- `temporal_overlap`;
- `temporal_overlap_cond_strength`;
- `adain_factor` for accumulated statistic/saturation drift;
- optional conditioning images / keyframes;
- optional per-tile prompts through `MultiPromptProvider`;
- optional negative-index latents for longer-term context.

This is a stronger temporal-continuation mechanism than CGlide's current single-handoff-image continuation and is the next controlled test.

### C. Hybrid

Try CGlide-style directing/orchestration with Lightricks continuation/sampling where the interfaces can be reconciled cleanly.

Do **not** assume hybrid is automatically superior. It wins only if it gives a visible improvement that justifies extra graph and adapter complexity.

Possible hybrid direction:

```text
CGlide Director/timeline intent
        ↓
compile prompts / image anchors / timing
        ↓
Lightricks temporal continuation sampler
        ↓
output / review / retake
```

Exact wiring is intentionally deferred until the standalone Lightricks test is understood.

## Comparison rules

Use the same benchmark subject and as many shared generation settings as the two engines allow.

Score each track on:

1. subject identity consistency;
2. rider/wardrobe/object geometry consistency;
3. motion continuity at boundaries;
4. camera-position and camera-velocity continuity;
5. realism / reduction of the "AI look" in later sections;
6. sharpness/detail retention;
7. color/saturation/contrast drift;
8. prompt/control adherence;
9. reproducibility;
10. runtime and VRAM/RAM behavior;
11. workflow complexity and debuggability;
12. suitability for explicit human controls and later agent suggestions.

## Test order

```text
A0/A1/A2  CGlide baseline                 PASS enough to compare
B0        Lightricks package/node smoke   NEXT
B1        Lightricks controlled ~16 s continuation
B2        Lightricks longer drift/limit test
C0        minimal hybrid wiring proof
C1        hybrid controlled comparison
DECISION  keep the simplest track that clearly wins quality/control
```

Do not spend a large amount of time tuning CGlide seam post-processing before B1. First determine whether Lightricks' temporal-overlap generation fundamentally improves the boundary.

## Decision rule

Prefer the simpler standalone path unless hybrid is materially better.

- If CGlide is equal or better: keep CGlide and optimize its overlap/seam/identity controls.
- If Lightricks is clearly better: use Lightricks as the continuation engine and decide separately whether any CGlide Director controls are worth adapting.
- If hybrid is clearly better and stable: adopt hybrid behind a Production adapter.

No option becomes a shared Helix contract merely because it wins this benchmark.
