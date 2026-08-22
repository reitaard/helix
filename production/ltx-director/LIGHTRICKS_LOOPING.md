# Lightricks ComfyUI-LTXVideo / Looping Sampler

**Status:** installed and locally proven as a continuation engine; not the default for short native shots.  
**Upstream:** `https://github.com/Lightricks/ComfyUI-LTXVideo`

## What the LoopingSampler is actually for

The upstream design is a long-video / memory-management sampler. It divides a video latent into overlapping temporal windows, generates the first window, then extends later windows from preceding temporal context.

Strong fit:

- videos longer than a convenient single native generation;
- continuous motion extended from recent visual context;
- memory-efficient long-form generation;
- moderate prompt evolution through tile-aware conditioning;
- later experiments with long-term context latents.

It is **not** itself a shot Director. A global camera timeline must be mapped to its temporal tiles correctly.

## New native-quality evidence changes the boundary

A bare full-resolution native LTX motorcycle test now passes at both 4 and 8 seconds:

```text
4 s  → 97 frames
8 s  → 193 frames
24 fps
736 × 1280 decoded
```

The same motorcycle/rider survived the 8-second native generation without duplicate or replacement subjects. Remaining errors were mainly decals/logos and tiny detail drift.

Therefore:

```text
4–8 s shot already fits native LTX reliably
→ do not add LoopingSampler by default
```

Use Lightricks when continuation is the actual problem, not simply to make the graph more sophisticated.

See `FULL_RES_NATIVE_I2V.md`.

## Core behavior confirmed from upstream code

Later temporal windows use `LTXVExtendSampler`.

The extension path:

1. selects final overlap latents from the preceding generated result;
2. creates the next temporal latent;
3. inserts the previous overlap as a latent guide at the beginning of the new window;
4. uses `temporal_overlap_cond_strength` as that guide strength;
5. generates the continuation while preserving recent context.

This is **not** a simple cross-fade between independent clips.

The node default for:

```text
temporal_overlap_cond_strength
```

is `0.50`.

Higher values can improve continuity but can also preserve mistakes in the preceding window. If a subject is leaving frame, a high strength can propagate that failure.

## Important controls

```text
temporal_tile_size
temporal_overlap
temporal_overlap_cond_strength
cond_image_strength
adain_factor
optional_positive_conditionings
optional_negative_index_latents
optional_normalizing_latents
```

`optional_positive_conditionings` is the intended hook for different positive conditioning per temporal tile, normally supplied by `LTXVMultiPromptProvider`.

`optional_negative_index_latents` can provide long-term context to each extension. Do not add it until base continuation/integration is stable.

## Local baseline history

### B0 — PASS as a long-video mechanism

```text
LTXVLoopingSampler on both generation stages
361 frames
24 fps
1280 × 704
~15.04 s
566.36 s runtime
```

Settings:

```text
temporal_tile_size              80
temporal_overlap                24
temporal_overlap_cond_strength  0.65
AdaIN                           0.15
spatial tiles                   1 × 1
```

Observed:

- genuine temporal continuation worked;
- motorcycle/rider consistency was good;
- boundary motion was smoother than the first CGlide single-image handoff;
- later detail remained competitive;
- world/background/lighting drifted subtly across windows.

This proved LoopingSampler works locally. It did **not** prove that stronger/larger settings are always better.

## What was over-tuned later

A failed hybrid changed several variables simultaneously:

```text
80 / 24 / 0.65
→
120 / 40 / 0.80
```

while also adding CGlide Prompt Relay and changing prompt structure.

Important correction:

- `120 / 40` is a reasonable one-third overlap geometry;
- `0.80` was a Helix experiment, not an upstream optimum;
- stronger continuation conditioning is not automatically higher quality.

## Intended Helix usage

### Good fit

Use LoopingSampler when:

- one scene must exceed a comfortable native LTX duration;
- camera/motion state evolves continuously;
- recent context is useful for extension;
- prompts are stable or explicitly aligned to temporal tiles.

Examples:

```text
vehicle continues down one road
character keeps walking through the same space
slow dolly/tracking movement
continuous environmental action
long establishing motion
```

### Higher-risk fit

Treat LoopingSampler cautiously when one long generation demands large internal choreography:

```text
front tracking
→ rapid orbit
→ exact side lock
→ another camera mode
```

For precise choreography, prefer:

- one native shot when duration permits;
- multiple deliberate shots at a higher level;
- tile-aware positive conditioning rather than one full-video attention schedule replayed inside every tile.

## Relationship to CGlide / Director

Current interpretation:

```text
Native LTX
  = preferred when the shot already fits comfortably in one generation

CGlide / Director
  = authoring/control surface; not a current 2.5 identity-reference layer

Lightricks LoopingSampler
  = temporal extension engine

Hybrid
  = valid when Director intent is translated into tile-aware Lightricks timing,
    or Prompt Relay is modified to understand each tile's true global offset
```

CGlide's old LTX 2.3 `@ref` / reference-sheet behavior is disabled for LTX 2.5. Do not attach CGlide merely as an identity reference.

## Next hybrid re-entry

Preferred first C4 topology:

```text
CGlide / Director timeline intent
        ↓
compile intent into per-tile prompt conditioning
        ↓
LTXVMultiPromptProvider
        ↓
LoopingSampler
```

For the first pass:

- same proven green motorcycle source;
- modest camera/motion changes;
- one source image;
- `0.50` previous-tile strength first;
- no second keyframe;
- no long-memory latent;
- no direct full-duration Prompt Relay over the tiles.

A standalone `120 / 40 / 0.50` Lightricks calibration remains useful if the C4 result exposes a continuation-specific problem that needs isolation.

## Installation / current worker note

The repo's current infrastructure note documents the standalone ComfyUI worker and pinned custom-node commits. Prefer that pinned worker state over speculative upgrades while these comparisons are active.

Verify the node family after startup:

```text
LTXV Looping Sampler
STG Guider Advanced
LTXV Multi Prompt Provider
```

Exact classes:

```text
LTXVLoopingSampler
STGGuiderAdvanced
LTXVMultiPromptProvider
```
