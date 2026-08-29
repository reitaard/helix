# D1 — FaceFusion HyperSwap comparison

Date: 2026-08-29

Status: **HyperSwap 1C completed successfully and is a modest visual improvement over 1A on the shared segment; source-identity likeness still needs the actual S1 image for rigorous scoring.**

## Benchmark ranges

D1-A used:

```text
trim: 250 -> 600
frames: 350
output duration: 11.689909 s
model: hyperswap_1a_256
processing-to-video: 106.09 s
```

D1-B used:

```text
trim: 250 -> 750
frames: 500
output duration: 16.689909 s
model: hyperswap_1c_256
processing-to-video: 102.36 s
```

Because D1-B extended the trim end from 600 to 750, total runtime is **not** a controlled A/B comparison. Visual comparison remains valid over the shared 250 -> 600 target interval, corresponding to the first 350 output frames of both files.

Observed throughput for reference only:

```text
D1-A: 350 / 106.09  = ~3.30 frames/s
D1-B: 500 / 102.36  = ~4.88 frames/s
```

Do not treat this as proof that 1C is intrinsically faster; clip length, warm caches and run state differ.

## HyperSwap 1C model download behavior

The first 1C download attempt reached completion but failed source validation repeatedly:

```text
[FACEFUSION.DOWNLOAD] validating source for hyperswap_1c_256 failed
[FACEFUSION.DOWNLOAD] deleting corrupt source for hyperswap_1c_256
```

FaceFusion then re-downloaded the approximately 402.7 MB source and the subsequent run completed normally. This is not a blocker, but a future worker should expose model-download/checksum failures as explicit setup/health events rather than presenting them as generic generation failures.

## Shared-segment visual comparison

Representative matching frames from the shared 250 -> 600 target interval were inspected side by side.

Current observations:

- 1C keeps the same useful eye, blink and mouth/speech preservation seen in 1A;
- 1C appears slightly less exaggerated around the eyes and slightly less beauty-filtered/synthetic in several frontal frames;
- facial rendering looks somewhat more natural through smile and neutral-expression changes;
- the difference is real but not dramatic; both still retain a smoothed face-swap character;
- no clear new temporal instability was observed in the sampled shared frames;
- the additional 600 -> 750 portion of the 1C run also remains coherent through speech and moderate viewpoint changes;
- exact source-identity likeness cannot be decided without the actual source portrait S1 beside the outputs.

## Current verdict

```text
HyperSwap 1A:
  execution baseline proven
  performance motion strong
  face quality below Production bar

HyperSwap 1C:
  modestly more natural rendering than 1A
  target eye/mouth/expression preservation remains strong
  still not proven Production-grade
  provisional winner over 1A for finished visual naturalness
```

The next useful test is HyperSwap 1B as the angle/profile challenger.

## Benchmark policy from here

The operator changed the trim to 250 -> 750 for D1-B. Freeze this as the preferred D1 range for new runs because it contains 500 frames / approximately 16.69 seconds and provides more facial motion than the earlier 250 -> 600 range.

For D1-C:

```text
source: same S1
target: same V1
trim: 250 -> 750
model: hyperswap_1b_256
all other settings unchanged
```

Do not rerun 1A at 250 -> 750 unless the 1B/1C results are close enough that a perfectly controlled timing or quality comparison is worth the extra GPU time. For visual comparison against 1A, use the shared 250 -> 600 interval.

Before freezing a FaceFusion winner, compare the actual source portrait S1 against representative 1A/1B/1C frames. The primary unresolved question is source identity fidelity, not target-expression preservation.
