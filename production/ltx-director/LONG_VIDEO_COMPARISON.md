# Long-Video Continuation Comparison

**Status:** active Production experiment  
**Started:** 2026-08-21

Helix will compare three existing LTX 2.5 continuation paths before choosing a long-scene Production backend. This is an implementation comparison, not a new Helix-wide schema.

## Decision tracks

### A. CGlide only

Use `CGlide/LTX-2.5-Director` for Director timeline control, chunk handoff, audio writing and final assembly.

Confirmed local baseline:

- one-chunk CGlide Director generation works;
- final Crop Guides after Stage 2 is required so appended guide frames do not leak into decoded output;
- corrected 8-second render is 193 frames at 24 fps;
- Chunk Writer creates 8 lossless PNG handoff frames;
- a second 193-frame chunk was generated from the handoff and automatically assembled;
- assembled result is 378 frames / 15.75 s plus aligned audio;
- motorcycle/rider/world continuity is promising;
- motion/camera velocity at the boundary is still perceptible;
- later-chunk realism may degrade, but that is not yet proven systematic.

CGlide remains a useful directing/orchestration layer and a working continuation baseline.

### B. Lightricks only

Use official `Lightricks/ComfyUI-LTXVideo` long-video sampling without CGlide handoff logic.

Confirmed local B0 result:

```text
LTXVLoopingSampler on both generation stages
361 frames
24 fps
1280 × 704
~15.04 s
566.36 s runtime
```

B0 used:

```text
temporal_tile_size              80
temporal_overlap                24
temporal_overlap_cond_strength  0.65
AdaIN                           0.15
spatial tiles                   1 × 1
```

Findings:

- true overlapping temporal continuation works locally;
- bike/rider consistency was good across the full sequence;
- motion continuity and seam quality were visibly stronger than CGlide's single-image handoff baseline;
- later sections did not show the same obvious softening concern as the CGlide test;
- however, the scene/world felt less stable: background, lighting and atmosphere could feel as if the weather or scene was subtly changing between temporal windows.

The next Lightricks optimization is therefore fewer/larger temporal windows (`120 / 40`) with stronger overlap conditioning before attempting 30+ seconds.

### C. Hybrid B — active next test

Combine CGlide Director's useful control surface with Lightricks' stronger continuation engine.

The locked Hybrid B v1 is:

```text
CGlide Director
Prompt Relay only
        ↓
Lightricks LTXVLoopingSampler
Stage 1 temporal overlap
        ↓
latent x2 upscale
        ↓
Lightricks LTXVLoopingSampler
Stage 2 temporal overlap
        ↓
decode
```

Hybrid B also becomes the postponed multi-frame experiment:

- portrait opening frame anchors the initial bike/rider identity;
- a second side-motion image is injected as a weaker visual keyframe around 9 s;
- three Prompt Relay zones drive front tracking → camera arc → side-tracking whoosh.

Important correction: CGlide's dedicated LTX 2.5 `@ref` / reference-sheet modes are disabled upstream, so the secondary visual image is handled through Lightricks keyframe conditioning instead.

Locked v1 settings:

```text
704 × 1280 portrait
15 s / 24 fps / 361 frames
120-frame temporal tile
40-frame overlap
0.80 overlap conditioning strength
0.15 AdaIN
side keyframe @ frame 216 (~9 s)
side keyframe strength 0.45
```

See `HYBRID_B_V1.md` for the exact prompt phases, topology and success criteria.

## Comparison rules

Score each track on:

1. subject identity consistency;
2. rider/wardrobe/object geometry consistency;
3. motion continuity at boundaries;
4. camera-position and camera-velocity continuity;
5. scene/world/weather stability;
6. realism / reduction of the "AI look" in later sections;
7. sharpness/detail retention;
8. color/saturation/contrast drift;
9. prompt/control adherence;
10. multi-frame/keyframe behavior;
11. reproducibility;
12. runtime and VRAM/RAM behavior;
13. workflow complexity and debuggability;
14. suitability for explicit human controls and later agent suggestions.

## Updated test order

```text
A0/A1  CGlide baseline                         PASS
B0     Lightricks ~15 s temporal overlap       PASS
C0     Hybrid B v1 structural/runtime proof    NEXT
C1     Hybrid B prompt/keyframe quality tune
B1     Lightricks longer drift/limit test       only after 15 s stability
DECISION choose simplest path that clearly wins
```

Do not increase to 30+ seconds until the 15-second Hybrid B and optimized temporal-window behavior are understood.

## Decision rule

Prefer the simpler standalone path unless hybrid is materially better.

- If CGlide is equal or better: keep CGlide and optimize its seam/identity controls.
- If Lightricks is clearly better: use Lightricks as the continuation engine and keep only CGlide controls that add real value.
- If Hybrid B is clearly better and stable: adopt the hybrid behind a Production adapter.

No option becomes a shared Helix contract merely because it wins this benchmark.
