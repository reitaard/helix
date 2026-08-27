# Deepfake local test plan

Status: **planned; no test has been executed yet**.

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

## D1 — face-swap model comparison

Use exactly the same S1 and V1.

Minimum comparison:

```text
hyperswap_1a_256
hyperswap_1b_256
hyperswap_1c_256
inswapper_128_fp16
```

Add one Ghost model if setup makes it straightforward.

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

Use the same S1 + V1.

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
| D0 | FaceFusion | S1 | smoke | - | - | - | - | - | - | - | pending |

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
