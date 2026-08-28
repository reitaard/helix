# Licon MSR research and local validation — LTX 2.5

Status: **installed and locally validated for one-subject reference-driven scene generation; stronger viewpoint retention and multi-reference separation remain unvalidated**.

This note records the mechanism of LiconStudio's LTX 2.5 Multiple Subject Reference (MSR) system, the first controlled Helix local test, and the revised comparison plan after Lightricks Ingredients also produced a successful local reference-driven scene.

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
~1.31 GB decimal / ~1.22 GiB on the worker
base model: Lightricks/LTX-2.5
license: Apache-2.0
SHA256: d45cedd720e5819ccbe200a4b0ae01f7ae0e0d2966d700a24ebd4c7739515d4f
```

Official repositories:

```text
model:  LiconStudio/LTX-2.5-Multiple-Subject-Reference
plugin: liconstudio/ComfyUI-LTX2.5-MSR
```

## Local installation checkpoint

Active runtime:

```text
C:\AI\ComfyUI-CLI
```

Installed plugin:

```text
C:\AI\ComfyUI-CLI\custom_nodes\ComfyUI-LTX2.5-MSR
```

Installed LoRA:

```text
C:\AI\Models\LTX\loras\LTX-2.5-Licon-MSR-V1.safetensors
```

The plugin imports successfully, ComfyUI exposes both nodes, and the loader sees the verified LoRA:

```text
ComfyUILTX25MSRICLoRALoader
ComfyUILTX25MSRMultiReferenceGuide
```

## Mechanism

The Licon description and node implementation use the following approach:

1. Each reference image is independently encoded into the LTX video latent space.
2. The MSR LoRA contains learned `reference_slot_embedding` tensors.
3. Each connected reference is assigned a stable slot ID.
4. A learned Fourier/MLP embedding for that slot is added to the encoded reference latent.
5. Reference latents are prepended using distinct **negative temporal positions**.
6. LTX retrieves reference details through its native self-attention path during generation.

Conceptually:

```text
Image 1 -> latent + learned slot 1 -> negative reference time
Image 2 -> latent + learned slot 2 -> negative reference time
Image 3 -> latent + learned slot 3 -> negative reference time
...
                         ↓
               target video generation
```

This is not face swap and not a post-generation identity repair step.

## Stable reference slots

Current input order:

```text
1. pic1
2. pic2
3. pic3
4. pic4
5. background
```

Missing optional references are skipped. Connected references receive consecutive slot IDs. Batch size is currently one.

Reference controls:

```text
reference_frames: 25 or 33
strength:         0.0-1.0
optional tiled VAE encoding
```

Subject references preserve the complete source image and may be white-padded during resize. Background references use cover/center-crop behavior.

The prompt should identify references explicitly using stable labels such as `Image 1`, `Image 2`, etc.

The current public control surface is intentionally small. MSR's main value comes from the learned independent slot representation rather than a large set of per-reference knobs.

## Native two-stage LTX 2.5 integration

The plugin fits the native Helix two-stage T2V topology.

```text
Native LTX model
    ↓
MSR IC-LoRA Loader
    ↓
model used by both sampling stages
```

Stage 1:

```text
empty VIDEO latent
+ positive / negative
+ video VAE
+ reference image(s)
+ MSR parameters
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
```

Stage 2:

```text
cropped stage-1 video latent
        ↓
spatial latent upscale
        ↓
MSR Guide #2 using the SAME references
        ↓
rejoin stage-1 audio
        ↓
stage 2 low-noise refinement
        ↓
separate AV
        ↓
crop stage-2 reference guides
        ↓
decode
```

MSR references must be re-encoded/reintroduced after spatial upscale because the reference latents depend on the current spatial latent grid.

## Standard fallback behavior — important control detail

The same `MultiReferenceGuide` node can run with `msr_parameters` disconnected.

That mode is **not MSR**. The source explicitly treats it as standard LTX guide conditioning:

```text
MSR enabled
-> learned slot embedding
-> negative temporal reference position

