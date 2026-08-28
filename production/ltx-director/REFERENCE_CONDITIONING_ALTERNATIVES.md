# Reference-conditioning alternatives — updated 2026-08-28

Status: **Licon MSR and Lightricks Ingredients are both locally demonstrated; no single reference backend is locked yet.**

This note compares the open/self-hosted reference-to-video approaches relevant to Helix.

The Production problem remains:

```text
reference image(s)
        +
creative prompt
        ↓
new video scene
while preserving the referenced person / wardrobe / object / location
```

The current Helix preference remains local ComfyUI / inspectable workflows first.

The important change since the original comparison is that **Ingredients is no longer only a candidate**. A working Core IC-LoRA path now exists locally and has produced a coherent new scene from a person + product + location reference bundle.

## Current locally demonstrated systems

### Licon MSR — LTX 2.5

Current local result:

```text
one portrait reference
+ new kitchen-commercial prompt
+ 8 s / 24 fps / 1280x704
        ↓
MSR generated a substantially different kitchen scene,
preserved the same general man / hair / beard / sweater identity,
and allowed useful action + camera freedom.
```

The paired standard-guide control remained heavily anchored to the original portrait composition/background.

That established the important behavioral distinction:

```text
standard frame-0 guide
-> reference strongly anchors the generated composition

Licon MSR negative-time slot reference
-> reference acts more like WHO / WHAT context
-> prompt retains much more WHERE / ACTION / CAMERA freedom
```

Current Licon verdict:

```text
plugin / inference works                 PASS
one-person reference affects identity   PASS
new-scene freedom                       STRONG PASS
hair / beard / sweater continuity       PASS
exact facial likeness                   GOOD, not perfect
strong profile / viewpoint retention    NOT TESTED
multi-subject slot separation           NOT TESTED
person + object + background A/B        NOT TESTED
```

See `MSR_RESEARCH.md`.

### Lightricks Ingredients — LTX 2.3

Ingredients has now crossed the same basic capability threshold.

The initial official 2.5 compatibility workflow and the first native 2.3 distilled workflow both failed by effectively animating the composite reference sheet.

The useful breakthrough was changing only the IC-LoRA reference path to:

```text
LoraLoaderModelOnly
Ingredients strength 1.4
        ↓
GetICLoRAParameters
        ↓
LTXVAddGuide
```

with the native short-video bucket:

```text
768 x 448
121 frames
24 fps
```

The working cheap 8-step path successfully reconstructed a new scene from:

```text
person + steak + kitchen
```

rather than reproducing the sheet.

Later prompt cleanup removed the recurring pseudo-typography artifact while preserving coherent multi-asset construction and comparatively stable movement.

Current Ingredients verdict:

```text
reference-sheet leakage        SOLVED
multi-asset composition        STRONG PASS
environment fidelity           GOOD
food/product fidelity          GOOD
simple physical interaction    PASS
motion stability               GOOD
character identity fidelity    MODERATE
exact action/blocking          MODERATE
camera/directing precision     MODERATE
human anatomy / hands          IMPERFECT
production ready               NO
```

This means:

```text
Does Ingredients work as reference conditioning?
-> YES.

Is the current 8-step distilled output production quality?
-> NO.
```

See `INGREDIENTS_RESEARCH.md`.

## Licon vs Ingredients — current interpretation

They should no longer be treated as identical competitors.

### Ingredients mental model

```text
"Here is the visual world/package of the shot."

character
wardrobe
product / prop
location
        ↓
one composite reference sheet
        ↓
construct a new scene
```

Observed/expected strengths:

- character + product + location together;
- whole campaign/story visual packages;
- environment and product carryover;
- one sheet can represent several asset types;
- useful fit for commercial/story asset bundles.

Costs/risks:

- reference-sheet construction overhead;
- several entities share one composite rather than explicit independent slots;
- panel size affects how much useful visual information survives;
- current locally tested human identity is moderate;
- current cheap distilled path has anatomy/control limitations.

### Licon mental model

```text
"These are distinct entities."

pic1       = Person A
pic2       = Person B
pic3       = Product / prop
background = Location
        ↓
independent encoded references
+ learned slot identity
+ separate negative temporal positions
        ↓
compose a new scene
```

