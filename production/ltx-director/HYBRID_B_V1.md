# Hybrid B — Director + Lightricks Integration

## Status

**Paused after v1.3 failure.**

Do not treat the current Prompt Relay + LoopingSampler wiring as a valid Production recipe. The latest run showed a catastrophic subject-identity failure: the original motorcycle left the frame and a completely different motorcycle model was generated later in the same shot.

The immediate goal is now to isolate Lightricks from Director before another hybrid attempt.

## What Hybrid B was trying to combine

- CGlide LTX Director 2.5 for timed Prompt Relay / shot direction
- Lightricks `LTXVLoopingSampler` for temporal extension
- native LTX 2.5 two-stage I2V for opening-image fidelity

This remains a plausible architecture, but only if the temporal control systems compose correctly.

## Confirmed upstream constraints

### CGlide reference-sheet controls

CGlide's old LTX 2.3 reference-sheet / `@ref` behavior is disabled in the LTX 2.5 Director path because it can corrupt 2.5 renders. Do not depend on that feature for identity.

### CGlide negative output

`LTXDirectorCS25` intentionally emits neutral / empty negative conditioning. If the workflow needs the native LTX negative prompt, wire it separately.

The local native-quality guard remains:

```text
pc game, console game, video game, cartoon, childish, ugly
```

plus only targeted failure terms when justified.

### Lightricks image conditioning

`LTXVLoopingSampler.optional_cond_images` are actual visual I2V/keyframe constraints. They are not a motion-only reference channel. Never use a visually different motorcycle as a supposed identity/motion reference and expect identity to remain unchanged.

## Local test history

### v1 / v1.1 — FAIL

Observed:

- Prompt Relay executed;
- Lightricks temporal continuation executed;
- a different green side-bike image was used as a later visual keyframe;
- duplicate subject behavior appeared in one configuration;
- later sections progressively morphed toward conflicting visual information;
- padded reference composition also encouraged the motorcycle to shrink/recede.

Avoid:

- ambiguous image-conditioning ownership;
- second keyframes from a different subject identity;
- padded/blur-band reference canvases that materially change composition.

### v1.2A — FAIL / useful isolation

Observed:

- duplicate-bike failure improved;
- front-to-side camera evolution became clearer;
- world/daylight continuity improved;
- realism dropped below the known native LTX 2.5 baseline;
- motorcycle geometry still simplified/drifted.

Causes found:

1. a generatively normalized first-frame asset had replaced the original photograph;
2. Director's neutral negative output had replaced the normal native negative-conditioning path.

Avoid:

- generative redraw/outpaint when benchmarking source-image fidelity;
- silently dropping native negative conditioning.

### v1.3 — FAIL

Run:

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

Positive findings were not sufficient to pass the run. The opening had strong source fidelity and photographic detail, but the main success criterion failed.

Observed failure sequence:

```text
opening: original motorcycle retained
        ↓
front→side camera motion becomes aggressive
        ↓
original motorcycle partly/fully exits the frame
        ↓
road/background continues without a strong subject anchor
        ↓
a completely different motorcycle model is synthesized later
```

**Overall verdict: FAIL.** A photorealistic replacement motorcycle does not count as continuity.

## Critical integration hypothesis from source inspection

This is a strong hypothesis that must be validated experimentally before being called a confirmed root cause.

CGlide Prompt Relay builds masks against the full Director timeline. When its cross-attention query does not represent the full video, it uses a scaled local-query mapping. The current mask calculation does not receive the Lightricks temporal tile's global start offset.

Lightricks, meanwhile, generates the long video as overlapping temporal chunks, for example:

```text
chunk 0:  0 → 14 latent frames
chunk 1: 10 → 24
chunk 2: 20 → 34
chunk 3: 30 → 44
chunk 4: 40 → 45
```

Therefore the current hybrid can make each Lightricks tile see a locally scaled version of the entire Director prompt arc instead of the correct global portion of that arc.

In plain English, a full-video timeline such as:

```text
front → camera arc → side
```

may be replayed inside multiple temporal extensions.

That can conflict with Lightricks' overlapping continuation state.

### Prompt Relay epsilon was also over-softened

v1.3 used:

```text
epsilon = 0.50
```

CGlide computes Prompt Relay sigma as:

```text
sigma = 1 / ln(1 / epsilon)
```

This makes `0.50` dramatically broader than `0.001`, so local prompt zones leak into each other much more strongly. Do not assume a larger epsilon is automatically a smoother/better transition.

### Lightricks overlap conditioning was also pushed aggressively

v1.3 used:

```text
temporal_overlap_cond_strength = 0.80
```

The Lightricks node default is `0.50`. The value is passed directly as the strength of the previous overlap latents used to condition a new temporal extension.

`0.80` may therefore propagate a bad framing state very strongly. If a tile ends with the motorcycle leaving frame, the next tile is strongly encouraged to continue that failure.

Important distinction: this is not a simple temporal cross-fade. The previous overlap latents become conditioning for the next extension.

## What to avoid now

Until a clean calibration is complete:

- do not run CGlide Prompt Relay inside Lightricks LoopingSampler as if both share the same global time coordinates;
- do not use `epsilon=0.50` as a default Prompt Relay smoothing value;
- do not assume `0.80` overlap conditioning is better than the Lightricks default;
- do not tune tile size, overlap amount, overlap strength, Prompt Relay and image references simultaneously;
- do not add identity LoRAs, long-memory latents or extra keyframes before the base continuation behavior is measured;
- do not use a second image of a different motorcycle;
- do not increase to 30+ seconds.

## Next experiment — Lightricks calibration before Hybrid B resumes

Remove CGlide Prompt Relay entirely and establish what Lightricks is good at by itself.

Keep:

```text
original first-frame photograph
native LTX 2.5 I2V: 0.70 Stage 1 / 1.00 Stage 2
704 × 1280
15 s / 24 fps
temporal tile 120
temporal overlap 40
overlap conditioning 0.50
AdaIN 0.10
one spatial tile
one continuous positive prompt
native negative-conditioning path
```

Do **not** ask for a large front-to-side orbit in this calibration. Keep the camera relationship comparatively stable so the test measures continuation rather than choreography.

Questions:

1. Does the exact motorcycle remain present for the full 15 seconds?
2. Does identity survive all temporal extensions?
3. Are window boundaries visually smooth at the default `0.50` overlap-conditioning strength?
4. Is realism close to the native LTX 2.5 benchmark?
5. Does world/weather state drift when Director is absent?

Only after those answers are known should Hybrid B resume.

## Future Hybrid B options

If Lightricks-only passes, there are two sane ways to restore timed direction:

1. compile Director intent into Lightricks' tile-aware `MultiPromptProvider` / per-tile conditioning;
2. modify Prompt Relay integration so every temporal tile receives its true global time offset.

Option 1 is simpler and should be tested before maintaining a custom Prompt Relay patch.

Multi-frame identity tests remain postponed until the temporal architecture is stable. When resumed, every identity keyframe must depict the same subject.