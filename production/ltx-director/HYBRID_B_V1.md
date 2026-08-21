# Hybrid B — Prompt Relay + Lightricks Temporal Continuation

## Goal

Validate whether a clean hybrid can combine:

- CGlide LTX Director 2.5 for Prompt Relay / timed local prompts
- Lightricks `LTXVLoopingSampler` for overlapping temporal continuation
- native LTX 2.5 I2V conditioning for source-image fidelity

Do not increase duration until the 15-second hybrid is stable and realistic.

## Confirmed upstream constraints

### CGlide references

CGlide's old reference-sheet / `@ref` features are disabled for LTX 2.5 upstream because those trained LTX 2.3 behaviors can corrupt 2.5 renders.

### CGlide negative output

`LTXDirectorCS25` intentionally emits a neutral / empty negative conditioning. Its source comments explicitly say to wire a separate negative-prompt node downstream when custom negative text is required.

This matters because the native LTX 2.5 I2V workflow uses the negative prompt:

```text
pc game, console game, video game, cartoon, childish, ugly
```

A hybrid that wires Director's neutral negative directly into generation silently loses that native quality guard.

### Lightricks image conditioning

`LTXVLoopingSampler.optional_cond_images` are real I2V/keyframe constraints. They are not a generic style- or motion-only reference channel. A second image of a different motorcycle therefore creates contradictory subject identity pressure.

The LoopingSampler also accepts non-empty latents and uses temporal overlap / extension for subsequent windows.

## Local test history

### Hybrid B v1 / v1.1 — failed

Observed:

- Prompt Relay executed.
- Lightricks temporal overlap executed.
- second visual keyframe executed in both stages.
- early duplicate motorcycle/rider appeared in one configuration.
- later sections progressively morphed when the different green side-bike keyframe took control.
- the padded side-reference composition also encouraged the motorcycle to recede / shrink.

Conclusion: image-state ownership was ambiguous and the second visual reference contradicted identity.

### Hybrid B v1.2A — cleaner but below native realism

Observed on the 361-frame / 15.04-second portrait run:

- one motorcycle / one rider was materially better than the earlier hybrid;
- front-to-side camera evolution worked;
- road / daylight state was comparatively stable;
- motorcycle identity still simplified and drifted as the angle changed;
- the motorcycle receded after the side transition;
- overall image character was more synthetic / less photographic than the native LTX 2.5 benchmark.

Two important causes were identified:

1. The first-frame asset used in the workflow had been generatively normalized rather than being a pixel-preserving crop of the original photograph.
2. The hybrid used CGlide Director's intentionally neutral negative output instead of restoring the native LTX negative-prompt path.

## Hybrid B v1.3 — active realism restoration test

### Ownership boundary

```text
ORIGINAL first-frame photograph
        ↓
native LTX I2V conditioning
Stage 1 strength 0.70
        ↓
Lightricks LoopingSampler Stage 1
        ↓
latent x2 upscale
        ↓
native LTX I2V conditioning
Stage 2 strength 1.00
        ↓
Lightricks LoopingSampler Stage 2
        ↓
decode

EMPTY long-video latent
        ↓
CGlide Director
Prompt Relay / model patching only
        ↓
conditioning + patched model
        ↓
LoopingSampler stages
```

Rules:

- Director receives the empty latent only so it can build the temporal Prompt Relay masks.
- Native LTX I2V owns source-image injection.
- `LoopingSampler.optional_cond_images` is disconnected for this test.
- no second motorcycle reference is used.
- native negative conditioning is restored separately from Director.

### Test specification

```text
orientation          9:16 portrait
resolution           704 × 1280
duration             15 s
fps                  24
pixel frames          361

temporal tile        120
temporal overlap     40
overlap strength     0.80
AdaIN                 0.10
spatial tiles         1 × 1

Prompt Relay epsilon 0.50
```

AdaIN is reduced from 0.15 to 0.10 because Lightricks documents `0.0–0.1` as the high-quality range while still allowing long-video statistic stabilization.

### Prompt strategy

For I2V, the source image supplies appearance. Prompt Relay therefore focuses on motion and camera behavior instead of repeatedly redescribing / negating the subject.

```text
0–5 s     close frontal pursuit tracking; gradual acceleration
5–10 s    continuous front → 3/4 → side camera arc
10–15 s   close side tracking; stronger acceleration; final whoosh blur
```

The global prompt carries photographic material / lighting / road realism and stable exposure.

The negative prompt restores the native LTX baseline and adds only targeted synthetic / morphing failures.

## Runtime sanity checks for v1.3

Because `LoopingSampler.optional_cond_images` is disconnected, this workflow should not show the old later-keyframe signature:

```text
Keyframe per tile indices: [(2, 56)]
```

If that line appears, the wrong / stale hybrid workflow is running.

## Success criteria

```text
single motorcycle / rider                stable
opening frame fidelity                   close to original photograph
photographic material / texture          improved vs v1.2A
front → side camera move                 intentional
bike remains large after side transition improved
world / daylight state                   stable
hard temporal seams                      absent or minor
final whoosh                             visible without subject collapse
```

## Multi-frame next step

Do not reintroduce multi-frame conditioning until v1.3 passes.

The next genuine multi-frame test must use a second view of the **same motorcycle identity**. Lightricks keyframes are actual visual constraints, not motion-only references.
