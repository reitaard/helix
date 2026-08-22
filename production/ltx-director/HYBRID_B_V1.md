# Hybrid B — Director + Lightricks Integration

## Status

**Previous direct integration paused after v1.3 failure. Safe re-entry is now defined.**

Do not treat the old Prompt Relay + LoopingSampler wiring as a valid Production recipe. That run showed catastrophic subject-identity failure: the original motorcycle left frame and a completely different motorcycle model appeared later.

A new bare full-resolution native LTX baseline has since passed at 4 and 8 seconds, proving that the replacement-bike failure is not an unavoidable base-model behavior.

## Component roles

Hybrid B should only continue if each component has one clear responsibility:

```text
native LTX 2.5
= visual generation quality

Lightricks LoopingSampler
= temporal extension when duration requires it

CGlide / Director
= shot/timeline intent
```

CGlide is **not** the current identity-reference mechanism. Its old LTX 2.3 `@ref` / reference-sheet behavior is disabled for LTX 2.5.

## Confirmed upstream constraints

### CGlide reference-sheet controls

Do not depend on the disabled 2.3 reference behavior for subject identity on 2.5.

### CGlide negative output

`LTXDirectorCS25` can emit neutral/empty negative conditioning. If the workflow needs a native LTX negative prompt, wire it separately.

### Lightricks image conditioning

`LTXVLoopingSampler.optional_cond_images` are actual visual/keyframe constraints, not a generic motion-only reference channel. A visually different motorcycle must never be used as a supposed same-subject identity reference.

## Local failure history

### v1 / v1.1 — FAIL

Observed:

- Prompt Relay executed;
- Lightricks temporal continuation executed;
- a different side-bike image was used as a later keyframe;
- duplicate subject behavior appeared;
- later frames morphed toward conflicting visual information;
- padded reference composition encouraged the motorcycle to shrink/recede.

Avoid:

- ambiguous image-conditioning ownership;
- second keyframes from a different subject identity;
- padded/blur-band reference canvases that materially alter composition.

### v1.2A — FAIL / useful isolation

Observed:

- duplicate-bike failure improved;
- camera evolution became clearer;
- world/daylight continuity improved;
- realism dropped below native LTX quality;
- motorcycle geometry still simplified/drifted.

Separate causes found:

1. a generatively normalized first frame replaced the original photo;
2. Director's neutral negative output replaced the normal native negative-conditioning path.

Avoid generative redraws when benchmarking source-image fidelity and do not silently drop the native negative path.

### v1.3 — FAIL

```text
704 × 1280 portrait
15.04 s / 361 frames / 24 fps
120 temporal tile
40 overlap
0.80 overlap conditioning
AdaIN 0.10
Prompt Relay epsilon 0.50
549.18 s runtime
```

Failure sequence:

```text
original motorcycle retained
        ↓
front→side move becomes aggressive
        ↓
motorcycle leaves frame
        ↓
recent temporal context becomes mostly road/background
        ↓
a different motorcycle is synthesized later
```

**Overall verdict: FAIL.** Photorealistic replacement is still identity failure.

## Why the old direct hybrid is unsafe

### 1. Prompt Relay / LoopingSampler global-time mismatch hypothesis

CGlide Prompt Relay builds a full-timeline temporal mask. Lightricks generates shorter overlapping temporal windows.

When Prompt Relay sees a shorter attention query, its scaled mapping currently does not receive the Lightricks tile's true global start offset.

Therefore a full-video intent such as:

```text
0–5   front
5–10  camera arc
10–15 side
```

can be locally rescaled/replayed inside multiple temporal windows instead of each tile receiving only its correct global portion.

This is a strong source-based hypothesis, not yet a locally patched/validated fact.

### 2. Prompt Relay was over-softened

v1.3 used:

```text
epsilon = 0.50
```

That greatly broadens prompt-zone leakage compared with earlier strict settings. Do not use `0.50` as a default smoothing value.

### 3. Lightricks overlap conditioning was pushed aggressively

v1.3 used:

```text
temporal_overlap_cond_strength = 0.80
```

