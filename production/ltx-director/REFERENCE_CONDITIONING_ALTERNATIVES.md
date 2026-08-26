# Reference-conditioning alternatives — 2026-08-26

Status: **research complete enough to define a comparison plan; no reference backend is locked yet**.

This note compares open/self-hosted reference-to-video approaches that are relevant to Helix after the first local Licon MSR one-subject test. The goal is not to collect every video model. The goal is to avoid freezing Helix around Licon MSR before checking the strongest nearby approaches for the same Production problem:

```text
reference image(s)
        +
creative prompt
        ↓
new video scene
while preserving the referenced person / wardrobe / object / location
```

The current Helix preference remains local ComfyUI / inspectable workflows first.

## Current local baseline — Licon MSR for LTX 2.5

Licon MSR V1 remains the strongest **already-running** candidate on the current worker.

Current local result:

```text
one portrait reference
+ new kitchen-commercial prompt
+ 8 s / 24 fps / 1280x704
        ↓
MSR generated the requested new kitchen scene,
preserved the same general man / hair / beard / sweater identity,
and allowed substantial action + camera freedom.
```

The paired fallback-control run stayed heavily anchored to the original portrait composition/background. That control therefore was not a clean "same identity method without MSR" quality baseline; it instead revealed an important behavioral distinction:

```text
standard frame-0 guide
-> strongly anchors video composition to the reference image

Licon MSR negative-time slot reference
-> uses the image more like an appearance/identity source
   while leaving the generated scene freer to change
```

This makes MSR especially relevant to Helix commercials and story shots, but exact facial identity under strong viewpoint change and multi-subject slot separation are still unvalidated.

## Candidate A — official Lightricks IC-LoRA Ingredients

**Priority: very high. Test before locking Licon MSR.**

Official Lightricks resources now include an LTX-2.5 ComfyUI workflow:

```text
LTX-2.5_ICLoRA_Ingredients_Single_Stage_Distilled.json
```

The official LTX-2.5 workflow family describes Ingredients as generation from a **reference sheet** containing characters, props, wardrobe and locations. The reference sheet is a single composite image; the prompt identifies elements by their position on that sheet.

Important implementation detail: the current official LTX-2.5 Ingredients workflow keeps the LTX-2.5 distilled backbone but uses the published **LTX-2.3 Ingredients IC-LoRA**:

```text
ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors
```

The model card describes the intended use as short clips that preserve recurring characters, face/costume, handled props and the location from a supplied sheet. The sheet is looped as a static reference video and supplied through the IC-LoRA path rather than being treated as the generated first frame.

### Why Ingredients is unusually relevant to Helix

It maps almost directly to a commercial/story asset package:

```text
reference sheet
├── actor / character views
├── wardrobe
├── product
├── logo / prop
└── location
        ↓
new commercial shot
```

That could be better than independent MSR image slots when a shot needs a **whole visual package** rather than only one person's identity.

Example Helix use:

```text
Brand campaign entity bundle:
  JOHN
  black headphones
  Soundwave store
  wardrobe A
        ↓
Ingredients reference sheet
        ↓
multiple generated commercial shots
```

### Strengths versus Licon MSR

- official Lightricks workflow and model family;
- designed around characters + props + wardrobe + locations together;
- reference content guides the whole clip without necessarily becoming frame zero;
- explicit commercial-style examples exist in the model card;
- uses the LTX-2.5 distilled backbone in the current official 2.5 workflow;
- same general Comfy/LTX Production ecosystem we already operate.

### Risks / disadvantages

- requires constructing a clean reference sheet first;
- several entities share one composite sheet rather than independent learned slots;
- important panels need enough pixel area or details can be lost;
- underlying Ingredients IC-LoRA was trained on LTX 2.3 even though the official 2.5 workflow uses it with the 2.5 backbone;
- original trained bucket is 768x448 / 121 frames / 24 fps, so our richer 8-second 1280x704 workflow is outside the training bucket;
- current official 2.5 Ingredients example is single-stage, while our main native quality baseline is two-stage.

### Decision

**Must test.** This is the closest serious alternative to Licon MSR for Helix's broader `character + prop + location` continuity problem.

Sources:

