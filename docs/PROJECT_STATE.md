# Project State

## Current phase

**Preparation / foundation.**

The system division is established at a high level. We are not building the complete architecture yet.

## Current direction

The primary post-preparation workstream is the **Helix brain**:

```text
Niche Intelligence -> Director -> Experiment Engine
```

Generation/production is a separate workstream connected through stable creative/variant briefs rather than being allowed to shape the Intelligence or Helix Director architecture.

## Current project divisions

- Foundation / Preparation
- Intelligence
- Director
- Experiment Engine
- Production
- Distribution
- Analytics / Feedback

## Existing implementation knowledge to preserve

- n8n orchestration experience;
- asynchronous generation pattern: create task -> task id -> status/result -> output;
- Runway workflow concepts and task-monitor behavior;
- Reitaard as a future application shell/interface;
- provider/model/workflow research as provisional future Production input;
- local LTX 2.5 / ComfyUI production research, including reproducible generation manifests and controlled prompt/seed/workflow testing;
- WhatDreamsCost LTX Director research: timed prompts, keyframes, IC-LoRA motion/reference guidance, audio and retake state are a candidate **Production control surface**, not a Helix Director dependency;
- a provisional pattern where Helix-owned execution intent is compiled into backend-specific workflows instead of agents manipulating provider UIs directly.

## Active Production-side validation slice

A deliberately narrow LTX Director experiment is active without changing the main Helix build order.

Current status (2026-08-21):

- WhatDreamsCost LTX Director nodes load successfully on the local ComfyUI Desktop installation;
- ComfyUI-KJNodes is installed in the active `Documents\ComfyUI\custom_nodes` directory;
- the active ComfyUI venv required `av>=16.0.0`;
- no separate ComfyUI-LTXVideo custom-node package has been required so far;
- the known-good native LTX 2.5 I2V workflow remains preserved;
- the Director-enabled workflow follows the upstream two-stage Director topology while retaining the local LTX 2.5 model/upscale/decode backend;
- **D0 single-prompt Director generation passed**: playable `1280x704`, 24 fps, ~8 s output saved in about `403.6 s`;
- D0 discovered an important runtime rule: Director width/height must be explicit for large guide images; zero inherited the 3200x1800 source and created a 3168x1792 latent;
- **D1 Prompt Relay with three timed local prompts is the next runtime checkpoint**;
- the current Comfy graph is an execution prototype, not the final agent-facing Director control surface.

This Production validation remains separate from the primary Niche Intelligence design work.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define draft contracts for `Niche`, `ResearchFinding`, `NicheModel`, `ContentIdea`, `ContentSpec`, `Experiment`, `Variant`, `MediaAsset`, `PublishedPost`, and `PerformanceSnapshot`.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [ ] Decide what durable state must live outside n8n.
- [ ] Keep real credentials outside git and document configuration names only when introduced.
- [ ] Document Reitaard <-> Helix boundaries when backend contracts become clearer.
- [ ] Preserve provider-neutral generation job notes inside Production/workflows without making them a blocker for Intelligence work.
- [ ] When Production implementation resumes, validate whether an internal `ProductionPlan` boundary is useful before promoting it to a shared schema.
- [x] Complete LTX Director D0 single-prompt generation and record the working settings/result.
- [ ] Validate D1 Prompt Relay temporal control.
- [ ] Pin WhatDreamsCost and KJNodes commits before treating the local Director stack as stable.

## Next phase

**Niche Intelligence design.**

The next design work should answer:

1. What exactly is a niche in Helix?
2. What sources and observations enter the Intelligence system?
3. What features should be extracted from content/examples?
4. How do we represent hooks, formats, topics, pacing, visuals, narrative structure, audience, saturation, novelty and temporal trends?
5. How do we distinguish observed facts from inferred patterns?
6. What does a `NicheModel` contain?
7. How does the Director query and consume it?

## Later

After the Intelligence contract is coherent:

1. Director skill design;
2. Experiment Engine algorithms;
3. separate Production implementation;
4. Distribution;
5. closed-loop Analytics/Feedback.
