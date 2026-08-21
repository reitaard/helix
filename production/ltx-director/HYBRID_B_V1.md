# Hybrid B v1 — Prompt Relay + Temporal Overlap + Multi-Frame

## Goal

Validate the full hybrid direction without jumping to 30+ seconds.

Hybrid B v1 combines:

- CGlide LTX Director 2.5 for Prompt Relay / timed local prompts
- Lightricks LTXVLoopingSampler for overlapping temporal continuation
- native LTX 2.5 I2V conditioning for the opening frame
- a second visual keyframe for the desired side-tracking motion/composition

## Important correction

CGlide's dedicated LTX 2.5 reference-sheet / `@ref` features are currently disabled upstream. The CGlide README says they are hidden because the 2.5 model was not trained for the old 2.3 reference behaviour and enabling it corrupts renders.

Therefore Hybrid B v1 does **not** use CGlide `@ref` as an identity system.

Instead:

- the front image is the primary opening identity anchor
- the side image is a weaker Lightricks keyframe / motion-composition target
- CGlide Director supplies temporal prompt zones
- Lightricks supplies temporal overlap continuity

This also becomes our first deliberate multi-frame experiment.

## Test specification

```text
orientation          9:16 portrait
resolution           704 × 1280
duration             15 s
fps                  24
pixel frames          361

temporal tile        120
temporal overlap     40
overlap strength     0.80
AdaIN                 0.15
spatial tiles         1 × 1
```

`361` frames is intentional:

```text
first window = 121 frames
advance      = 120 - 40 = 80 frames
121 + 80 + 80 + 80 = 361
```

This reduces the number of temporal reinterpretations compared with the earlier `80 / 24` test while keeping substantial overlap.

## Visual inputs

### Opening frame

Portrait front-tracking motorcycle image.

Role:
- primary motorcycle/rider identity
- opening camera composition
- frame-zero I2V anchor

### Side motion image

Portrait-normalized version of the side-tracking motorcycle image.

Role:
- desired side framing
- rider posture
- motion language
- target composition during the camera transition

The two source pictures are not the same motorcycle, so the side image is intentionally a weaker guide rather than identity truth.

Current planned keyframe:

```text
frame 216 ≈ 9.0 s
strength 0.45
```

## Prompt Relay plan

### 0–5 s — Front tracking

Motorcycle already moving, gains speed, stable centered front tracking, realistic road motion and daylight.

### 5–10 s — Camera transition

Continuous camera arc from front through front three-quarter toward a close side-tracking position. No cut. Full rider becomes visible.

### 10–15 s — Side speed / whoosh

Hold side tracking. Accelerate harder. Final two seconds build strong background and road-edge motion blur while rider and motorcycle remain readable and comparatively sharp.

## Active topology

```text
front image
   ↓
native LTX I2V anchor
   ↓
CGlide Director
Prompt Relay only
   ↓
LTXVConditioning
   ↓
STGGuiderAdvanced (neutral CFG/STG for distilled model)
   ↓
LTXVLoopingSampler — Stage 1
   ↑
side image keyframe @ ~9 s
   ↓
latent x2 upscale
   ↓
re-apply opening I2V anchor
   ↓
STGGuiderAdvanced
   ↓
LTXVLoopingSampler — Stage 2
   ↑
side image keyframe @ ~9 s
   ↓
decode / video
```

## What this test must answer

1. Does Prompt Relay still obey the 3 timed phases while Lightricks owns temporal sampling?
2. Does `120 / 40` feel more like one stable world than the previous `80 / 24` test?
3. Can the camera evolve from frontal tracking toward a side view without feeling like a weather/scene reset?
4. Does the weaker side keyframe improve pose/composition without replacing the opening motorcycle identity?
5. Does the final whoosh build while keeping the bike and rider readable?
6. Does portrait orientation remain practical on the current local hardware?

## Success criteria

```text
same rider / opening-bike identity      good
scene / weather state                   stable
front → side camera evolution           intentional
hard temporal seams                     absent or minor
side keyframe identity takeover         limited
final side-view whoosh                  visible
later-section realism                   not worse than B0
```

## Next branch after this test

Do not increase duration yet.

If Hybrid B v1 works, tune:

- side keyframe timing / strength
- temporal overlap strength
- prompt-zone wording
- optional long-term latent context

Only after the 15-second hybrid is stable should we test 30+ seconds.
