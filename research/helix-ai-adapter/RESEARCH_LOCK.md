# Research Lock

**Status:** POSTPONED

**Locked by:** Creator

**Lock date:** 2026-08-26

**Frozen branch:** `research/qwen-config-matrix`

**Frozen tag:** `research/qwen-config-matrix-postponed-2026-08-26`

## Directive

This research is paused indefinitely. Do not continue experiments unless the Creator explicitly asks to resume it.

While locked, do not:

- run additional benchmarks or regenerate raw results;
- tune prompts, schemas, fixtures, examples, or thresholds;
- download or substitute another model;
- start another inference server or change `helixai-adapter.service`;
- integrate model output into Telegram, `media-runtime`, PostgreSQL, workflows, or jobs;
- reinterpret this lock as approval for shadow or production integration;
- rewrite previous conclusions without new Creator-approved research.

Ordinary Helix development may continue. This lock applies only to the semantic-adapter research under this directory.

## Frozen evidence

Read these records without rerunning them:

1. `BASELINE_V1.md` — combined settings-delta baseline.
2. `ASPECT_V1.md` — decomposed aspect experiment.
3. `TERRA_USE_CASE_BRIEF.md` — exact-physics, error-family, and shot-structure contracts.
4. `CONFIG_MATRIX_V1.md` — three-repeat configuration matrix and corrected conclusion.
5. `INSPECTED_CONTRACT.md` — Production contract inspected for the research.

Raw benchmark JSON remains intentionally ignored under `results/` and is not part of the durable lock checkpoint.

## Frozen conclusion

Qwen3 0.6B Q8 demonstrates semantic capability, and configuration changes can improve selected categories. None of the tested practical configurations was accurate and stable enough to control the evaluated Helix production decisions automatically.

This does not establish that unrestricted reasoning or larger Qwen3 models would fail. Those questions are postponed, not answered.

## Resume procedure

Only after an explicit Creator request:

1. Start from the frozen tag rather than an arbitrary newer branch state.
2. Re-read this file and `CONFIG_MATRIX_V1.md`.
3. Verify that the current Production contract has not changed.
4. Remove `RESEARCH_LOCKED` only in a dedicated resumption commit.
5. State one narrow hypothesis and one changed variable before running anything.
6. Keep all inference detached and preserve existing raw-result ignore rules.
7. Record the new branch, model checksum, runtime configuration, fixtures, and result provenance.

The committed `RESEARCH_LOCKED` sentinel makes every benchmark runner refuse execution while postponed.

Until then, treat this directory as read-only research evidence.
