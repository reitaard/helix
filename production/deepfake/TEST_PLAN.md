# Deepfake local test plan

Status: **D0 completed on the local RTX 4060. Technical execution passed, but the first HyperSwap 1A result is below the desired finished-media quality bar. D1 raw swapper comparison is next.**

The purpose of this plan is to answer one question before backend work:

> Can the chosen local Windows GPU setup turn one source identity image + one target video into a convincing, stable output video, and does generated reference preparation materially improve it?

## Test policy

- Run the first experiments manually on the Windows PC.
- Keep every deepfake engine in its own environment.
- Do not modify `C:\AI\ComfyUI-CLI` to install FaceFusion/CanonSwap dependencies.
- Keep ComfyUI available only for the optional reference-generation stage.
- Do not add Telegram, n8n, VPS or `helix-runtime` integration during these tests.
- Record exact versions/settings/output names for every run.
- Keep source and target media fixed when comparing models/settings.
- Evaluate the native output artifact, not a messaging-app preview/transcode.

## Test assets

### Source identity image S1

Use one high-quality portrait with:

- one clearly visible adult face;
- enough facial resolution for recognition;
- minimal obstruction;
- neutral or moderate expression;
- no extreme stylization.

The first source should remain unchanged across the raw-engine benchmark.

First executed source image dimensions:

```text
736 x 1104
portrait orientation
```

### Target video V1

Use one deliberately challenging but practical clip, approximately 8-15 seconds initially.

It should contain several of these within one clip:

```text
frontal face
three-quarter view
clear profile / strong yaw
speech or mouth movement
expression change
head movement
partial hand/hair/object occlusion
a lighting change or non-flat lighting
```

Avoid selecting a target that makes every frame an easy frontal beauty shot.

Record before testing:

```text
duration
frame count
FPS
resolution
codec
audio codec / audio present
file size
```

The first executed target was substantially longer than intended. Inspection of the native output established:

```text
duration: 79.289909 s
frame count: 2378
FPS: 30
resolution: 720x1280
video codec: H.264
audio codec: AAC stereo, 44.1 kHz
```

The earlier approximately 19-second estimate was incorrect. For D1, cut one fixed 6-10 second benchmark segment from this video and reuse that exact segment for all model comparisons.

## D0 — FaceFusion installation smoke test

Goal: prove the isolated FaceFusion environment can process S1 + V1 on the local NVIDIA GPU and reconstruct a valid output video.

Target version for the first checkpoint:

```text
FaceFusion 3.8.2
```

Record:

```text
FaceFusion commit/tag
Python
ONNX Runtime
CUDA provider availability
GPU
VRAM
FFmpeg
command/config used
wall-clock runtime
peak observed VRAM if available
peak observed RAM if available
output metadata
```

Pass criteria:

- CUDA execution is actually used;
- output video opens correctly;
- duration/FPS/resolution are understood and not silently damaged;
- original audio is present unless deliberately disabled;
- target face is replaced for a meaningful part of the clip.

Do not optimize quality during the smoke run beyond choosing a reasonable baseline.

### D0 execution checkpoint — 2026-08-29

Environment:

```text
OS: Windows
GPU: NVIDIA GeForce RTX 4060
Dedicated VRAM: 8188 MiB class / 8 GB
FaceFusion: 3.8.2
FaceFusion git tag: 3.8.2
Python: 3.12.13
ONNX Runtime GPU: 1.24.4
Available ORT providers:
  TensorrtExecutionProvider
  CUDAExecutionProvider
  CPUExecutionProvider
FFmpeg: 9.0.1 full build
FaceFusion installer backend: cuda@12
```

Baseline settings used/observed:

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

Terminal completion:

```text
[FACEFUSION.CORE] processing step 1 of 1
analysing: 100% (2378/2378)
processing: 100% (2378/2378)
[FACEFUSION.TO_VIDEO] processing to video succeeded in 476.96 seconds
```

Measured/observed machine pressure during processing:

```text
GPU utilization: reached 100%
dedicated GPU memory: approximately 7.6 / 8.0 GB
shared GPU memory: approximately 10.0 / 15.9 GB
system RAM: approximately 30.3 / 31.8 GB (95%)
GPU temperature observed: approximately 48 C
```

Derived performance using the inspected 79.289909-second output:

```text
throughput: approximately 4.99 processed frames/s
runtime ratio: approximately 6.0x slower than real time
```

Finished-media observations:

- CUDA execution and full 2378-frame processing passed.
- The output opens correctly at 720x1280 / 30 fps and contains AAC stereo audio.
- Eye motion is preserved well.
- Mouth/speech motion is preserved well.
- Sampled ordinary frontal motion is reasonably temporally coherent.
- Overall face/identity quality is not yet good enough; the face has a smoothed/generic swapped appearance.
- Do not use restoration/enhancement yet to hide a weak raw swapper. First compare the raw swapper models.
- Source-identity likeness should be evaluated beside the actual S1 source image during D1; output-only inspection cannot rigorously score likeness.

D0 verdict:

```text
execution feasibility: PASS
full-video completion: PASS
video reconstruction: PASS
expression / eye / mouth preservation: PROMISING
finished identity/compositing quality: BELOW PRODUCTION BAR
memory efficiency: HEAVY
```

See [`D0_RESULT.md`](D0_RESULT.md) for the focused result record.

## D1 — face-swap model comparison

Use exactly the same S1 and one fixed 6-10 second segment cut from V1.

