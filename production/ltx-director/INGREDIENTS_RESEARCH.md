# Lightricks Ingredients IC-LoRA — local research and validation

Status: **locally demonstrated for reference-driven scene construction on the current RTX 4060 worker; not yet production-quality.**

This note records the Helix evaluation of Lightricks' LTX 2.3 Ingredients IC-LoRA and the important distinction between the failed initial workflows and the later working Core IC-LoRA path.

## What Ingredients is

Ingredients is a reference-conditioned LTX video system built around a single composite **reference sheet**. The sheet can contain a character, wardrobe, product/prop and location references. The generated video is expected to use those visual ingredients to construct a new scene rather than treating the sheet as frame zero.

Conceptually:

```text
reference sheet
├── person / character
├── wardrobe
├── product / prop
└── location / environment
        ↓
Ingredients IC-LoRA
        ↓
new generated scene
```

The published Ingredients weight is trained for LTX 2.3:

```text
ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors
```

The official model guidance centers on the native short-video bucket:

```text
768 x 448
121 frames
24 fps
~5.04 s
```

The higher-quality model-card recipe recommends approximately:

```text
Ingredients strength: 1.4
steps:                30
CFG:                  4
STG mode:             stg_v
STG block:            29
STG scale:            1.0
```

Our currently proven local workflow is deliberately cheaper than that quality recipe and therefore should be treated as a capability validation, not the final quality ceiling.

## Local assets

Reference inputs used in the controlled test:

```text
man.jpg
-> adult light-skinned man
-> tousled light-brown hair
-> short beard
-> charcoal knit sweater

kitchen.jpg
-> premium modern dark kitchen
-> wood island
-> dark cabinetry
-> warm practical lighting

plate.jpg
-> grilled steak
-> rosemary
-> roasted garlic
-> dark ceramic plate
```

Final useful sheet:

```text
ingredients_sheet_23_v2.png
768 x 448
```

Layout:

```text
┌──────────────────────────────┬───────────────────┐
│                              │                   │
│           KITCHEN            │                   │
│                              │       MAN         │
├──────────────────────────────┤    full head      │
│                              │   + shoulders     │
│            STEAK             │                   │
│                              │                   │
└──────────────────────────────┴───────────────────┘
```

The man reference was preserved with contain/letterbox behavior so the full hair/head remained available instead of being cropped.

## Initial failures — important history

### LTX 2.5 official compatibility workflow

The first official LTX 2.5 Ingredients workflow produced severe reference-sheet leakage.

Observed behavior:

```text
reference sheet
-> animated almost directly as the video
-> panels remained visible
-> requested coherent kitchen scene did not materialize
```

A second 2.5 run with bypass handling corrected still showed the same fundamental problem: the sheet remained visible early and only partially collapsed into a new scene later.

This established:

```text
LTX 2.5 compatibility path
-> severe sheet leakage on the current worker
-> not enough evidence to declare Ingredients itself broken
```

### LTX 2.3 official distilled workflow

We then moved to the native LTX 2.3 Ingredients workflow and matched the intended short-video bucket:

```text
768 x 448
121 frames
24 fps
```

The official distilled topology used:

```text
LTX 2.3 DEV FP8
+ official rank-384 distilled LoRA @ 0.5
+ Ingredients custom loader @ 1.0
+ LTXAddVideoICLoRAGuide
+ 8-step distilled sigmas
+ CFG 1
```

That run still reproduced the reference sheet as the video for nearly the entire 5 seconds.

The key conclusion at that point was:

```text
base-model family alone was not the root cause
```

The same failure occurring under both 2.5 compatibility and 2.3 native-distilled paths strongly suggested a conditioning-path problem.

## Breakthrough — Core IC-LoRA path

Further research found a newer/current ComfyUI IC-LoRA path built around:

```text
normal LoraLoaderModelOnly
        ↓
GetICLoRAParameters
        ↓
LTXVAddGuide
```

We rebuilt only the Ingredients conditioning section while preserving the rest of the cheap 8-step diagnostic.

Working model chain:

```text
LTX 2.3 DEV FP8
        ↓
Distilled LoRA @ 0.5
        ↓
Ingredients LoRA @ 1.4
        ├──────────────→ CFGGuider model
        │
        └→ GetICLoRAParameters
                    ↓
               LTXVAddGuide
```

Guide inputs:

