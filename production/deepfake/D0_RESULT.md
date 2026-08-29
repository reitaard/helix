# D0 — FaceFusion 3.8.2 baseline result

Date: 2026-08-29

Status: **technical execution passed; finished-video quality is below the desired Production bar**.

## Inputs

Source identity image:

```text
736 x 1104
portrait orientation
```

Target/output artifact inspected after the run:

```text
resolution: 720 x 1280
video codec: H.264
frame rate: 30 fps
frame count: 2378
duration: 79.289909 s
audio codec: AAC
sample rate: 44.1 kHz
channels: 2
output size: 104,034,803 bytes
```

The earlier operator estimate of approximately 19 seconds was incorrect. `2378` frames at 30 fps is consistent with the measured output duration of approximately 79.29 seconds.

## Environment

```text
OS: Windows
GPU: NVIDIA GeForce RTX 4060
Dedicated VRAM: 8 GB class / 8188 MiB
FaceFusion: 3.8.2
Python: 3.12.13
ONNX Runtime GPU: 1.24.4
CUDAExecutionProvider: available and used
FFmpeg: 9.0.1 full build
FaceFusion installer backend: cuda@12
```

## Baseline settings

```text
processor: face_swapper only
face swapper: hyperswap_1a_256
pixel boost: 256x256
face swapper weight: 0.5
video memory strategy: strict
execution thread count: 8
execution provider: CUDA
face detector: yolo_face
face detector size: 640x640
face detector angle: 0
face detector score: 0.5
face landmarker: 2dfan4
face landmarker score: 0.5
face mask type: box only
face mask blur: 0.3
face mask padding: 0
face enhancer: off
expression restorer: off
frame enhancer: off
deep swapper: off
```

## Execution

Terminal completion:

```text
[FACEFUSION.CORE] processing step 1 of 1
analysing: 100% (2378/2378)
processing: 100% (2378/2378)
[FACEFUSION.TO_VIDEO] processing to video succeeded in 476.96 seconds
```

Derived throughput from the inspected output:

```text
2378 frames / 476.96 s = approximately 4.99 processed frames/s
476.96 s / 79.29 s = approximately 6.0x slower than real time
```

Observed machine pressure during processing:

```text
GPU utilization: reached 100%
dedicated GPU memory: approximately 7.6 / 8.0 GB
shared GPU memory: approximately 10.0 / 15.9 GB
system RAM: approximately 30.3 / 31.8 GB (95%)
GPU temperature observed: approximately 48 C
```

## Finished-video inspection

The output opens correctly and contains a valid AAC stereo audio stream.

Operator observation:

```text
overall result: not great / below desired quality
eyes: target eye motion preserved well
mouth: target mouth/speech motion preserved well
```

Frame sampling across the native output supports the same general conclusion:

- target performance and facial motion are retained well enough to be useful;
- the swapped face remains reasonably temporally coherent through ordinary frontal motion;
- the face has a visibly smoothed/generic swapped appearance rather than a convincing Production-grade identity transfer;
- this first run does not justify adding enhancement/restoration yet because we have not established which swapper model gives the strongest raw identity result;
- source-identity likeness cannot be scored rigorously from the output alone; future comparison should include the actual S1 source image beside representative output frames.

## D0 verdict

```text
CUDA execution: PASS
full-video completion: PASS
video reconstruction: PASS
output 720x1280 / 30 fps: PASS
AAC audio stream present: PASS
expression/mouth/eye preservation: PROMISING
finished identity/compositing quality: FAIL / BELOW PRODUCTION BAR
memory efficiency on current worker: HEAVY
```

D0 therefore proves feasibility of the execution path, not final quality.

## Next experiment

Do not rerun another 79-second clip for model selection.

Create one fixed 6–10 second benchmark segment from the same target containing the most useful facial motion, then keep source, clip, detector, mask, output settings and seed-equivalent conditions fixed.

Because D0's main weakness is overall identity/face quality while eye and mouth performance are already preserved, the first comparison should prioritize raw identity quality:

```text
D1-A  hyperswap_1a_256   existing baseline
D1-B  hyperswap_1c_256   first challenger
D1-C  hyperswap_1b_256   angle/profile challenger
```

Only after selecting the strongest raw HyperSwap result should we test pixel boost, masks, expression restoration, enhancement, generated references, or CanonSwap.
