# Upscaling Research

This folder records active Helix Production research into local image/video upscaling and restoration. It is **not** a production capability yet.

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

The current rule is:

```text
research -> controlled benchmark -> choose behavior/model -> define semantic contract -> integrate
```

Do not expose model names, raw Comfy node IDs, BlockSwap values, VAE tile sizes, or similar implementation details as the eventual Helix contract.

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

### Image conclusion so far

The SeedVR2 result is consistent with a **conservative restoration/upscale** behavior: it preserves source structure well but does not strongly re-imagine detail in already-clean generated images.

That means the research question has changed from:

```text
Which conservative upscaler is best?
```

to:

```text
Which local method gives a controllable fidelity <-> detail trade-off
for clean AI-generated images while remaining production-safe?
```

Do not lock SeedVR2 7B or the community 1.4B distillation as `image.upscale` yet.

## Research insight: upscale vs enhancement

Current ComfyUI guidance distinguishes two different jobs:

```text
upscaling
-> increase resolution / reconstruct detail

enhancement
-> improve perceived detail, denoise, sharpen, restore or creatively rebuild texture
```

It also classifies SeedVR2 as conservative. That explains why our clean FLUX comparisons are subtle: the model is behaving close to its intended fidelity-preserving role rather than acting as a creative refiner.

For Helix, this suggests that a future image-upscale capability may need internal modes such as:

```text
faithful / restore
creative / enhance
```

Those are only candidate semantics. They should not be added to the runtime until repeated tests show that the distinction is durable and useful.

## Current local research shortlist

### 1. PiSA-SR — highest-priority next benchmark

CVPR 2025, one-step diffusion SR.

Why it is especially relevant to Helix:

- explicitly demonstrates **AIGC enhancement**;
- exposes separate pixel-level and semantic-level LoRA strengths;
- lets us intentionally trade fidelity against added semantic detail;
- supports tiled diffusion/VAE inference for lower VRAM;
- Apache 2.0 project license.

The important knobs are conceptually:

```text
lambda_pix
-> degradation cleanup / pixel-level fidelity

lambda_sem
-> additional semantic detail
```

This is much closer to the behavior we were expecting when SeedVR2 looked too conservative.

### 2. VOSR — strongest new architecture candidate

CVPR 2026 vision-only generative super-resolution framework.

Relevant released variants include:

```text
VOSR 0.5B multi-step
VOSR 0.5B one-step
VOSR 1.4B multi-step
VOSR 1.4B one-step
```

Reasons to test:

- no text-to-image prior is required for the SR task;
- one-step distilled checkpoints are available;
- 0.5B is especially interesting for the RTX 4060;
- tiled inference supports large inputs;
- authors emphasize fine structures and text readability;
- multi-step variants expose a fidelity/generative-strength trade-off;
- Apache 2.0 project license.

The 0.5B one-step checkpoint is the practical first VOSR candidate. The 1.4B path can be tested later if the smaller model is promising.

### 3. TVT — fine-structure/reference candidate

ICCV 2025 Transfer VAE Training targets a known weakness of diffusion SR: losing small characters and fine texture through aggressive VAE downsampling.

The paper reports stronger fidelity/fine-structure metrics than earlier one-step diffusion SR methods while also providing tiled inference. This makes TVT particularly interesting for:

```text
small text
product labels
logos
fine texture
hard structure
```

It is not the first implementation target because the stack is more involved and there is no clean first-party Comfy integration currently selected for Helix.

### 4. AdcSR — speed reference

CVPR 2025 compressed one-step diffusion SR.

Useful as a later speed/efficiency control because it removes/prunes much of the OSEDiff stack and is dramatically cheaper while retaining generative behavior. It is not currently the quality-first master candidate.

### 5. Traditional SR baselines

Keep deterministic/local baselines available:

```text
RealESRGAN
BSRGAN
SwinIR
Lanczos
```

They are useful controls for measuring whether a generative model is actually adding value. They should not be expected to produce the same visible semantic enhancement as a generative SR/refinement model.

## Candidates intentionally deprioritized

### SeedVR2 1.4B Sharp distillation

A community 1.4B / six-layer Sharp distillation exists and is attractive for memory/runtime, but it is distilled from the same conservative SeedVR2 Sharp teacher. It may solve **cost**, but it does not directly solve the behavioral issue discovered in our tests: insufficient visible enhancement on clean AI images.

Therefore it is not the next benchmark.

### CCSRv2

Interesting content-consistent diffusion SR with adjustable step counts, but the current Comfy wrapper is explicitly not a native/efficient implementation and warns of memory issues. That makes it a poor first choice for an 8 GB Production worker.

### DiT4SR

Strong research results, but its released stack depends on SD3.5 Medium plus large auxiliary language/vision components and has a less convenient license/integration profile for the current Helix worker. Not an early Production candidate.

### SUPIR / older heavy multi-step restoration stacks

Still capable, but computationally heavy relative to newer one-step approaches and not the best first fit for the RTX 4060.

## Next benchmark design

The next controlled image benchmark should compare behavior, not just output resolution.

Use a small representative set:

```text
A. clean AI portrait
   identity, eyes, skin, hair, fabric

B. product / object with text
   label edges, logos, tiny characters, geometry

C. environment
   foliage, branches, rocks, repeated texture

D. degraded copy with known ground truth
   restoration fidelity and hallucination
```

For each candidate record:

```text
fidelity to source / ground truth
visible useful detail gained
hallucinated or changed detail
identity stability
small-text correctness
hard-edge / geometry stability
texture naturalness
runtime
peak VRAM
system RAM
installation/integration complexity
license / redistribution constraints
```

The next model to benchmark is **PiSA-SR**, because its separate pixel/semantic controls directly test the behavior SeedVR2 could not provide. VOSR 0.5B one-step is the next architecture comparison after PiSA-SR.

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

The model/workflow winner should be selected before this code is added.
