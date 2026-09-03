# Upscaling Research

This folder records active Helix Production research into local image/video upscaling, restoration, and controlled image enhancement. It is **not** a production capability yet.

## Status

```text
physical worker: helix-rtx4060-01
GPU: RTX 4060 / 8188 MiB VRAM
candidate logical profile: lowry / John D. Lowry
candidate semantic capabilities:
- image.upscale
- video.upscale
```

`lowry` is only a candidate Production profile. It is not registered in `media-runtime`, the public job tool enum does not expose upscale tools, and no upscale workflow binder is production-wired.

The current rule remains:

```text
research -> controlled benchmark -> choose behavior/model -> define semantic contract -> integrate
```

Do not expose model names, raw Comfy node IDs, denoise values, BlockSwap values, VAE tile sizes, or similar implementation details as the eventual Helix contract.

## The research question changed

The initial work treated image upscaling as one problem. Controlled tests plus a later community/workflow audit show that at least three different jobs matter:

```text
faithful enlargement
-> make a good image larger while changing as little as possible

restoration
-> recover a weak / blurry / compressed source

generative enhancement
-> preserve the image while deliberately rebuilding richer micro-detail
```

This distinction matters for Helix. SeedVR2 is a strong conservative reconstruction path, but the visual effect the project wants for already-good FLUX images is closer to **controlled generative enhancement**.

A future semantic split such as:

```text
faithful / restore
creative / enhance
```

is now a useful hypothesis, not an approved runtime contract. It should be promoted only if repeated experiments prove the distinction durable.

## SeedVR2 local integration used for research

The RTX 4060 worker was extended experimentally with:

```text
custom node: numz/ComfyUI-SeedVR2_VideoUpscaler
version: v2.5.23
commit: 5a4bf428f3735cc72ac760d40f372f94dec28422
```

Primary research assets:

```text
seedvr2_ema_7b_fp16.safetensors
seedvr2_ema_7b_sharp_fp16.safetensors
ema_vae_fp16.safetensors
```

The 7B FP16 path was made viable on 8 GB VRAM through aggressive BlockSwap/CPU offload and tiled VAE operation. This proves execution feasibility, not Production suitability.

## Video benchmark checkpoint

Source:

```text
LTX_2.5_t2v_00035_.mp4
704 x 1280
24 fps
~8.04 s
```

SeedVR2 target was approximately:

```text
1056 x 1920
```

### 7B regular FP16

A full ~8 second run completed successfully:

```text
total generation time: 7690.06 s
~128 min 10 s
```

Matched-frame inspection against the original showed only a small improvement in trail edges, rocks/ground separation, cockpit structure and some tree detail. Motion blur remained dominant.

### 7B Sharp FP16

A controlled one-second / 24-frame Sharp run completed successfully:

```text
total generation time: 750.14 s
~12 min 30 s for one second of source video
```

A matched comparison was made between:

```text
original
Lanczos resize
SeedVR2 7B regular
SeedVR2 7B Sharp
```

Sharp was the best of the four, but the gain over regular/Lanczos remained modest relative to compute cost.

### Video conclusion

For already-clean LTX 704x1280 generation, SeedVR2 7B FP16 is **not justified as a default finishing stage** on the RTX 4060.

Current policy from the experiment:

```text
clean generated LTX video
-> do not default to SeedVR2

truly degraded / low-resolution video
-> SeedVR2 remains an unclosed restoration candidate
```

Video upscaler integration is halted for now rather than forcing a costly model into Production because it technically runs.

## Image benchmark checkpoint

The first image tests used a clean FLUX.2 Klein portrait at 1024x1024.

### Clean 1024 -> 2048

Compared:

```text
original 1024x1024
Lanczos 2x
SeedVR2 7B Sharp FP16 2x
```

The SeedVR2 run completed in roughly 68 seconds. It produced small improvements in local micro-contrast, skin texture, hair separation, rain/window detail and clothing edges, but the visual difference from Lanczos was still subtle.

### Ground-truth restoration test

The same pristine 1024x1024 image was downscaled to 512x512, then restored back to 1024x1024 with:

```text
Lanczos
SeedVR2 7B Sharp FP16
```

Again, SeedVR2 looked somewhat more processed/resolved, but the difference was not large enough to justify selecting it as the final Helix image upscaler.

### SeedVR2 image conclusion

The observed behavior is consistent with a **conservative restoration/upscale** path: good structural fidelity, modest visible reconstruction on already-clean generated images.

Do not lock SeedVR2 7B or the community 1.4B distillation as the final `image.upscale` implementation yet.

## Community/workflow audit — 2026-09-03

A focused audit of current Stable Diffusion / ComfyUI community workflows added an important insight: users repeatedly distinguish between SeedVR2-style faithful reconstruction and FLUX/Klein-style generative refinement.

The strongest concrete workflow found uses FLUX.2 Klein as a controlled image-to-image refinement stage rather than as a classical SR model.

Its first-pass pattern is:

```text
source image
    ↓
bilinear scale to about 1 MP
    ↓
same scaled image used as:
    - reference latent
    - starting latent
    ↓
FLUX.2 Klein
    ↓
short descriptive enhancement prompt
    ↓
8 steps / CFG 1 / Euler / beta
    ↓
denoise roughly 0.7 - 0.9
```

The published reference workflow uses:

```text
prompt:
High resolution image 1. Preserve exact color saturation and exposure from image 1.

seed: 252
steps: 8
cfg: 1
sampler: euler
scheduler: beta
denoise: 0.8
```

