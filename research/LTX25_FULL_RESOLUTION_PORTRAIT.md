# LTX 2.5 Full-Resolution + Portrait Research Notebook

**Status:** evidence collection / analysis only  
**Purpose:** collect external findings before designing the next Production workflow. Do not treat any single post or workflow as the final Helix recipe.

## Current question

We are trying to separate several different problems that became mixed together during the motorcycle experiments:

1. native LTX 2.5 image fidelity and realism;
2. viewpoint changes that reveal geometry not visible in the opening image;
3. long-video continuation / temporal tiling;
4. subject identity persistence;
5. timed shot direction;
6. portrait / short-form quality requirements.

The next sources should be analyzed against these categories rather than immediately merged into one large workflow.

---

## Source A — Reddit: LTX 2.5 full-resolution workflows without the normal latent-upscale path

Source discussed on 2026-08-22:

`r/comfyui — LTX 2.5 full-resolution workflows / no latent upscale`

### Source-derived claim

The post argues that the normal LTX 2.5 two-stage I2V path can lose detail when motion or viewpoint changes force the model to invent content that is not visible in the opening image.

The normal path is conceptually:

```text
source image
    ↓
Stage 1 — lower-resolution generation
    ↓
latent ×2 upscaler
    ↓
Stage 2 — short final-resolution refinement
```

The alternative workflow samples at the final spatial resolution from the beginning instead of relying on low-resolution generation followed by latent upscaling.

The post reports a substantial runtime increase, but claims better detail retention in demanding I2V cases. It also states that the full-resolution approach can be used with the INT8 ConvRot model family relevant to the current local setup.

This is community evidence, not yet a locally confirmed Helix result.

### Why this matters to the motorcycle failure

The motorcycle test started from a frontal image but asked the model to reveal increasingly different views:

```text
front
  ↓
front 3/4
  ↓
side
```

A frontal source image does not contain direct visual evidence for many side-view details:

- full side fairing geometry;
- fuel-tank side shape;
- side mechanical components;
- rear bodywork;
- exact side wheel / brake geometry;
- rider anatomy and clothing from the new angle.

Therefore the model has to synthesize unseen geometry.

A plausible failure path is:

```text
unseen geometry required
      ↓
created first at lower Stage-1 resolution
      ↓
coarse / generic structure becomes established
      ↓
latent upscale + short Stage-2 refinement
      ↓
Stage 2 improves texture but may not reconstruct exact identity geometry
```

This may help explain why a motorcycle can remain photorealistic while gradually becoming a different motorcycle model.

### Important: this does not replace the temporal-integration diagnosis

Current evidence supports multiple possible failure mechanisms acting together:

```text
Prompt Relay / LoopingSampler timing mismatch
             +
aggressive overlap propagation
             +
subject temporarily leaving frame
             +
low-resolution generation of newly exposed geometry
             ↓
identity collapse / re-synthesis
```

The full-resolution hypothesis primarily concerns **spatial detail and identity during large viewpoint changes**. It does not by itself explain repeated or conflicting camera instructions across temporal tiles.

### What the source does NOT prove

Do not record these as facts until locally tested:

- full-resolution sampling always has better identity consistency;
- full-resolution sampling fixes long-video continuation;
- full-resolution sampling removes the need for identity references;
- full-resolution sampling is automatically better for every shot;
- full-resolution sampling is worth the runtime for simple motion.

It may be a shot-class optimization rather than a universal default.

---

## Emerging shot-class hypothesis

Instead of forcing one universal LTX workflow, Production may eventually choose a generation strategy based on shot requirements.

Provisional research model:

```text
simple shot / limited viewpoint change
    → native two-stage LTX 2.5

identity-critical hero shot
or major viewpoint change
    → test full-resolution LTX 2.5

long continuous motion / duration extension
    → test Lightricks LoopingSampler

precise timed direction
    → Director / compiled shot controls

known start + known destination frame
    → evaluate first/last-frame or multi-keyframe path
```

This is an analysis hypothesis, not a frozen Production architecture.

