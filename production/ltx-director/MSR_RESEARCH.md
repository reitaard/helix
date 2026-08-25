# Licon MSR research — LTX 2.5

Status: **researched, not yet locally validated**.

This note records the current understanding of LiconStudio's LTX 2.5 Multiple Subject Reference (MSR) system before installing or benchmarking it on the Helix worker.

## What MSR is

Licon MSR V1 is a multi-reference LoRA trained specifically for LTX 2.5.

Its purpose is different from Prompt Relay:

```text
Prompt Relay
= what semantic beat should dominate WHEN

MSR
= which referenced subject/object/background should remain WHO/WHAT
```

The published model supports up to five reference images and targets preservation of characters, clothing, objects and backgrounds in one generation.

Current public weight:

```text
LTX-2.5-Licon-MSR-V1.safetensors
~1.31 GB
base model: Lightricks/LTX-2.5
license: Apache-2.0
```

Official model repository:

```text
LiconStudio/LTX-2.5-Multiple-Subject-Reference
```

ComfyUI node repository:

```text
liconstudio/ComfyUI-LTX2.5-MSR
```

## Mechanism

The Licon description and node implementation use the following approach:

1. Each reference image is independently encoded into the LTX video latent space.
2. The MSR LoRA contains learned `reference_slot_embedding` tensors.
3. Each connected reference is assigned a stable slot ID.
4. A learned Fourier/MLP embedding for that slot is added to the encoded reference latent.
5. Reference latents are prepended to the generation latent using distinct **negative temporal positions**.
6. The LTX model can retrieve those reference details through its normal self-attention path during generation.

Conceptually:

```text
Image 1 -> latent + learned slot 1 -> negative reference time
Image 2 -> latent + learned slot 2 -> negative reference time
Image 3 -> latent + learned slot 3 -> negative reference time
...
                         ↓
               target video generation
```

This is not a face-swap step and not a post-processing identity repair. The references participate in diffusion as latent guide tokens.

## Stable reference slots

The current ComfyUI node accepts references in this order:

```text
1. pic1
2. pic2
3. pic3
4. pic4
5. background
```

Missing optional references are skipped and connected references receive consecutive slot IDs.

The loader checks that the selected LoRA actually contains MSR slot-embedding weights. A normal LoRA without the required `reference_slot_embedding` tensors is rejected.

The current implementation requires batch size 1.

## Reference preparation

The guide supports:

```text
reference_frames: 25 or 33
strength:         0.0-1.0
optional tiled VAE encoding
```

Subject images and background images are treated differently when resizing:

- subject references try to preserve the complete source image and may use white padding;
- background references are resized to cover the target and center-cropped.

The model card recommends describing each reference explicitly in the prompt with stable labels such as `Image 1`, `Image 2`, `Image 3`, and clearly assigning character/object/clothing/background responsibilities.

## Native LTX workflow integration

The new LTX 2.5 plugin is intentionally narrow. It leaves base model loading, text encoding, prompt enhancement, samplers, sigma schedules, audio, latent upscaling and decode to native ComfyUI nodes.

Basic topology:

```text
Native LTX model
    ↓
MSR IC-LoRA Loader
    ↓
model used by native guider/sampler

positive + negative conditioning
video VAE
empty VIDEO latent
reference image(s)
MSR parameters
    ↓
MSR Multi-Reference Guide
    ↓
LTXVConcatAVLatent
    ↓
native LTX sampling
    ↓
LTXVSeparateAVLatent
    ↓
LTXVCropGuides
    ↓
decode
```

The guide must receive a **video-only** LTX latent before `LTXVConcatAVLatent`. It does not accept the already-combined AV latent.

After sampling, appended reference slots must be cropped before decoding. Otherwise reference guide frames/tokens can remain in the decoded result.

## Two-stage LTX 2.5 integration

The published plugin explicitly supports the native two-stage latent-upscale pattern.

Recommended topology:

```text
empty video latent
    ↓
MSR Guide #1
    ↓
concat audio
    ↓
stage 1 sampling
    ↓
separate AV
    ↓
crop stage-1 reference guides
    ↓
spatial latent upscale
    ↓
MSR Guide #2 using the SAME references
    ↓
rejoin audio
    ↓
stage 2 low-noise refinement
    ↓
crop stage-2 reference guides
    ↓
decode
```

This is important for Helix because our validated native T2V workflow is also two-stage.

Unlike Kijai Prompt Relay, which could patch one model and feed both sampling stages, MSR reference latents are spatial-resolution-dependent. The documented two-stage path therefore **re-applies the references after spatial upscale**.

Do not replace the second MSR guide with `LTXVImgToVideoInplace`; that path re-encodes/overwrites latent frames rather than retaining the upscaled generated latent and rebuilding high-resolution reference conditions.

## Current implementation caveat

