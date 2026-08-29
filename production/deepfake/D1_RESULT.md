# D1 — FaceFusion raw swapper comparison

Date: 2026-08-29

Status: **HyperSwap 1A, 1C, 1B and Ghost 3 have now been inspected. Ghost 3 is rejected on this benchmark. HyperSwap 1B and 1C remain the meaningful candidates.**

## Benchmark ranges

D1-A used:

```text
trim: 250 -> 600
frames: 350
output duration: 11.689909 s
model: hyperswap_1a_256
processing-to-video: 106.09 s
```

D1-B / HyperSwap 1C used:

```text
trim: 250 -> 750
frames: 500
output duration: 16.689909 s
model: hyperswap_1c_256
processing-to-video: 102.36 s
```

D1-C / HyperSwap 1B inspected artifact:

```text
trim: 250 -> 750
frames: 500
output duration: 16.666667 s
resolution: 720 x 1280
FPS: 30
model: hyperswap_1b_256
```

D1-D / Ghost 3 inspected artifact:

```text
trim: 250 -> 750
resolution: 720 x 1280
FPS: 30
model: ghost_3_256
```

Because D1-A used only 350 frames, total runtime is not a controlled comparison against 1B/1C/Ghost. Visual comparison remains valid over the shared interval. HyperSwap 1B and 1C use the same 500-frame benchmark range and can be compared directly.

Observed earlier throughput for reference only:

```text
D1-A / 1A: 350 / 106.09 = ~3.30 frames/s
D1-B / 1C: 500 / 102.36 = ~4.88 frames/s
```

No clean terminal runtime is recorded yet for 1B or Ghost, so do not infer their performance from artifact metadata alone.

## HyperSwap 1C model download behavior

The first 1C download attempt reached completion but failed source validation repeatedly:

```text
[FACEFUSION.DOWNLOAD] validating source for hyperswap_1c_256 failed
[FACEFUSION.DOWNLOAD] deleting corrupt source for hyperswap_1c_256
```

FaceFusion then re-downloaded the approximately 402.7 MB source and the subsequent run completed normally. A future worker should expose model-download/checksum failures as explicit setup/health events rather than generic generation failures.

## Shared visual comparison

### HyperSwap 1A -> 1C

- 1C keeps the same useful eye, blink and mouth/speech preservation seen in 1A;
- 1C appears slightly less exaggerated around the eyes and slightly less beauty-filtered/synthetic in several frontal frames;
- facial rendering looks somewhat more natural through smile and neutral-expression changes;
- the difference is real but not dramatic; both retain a smoothed face-swap character;
- no clear new temporal instability was observed.

### HyperSwap 1C -> 1B

- both preserve target performance, eye motion, blink states and mouth/speech shapes similarly;
- operator observation: 1B is less conservative around the mouth and allows wider mouth/jaw opening during speech;
- 1B renders facial features slightly more sharply/strongly, especially around eyes, brows, nose and lips;
- 1B can read like a stronger identity imprint, but also slightly more synthetic/processed;
- 1C is softer but generally looks more natural and less obviously overlaid;
- neither shows a clear temporal-consistency advantage on this clip;
- exact source-identity fidelity remains unresolved without S1 beside the outputs.

A simple diagnostic frame-to-frame grayscale-difference check over the same fixed face region found essentially identical motion behavior between 1B and 1C:

```text
1B mean adjacent-frame difference: ~6.65
1C mean adjacent-frame difference: ~6.68
1B p95: ~11.78
1C p95: ~11.79
```

This is not an identity/quality metric; it only supports the observation that 1B vs 1C is mainly a facial-rendering/performance-transfer choice rather than a temporal-stability difference on this benchmark.

### Ghost 3

Ghost 3 was inspected against the same speaking/head-motion benchmark and is clearly inferior for this use case.

Observed:

- face rendering is flatter and more synthetic than both HyperSwap 1B and 1C;
- it does not provide a compensating improvement in motion, mouth behavior or temporal stability;
- the result reads more obviously as a face-swap overlay;
- operator verdict: "worst" among the tested candidates;
- no tuning pass is justified before higher-value experiments.

Ghost 3 is therefore **rejected for the current Helix baseline**.

## Current verdict

```text
HyperSwap 1A:
  execution baseline proven
  performance motion strong
  face quality below Production bar

HyperSwap 1C:
  best current finished-video naturalness
  eye/mouth/expression preservation strong
  still visibly face-swapped

HyperSwap 1B:
  strongest current performance-transfer candidate
  wider/more expressive mouth behavior observed during speech
  slightly stronger/sharper facial definition than 1C
  can look a little more processed
  provisional practical baseline

Ghost 3:
  worst visual result of tested candidates
  no useful compensating advantage
  rejected
```

## Next decision

Do not spend time tuning Ghost 3.

There are two useful remaining raw-FaceFusion steps:

1. compare the actual source portrait S1 beside matching 1B/1C frames to settle identity fidelity;
2. if a legacy control is still desired, run `inswapper_128_fp16` once on the fixed 250 -> 750 benchmark. If it does not clearly beat 1B/1C, stop raw model hunting.

After that, use HyperSwap 1B as the provisional baseline if performance transfer remains the priority, and move to the reference/detail experiments rather than testing every dropdown model.

The next higher-value questions are:

```text
Is the remaining problem source identity strength?
-> test target-matched/generated reference preparation

Is the remaining problem mainly softness/detail?
-> controlled pixel-boost / face-enhancer A/B on the winning raw swapper

Is the remaining problem angle-specific identity loss?
-> generated 3/4/profile references

Is the remaining problem occlusion/compositing?
-> targeted mask tests
```

## Benchmark policy from here

Keep the preferred D1 benchmark fixed at:

```text
trim: 250 -> 750
frames: 500
approximately 16.67 seconds at 30 fps
```

Do not rerun 1A unless a later source-identity review unexpectedly makes it competitive.