```text
positive          <- LTXV conditioning
negative          <- LTXV conditioning
vae               <- LTX 2.3 checkpoint VAE
latent            <- empty 121-frame LTX video latent
image             <- repeated reference sheet x 121
iclora_parameters <- GetICLoRAParameters
frame_idx         = 0
strength          = 1.0
```

After sampling:

```text
LTXVSeparateAVLatent
        ↓
LTXVCropGuides
        ↓
video decode
```

This wiring was the first configuration that converted the sheet into actual reference context rather than simply animating it.

## Proven local cheap baseline

Current locally validated capability baseline:

```text
base model:           ltx-2.3-22b-dev-fp8.safetensors
text encoder:         gemma_3_12B_it_fp4_mixed.safetensors
distilled LoRA:       ltx-2.3-22b-distilled-lora-384-1.1.safetensors
                      strength 0.5
Ingredients IC-LoRA:  ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors
                      strength 1.4
steps:                8 distilled steps
CFG:                  1
frames:               121
fps:                  24
output:               768 x 448
reference guide:      strength 1.0
```

The first successful-core output showed:

- one coherent kitchen scene rather than the composite sheet;
- the referenced man present in the new environment;
- the referenced steak preserved as a recognizable plated product;
- believable garnish interaction;
- stable enough motion to prove the mechanism;
- meaningful new-scene freedom.

This was the key capability threshold:

> Ingredients can use a person + product + location bundle to construct a new scene on the current worker.

## Prompt-tuning sequence

The first working-core run also exposed fake upper-left pseudo-typography. Several controlled prompt iterations helped identify the source.

### Failed direction — negative wording and structured labels

Adding many words such as:

```text
watermark
logo
text
caption
side profile
```

to the negative prompt did not help under CFG 1 and, in one run, the pseudo-typography became substantially worse.

The positive prompt also contained structured layout wording such as:

```text
### Reference Sheet Description
Upper Left — Location
Lower Left — Food
Right — Character
```

plus commercial/advertising vocabulary.

Those runs repeatedly generated fake text in the upper-left of the frame.

### Seed test

Changing the seed from `42` to `817263945` improved motion stability but did **not** remove the upper-left fake typography.

Therefore:

```text
seed 42
!= root cause of pseudo-typography
```

### Useful local prompt finding

The later prompt removed:

```text
Reference Sheet Description
Upper Left
Lower Left
Right
commercial
advertising
logo
watermark
text
caption
```

and switched to plain natural scene prose while preserving the working IC-LoRA wiring and stable seed.

Result:

- fake typography disappeared;
- coherent reference-driven scene construction remained;
- motion became comparatively stable;
- the man carried/placed the steak, adjusted the garnish and moved away;
- product and kitchen references remained recognizable.

This should be recorded narrowly as a **local Helix prompt-compiler finding**, not as a claim that the official Ingredients sheet-description format is universally wrong.

Current local rule:

```text
Ingredients prompt compilation
-> prefer plain natural scene prose
-> avoid unnecessary Markdown/layout labels
-> describe desired visible state affirmatively
-> do not prime unwanted graphic/text concepts in the positive prompt
```

## Best current result — capability verdict

The best current local run demonstrated:

```text
Reference-sheet leakage        SOLVED
Pseudo-text artifact           SOLVED in simplified-prompt run
Multi-asset composition        STRONG PASS
Environment fidelity           GOOD
Food/product fidelity          GOOD
Simple physical interaction    PASS
Motion stability               GOOD
Character identity fidelity    MODERATE
Exact action/blocking          MODERATE
Camera/directing precision     MODERATE
Human anatomy / hands          IMPERFECT
Production ready               NO
```

Observed remaining defects include:

- occasional pinching/malformed hands;
- human morphology drift;
- moderate rather than exact face identity;
- generated blocking can exceed the requested action;
- actor may move toward/out of the desired framing;
- camera control remains semantic rather than exact.

These are now quality/control questions, not evidence that the reference mechanism failed.

## Important interpretation

The experiment should be separated into two questions:

```text
1. Does reference conditioning work?
   YES.

2. Is the current cheap 8-step output production quality?
   NO.
```

The first question is settled strongly enough to keep Ingredients in the Helix candidate set.

## Ingredients vs Licon MSR

After both systems produced successful new-scene generations, they appear less like direct substitutes and more like complementary reference abstractions.