- `https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5`
- `https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/example_workflows/2.5/LTX-2.5_ICLoRA_Ingredients_Single_Stage_Distilled.json`
- `https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients`

## Candidate B — LTX-Best-Face-ID / BFS Nodes

**Priority: high for human spokesperson identity; not a generic MSR replacement.**

`Alissonerdx/LTX-Best-Face-ID` is a dedicated identity-preserving reference-to-video LoRA for **LTX 2.3**. It uses:

```text
reference latent overlap
+ TASS-RoPE / source-phase tagging
+ ArcFace identity supervision during training
```

The current project exposes two notable modes:

```text
Best_FaceID_v1.0
-> close-up / bust face reference

Best_FaceID_CharacterSheet_v1.0
-> character sheet with face + body views
```

The companion `ComfyUI-BFSNodes` repository also contains multi-angle identity-transfer work where front face, back of head, full-body front and side profile are injected as distinct source IDs.

### Why it matters

This system is more **identity-specialized** than Licon MSR. ArcFace identity loss directly optimizes facial similarity, which makes it a serious challenger if Helix's most important use case becomes:

```text
same human spokesperson
across many commercial shots
```

Our clean male portrait is almost exactly the kind of source image its face model recommends: frontal/near-frontal, chest-up, clear and well lit.

### Strengths versus Licon MSR

- explicitly optimized for human face identity;
- ArcFace-supervised training rather than generic reference retrieval alone;
- source-phase reference design avoids simply treating the image as generated frame zero;
- character-sheet continuation adds clothing/body appearance support;
- ready-made Comfy workflows and active BFS node implementation exist.

### Risks / disadvantages

- current released model is LTX 2.3, not LTX 2.5;
- would create a separate LTX 2.3 branch rather than dropping cleanly into our proven 2.5 graph;
- dedicated primarily to people, not arbitrary objects/backgrounds;
- strongest close-up model is biased toward clear frontal face references;
- extra BFS node/dependency surface;
- Hugging Face model card currently uses a non-Apache `other` license, so licensing needs review before any production lock.

### Decision

Do **not** replace Licon with it now, but keep it as the most interesting **human-identity specialist**. If the next Licon viewpoint test shows noticeable face drift, this should become a direct isolated challenger using the same portrait and commercial concept.

Sources:

- `https://huggingface.co/Alissonerdx/LTX-Best-Face-ID`
- `https://github.com/alisson-anjos/ComfyUI-BFSNodes`

## Candidate C — Phantom-Wan 14B

**Priority: medium; strong multi-subject challenger on a different model stack.**

ByteDance's Phantom is a purpose-built **Subject-to-Video** framework. Phantom-Wan supports single and multi-reference subject generation; the published implementation accepts up to four reference images. Its design explicitly targets subject consistency while reducing reference-image leakage and multi-subject confusion.

ComfyUI support exists through Wan tooling, and ComfyUI also documents a built-in `WanPhantomSubjectToVideo` node.

### Why it matters

This is the clearest non-LTX alternative if our key requirement becomes:

```text
multiple independent people / objects
in a newly generated scene
```

rather than preserving an opening frame.

### Strengths versus Licon MSR

- purpose-built subject-to-video model rather than an add-on to ordinary I2V;
- up to four references;
- research specifically targets both single- and multi-subject consistency;
- mature public history and ComfyUI integrations;
- not dependent on constructing one reference sheet.

### Risks / disadvantages

- different Wan 2.1 model stack, so this is a backend comparison rather than a drop-in LTX control;
- would require additional models/workflow calibration on the worker;
- older Phantom-Wan generation conventions differ from our native LTX 2.5 24-fps joint-AV baseline;
- our current validated Production prompt/audio behavior belongs to LTX, so moving to Phantom has a higher integration cost.

### Decision

Do not install immediately. Keep Phantom-Wan 14B as the **fallback multi-subject challenger** if Licon and Ingredients both fail the two-person test.

Sources:

- `https://github.com/Phantom-video/Phantom`
- `https://huggingface.co/bytedance-research/Phantom`
- `https://docs.comfy.org/built-in-nodes/WanPhantomSubjectToVideo`

## Candidate D — HunyuanCustom

**Priority: research reference only on the current worker.**

