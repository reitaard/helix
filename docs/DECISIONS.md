# Decisions

Only choices we are willing to treat as current project commitments belong here. Uncertain ideas belong in `ASSUMPTIONS.md`.

## 2026-08-19 — Project name

**Decision:** Helix.

**Reason:** The intended system iterates through content variants, measurement, selection, and further variants.

## 2026-08-19 — Preparation before implementation scale

**Decision:** Build shared vocabulary, boundaries, workflow hygiene, and evidence discipline before committing to large infrastructure.

## 2026-08-19 — Divide the system by responsibility

**Decision:** Helix is divided into Foundation, Intelligence, Director, Experiment Engine, Production, Distribution, and Analytics/Feedback.

**Reason:** Research/decision logic, experimentation logic, and media execution need independent boundaries so one can evolve without locking the others to a specific tool or provider.

## 2026-08-19 — Brain development precedes generation integration

**Decision:** After preparation, the main development order is `Intelligence → Director → Experiment Engine`. Production/generation is a separate workstream and will connect later through stable briefs/contracts.

**Reason:** The valuable decision system should determine what to make and what to test independently of the current generation technology.

## 2026-08-19 — Director is production-agnostic

**Decision:** Director outputs must not depend on a specific model/provider.

**Reason:** LTX, Seedance-class systems, Wan, H3, stock footage, motion graphics, human editors, and future production methods should remain interchangeable execution possibilities from the Director's point of view.

## 2026-08-19 — Preserve asynchronous generation pattern as Production knowledge

**Decision:** Keep the known `create task → task id → status/result → normalized output` pattern for generation workflows, but do not treat it as the central Helix brain contract.

**Reason:** It remains useful for Production integration while no longer dictating project order.

## 2026-08-21 — Tool-specific directors stay inside Production

**Decision:** Tool-specific generation/control layers such as LTX Director and ComfyUI workflow state belong inside Production adapters. They are not the Helix Director contract.

**Reason:** Helix Director should express creative intent independently. Production can translate that intent into timeline segments, keyframes, IC-LoRA guidance, audio controls, retake regions, sampler/model settings, or equivalent backend-specific controls without coupling the brain to one generation stack.

## 2026-08-23 — Production workers stay pinned; update awareness is read-only

**Decision:** The active ComfyUI worker uses an explicit production revision pin. Helix may compare that revision with official upstream state for operator visibility, but it must not automatically update the worker.

**Reason:** ComfyUI, custom nodes, PyTorch/CUDA behavior, and LTX workflow compatibility form one validated execution stack. Upstream drift is useful information; mutation of the production worker requires an explicit inspect → update → restart → validation checkpoint.

## 2026-08-23 — Telegram is an operator surface, not a general control plane

**Decision:** Telegram lives inside `helix-runtime` as a narrow operator surface. It may expose diagnostics, queue/job/outbox/Downloads inspection, durable debug views, operational alerts, explicitly confirmed media-job cancellation, explicitly confirmed T2V/T2I generation, and explicit artifact retrieval, but not restart, shell, package-update, or arbitrary worker-mutation actions.

**Reason:** Telegram is useful for compact operational visibility and bounded intervention, while low-level execution ownership remains in Helix runtime/worker boundaries. Restricting access to the configured chat ID and keeping the command surface intentionally small preserves that boundary.

## 2026-08-23 — Telegram cancellation requires durable terminal-style confirmation

**Decision:** `/cancel <number>` and alias `/cc` create one durable pending action for the configured operator chat, expire after 60 seconds, and require a case-insensitive `yes` or `no`. Three invalid responses abort the request. A new slash command silently abandons the pending confirmation. Legacy Helix UUID references remain accepted for compatibility.

**Reason:** Job cancellation is already owned by `JobService`, so Telegram should only provide a guarded operator path into that existing service. Durable pending state preserves intent and survives runtime restarts without introducing destructive buttons or direct Comfy control.

## 2026-08-23 — Operational alerts are durable and deduplicated

**Decision:** Failed/timed-out jobs, terminal Outbox failures, and confirmed worker offline/recovered transitions may proactively alert the configured Telegram operator. Event-derived alerts are persisted and deduplicated; worker transition alerts require consecutive observations and a cooldown.

**Reason:** Operator notification must not depend on a single process tick or flood the chat during polling/restart. Durable alert rows, a migration-time event cursor, bounded send retry, transition thresholds, and cooldown provide observability without turning transient observations into repeated noise.

## 2026-08-24 — Telegram T2V generation requires pre-submit confirmation

**Decision:** Receiving a T2V prompt must not immediately spend GPU time. `/t2v` captures the prompt durably, previews it, and requires terminal-style `yes` / `no` confirmation before `JobService.create()` is called.

**Reason:** Generation is a meaningful compute action and operator text may contain mistakes. Prompt entry and execution intent must remain separate.

## 2026-08-24 — Initial T2V semantic surface is prompt-only

**Decision:** The first validated native LTX 2.5 T2V binding mutates only `405:376.inputs.value` in the vetted runtime workflow. Prompt enhancement remains disabled and the current resolution/aspect, duration, FPS, negative prompt, model and sampler controls remain workflow-defined.

**Reason:** The full T2V settings contract has not been designed yet. A narrow binding proves the end-to-end Production path without prematurely freezing unstable Comfy node controls as public Helix semantics.

## 2026-08-24 — T2V settings must be Helix semantics, not raw Comfy node controls

**Decision:** Future T2V settings should expose stable concepts such as aspect ratio, duration, quality/resolution preset and prompt enhancement first. Seed, negative prompt, sampler/model tuning and workflow-specific values remain advanced/internal until their value and stability are proven.