Lightricks defaults to `0.50`. The value directly controls how strongly the previous overlap latents guide a new extension. Strong conditioning can propagate a bad end-state just as effectively as a good one.

### 4. Too many variables changed simultaneously

Do not change tile size, overlap amount, overlap strength, prompt segmentation, reference images and generation architecture in one experiment and then infer a single cause.

## New native baseline that Hybrid B must protect

Bare native full-resolution LTX 2.5 now passes the same general motorcycle quality class:

```text
4 s  → 97 frames
8 s  → 193 frames
24 fps
736 × 1280 decoded
```

Observed in both:

- same motorcycle retained;
- same rider retained;
- no duplicate motorcycle;
- no disappearance/replacement;
- strong gross fairing/headlight/windscreen consistency;
- realistic materials and motion;
- remaining drift concentrated in logos/decals and tiny details.

See `FULL_RES_NATIVE_I2V.md`.

This becomes the quality floor. A hybrid that adds control but materially worsens identity or realism is rejected.

## C4 — safe hybrid re-entry

### Goal

Test whether Director intent can coexist with Lightricks temporal extension **without** reintroducing the old time-coordinate conflict.

C4 is not a multi-reference experiment and not an identity-LoRA experiment.

### Preferred integration

Do not directly connect a full-duration Prompt Relay schedule into LoopingSampler again.

Instead:

```text
CGlide / Director timeline intent
        ↓
compile intent into one prompt per temporal tile
        ↓
LTXVMultiPromptProvider / tile-aware positive conditioning
        ↓
Lightricks LoopingSampler
        ↓
LTX generation
```

This keeps CGlide/Director as the authoring source and uses the Lightricks conditioning interface designed for temporal tiles.

### First C4 shot

Keep the successful green motorcycle source and the motion deliberately modest.

Candidate timeline:

```text
phase 1
stable front-three-quarter tracking, constant distance

phase 2
same camera relationship, slightly stronger forward acceleration

phase 3
hold composition, maintain same bike/rider, no orbit or side reveal
```

The first C4 test should prove control/timing composition, not cinematographic ambition.

### Lightricks controls

Start from conservative/default-ish continuation behavior rather than the old aggressive values:

```text
temporal overlap geometry   moderate / approximately one third
previous-tile strength      0.50 first
AdaIN                       small, around the already-tested low range
spatial tiles               1 × 1
```

Do not jump directly to `0.80` overlap conditioning.

### Identity/reference controls

For C4 first pass:

- one source motorcycle image only;
- no second visual keyframe;
- no IC-LoRA;
- no negative-index long-memory latent;
- no CGlide `@ref` assumption;
- no generatively redrawn benchmark source.

Only after temporal integration passes should identity memory be added to solve a measured remaining weakness.

## C4 success criteria

The hybrid must meet or beat the native quality floor:

1. exact same motorcycle for the entire shot;
2. same rider/helmet/gear;
3. bike remains continuously in frame;
4. no duplicate/replacement object;
5. no visible temporal seam or reset;
6. Director/tile prompt change occurs at the intended time;
7. realism is not materially worse than the native full-resolution baseline;
8. micro-detail drift remains local rather than becoming geometry drift.

## What to avoid

- full-duration Prompt Relay inside LoopingSampler before global offsets are solved;
- `epsilon=0.50` as a default;
- `0.80` overlap strength as a default;
- different-subject visual keyframes;
- multi-reference + long-memory + prompt-relay + tile changes all in one run;
- forcing Lightricks into a 4–8 second shot that already works natively merely to increase node count;
- treating CGlide as an identity reference rather than a Director/control surface.

## Longer-term options

If C4 passes:

1. test a slightly more meaningful camera change using tile-aware prompts;
2. test duration extension beyond the native comfortable range;
3. separately test `optional_negative_index_latents` for long-term subject memory if identity begins to drift;
4. separately evaluate same-subject multi-view/Ingredients IC-LoRA only if exact geometry needs more support;
5. only consider a custom Prompt Relay + LoopingSampler patch if tile-aware prompt compilation proves insufficient.