Tencent's HunyuanCustom is a dedicated customized-video architecture supporting image, text, audio and video conditions and both single- and multi-subject customization. Its published examples explicitly include virtual-human advertisements and virtual try-on.

The architecture is interesting because it uses image-text fusion plus a separate identity-enhancement path, and its multi-subject design also uses separated negative temporal positions for different subjects.

However, the official requirements make it a poor current fit for `helix-rtx4060-01`:

```text
512x896 / 129f -> ~60 GB peak memory
720x1280 / 129f -> ~80 GB peak memory
minimum documented GPU memory -> 24 GB, very slow
```

### Decision

Keep as an architectural benchmark, not an immediate local Production candidate.

Sources:

- `https://github.com/Tencent-Hunyuan/HunyuanCustom`
- `https://huggingface.co/tencent/HunyuanCustom`

## Candidate E — HuMo

**Priority: future human + audio reference path, not current identity baseline.**

ByteDance/Tsinghua HuMo is human-centric and combines text, reference images and audio. It emphasizes subject preservation plus synchronized audio-driven motion. This is conceptually attractive for future spokesperson/dialogue videos because Helix could eventually provide:

```text
person reference
+ scene prompt
+ voice/dialogue audio
        ↓
identity-consistent talking/acting video
```

But current compute is not a natural RTX 4060 fit. The project's 1.7B release is described around 480p generation on a 32 GB GPU, while the 17B model is heavier.

### Decision

Track, but do not divert the current MSR experiment into HuMo.

Sources:

- `https://github.com/Phantom-video/HuMo`
- `https://huggingface.co/bytedance-research/HuMo`

## Not in active scope — provider-only reference systems

Current commercial/partner-node systems may offer stronger reference-to-video quality, but they do not answer the current open/self-hosted Production question. For example, Wan 2.7 Partner Nodes expose reference-to-video with multiple real-person inputs, but that path is provider/API-backed rather than the local open workflow we are evaluating.

Do not use provider systems to decide the local Helix reference backend.

## Current ranking for Helix

```text
1. Licon MSR LTX 2.5
   -> best already-running general independent-reference candidate

2. Lightricks Ingredients IC-LoRA
   -> MUST benchmark; strongest same-ecosystem challenger for
      character + wardrobe + prop + location commercial continuity

3. LTX-Best-Face-ID
   -> strongest specialist challenger for exact human spokesperson identity

4. Phantom-Wan 14B
   -> alternate-stack challenger for multi-subject reference generation

5. HunyuanCustom / HuMo
   -> interesting architecture, currently poor worker fit
```

This is **not** a final winner ranking. It is a test-priority ranking.

## Recommended experiment order

### R1 — finish Licon single-person identity stress

Use the current portrait and force a strong viewpoint transition:

```text
front
-> clear 60-90 degree profile / side-on action
-> return to camera
```

If identity survives, mark Licon one-subject locally validated.

### R2 — official Ingredients one-character commercial test

Build a clean reference sheet from the same man, then include one product and one location element. Use a compact commercial shot so Ingredients gets tested for the thing it was trained to do rather than as a pure face-ID tool.

Score:

- facial identity;
- wardrobe;
- product fidelity;
- location fidelity;
- scene freedom;
- action quality;
- preparation burden;
- runtime / memory.

### R3 — Licon two-person slot separation

Only after R1. Two people with visually different wardrobe and clearly assigned actions/positions.

### R4 — Ingredients multi-element / two-character test

Compare the same underlying creative requirement using a sheet rather than independent MSR slots.

### R5 — specialized challenger only when justified

```text
if exact human face identity is still weak
-> test LTX-Best-Face-ID on LTX 2.3

if multi-subject separation is weak in both Licon + Ingredients
-> test Phantom-Wan 14B
```

## Production-contract implication

Do **not** make `msr_parameters`, Licon slot IDs, Ingredients sheet layout or BFS source IDs part of the Helix Director contract.

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

**Do not lock Licon MSR yet.**

The first local MSR result is strong enough to keep testing, not strong enough to freeze the reference architecture. The immediate comparison that can realistically beat or complement it on our existing LTX stack is **Lightricks Ingredients IC-LoRA**. Human-only Face-ID and Phantom-Wan remain targeted challengers rather than mandatory installs.