**Reason:** The operator surface should remain understandable and portable across future workflow revisions. Raw node IDs and model-specific sampler details are implementation details, not the long-term Production contract.

## 2026-08-24 — WebSocket event readiness is advisory

**Decision:** A transient Comfy WebSocket events-probe timeout does not by itself mark an otherwise execution-ready worker `Degraded`. Runtime reachability, queue access and capability inspection determine execution readiness; event-socket errors remain visible as diagnostics.

**Reason:** Helix job correctness comes from durable queue/history reconciliation. Treating one optional event probe as the entire worker state made `/status` flap despite successful active generation.

## 2026-08-24 — Telegram artifact captions identify the Helix tool

**Decision:** Generated artifact captions use the actual media tool such as `[video.t2v]` instead of a generic Comfy heading, and use the configured worker presentation name rather than the durable worker ID.

**Reason:** Operator output should describe the Helix action that produced the artifact while preserving durable IDs internally. Presentation naming and execution identity remain separate concerns.

## 2026-08-25 — Current generation direction is open/self-hosted first

**Decision:** Runway is not part of the active Production plan. Current generation research and integration should prioritize open/self-hosted execution through ComfyUI and locally controllable model/workflow families. Seedance 2.0 is currently a behavioral/quality reference for reverse-engineering prompt and temporal behavior, not an active provider dependency.

**Reason:** The current project goal is to learn which open Production components can reproduce the useful behavior of packaged commercial video systems while preserving local control, replaceability, inspectability, and a stable Helix-owned execution boundary.

## 2026-08-25 — Native LTX first; escalate controls only when needed

**Decision:** For LTX 2.5, Production should try a focused native prompt before adding LTX Director, Prompt Relay, or continuation machinery. Extra control layers are justified when native prompting repeatedly fails required timing, shot responsibility, state change, or structured progression.

**Reason:** Controlled native T2V experiments showed that LTX 2.5 already performs meaningful temporal allocation, camera/action planning, native hard cuts, subject continuity, and audiovisual synchronization. Adding tool-specific control to every shot would increase complexity and can destabilize shot types that already work well natively.

## 2026-08-25 — Evaluate usable video separately from clause-by-clause adherence

**Decision:** Production experiments must score both prompt/benchmark adherence and finished-video quality.

**Reason:** The 5/8/10-second native T2V tests repeatedly showed that stricter prompt adherence can make a worse video: robotic acting, poor pacing, symbolic debris, or static shots may satisfy more clauses while reducing naturalness and usefulness. Helix should optimize reliable creative output, not merely textual obedience.

## 2026-08-25 — Prompt Relay is a scene-progression control, not a state machine

**Decision:** Kijai Prompt Relay is an optional LTX 2.5 Production control for temporal semantic routing and scene progression. It should be considered when a single generation contains distinct narrative/behavioral beats and native LTX exposes later beats too early or smears events across the clip. It is not the default path for every shot and must not be treated as a hard frame switch, physics controller, or persistent object-state machine.

**Reason:** Clean native-vs-Relay tests showed modest improvement on a simple motorcycle sequence, strong reduction of semantic leakage in a walk → stop/speak → run sequence, and a clear scene-development benefit in a 15-second café narrative where native LTX introduced later story content too early. A receive → inspect/open → discard object-state stress test also showed that Relay does not solve fragile physical state and possession chains. The useful abstraction is `persistent global state + temporally routed semantic beats`, while object causality and reference identity remain separate Production problems.

## 2026-08-25 — Reference conditioning remains opt-in and must be validated independently

**Decision:** Licon MSR is a researched LTX 2.5 reference/continuity candidate, not yet a validated Production capability. Test it independently before combining it with Prompt Relay.

**Reason:** MSR and Prompt Relay target different failure dimensions. Prompt Relay routes semantic beats over time; MSR is intended to preserve referenced characters, clothing, objects and backgrounds through latent reference slots. Combining unvalidated controls would make failures impossible to attribute. The first MSR experiments should therefore establish one-subject identity retention, then multi-subject slot separation, before any combined scene-progression test.

## 2026-08-26 — Production Profiles share physical execution infrastructure

**Decision:** `nolan` / Christopher Nolan and `leibovitz` / Annie Leibovitz are logical Production Profiles on the same `helix-rtx4060-01` worker, Comfy endpoint, adapter, queue, RTX 4060, and one-job physical concurrency limit. Nolan owns validated LTX video tools; Leibovitz owns the validated narrow FLUX.2 Klein Distilled `image.t2i` path.

**Reason:** Profile identity describes tool authority and operator presentation, not additional hardware. Sharing the physical boundary avoids false worker/queue semantics while preserving distinct settings and generation behavior.

## 2026-08-26 — Telegram uses one durable numeric Job reference

**Decision:** Every media job receives a unique, non-null, sequential `BIGINT job_number`. Telegram displays and resolves this exact unpadded number across Jobs, details, events, cancellation, alerts, delivery, Outbox, errors, and Downloads. Internal Helix `job_...` primary keys and Comfy Prompt IDs remain unchanged; legacy references remain accepted where previously supported.

**Reason:** One short numeric reference is easier to recognize, copy, and type than visually similar Helix and Comfy UUID prefixes. An additive public reference avoids risky primary-key or foreign-key rewrites.

## 2026-08-26 — Jobs and Downloads use 20-item pagination

**Decision:** `/j`, `/jbs`, and `/jobs` show 20 jobs per page with `/j p <page>` navigation. `/dl` and `/downloads` show 20 live Comfy history items per page with `/dl p <page>`. `/jb <number>` remains Job detail; `/j` never aliases detail.

**Reason:** Five Jobs hid too much recent history, while unbounded messages would violate compact Telegram presentation. Matching 20-item page grammar keeps both operational browsers predictable.