The plugin preserves MSR slot embeddings and negative reference positions, but its current ComfyUI compatibility path forces:

```text
reference_temporal_scale_factor = 1
```

rather than blindly honoring another temporal scale recorded by a checkpoint.

This is an implementation-specific compatibility choice and is one reason the first local test should use the author's current V1 model + current plugin together rather than mixing older 2.3 workflows/nodes.

## Maturity / confidence

The LTX 2.5 plugin is very new compared with the older LTX 2.3 Licon MSR ecosystem.

Current evidence:

- dedicated LTX 2.5 model card and weight exist;
- dedicated standalone LTX 2.5 ComfyUI plugin exists;
- author provides a sample two-stage workflow;
- author publishes several validation examples with three references;
- at least one independent recent ComfyUI test reports successful LTX 2.5 MSR generation;
- the older 2.3 MSR implementation has substantially more community history, but its workflows/nodes should not be assumed equivalent to the new 2.5 implementation.

Therefore MSR is promising enough to test, but not yet a Helix-validated Production capability.

## What MSR is likely to help

Primary hypothesis:

- recurring character likeness;
- wardrobe/clothing consistency;
- specific object/vehicle appearance;
- multiple distinct subjects in one shot;
- subject + object composition;
- optional environment/background reference consistency.

Potential Helix use:

```text
Story entity: JOHN
reference asset: john_reference.png

Shot 01 contains JOHN -> attach John's MSR reference
Shot 02 no JOHN          -> do not attach it
Shot 03 contains JOHN -> attach same reference again
```

The important semantic concept for Helix is therefore not "always use MSR" but **continuity groups / story entities with selective reference attachment**.

## What MSR should not be assumed to solve

Before testing, do not claim that MSR guarantees:

- exact pose;
- exact blocking/spatial location;
- temporal event timing;
- physical state transitions;
- collision geometry;
- exact face identity at every angle;
- cross-shot continuity when references are not supplied consistently;
- reliable interaction among many subjects under dense action.

Those remain experiment questions.

## Relationship to Prompt Relay

The two controls attack different dimensions:

```text
MSR
-> reference identity / appearance retrieval

Prompt Relay
-> temporal semantic routing / scene progression
```

A future combination is conceptually attractive:

```text
same woman reference
same man reference
        ↓
MSR maintains who they are

wait -> arrival -> approach -> payoff
        ↓
Prompt Relay manages when each beat dominates
```

But do **not** combine them in the first test. If a combined generation fails, attribution becomes impossible.

First validate MSR independently against native LTX.

## Recommended first local benchmark

Start with **one reference subject**, even though MSR supports multiple.

Reason: establish whether the LTX 2.5 LoRA/plugin preserves identity at all on our worker before testing slot separation between several references.

### Test A — native I2V/reference baseline

Use one clean portrait/full-body character reference with our already validated native LTX path, where appropriate.

### Test B — MSR one-subject

Same creative prompt, same model family/settings/seed where the workflow allows a meaningful comparison, but provide the subject through MSR.

Evaluation:

```text
face / hair
wardrobe
body silhouette
colors/materials
identity through camera movement
motion quality
prompt adherence
finished visual quality
runtime / VRAM / RAM
```

### Test C — two-subject slot separation

Only after Test B works:

```text
Image 1 = woman A
Image 2 = man B
```

Prompt must explicitly label/reference both subjects and assign distinct actions/positions.

Evaluate:

- whether identities mix;
- whether wardrobe swaps;
- whether one reference dominates;
- whether each subject remains distinct through motion;
- whether reference conditioning reduces action quality.

### Test D — subject + object

If two-human separation works, test a character plus a distinctive vehicle/object. This is more directly useful to Helix recurring-story continuity.

## Installation plan for the Helix standalone ComfyUI

Active runtime discovered during current research:

```text
C:\AI\ComfyUI-CLI
```

Central model library:

```text
C:\AI\Models\LTX
```

Recommended placement:

```text
custom node:
C:\AI\ComfyUI-CLI\custom_nodes\ComfyUI-LTX2.5-MSR

LoRA:
C:\AI\Models\LTX\loras\LTX-2.5-Licon-MSR-V1.safetensors
```

`C:\AI\Models\LTX\loras` is already exposed to the active ComfyUI through `extra_model_paths.yaml`, so the LoRA does not need to live inside the runtime folder.

Do not install the older `ComfyUI-Licon-MSR` LTX 2.3 package for this experiment unless a separate 2.3 comparison is explicitly desired.

## Decision gate

MSR earns a place in Helix Production only if local tests show a meaningful identity/reference gain without unacceptable damage to motion, framing, action completion or runtime stability.

If validated, likely Production role:

```text
native LTX
+ optional MSR references for continuity-critical entities
+ optional Prompt Relay for scene progression
```

Each layer remains opt-in and justified by the creative requirement.