The workflow deliberately uses the bilinear-scaled source as both a reference and the KSampler starting latent. That gives Klein enough freedom to rebuild detail while keeping the source image strongly anchored.

Community reports also expose the important failure modes:

```text
too much denoise / generative freedom
-> changed skin texture
-> added wrinkles / apparent aging
-> changed small objects
-> background detail created where blur should remain
-> exposure / saturation drift
-> seed dependence
```

This is precisely the fidelity-versus-detail curve that Helix needs to measure rather than hide.

### SeedVR2 remains useful as a reference behavior

The same community material broadly supports the local result:

```text
good but small source
-> SeedVR2 is strong and coherent

weak / blurry source
-> restoration/edit before final enlargement may be necessary

clean AI image where more visible detail is desired
-> generative refinement is a different task
```

The repeatedly suggested SeedVR2 downscale trick also supports the local 1024 -> 512 -> 1024 experiment: deliberate reduction can suppress high-frequency junk and give reconstruction more freedom. It did not, however, create enough visible improvement on the clean portrait to answer the project's enhancement goal.

## Current highest-priority path: existing FLUX.2 Klein 4B

Helix already has a validated local FLUX.2 Klein 4B generation stack on the same RTX 4060, including:

```text
FLUX.2 Klein 4B INT8 W8A8
qwen_3_4b.safetensors
flux2-vae.safetensors
```

This changes the immediate research priority. Before adding PiSA-SR, VOSR, or another dependency stack, test whether the already-working Klein 4B model can provide the desired controlled enhancement behavior.

The first controlled experiment is documented in:

```text
production/upscaling/KLEIN4B_ENHANCEMENT_TEST.md
```

The benchmark starts at the original 1024x1024 portrait resolution. It is deliberately **not** a 2x/4x size benchmark yet. The question is first:

```text
How much useful micro-detail can Klein add
before identity / geometry / blur / color drift becomes unacceptable?
```

Only after that curve is understood should physical enlargement or tiled 4K generation be tested.

## Tiled generative refinement

If the single-image Klein test succeeds, the next research class is tiled generative refinement for larger outputs.

Two community directions are relevant:

### Divide & Conquer

Conceptually:

```text
upscale
-> divide into tiles
-> generative diffusion per tile
-> stitch
```

This is useful when the goal is effectively to **generate a believable high-resolution version**, not merely interpolate pixels. It should not be used just to tile SeedVR2 because SeedVR2 already has its own tiling path.

### Klein-specific tiled workflows

New Klein tiled upscalers expose useful concepts such as source anchoring, adaptive work per tile, color matching and consistent noise. These concepts are relevant to Lowry, but current community custom nodes require source audit before any Production consideration.

Do not install an unaudited tiled custom node into the pinned worker merely because its output examples look good.

## Independent model shortlist if Klein 4B is insufficient

### 1. PiSA-SR

CVPR 2025 one-step diffusion SR with separately controllable pixel-level and semantic-detail LoRA strengths.

Still important because it directly exposes a fidelity/detail trade-off and demonstrates AIGC enhancement, but it is now an **independent comparison after the existing Klein 4B experiment**, not the immediate next installation.

### 2. VOSR

CVPR 2026 vision-only generative SR. The 0.5B one-step variant remains especially interesting for the RTX 4060 and tiled 4x operation.

### 3. TVT

ICCV 2025 Transfer VAE Training remains a strong fine-structure/text candidate, particularly for small characters, product labels, logos and hard geometry.

### 4. AdcSR

Useful later as an efficiency reference for compressed one-step generative SR.

### 5. Traditional controls

Keep deterministic baselines available:

```text
Lanczos
RealESRGAN
BSRGAN
SwinIR
4xFFHQLDAT-class faithful photographic SR
```

They are controls for whether a generative path is earning its added complexity.

## Candidates intentionally deprioritized

### SeedVR2 1.4B Sharp distillation

The community 1.4B / six-layer Sharp distillation is attractive for memory/runtime, but it primarily solves **cost**. It does not directly solve the observed behavioral issue: insufficient visible enhancement on clean AI images.

### CCSRv2

Interesting content-consistent diffusion SR, but the current Comfy wrapper is not the clean first fit for an 8 GB Production worker.

### DiT4SR

Strong research results but a heavier dependency/license/integration profile than the current Helix path.

### SUPIR / older heavy multi-step restoration stacks

Still capable, but computationally heavy relative to newer one-step or existing-Klein approaches.

## Benchmark matrix

The image benchmark should grow into a small fixed set:

```text
A. clean AI portrait
   identity, age, eyes, skin, hair, intended depth of field

B. product / object with text
   labels, logos, tiny characters, geometry, reflections

C. environment
   foliage, branches, rocks, repeated texture, depth

D. degraded copy with known ground truth
   restoration fidelity and hallucination
```

For each candidate record:

```text
fidelity to source / ground truth
visible useful detail gained
hallucinated or changed detail
identity and apparent-age stability
small-text correctness
hard-edge / geometry stability
intended blur / depth-of-field preservation
color / exposure stability
texture naturalness
runtime
peak VRAM
system RAM
installation/integration complexity
license / redistribution constraints
```

## Production integration remains deferred

No runtime changes should be made yet.

The current `media-runtime` only exposes:

```text
video.i2v
video.t2v
image.t2i
```

A future Lowry integration will require deliberate work around:

```text
profile registration
image.upscale / video.upscale semantic tool contracts
input staging/binding
workflow templates and binders
runtime timeout policy
regression tests
Telegram/operator surface if desired
```

The behavior and workflow winner must be selected before this code is added.