---

## Portrait / AI-influencer analysis lens for the next source

The next source is expected to focus on AI-influencer / short-form portrait video. Analyze it independently first, then compare it with the motorcycle findings.

### A. Portrait composition

Record:

- exact resolution and aspect ratio;
- whether generation happens natively in portrait or is cropped afterward;
- framing of face, torso, hands and legs;
- whether the subject stays close to camera or changes scale;
- camera movement type;
- amount of background motion.

### B. Human identity consistency

Human portrait content makes identity errors much more visible than motorcycle geometry.

Look for:

- facial identity retention;
- hair consistency;
- eye / mouth stability;
- skin texture;
- body proportions;
- hand/finger stability;
- wardrobe and accessory persistence;
- jewelry / glasses / tattoos / small identity markers;
- whether the workflow uses repeated identity anchors or only the first image.

### C. Realism / anti-AI-look

Record specifically:

- skin detail and pore retention;
- natural hair strands;
- cloth texture;
- natural motion blur;
- lighting consistency;
- exposure / white-balance stability;
- background coherence;
- whether realism degrades as duration increases;
- whether the workflow uses full-resolution sampling, upscaling, restoration or post-processing.

### D. Motion class

Separate:

```text
micro-motion
(head / eyes / expression / breathing)

body motion
(walk / turn / gesture / dance)

camera motion
(push / orbit / handheld / tracking)

scene change
(background / location / lighting transition)
```

A workflow that excels at subtle influencer motion may not be appropriate for aggressive camera or scene transitions.

### E. Temporal strategy

Determine whether the source uses:

- one native-duration generation;
- Lightricks temporal tiles;
- conventional chunk chaining;
- first/last-frame interpolation;
- overlapping frame continuation;
- latent continuation;
- explicit keyframes;
- prompt changes per tile / segment.

Also record whether transitions are produced during generation or assembled afterward.

### F. Identity / reference strategy

Look for:

- source-image I2V strength;
- multi-view references;
- IC-LoRA / Ingredients;
- reference video;
- keyframes;
- long-term negative-index latent context;
- face-specific restoration or identity tools;
- whether identity tools are part of LTX itself or external post-processing.

Do not assume an additional image is merely a style/motion reference; determine how the actual node consumes it.

### G. Sampling architecture

Record whether it uses:

```text
two-stage low-res → latent upscale → refine
```

or:

```text
full-resolution sampling from the beginning
```

This is now a first-class comparison variable because Source A suggests it can matter when newly exposed identity detail has to be synthesized.

### H. Performance / practical Production cost

Record:

- seconds per generation;
- duration generated;
- GPU / VRAM if reported;
- model precision / quantization;
- number of diffusion stages;
- retry rate if mentioned;
- whether the result shown is cherry-picked or reproducible;
- whether a faster draft / final-quality split exists.

### I. Applicability to Helix

For every technique from the portrait source, classify it as one of:

```text
DIRECTLY RELEVANT
worth testing locally

SHOT-SPECIFIC
useful only for human portrait / influencer content

LONG-VIDEO SPECIFIC
continuation technique, not short-shot default

POST-PROCESSING
not a generation architecture

UNVERIFIED
interesting claim without enough evidence
```

This prevents a strong portrait workflow from being copied blindly into unrelated shot classes.

---

## Current experiment order — HOLD until more sources are read

Do not design the final optimized workflow yet.

Existing clean diagnostics remain available:

```text
F0 candidate
native full-resolution I2V baseline
(no Director, no Lightricks)

B0.1 candidate
Lightricks-only continuation calibration
120 / 40 / 0.50
(no Director)
```

But the next source(s) should be analyzed first. After the portrait/influencer evidence is added, compare all findings and then decide which baseline(s) are worth rendering.

## Decision principle

Do not optimize for maximum number of control nodes.

Choose the smallest workflow that satisfies the shot's actual requirements:

```text
quality
identity
motion
camera control
duration
portrait framing
runtime
```

Only combine systems when a measured weakness requires the additional system.
