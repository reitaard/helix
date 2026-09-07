# CanonSwap RTX 4060 benchmark

Date: **2026-09-07**

Status: **optimized CanonSwap execution is now proven on the local RTX 4060; quality comparison against FaceFusion is still pending review of the completed 20-second output.**

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

## Interpretation

CanonSwap is now **operationally viable for research on the RTX 4060**, but it is far slower than the FaceFusion baseline.

FaceFusion D0 measured roughly:

```text
~4.99 processed fps
```

whereas the optimized CanonSwap 20-second run measured roughly:

```text
~0.20 overall fps
```

The engines are not performing identical pipelines, so this is not a pure model-speed benchmark, but CanonSwap is clearly in a much slower execution class on this worker.

Because the user has stated that time is not currently the primary constraint, CanonSwap should remain in contention **only if its finished visual quality is materially better** than HyperSwap 1B/1C.

## Next decision gate

Do not optimize CanonSwap further before reviewing the completed 20-second result.

Compare against the best FaceFusion candidates on:

```text
identity fidelity
mouth openness / speech performance
eye motion and blinking
head-turn robustness
skin/detail quality
face boundary / paste-back quality
temporal stability
FP16 artifacts
```

If CanonSwap clearly wins quality, continue production-oriented optimization and consider a larger-GPU worker later.

If quality is only comparable to FaceFusion, prefer the operationally simpler/faster engine path and continue evaluating newer FaceFusion models or another architecture.