Expected structural strengths:

- explicit independent reference slots;
- natural fit for recurring named entities;
- no need to construct one composite sheet;
- dedicated background slot;
- current first test showed stronger human-identity impression than the current Ingredients run.

Costs/risks:

- only a global reference strength plus reference-frame count; no rich per-slot public control surface;
- exact identity through strong viewpoint change is still unknown;
- multi-subject slot separation is still unvalidated locally;
- object/background preservation has not yet been directly compared with Ingredients using the same assets.

## Candidate B — LTX-Best-Face-ID / BFS Nodes

**Priority: targeted challenger for exact human identity.**

`Alissonerdx/LTX-Best-Face-ID` is a dedicated LTX 2.3 human-identity reference system using ArcFace-supervised identity training and specialized source/reference handling.

Notable modes include:

```text
Best_FaceID_v1.0
-> close-up / bust face reference

Best_FaceID_CharacterSheet_v1.0
-> face + body / multi-view character sheet
```

Why it remains important:

```text
same human spokesperson
across many shots
```

is a narrower problem than generic person + product + location conditioning. If Licon's next viewpoint test shows unacceptable face drift, Best-Face-ID should become the direct identity specialist challenger.

Strengths:

- explicitly optimized for human identity;
- ArcFace supervision;
- close-up and character-sheet paths;
- avoids ordinary frame-zero reference semantics.

Risks:

- LTX 2.3 branch rather than native 2.5 MSR;
- mostly a people specialist, not a generic asset/reference backend;
- extra BFS node/dependency surface;
- license must be reviewed before any production lock.

Sources:

- `https://huggingface.co/Alissonerdx/LTX-Best-Face-ID`
- `https://github.com/alisson-anjos/ComfyUI-BFSNodes`

## Candidate C — Phantom-Wan 14B

**Priority: fallback multi-subject challenger on a different stack.**

ByteDance Phantom-Wan is purpose-built Subject-to-Video and supports multiple references. It is particularly relevant if the central problem becomes:

```text
multiple independent people / objects
inside one newly generated scene
```

Strengths:

- purpose-built single/multi-subject generation;
- up to four public references in the published system;
- research explicitly targets subject consistency and reduced reference leakage/mixing;
- available ComfyUI integrations.

Risks:

- different Wan stack;
- additional model/download/calibration burden;
- higher integration cost because our current prompt/audio research baseline is LTX.

Decision:

Do not install by default. Activate only if **both Licon and Ingredients fail the meaningful two-subject requirement**.

Sources:

- `https://github.com/Phantom-video/Phantom`
- `https://huggingface.co/bytedance-research/Phantom`
- `https://docs.comfy.org/built-in-nodes/WanPhantomSubjectToVideo`

## Candidate D — HunyuanCustom

**Priority: architecture reference only on the current worker.**

Tencent HunyuanCustom supports customized video with single/multi-subject conditioning and includes virtual-human advertisement/try-on style use cases.

Published memory requirements make it a poor current fit for the RTX 4060 worker:

```text
512x896 / 129f -> ~60 GB peak
720x1280 / 129f -> ~80 GB peak
minimum documented GPU memory -> 24 GB, very slow
```

Keep as an architectural benchmark, not an immediate local Production candidate.

Sources:

- `https://github.com/Tencent-Hunyuan/HunyuanCustom`
- `https://huggingface.co/tencent/HunyuanCustom`

## Candidate E — HuMo

**Priority: future human + audio reference path.**

HuMo combines text, reference images and audio for human-centric video. It remains attractive for a future path such as:

```text
person reference
+ scene prompt
+ dialogue / voice audio
        ↓
identity-consistent talking/acting video
```

Current compute requirements do not make it a natural RTX 4060 Production candidate.

Sources:

- `https://github.com/Phantom-video/HuMo`
- `https://huggingface.co/bytedance-research/HuMo`

## Not in active scope — provider-only systems

Provider/API reference-to-video systems may be stronger, but they do not answer the current open/self-hosted Helix Production question.

Do not use provider systems to decide the local reference backend.

## Current role hypothesis — not a final lock

The most useful current hypothesis is **complementary roles**, not one winner:

