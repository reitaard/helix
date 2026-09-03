# Klein 4B Enhancement Benchmark

Status: **research only**. This is not a Production workflow and does not create a Lowry runtime capability.

## Goal

Test whether Helix's existing FLUX.2 Klein 4B INT8 W8A8 stack can provide the visible image-detail enhancement that conservative SeedVR2 tests did not.

The first benchmark intentionally keeps the image at **1024 x 1024**. It tests enhancement behavior before testing 2x/4x output size.

The question is:

```text
How much useful micro-detail can Klein add
before identity / age / geometry / intended blur / color drift becomes unacceptable?
```

## Why this workflow

The benchmark adapts a current community Klein enhancement workflow to Helix's already-working 4B INT8 W8A8 model.

The key pattern is:

```text
LoadImage
    ↓
ImageScale bilinear -> 1024 x 1024
    ↓
VAEEncode
    ├──> KSampler latent_image
    ├──> ReferenceLatent positive
    └──> ReferenceLatent negative

prompt conditioning + same source latent
    ↓
Klein 4B INT8 W8A8
    ↓
KSampler
    ↓
VAEDecode
    ↓
SaveImage
```

This is not classical super-resolution. It is controlled image-to-image regeneration anchored to the source.

## Known-good Helix model stack

Use the same loaders/assets as the working Klein T2I workflow:

```text
model loader:
OTUNetLoaderW8A8

unet_name:
flux-2-klein-4b-int8.safetensors

weight_dtype:
default

model_type:
flux2

on_the_fly_quantization:
false

enable_convrot:
false

lora_mode:
None

CLIP:
qwen_3_4b.safetensors
(type = flux2, device = default)

VAE:
flux2-vae.safetensors
```

Do not change the worker dependency stack for this test.

## Test source

First source:

```text
Flux2-Klein-Distilled_00002_2.png
1024 x 1024
```

This is the same portrait already used for the SeedVR2 comparisons, which gives us a direct visual reference.

## Source preparation

Use core `ImageScale`:

```text
upscale_method: bilinear
width: 1024
height: 1024
crop: disabled
```

Even though the source is already 1024x1024, keep this node in the graph so the benchmark matches the reference workflow structure and can later accept different source dimensions.

The scaled image must go into one `VAEEncode` node.

That encoded source latent is used in **three places**:

```text
1. KSampler latent_image
2. ReferenceLatent positive latent
3. ReferenceLatent negative latent
```

## Conditioning

Positive prompt for the first benchmark:

```text
High resolution image 1. Preserve exact color saturation and exposure from image 1.
```

Negative prompt:

```text
<empty>
```

Pass both positive and negative conditioning through separate `ReferenceLatent` nodes using the same encoded source latent.

Do not add a longer preservation prompt yet. The first test should reproduce the simplest reported behavior before we tune around failures.

## Sampler baseline

The published Klein 9B community reference uses 8 steps. Helix's current local Klein 4B INT8 W8A8 path is the **4-step distilled** model, so this adaptation keeps the model's known-good 4-step inference budget instead of blindly copying the 9B step count.

Keep these constant:

```text
seed: 252
control_after_generate: fixed
steps: 4
cfg: 1
sampler: euler
scheduler: beta
```

Run three denoise strengths with all other variables fixed:

```text
A — 0.70
B — 0.80
C — 0.90
```

Suggested output prefixes:

```text
klein4b_enhance_d070
klein4b_enhance_d080
klein4b_enhance_d090
```

A single benchmark workflow may contain three KSampler branches so one queue action produces all three results.

## Evaluation

Compare the three Klein outputs against:

```text
original 1024x1024
Lanczos reference
SeedVR2 7B Sharp reference
```

Inspect at 100% and 200% crops.

### Face / identity

Check:

```text
eye shape
eyelashes
eyebrow structure
nose / lips
jawline
skin pores / texture
apparent age
moles / small identity marks if present
```

Fail if enhancement creates obvious age drift, identity drift, makeup-like texture, excessive pores or synthetic skin patterns.

### Hair

Check whether new strand separation looks physically plausible rather than painted or repetitive.

### Window / rain

Check droplet/streak definition, but also verify that reflections and bokeh are not converted into false sharp objects.

### Jacket / fabric

Check useful weave/seam/fold detail versus invented texture.

### Depth of field

The source intentionally contains blurred background areas. More detail is **not automatically better**. Fail if the model sharpens background bokeh or out-of-focus regions in a way that changes the photographic depth structure.

### Color / exposure

Check skin tone, warm lamps, dark greens and the window area. The workflow should not introduce a systematic warm/beige cast or materially alter exposure.

## Decision rules

### If 0.70 is almost unchanged

That establishes a faithful lower bound. Keep it as a potential conservative generative setting but do not stop the experiment.

### If 0.80 adds useful detail with low drift

This becomes the first balanced candidate for further testing on product/text and environment images.

### If 0.90 adds obvious detail but changes identity/age/blur

That is still useful evidence: the model has the desired enhancement capacity, but the safe operating point is lower.

### If even 0.90 barely changes the image

Klein 4B INT8 does not provide enough enhancement ceiling for this task; move to the independent PiSA/VOSR/9B research branch instead of endlessly prompt-tuning 4B.

## Next test only if portrait passes

Do not jump directly to tiled 4K output.

Next use:

```text
product / object image with small text or logo
```

This tests whether the enhancement preserves exact geometry and characters rather than merely producing attractive portrait texture.

Then test an environment image for foliage/rock/repeated texture and intended depth.

## Production boundary

The eventual Helix contract, if this research succeeds, should expose a semantic behavior such as fidelity/enhancement strength rather than:

```text
denoise
sampler
scheduler
raw prompt
Klein model filename
ReferenceLatent node IDs
```

No runtime integration occurs until the benchmark is closed.