msr_parameters omitted
-> no slot embedding
-> standard reference starts at frame_offset 0
```

This distinction became important in the first local test because the frame-0 fallback was much more composition-anchoring than MSR.

## First local one-subject commercial test — 2026-08-26

Reference:

```text
clean chest-up portrait of one man
clear frontal face
brown tousled hair
trimmed beard
dark charcoal knit sweater
plain blue-grey studio background
source image: 736x1097 portrait
```

The source aspect ratio did not need manual conversion. The Licon guide handled subject resize/padding internally.

Creative brief:

```text
premium kitchen food commercial
same man
same charcoal sweater
speaks / gestures
looks down
sprinkles herbs over plated food
camera gently pushes closer
returns gaze to camera with a smile
```

Controlled generation settings:

```text
duration:         8 s
frames:           193
fps:              24
output:           1280x704
prompt enhance:   OFF
stage-1 seed:     558811532553686 fixed
stage-2 seed:     42 fixed
reference:        pic1 only
reference_frames: 33
strength:         1.0
```

Outputs:

```text
LTX_2.5_t2v_ref_control_00001_.mp4
LTX_2.5_t2v_msr_00001_.mp4
```

Both were native 193-frame / 24-fps / ~8.04-second / 1280x704 artifacts.

## First-test observations

### Standard fallback control

The fallback guide preserved the portrait identity extremely strongly, but it also preserved the original portrait composition/background for almost the whole clip.

Observed behavior:

- blue-grey studio background remained dominant;
- framing stayed close to the source portrait;
- the man gestured, changed expression and smiled;
- the requested kitchen, counter and food-commercial world mostly failed to materialize.

Interpretation:

```text
standard frame-0 reference guide
-> excellent source-image anchoring
-> poor freedom to reinterpret the portrait into the requested new scene at this strength/setup
```

Therefore this run should **not** be used to claim that MSR has higher pixel-level identity similarity than the standard guide. The two methods are solving the reference problem differently.

### MSR run

The MSR video immediately constructed a new kitchen-commercial environment while retaining the referenced man's appearance.

Observed behavior:

- credible modern kitchen appeared instead of the studio background;
- charcoal sweater remained stable;
- brown tousled hair, beard pattern, general face shape and age remained recognizably tied to the reference;
- the man spoke/gestured, looked down, interacted with the plated dish and performed the garnish action;
- the camera moved substantially closer by the end;
- final close-up remained recognizably the same person although fine facial proportions and expression became somewhat more polished/commercialized.

The biggest result is not perfect face matching. It is the separation of **reference identity** from **generated composition**:

```text
portrait supplies WHO
prompt supplies WHERE / WHAT / CAMERA
```

This is exactly the behavior needed for commercials and recurring-story characters.

## First-test verdict

```text
plugin / inference works                 PASS
LoRA / slot parameters work             PASS
one-person reference affects identity   PASS
new-scene freedom                       STRONG PASS
hair / beard / sweater continuity       PASS
commercial usefulness                   PASS
exact facial likeness                   GOOD, not perfect
strong profile / viewpoint retention    NOT TESTED
multi-subject slot separation           NOT TESTED
subject + object reference separation   NOT TESTED
```

Working conclusion:

> Licon MSR has shown genuine local Production value: it can use a portrait as an appearance source while allowing LTX to construct a substantially different prompted scene, rather than forcing the reference image to behave like frame zero.

This is enough to keep MSR in the leading group, but not enough to lock Helix to Licon as the final reference-conditioning backend.

## New comparison context — Ingredients now works locally

Lightricks Ingredients has now also produced a successful local new-scene generation from:

```text
person + steak + kitchen
```

using a composite sheet and the corrected Core IC-LoRA path.

This changes the MSR test strategy.

We no longer need another unrelated Licon demonstration. We can now compare the two systems on the **same underlying creative requirement**.

The likely abstraction difference is:

```text
Ingredients
-> visual world / campaign asset bundle
-> one composite sheet