Because D0's principal weakness is raw identity/face quality while target eye and mouth motion are already preserved, compare in this order:

```text
D1-A  hyperswap_1a_256   existing baseline
D1-B  hyperswap_1c_256   identity-quality challenger
D1-C  hyperswap_1b_256   angle/profile challenger
D1-D  inswapper_128_fp16 if still useful
```

Add one Ghost model later if setup makes it useful.

Keep detector, selector, masks, enhancement and output settings fixed unless a model strictly requires a different compatible pixel-boost setting.

For each output score:

### Identity

```text
source likeness
face/head-shape retention
recognizability at frontal view
recognizability at 3/4
recognizability at profile
```

### Target preservation

```text
expression
mouth movement
head pose
eye direction
performance timing
```

### Temporal quality

```text
missed frames
identity jumps
flicker
geometry jumps
face-size instability
```

### Compositing

```text
face boundary
hair boundary
occlusions
skin tone
lighting mismatch
warping around head
```

### Technical preservation

```text
duration
FPS
resolution
audio
unexpected crop
codec/output problems
```

### Performance

```text
wall-clock runtime
VRAM
RAM
errors/retries
```

Select the best **finished-video result**, not simply the model with the sharpest single frame.

## D2 — controlled FaceFusion corrections

Only run a correction when D1 exposes a concrete failure.

Examples:

```text
occlusion artifacts
-> test occlusion mask

wrong facial region blending
-> test region/area mask

identity good but expression degraded
-> test expression restorer

face too soft
-> carefully test face enhancement / pixel boost

wrong target person selected
-> tune reference face / selector behavior
```

Do not turn every processor on simultaneously. Each correction should have a reason and an A/B output.

Face enhancement must be treated carefully because restoration can improve sharpness while reducing source likeness or producing plastic skin.

At the end of D2 freeze one `FF_BASELINE` configuration for V1.

## D3 — target-frame inspection for reference preparation

Extract/select representative target frames corresponding to meaningful appearance conditions:

```text
T_FRONT
T_3Q
T_PROFILE
T_LIGHT
```

Not every test needs all four. Pick only genuinely distinct conditions present in V1.

The goal is to understand what the original source image does not cover.

## D4 — generated reference A/B

Use an image-generation/editing model to create a target-matched reference while preserving S1 identity.

First experiment may use the already available local FLUX.2 Klein workflow to avoid introducing another model before the hypothesis is tested. This is a convenience choice, not an architectural choice.

Example requirement:

```text
identity = S1
viewpoint / pose / crop / lighting = derived from T_3Q
result = R_3Q
```

Before using `R_3Q` in the video pipeline, inspect it against S1 for identity drift.

Then run:

```text
D4-A
S1 + V1 -> FF_BASELINE

D4-B
R_3Q + V1 -> same FF_BASELINE
```

Nothing else changes.

Compare especially the frames around the target condition that motivated `R_3Q`.

A generated reference passes only if it gives a meaningful difficult-frame improvement without making overall source likeness worse.

## D5 — multi-reference identity coverage

Run only if D4 shows clear value.

Prepare a small identity set such as:

```text
S1 original
R_FRONT
R_3Q
R_PROFILE
```

Test FaceFusion's multi-source/averaging behavior if supported by the chosen configuration.

Questions:

- does multi-view coverage reduce misses/drift?
- does averaging weaken distinctive facial identity?
- does a generated profile help profile frames but harm frontal ones?
- is one excellent source image better than several imperfect generated variants?

Do not assume more references are automatically better.

## D6 — CanonSwap challenger

Run only after FaceFusion has a documented best configuration.

Use the same S1 + V1 benchmark segment.

The goal is not to reproduce every FaceFusion feature. Compare the core output on:

```text
identity
profile robustness
temporal consistency
expression preservation
occlusion behavior
compositing
runtime
VRAM/RAM
installation burden
failure/recovery behavior
```

CanonSwap earns further work only if it materially improves a problem that matters in the actual video.

## Result table

Maintain one compact result table as tests happen:

| ID | Engine | Source | Key settings | Identity | Profile | Temporal | Expression | Composite | Runtime | VRAM | Verdict |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| D0 | FaceFusion 3.8.2 | S1 736x1104 | HyperSwap 1A, 256 boost, weight 0.5, CUDA, strict | below desired bar; exact likeness needs S1 side-by-side | not isolated yet | ordinary frontal motion reasonably coherent | eyes/mouth preserved well | smoothed/generic swap appearance | 476.96 s for 79.29 s / 2378 frames (~4.99 fps) | ~7.6/8.0 GB dedicated + ~10 GB shared | execution pass; finished quality fail |

Scores should be supplemented by written observations; a single number can hide different failure modes.

## Production gate

Do not begin VPS/backend migration until we have at least:

```text
one repeatable raw FaceFusion baseline
one documented winning model/settings configuration
one native output that is subjectively useful
measured runtime on the local GPU
known failure cases
reference-generation A/B result
```

CanonSwap is not mandatory for the first Production gate if FaceFusion already meets the practical goal.

## After the gate

Only then design:

```text
VPS deepfake backend
Windows deepfake worker
media transfer/staging
job identity/lifecycle
worker health
cancellation/timeouts
output retrieval
optional Comfy reference-generation RPC
GPU mutual exclusion / scheduling
```

That implementation work belongs to a later Codex/backend session, not this research checkpoint.