```text
Ingredients
-> scene / campaign asset bundle
-> character + product + wardrobe + location

Licon MSR
-> explicit entity continuity
-> recurring people / independent subjects / named objects
```

This remains a hypothesis until the next controlled Licon tests.

## Revised experiment order

### R1 — Licon viewpoint identity stress

Use the same male portrait and force:

```text
front
-> clear 60-90 degree rotation
-> short side-facing action
-> return toward camera
```

Score:

- facial geometry;
- hair;
- beard;
- age;
- sweater;
- whether the same person survives the viewpoint transition.

If this fails badly, activate Best-Face-ID as the direct human-identity challenger.

### R2 — direct Licon vs Ingredients asset-bundle A/B

Use the same assets from the successful Ingredients test:

```text
Licon:
pic1       = man
pic2       = steak
background = kitchen

Ingredients:
one sheet containing the same man + steak + kitchen
```

Ask for essentially the same creative shot.

Score separately:

```text
REFERENCE CAPABILITY
- person likeness
- product fidelity
- location fidelity
- entity/reference separation
- reference leakage

FINAL VIDEO QUALITY
- anatomy / hands
- motion stability
- action adherence
- camera quality
- overall coherence
```

Also record:

- workflow preparation burden;
- runtime;
- VRAM / RAM behavior.

Do not claim one reference method is better merely because the Licon path currently uses LTX 2.5 two-stage 1280x704 while Ingredients was proven with a cheap LTX 2.3 768x448 distilled path.

### R3 — Licon two-person slot separation

```text
Image 1 = Person A
Image 2 = Person B
```

Use deliberately different faces and wardrobe with clearly assigned positions/actions.

Evaluate:

- face mixing;
- wardrobe swapping;
- one slot dominating;
- position/action swapping;
- identity through motion;
- interaction quality.

### R4 — Ingredients quality ceiling

Ingredients has already passed its basic capability gate.

The remaining heavier experiment is:

```text
30 steps
CFG 4
Ingredients ~1.4
STG mode stg_v
block 29
scale 1.0
```

Purpose:

- hand/anatomy quality;
- facial fidelity;
- temporal stability;
- action quality;
- practical quality ceiling on the current worker.

This test is no longer required to prove that Ingredients works.

### R5 — specialist challenger only when justified

```text
if exact human face identity remains weak
-> Best-Face-ID

if multi-subject separation remains weak
-> Phantom-Wan 14B
```

## Current ranking by role

Do not read this as a single quality leaderboard.

```text
GENERAL INDEPENDENT ENTITY REFERENCES
1. Licon MSR LTX 2.5
   -> locally proven one-person scene freedom
   -> viewpoint / multi-slot tests pending

SCENE / ASSET BUNDLE REFERENCES
1. Lightricks Ingredients LTX 2.3
   -> locally proven person + product + location construction
   -> higher-quality recipe pending

HUMAN IDENTITY SPECIALIST
1. LTX-Best-Face-ID
   -> activate only if needed

ALTERNATE MULTI-SUBJECT STACK
1. Phantom-Wan 14B
   -> activate only if needed
```

## Production-contract implication

Do **not** make `msr_parameters`, Licon slot IDs, Ingredients sheet geometry, `GetICLoRAParameters` wiring or BFS source IDs part of the Helix Director contract.

The semantic concept should stay generic:

```text
reference_entities[]
  entity_id
  role              character | wardrobe | prop | vehicle | location | background
  reference_assets[]
  continuity_priority
  shot_scope
```

Production can later choose:

```text
Licon independent slots
or
Ingredients reference sheet
or
Face-ID specialist
or
another backend
```

without changing upstream Helix creative intent.

## Current decision

**Do not lock one reference backend yet.**

Both Licon and Ingredients now have enough local evidence to justify continued testing.

The next useful work is no longer "Does Ingredients work?" It is:

```text
1. how well does Licon preserve identity through viewpoint change?
2. how does Licon compare with Ingredients on the same man + product + location requirement?
3. can Licon keep two independent people separated?
4. how much does the heavier Ingredients recipe improve anatomy/identity quality?
```

Best-Face-ID and Phantom-Wan remain active contingency searches rather than abandoned alternatives.