Licon MSR
-> explicit independent entities
-> separate learned slots
```

See `INGREDIENTS_RESEARCH.md` and `REFERENCE_CONDITIONING_ALTERNATIVES.md`.

## Revised next Licon experiments

### R1 — viewpoint identity stress

Run one stronger one-person viewpoint test first:

```text
front-facing
-> turn 60-90 degrees into clear three-quarter/profile view
-> perform a short side-on action
-> turn back toward camera
```

Use:

- the same portrait;
- the same native LTX 2.5 two-stage baseline;
- fixed seeds/settings;
- `reference_frames = 33`;
- reference strength `1.0`;
- Prompt Enhance OFF;
- no Prompt Relay.

Goal:

```text
does the same identity survive a real viewpoint change?
```

Score:

- face geometry;
- hair;
- beard;
- age;
- sweater;
- identity at strongest profile;
- identity after returning toward camera.

If this is weak, LTX-Best-Face-ID becomes the most justified specialist challenger.

### R2 — direct Ingredients problem A/B

Use the exact assets already proven with Ingredients:

```text
pic1       = man
pic2       = steak / plate
background = kitchen
```

Ask Licon to create essentially the same kitchen/steak shot.

This is the most useful direct comparison because it removes the conceptual mismatch between the earlier Licon portrait-only demo and the Ingredients person + product + location test.

Score two dimensions separately.

#### Reference capability

```text
person likeness
steak fidelity
kitchen fidelity
entity/reference separation
reference leakage
```

#### Final video quality

```text
human anatomy
hands
motion stability
action adherence
camera quality
overall coherence
```

Also record:

```text
workflow preparation burden
runtime
VRAM / RAM
```

Important fairness rule:

> Do not claim that one reference mechanism is better merely because Licon currently runs through a higher-quality LTX 2.5 two-stage 1280x704 path while Ingredients was proven through a cheap LTX 2.3 768x448 distilled path.

Reference capability and final video quality must be scored separately.

### R3 — two-person slot separation

After R1/R2:

```text
Image 1 = Person A
Image 2 = Person B
```

Use visually distinct people and wardrobe with clearly assigned positions/actions.

Evaluate:

- identity mixing;
- wardrobe swapping;
- one reference dominating;
- position/action swapping;
- slot separation through motion;
- prompt/action degradation caused by multiple reference conditions;
- interaction quality.

This is the test where Licon's independent slot architecture should prove a real advantage if it has one.

## What MSR should not be assumed to solve

Even after the first success, do not claim MSR guarantees:

- exact pose;
- exact blocking/spatial location;
- temporal event timing;
- physical state transitions;
- collision geometry;
- exact face identity at every angle;
- cross-shot continuity when references are not supplied consistently;
- reliable interaction among many subjects under dense action.

Those remain separate experiment questions.

## Relationship to Prompt Relay

```text
MSR
-> WHO / WHAT stays visually anchored to references

Prompt Relay
-> WHEN semantic beats dominate
```

They remain conceptually complementary, but do not combine them until MSR's independent reference behavior is understood.

## Broader reference-backend decision

Licon is **not locked** as Helix's final reference solution.

The leading local reference systems now are:

```text
Licon MSR
-> independent slot-style references on LTX 2.5

Lightricks Ingredients
-> composite person + product + location reference bundle on LTX 2.3
```

Targeted challengers remain:

```text
LTX-Best-Face-ID
-> human identity specialist

Phantom-Wan
-> alternate-stack single/multi-subject challenger
```

See `REFERENCE_CONDITIONING_ALTERNATIVES.md` for the updated role comparison and test order.

## Current Helix semantic implication

Do not expose Licon-specific slot wiring upstream.

The useful semantic abstraction remains generic:

```text
reference_entities[]
  entity_id
  role
  reference_assets[]
  continuity_priority
  shot_scope
```

Production should choose the concrete reference backend later.

## Decision gate

Licon earns a stable Production role only if the next tests show that its scene freedom survives stronger viewpoint changes and multiple references without unacceptable identity mixing, action loss, motion degradation or runtime instability.

Current checkpoint:

```text
one-subject new-scene generation
-> locally demonstrated

exact viewpoint identity
-> pending / NEXT

person + product + background direct A/B
-> pending

multi-subject separation
-> pending

final Helix reference backend
-> deliberately open
```
