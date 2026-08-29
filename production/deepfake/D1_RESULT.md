# D1 — FaceFusion HyperSwap comparison

Date: 2026-08-29

Status: **HyperSwap 1A, 1C and 1B have now been inspected. 1C remains the provisional finished-video naturalness winner, while 1B renders slightly stronger/sharper facial features. Final identity-fidelity selection requires the actual source portrait S1.**

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
trim: 250 -> 750 (operator-confirmed benchmark range)
frames: 500
output duration: 16.666667 s
resolution: 720 x 1280
FPS: 30
model: hyperswap_1b_256
```

The uploaded 1B artifact filename was `D1_B_hyperswap_1b.mp4`, but within the experiment sequence it is the planned D1-C / HyperSwap 1B challenger.

Because D1-A used only 350 frames, total runtime is **not** a controlled comparison against 1B/1C. Visual comparison remains valid over the shared first 350 output frames. HyperSwap 1B and 1C both use the same 500-frame benchmark range, so their visual comparison is directly aligned.

Observed earlier throughput for reference only:

```text
D1-A / 1A: 350 / 106.09 = ~3.30 frames/s
D1-B / 1C: 500 / 102.36 = ~4.88 frames/s
```

No terminal runtime was supplied yet for the 1B artifact, so do not infer a 1B performance result from file metadata alone.

## HyperSwap 1C model download behavior

The first 1C download attempt reached completion but failed source validation repeatedly:

```text
[FACEFUSION.DOWNLOAD] validating source for hyperswap_1c_256 failed
[FACEFUSION.DOWNLOAD] deleting corrupt source for hyperswap_1c_256
```

FaceFusion then re-downloaded the approximately 402.7 MB source and the subsequent run completed normally. This is not a blocker, but a future worker should expose model-download/checksum failures as explicit setup/health events rather than presenting them as generic generation failures.

## Shared visual comparison

Representative matching frames were inspected side by side across the common target interval.

### HyperSwap 1A -> 1C

- 1C keeps the same useful eye, blink and mouth/speech preservation seen in 1A;
- 1C appears slightly less exaggerated around the eyes and slightly less beauty-filtered/synthetic in several frontal frames;
- facial rendering looks somewhat more natural through smile and neutral-expression changes;
- the difference is real but not dramatic; both still retain a smoothed face-swap character;
- no clear new temporal instability was observed.

### HyperSwap 1C -> 1B

The 1B and 1C artifacts contain the same 500 frames, which allows a cleaner visual comparison.

Observed differences:

- both preserve the target performance, eye motion, blink states and mouth/speech shapes similarly;
- 1B renders facial features slightly more sharply/strongly, especially around eyes, brows, nose and lips;
- 1B can therefore look like a stronger identity imprint, but it also reads slightly more synthetic/processed in several frames;
- 1C is a little softer but generally looks more natural and less obviously overlaid;
- neither model shows a clear temporal-consistency advantage in this clip;
- both remain coherent across ordinary speaking/head-motion frames;
- neither can be declared the identity-fidelity winner without comparing against S1 itself.

A simple diagnostic frame-to-frame grayscale-difference check over the same fixed face region also found essentially identical motion behavior:

```text
1B mean face-region adjacent-frame difference: ~6.65
1C mean face-region adjacent-frame difference: ~6.68
1B p95: ~11.78
1C p95: ~11.79
```

The largest-change frame positions were also effectively the same. This is **not an identity/quality metric**, but it supports the visual observation that 1B versus 1C is mainly a facial-rendering choice rather than a temporal-stability difference on this benchmark.

## Current verdict

```text
HyperSwap 1A:
  execution baseline proven
  performance motion strong
  face quality below Production bar

HyperSwap 1C:
  best current finished-video naturalness
  eye/mouth/expression preservation strong
  still visibly face-swapped / not yet Production-grade
  provisional naturalness winner

HyperSwap 1B:
  slightly stronger/sharper facial definition than 1C
  target performance preservation comparable to 1C
  no clear temporal advantage
  can look slightly more processed/synthetic
  identity-fidelity result unresolved until S1 is available
```

## Next decision gate

Do **not** spend another GPU run on InSwapper, enhancement, masks or generated references yet.

First obtain the actual source portrait S1 and compare it beside representative matching 1A/1B/1C frames.

The next decision should answer:

```text
Which HyperSwap variant is actually closest to S1?
```

Only after that should we decide whether the problem is:

```text
raw identity strength
-> try another swapper / CanonSwap

softness/detail only
-> test pixel boost or face enhancement

angle-specific identity loss
-> test generated/multi-angle references

occlusion/composite failure
-> test masks
```

## Benchmark policy from here

Keep the preferred D1 benchmark fixed at:

```text
trim: 250 -> 750
frames: 500
approximately 16.67 seconds at 30 fps
```

Do not rerun 1A at 250 -> 750 unless the final source-identity review shows 1A is unexpectedly competitive and a fully aligned comparison becomes worthwhile.
