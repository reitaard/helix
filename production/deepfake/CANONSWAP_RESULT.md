# CanonSwap RTX 4060 benchmark

Date: **2026-09-07**

Status: **optimized CanonSwap execution is proven on the local RTX 4060, but the completed 20-second quality review is a fail for this target. CanonSwap is rejected as the current Helix Production candidate because it preserves camera engagement / gaze behavior worse than FaceFusion while also running far slower.**

## Environment

```text
GPU: NVIDIA GeForce RTX 4060, 8 GB
CanonSwap repo: Pixel-Talk/CanonSwap
Pinned commit: dd5100f6348edb4db32c1e5b3e99ce8b7d5f422a
Python: 3.10
PyTorch: 2.3.0 + CUDA 11.8
ONNX Runtime GPU: 1.18.0
CUDAExecutionProvider: available
```

Required weights were installed successfully:

```text
pretrained_weights/
  combined_weights.pth
  arcface_checkpoint.tar
  landmark.onnx
  insightface/models/antelope/
    glintr100.onnx
    scrfd_10g_bnkps.onnx
  insightface/models/buffalo_l/
    2d106det.onnx
    det_10g.onnx
```

## Stock-path finding

The published `inference_canswap.py` forces:

```python
inference_cfg.flag_use_half_precision = False
```

On the 8 GB RTX 4060, stock FP32 execution loaded and ran but became impractically slow and spilled heavily into shared GPU memory.

A first 60-frame / 2-second smoke test reached only a few percent after many minutes while approximately saturating dedicated VRAM and using several additional GB of shared GPU memory.

This proved that CanonSwap itself was compatible with the machine, but the published research inference path was not suitable as-is for an 8 GB Production worker.

## Mixed-precision finding

CanonSwap already contains `torch.autocast(..., dtype=torch.float16)` support through `inference_ctx()`, but the main end-to-end swapping loop calls several heavy modules outside that context.

A local research patch therefore:

```text
1. enabled flag_use_half_precision = True;
2. wrapped canonical warping in inference_ctx();
3. wrapped identity swap in inference_ctx();
4. wrapped refinement in inference_ctx().
```

This materially improved execution, but the published pipeline was still performing two additional per-frame decode branches used for its diagnostic concat output.

## Production-path simplification

The original end-to-end loop creates:

```text
rec_can      -> diagnostic canonical reconstruction
swap_can     -> diagnostic canonical swapped preview
final output -> refined + warped + paste-backed result
```

`rec_can` and `swap_can` feed the side-by-side `concat_frames(...)` debug video. They do not feed the final refined/paste-backed result.

For the local Production-path benchmark, the two diagnostic decodes and concat-video construction were disabled while retaining:

```text
source identity extraction
face detection/cropping
face parsing masks
motion-template extraction
appearance feature extraction
canonical warp
identity modulation
refinement
final warp/decode
mask + paste-back
original target audio
final video output
```

This was a research optimization only; it is not yet committed as Helix runtime code.

## 2-second optimized smoke result

Input:

```text
frames: 60
FPS: 30
video duration: ~2 s
```

Result:

```text
swapping: 60 / 60 in 00:01:30
```

Observed during the optimized run:

```text
dedicated VRAM: ~7.6 / 8.0 GB
shared GPU memory: ~1.1 GB at one observed checkpoint
GPU utilization: ~94-100%
```

The final MP4 and original target audio were written successfully.

## 20-second full benchmark

Input:

```text
frames: 605
FPS: 30
video duration: ~20.17 s
```

Measured phases:

```text
parsing:                 00:09:54
motion templates:        00:00:23
swapping:                00:39:08
final encode/audio:      ~seconds
TOTAL WALL TIME:         00:50:03.0203076
```

Calculated execution rates:

```text
swap-stage throughput:   605 / 2348 s  ~= 0.258 fps
swap-stage cost/frame:   ~= 3.88 s/frame
overall throughput:      605 / 3003 s  ~= 0.201 fps
overall cost/frame:      ~= 4.96 s/frame
input duration:          ~= 20.17 s
wall-clock/input ratio:  ~= 149x slower than real time
```

A representative mid-run checkpoint showed approximately:

```text
GPU utilization: ~86%
dedicated VRAM:  ~7.7 / 8.0 GB
shared GPU:      ~2.8 GB
total GPU memory shown by Task Manager: ~10.5 GB
```

The run completed without OOM and reconstructed the final MP4 with target audio.

## Completed visual review

The full 605-frame output was reviewed against the earlier FaceFusion HyperSwap 1B/1C results on the same talking-head source material.

The decisive failure is **target camera engagement / gaze preservation**.

Observed CanonSwap behavior:

```text
- the generated face repeatedly appears to look upward or away from the camera;
- eye direction / facial attitude does not follow the target performance as faithfully as the FaceFusion outputs;
- the result therefore feels less like the original on-camera delivery even when the face itself remains temporally coherent;
- on this UGC/talking-head clip, this behavior is immediately more distracting than FaceFusion's smoother/generic identity-rendering weakness.
```

Representative aligned-frame inspection confirmed the user's observation: CanonSwap changes the perceived gaze and facial orientation enough that the subject often appears to avoid direct camera engagement, while HyperSwap 1B/1C retain the target's direct-to-camera performance more convincingly.

CanonSwap exposes experimental eye/lip retargeting controls in its inherited LivePortrait-style configuration, but those paths are marked WIP / not recommended in the published config. Because the current failure is a core performance-preservation problem and FaceFusion already performs better on this dimension, further CanonSwap tuning is not justified at this stage.

## Verdict

```text
execution feasibility:        PASS after local optimization
20-second completion:         PASS
memory fit on RTX 4060:       PASS with shared-memory spill
runtime competitiveness:      FAIL
camera/gaze preservation:     FAIL
finished quality vs 1B/1C:    FAIL
current Production candidate: REJECT
```

CanonSwap remains useful as architectural research evidence: Helix should keep a swappable face-engine boundary rather than hard-coding FaceFusion. However, CanonSwap should not receive additional optimization effort for the current Production route unless a future target class specifically benefits from its canonical-space behavior.

## Next decision

Return to the faster FaceFusion path, but do **not** lock Helix architecture to FaceFusion.

The next high-value model test is the newer FaceFusion 3.9 `alphaface_256` path on the same source/target material, with HyperSwap 1B/1C retained as established baselines. Only after that result should reference preparation or further backend challengers be prioritized.
