# Long-Video Continuation Comparison

**Status:** active Production experiment  
**Started:** 2026-08-21

Helix is comparing existing LTX 2.5 continuation approaches before choosing a long-scene Production backend. This is an implementation comparison, not a new Helix-wide schema.

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

CGlide remains a working continuation baseline and a useful directing/orchestration surface.

### B. Lightricks only

Use official `Lightricks/ComfyUI-LTXVideo` long-video sampling without CGlide Prompt Relay.

#### B0 confirmed result — PASS as continuation mechanism

```text
LTXVLoopingSampler on both generation stages
361 frames
24 fps
1280 × 704
~15.04 s
566.36 s runtime
```

Settings:

```text
temporal_tile_size              80
temporal_overlap                24
temporal_overlap_cond_strength  0.65
AdaIN                           0.15
spatial tiles                   1 × 1
```

Findings:

- true overlapping temporal continuation works locally;
- bike/rider consistency was good across the sequence;
- motion continuity and seam quality were visibly stronger than the first CGlide single-image handoff baseline;
- later sections retained useful detail;
- scene/world/lighting state could still drift subtly between temporal windows.

Important correction: after B0, Helix changed several Lightricks parameters simultaneously (`80/24/0.65 → 120/40/0.80`) while also adding Director Prompt Relay. Those later hybrid failures cannot be attributed to Lightricks alone.

#### What Lightricks is for

`LTXVLoopingSampler` is primarily a temporal-extension / memory-efficient long-video engine. It is useful when a single continuous scene must exceed a comfortable native generation length.

It should not automatically replace native LTX for every short or medium shot. If a shot already fits reliably in one native generation, the simpler native path should remain the default.

Lightricks is most natural for continuous extension with a stable camera/motion relationship or tile-aware prompt changes. Large whole-shot camera choreography needs additional care.

### C. Hybrid B — PAUSED after v1.3 failure

The attempted hybrid was:

```text
CGlide Director Prompt Relay
        ↓
Lightricks LoopingSampler temporal extension
        ↓
two-stage native LTX I2V / upscale path
```

The latest v1.3 run used:

```text
704 × 1280
15.04 s / 361 frames / 24 fps
120 temporal tile
40 overlap
0.80 overlap conditioning
AdaIN 0.10
Prompt Relay epsilon 0.50
549.18 s runtime
```

Overall verdict: **FAIL**.

The original motorcycle was initially preserved, then left the frame, and a completely different motorcycle model was synthesized later in the same continuous shot. This invalidates the run even though parts of the later rendering were photorealistic.

## What likely went wrong in the hybrid

### 1. Prompt Relay and LoopingSampler may be using different time coordinate systems

Source inspection shows that CGlide Prompt Relay builds a full-timeline temporal mask, while Lightricks generates the video in overlapping temporal chunks.

When Prompt Relay operates on a shorter attention query, its scaled mapping does not receive the Lightricks tile's global start offset.

Strong current hypothesis:

```text
Director intent:
0–5 front
5–10 camera arc
10–15 side

may be locally re-scaled/replayed inside multiple Lightricks temporal windows
```

This must be validated with a no-Prompt-Relay control run before being treated as a confirmed root cause.

### 2. Prompt Relay was over-softened

The hybrid used:

```text
epsilon = 0.50
```

CGlide's sigma formula makes this much broader than the earlier `0.001`, increasing local-prompt leakage across temporal zones.

Do not use `0.50` as the default merely because the transition is intended to be smooth.

### 3. Lightricks overlap conditioning was pushed above its default

The hybrid used:

```text
temporal_overlap_cond_strength = 0.80
```

Lightricks defaults to `0.50`. The value directly controls how strongly the previous overlap latents guide the next extension.

A high value can preserve good motion continuity, but it can also propagate a bad framing state. If the preceding tile ends with the bike leaving frame, `0.80` strongly encourages that state to persist.

### 4. Earlier hybrid runs also had separate visual-reference mistakes

Avoid repeating these known failures:

- second keyframe from a different motorcycle identity;
- padded reference image that made the motorcycle small in frame;
- generatively redrawn first frame when benchmarking fidelity;
- using CGlide's neutral negative output instead of the native negative path;
- changing many controls simultaneously and then trying to infer one cause.

## Updated decision principle

Do not choose a long-video backend based on maximum control count.

Prefer the simplest backend that satisfies the actual shot requirement.

```text
shot fits native LTX comfortably
→ native LTX first

shot needs longer continuous temporal extension
→ evaluate Lightricks

shot needs explicit Director timeline control + extension
→ hybrid only after temporal mapping is proven

shot is better represented as multiple intentional shots
→ do not force one huge LoopingSampler generation
```

## Next test — B0.1 clean Lightricks calibration

Before another Hybrid B run, isolate Lightricks:

```text
original first-frame photograph
native LTX 2.5 I2V
15 s / 24 fps / 704 × 1280
120 temporal tile
40 temporal overlap
0.50 overlap conditioning
AdaIN 0.10
one continuous positive prompt
native negative conditioning
NO CGlide Prompt Relay
NO secondary keyframe
NO long-term memory latent
```

Keep the camera relationship comparatively stable. The purpose is not to prove a fancy shot; it is to determine what LoopingSampler itself does to identity, realism and world continuity.

Questions:

1. Does the original motorcycle remain the same motorcycle for 15 seconds?
2. Does it remain in frame across all temporal windows?
3. Is realism close to the native benchmark?
4. Are temporal boundaries smooth at the default `0.50` strength?
5. Does the scene/world still drift without Director?

If B0.1 passes, tune only one variable at a time. If more overlap conditioning is needed, test `0.60` or `0.65` before considering `0.80`.

## Hybrid re-entry criteria

Hybrid work resumes only after Lightricks-only behavior is understood.

Preferred first hybrid re-entry path:

```text
Director timeline / shot intent
        ↓
compile into Lightricks tile-aware positive conditioning
        ↓
LTXVMultiPromptProvider / equivalent per-tile conditioning
        ↓
LoopingSampler
```

Only consider a custom Prompt Relay + LoopingSampler integration if Prompt Relay is made aware of each temporal tile's true global start offset.

## Comparison criteria

Score each track on:

1. exact subject identity consistency;
2. rider/wardrobe/object geometry consistency;
3. motion continuity at boundaries;
4. camera-position and camera-velocity continuity;
5. scene/world/weather stability;
6. realism / later-section AI look;
7. sharpness/detail retention;
8. color/saturation/contrast drift;
9. prompt/control adherence;
10. multi-frame/keyframe behavior;
11. reproducibility;
12. runtime and VRAM/RAM behavior;
13. workflow complexity and debuggability;
14. suitability for explicit human controls and later agent suggestions.

## Current test order

```text
A0/A1  CGlide baseline                              PASS
B0     Lightricks 80/24/0.65 baseline              PASS as mechanism
C0-C3  Hybrid experiments                          FAIL / PAUSED
B0.1   Lightricks 120/40/0.50 calibration          NEXT
B0.2   tune one Lightricks parameter if justified
C4     tile-aware hybrid only after B0.x understood
DECISION choose simplest path that clearly wins
```

Do not increase to 30+ seconds yet.