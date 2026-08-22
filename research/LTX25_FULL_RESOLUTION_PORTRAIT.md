# LTX 2.5 Full-Resolution Research Notebook

**Status:** motorcycle evidence collection / locally validated baseline  
**Purpose:** separate native generation quality from temporal-extension and Director-control failures before designing the next Production hybrid.

> The earlier planned portrait/influencer source was not available and is deferred. Current analysis remains focused on the motorcycle experiments.

## Research question

The motorcycle experiments mixed several variables that must be separated:

1. native LTX 2.5 image fidelity and realism;
2. viewpoint changes that reveal geometry absent from the opening frame;
3. two-stage low-resolution → latent-upscale generation versus direct full-resolution sampling;
4. long-video temporal continuation;
5. exact subject identity persistence;
6. timed shot direction.

---

## Source A — Reddit full-resolution LTX 2.5 workflow discussion

The community post argues that the normal two-stage LTX 2.5 I2V path can lose detail when motion/viewpoint changes require content that was not visible in the opening image.

Normal path:

```text
source image
    ↓
Stage 1 — lower-resolution generation
    ↓
latent ×2 upscaler
    ↓
Stage 2 — short final-resolution refinement
```

Alternative path:

```text
source image
    ↓
full-resolution latent from the beginning
    ↓
single full-resolution generation path
```

The source reports higher runtime but better detail retention in demanding I2V cases and says the approach works with the INT8 ConvRot model family used locally.

The original external claim remains community evidence. Helix has now locally validated that the full-resolution path itself works well on the motorcycle benchmark, but has **not** yet run a strict same-image/same-prompt two-stage A/B proving that full-resolution is universally superior.

## Why this mattered to the earlier motorcycle failure

The earlier frontal-bike experiment demanded:

```text
front
  ↓
front 3/4
  ↓
side
```

That forces synthesis of unseen side fairing, tank, mechanical, rear-bodywork, wheel/brake and rider details.

A plausible two-stage weakness remains:

```text
unseen geometry required
      ↓
created first at lower Stage-1 resolution
      ↓
coarse/generic structure becomes established
      ↓
latent upscale + short refinement
      ↓
texture improves without necessarily restoring exact identity geometry
```

This remains a hypothesis about the two-stage path, not a proven explanation of the earlier replacement-bike failure.

The earlier catastrophic hybrid also had independent temporal/control problems:

```text
Prompt Relay / LoopingSampler timing mismatch
             +
over-soft Prompt Relay zones
             +
aggressive overlap propagation
             +
subject leaving frame
             ↓
identity collapse / re-synthesis
```

---

## Local F0 validation — bare full-resolution motorcycle I2V

F0 deliberately removed all external control/continuation systems.

Not used:

- CGlide Director;
- Prompt Relay;
- Lightricks LoopingSampler;
- temporal tiles/overlap;
- second reference/keyframe;
- latent ×2 upscaler in the executed path;
- Stage-2 diffusion in the executed path.

Input: photorealistic green sport motorcycle + rider, portrait composition.

Prompt class: restrained forward motion, nearly fixed front-three-quarter tracking camera, realistic wheel/suspension motion, stable daylight and crisp materials. No large orbit, no scene change and no deliberate heavy blur.

Shared settings:

```text
requested canvas      704 × 1280
actual decoded size   736 × 1280 after LTX dimension snapping
fps                   24
Prompt Enhance        OFF
native I2V strength   0.70
fixed seed            held for duration comparison
```

### 4-second result

```text
97 frames
24 fps
736 × 1280
```

Observed:

- same motorcycle retained;
- rider/helmet/gear coherent;
- no duplicate or replacement motorcycle;
- no subject disappearance;
- gross fairing/headlight/windscreen geometry stable;
- photographic materials and road motion strong;
- composition drifted more than requested near the end;
- logos/decals and tiny surface details morphed.

Verdict: **PASS as a native full-resolution quality baseline.**

### 8-second duration control

Only duration was increased while retaining the same source, seed, prompt family and full-resolution architecture.

```text
193 frames
24 fps
736 × 1280
```

Observed:

- same green motorcycle and rider survived all 8 seconds;
- no catastrophic identity substitution;
- gross geometry remained stable;
- rider consistency remained strong;
- framing was more stable than the 4-second trajectory;
- micro-detail/logos/decals still drifted;
- the fine-detail errors did not grow into whole-object identity collapse.

Verdict: **PASS for an 8-second restrained native full-resolution shot.**

### Duration changes the whole trajectory

Important experimental result: the first four seconds of the 8-second generation were not simply the same four-second render followed by an extension. Changing duration changes the denoising/generative trajectory from the beginning.

Therefore:

```text
duration != append-only parameter
```

When comparing durations, treat each duration as a distinct generation condition even when the seed and prompt are fixed.

---

## What is now supported locally

- LTX 2.5 itself can preserve a detailed motorcycle/rider strongly for 4–8 seconds under restrained motion.
- The catastrophic replacement-bike failure is not an unavoidable base-model behavior.
- A short shot that fits one native generation does not need Lightricks temporal extension by default.
- Gross identity can remain strong while logos/decals and tiny mechanical details drift.
- Local masked repair/inpainting is a sensible later Production strategy for small logo/decal defects; do not over-condition the whole generation solely to preserve tiny text.
- Full-resolution native sampling is now a credible quality path for identity/detail-critical short shots.

## What remains unproven

- direct full-resolution superiority over two-stage generation on the exact same source/prompt;
- stability under large front→side viewpoint changes;
- stability at 15–30+ seconds without continuation machinery;
- exact logo/text persistence from prompting alone;
- generalization to every subject class.

---

## Updated shot-class hypothesis

```text
short/medium shot fits native duration
    → native LTX first

identity/detail-critical short shot
    → full-resolution native LTX is a validated candidate

long continuous motion beyond comfortable native duration
    → Lightricks LoopingSampler

precise timed direction
    → CGlide/Director intent compiled into backend-compatible timing

known start + known destination
    → separately evaluate first/last-frame or keyframe path
```

This is still Production research policy, not a frozen Helix contract.

## Next hybrid principle

Do not return to the old "everything connected at once" graph.

The next controlled hybrid should preserve the native quality baseline and assign each system one job:

```text
CGlide / Director intent
    = shot/timeline authoring

Lightricks
    = temporal extension only when needed

native LTX
    = image/video generation quality
```

Critical rules:

- CGlide is **not** the current motorcycle identity-reference layer; old LTX 2.3 reference-sheet behavior is disabled for 2.5.
- Do not directly place a full-duration Prompt Relay schedule inside each Lightricks temporal tile until global tile offsets are handled.
- First hybrid re-entry should translate Director timing into Lightricks tile-aware positive conditioning (`LTXVMultiPromptProvider` / equivalent).
- Keep the motorcycle visible and the camera motion modest in the first re-entry.
- Do not introduce a second motorcycle image, IC-LoRA, negative-index memory and aggressive prompt choreography in the same run.
- Change one control variable at a time.

## Decision principle

Choose the smallest workflow that satisfies the actual shot requirement. Add another system only when a measured weakness requires it.