### Ingredients mental model

```text
"Here is the visual world of this shot."

person
product
wardrobe
location
        ↓
one composite reference package
        ↓
construct a scene
```

Observed local strengths:

- person + product + location in one generation;
- strong environment and product carryover;
- good scene reconstruction from a visual bundle;
- natural fit for campaign/story asset packages.

Observed local weaknesses:

- one composite sheet rather than independently controlled entity slots;
- panel construction is preparation overhead;
- human identity remains moderate in the current one-portrait sheet;
- current cheap distilled output has anatomy/control limitations.

### Licon MSR mental model

```text
"These are specific independent entities."

pic1       = Person A
pic2       = Person B
pic3       = Product
background = Location
        ↓
learned reference slots
        ↓
compose a scene
```

Licon independently encodes references, assigns learned slot embeddings and places references at distinct negative temporal positions. That makes it structurally attractive for explicit entity separation.

Current local Licon evidence:

```text
one-person new-scene freedom        STRONG PASS
hair / beard / sweater continuity   PASS
exact likeness                      GOOD, not perfect
profile/viewpoint identity           NOT YET TESTED
multi-person slot separation         NOT YET TESTED
person + product + background A/B    NOT YET TESTED
```

## Revised Licon comparison plan

Ingredients gives us a much better benchmark for the next Licon tests.

### Licon R1 — viewpoint identity stress

Same portrait:

```text
front
-> clear 60-90 degree rotation
-> short side-facing action
-> return toward camera
```

Score:

- face geometry;
- hair;
- beard;
- age;
- sweater;
- identity after viewpoint change.

### Licon R2 — direct Ingredients problem A/B

Use the same underlying assets as the successful Ingredients test:

```text
pic1       = man.jpg
pic2       = plate.jpg
background = kitchen.jpg
```

Ask for essentially the same kitchen/steak scene.

Compare:

- person likeness;
- steak fidelity;
- kitchen fidelity;
- human anatomy;
- hands;
- action adherence;
- scene freedom;
- reference leakage;
- camera freedom;
- preparation burden;
- runtime / memory.

This should be scored as both:

```text
REFERENCE CAPABILITY
and
FINAL VIDEO QUALITY
```

Do not conflate those two scores because Licon and Ingredients currently run on different base versions/quality pipelines.

### Licon R3 — two-person slot separation

```text
Image 1 = Person A
Image 2 = Person B
```

Use intentionally different people and wardrobe.

Score:

- face mixing;
- wardrobe swapping;
- one slot dominating;
- position/action swapping;
- identity through motion;
- interaction quality.

## Ingredients quality-ceiling test remains active

Do **not** abandon the higher-quality Ingredients path.

Now that the reference mechanism is proven, the 30-step recipe has a different purpose:

```text
30 steps + CFG 4 + STG
-> test anatomy quality
-> hand quality
-> human identity stability
-> action quality
-> temporal stability
```

This is no longer required to prove that Ingredients works; it is a quality-ceiling experiment.

## Other reference searches remain active

The broader shortlist is still valid.

```text
LTX-Best-Face-ID
-> activate if exact human identity remains weak

Phantom-Wan 14B
-> activate if Licon + Ingredients both struggle with multi-subject separation

HunyuanCustom / HuMo
-> architectural/future references; poor current RTX 4060 fit
```

Do not test every model by default. Trigger specialist challengers only when a real weakness remains after the Licon/Ingredients comparison.

## Helix Production implication

Do not expose Ingredients sheet layout or Licon slot wiring in the Helix Director contract.

Keep the semantic representation generic:

```text
reference_entities[]
  entity_id
  role              character | wardrobe | prop | vehicle | location | background
  reference_assets[]
  continuity_priority
  shot_scope
```

Production can then compile the same semantic intent into:

```text
Ingredients reference sheet
or
Licon independent MSR slots
or
Face-ID specialist
or
another reference backend
```

without changing upstream creative intent.

## Current conclusion

Ingredients is no longer an unvalidated alternative.

```text
capability
-> PROVEN locally

cheap 8-step production quality
-> NOT sufficient

quality ceiling
-> pending 30-step / CFG4 / STG validation

likely Helix role
-> scene / asset-bundle reference conditioning
```

Licon remains the stronger-looking candidate for explicit entity/identity slot handling, but the next controlled tests must prove that advantage rather than assume it.
