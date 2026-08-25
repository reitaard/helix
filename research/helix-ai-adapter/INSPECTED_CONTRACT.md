# Inspected Production Contract

**Inspected:** 2026-08-25

**Repository branch at inspection:** `research/qwen-production-settings`, merged with the latest `feature/t2v-settings`

**Upstream Production source commit:** `9523428` (`docs: replace auto plan with explicit T2V modes`)

**Research merge commit:** `0f5f1a0`

This file is the source map for the benchmark. If Production settings source changes, re-inspect it and update this document before trusting benchmark conclusions.

## Source files

| Concern | Source |
|---|---|
| Types, defaults, limits, supported values | `production/media-runtime/src/t2v/settings.ts` |
| Explicit generation modes and deterministic patches | `production/media-runtime/src/t2v/mode.ts` |
| Persisted mode resolution | `production/media-runtime/src/t2v/mode-service.ts` |
| Deterministic core/dev setting mutations | `production/media-runtime/src/t2v/profile-service.ts` |
| Mapping stable settings onto vetted Comfy nodes | `production/media-runtime/src/t2v/workflow-binder.ts` |
| Durable profile/tool settings | `production/media-runtime/src/repositories/t2v-settings-repository.ts` |
| Settings migration and initial row | `production/media-runtime/migrations/0007_t2v_profile_settings.sql` |
| Telegram settings command/UI surface | `production/media-runtime/src/telegram/t2v-settings-service.ts` |
| Telegram mode command/UI surface | `production/media-runtime/src/telegram/t2v-mode-service.ts` |
| Prompt capture, settings snapshot, confirmation, submission | `production/media-runtime/src/telegram/t2v-service.ts` |
| Durable pending snapshot | `production/media-runtime/src/repositories/t2v-pending-repository.ts` |
| Project-level commitment | `docs/DECISIONS.md` — “T2V settings must be Helix semantics, not raw Comfy node controls” |

## Explicit T2V modes

The updated Production branch replaces the earlier automatic-plan idea with three explicit, persisted operator modes:

```text
manual
fast
quality
```

Mode behavior is deterministic:

```text
manual  -> preserve stored settings without a mode patch
fast    -> quality=standard, durationSeconds=5, fps=24, megapixelsOverride=null
quality -> quality=high, durationSeconds=8, fps=24, megapixelsOverride=null
```

The selected mode is stored in `production_profile_tool_settings.generation_mode`, defaults to `manual`, and is constrained by the database. At prompt capture, Helix resolves the selected mode over base settings and snapshots the resulting effective settings before confirmation.

Mode selection and free-form settings interpretation are different candidate tasks. Baseline V1 continues to test only core settings deltas. A future mode benchmark must use its own fixture and tiny contract, for example:

```json
{"mode":"manual|fast|quality|none"}
```

Do not silently add mode inference to the V1 settings benchmark because that would change two variables and invalidate comparison with its recorded baseline.

## Existing core settings

These are the only settings in the initial AI research scope.

### `aspect`

Supported exact values:

```text
1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9
```

Current labels:

```text
1:1  Square
2:3  Portrait Photo
3:2  Photo
3:4  Portrait Standard
4:3  Standard
9:16 Portrait Widescreen
16:9 Widescreen
21:9 Ultrawide
```

Default: `16:9`.

Research alias policy (benchmark policy, not yet a Production decision):

```text
vertical / portrait video -> 9:16
landscape / widescreen     -> 16:9
square                     -> 1:1
ultrawide / cinematic-wide -> 21:9
```

More specific ratios always override aliases. Ambiguous language should not be forced into a ratio.

### `quality`

Supported values and current megapixel mapping:

```text
low      -> 0.5 MP
standard -> 0.9 MP
high     -> 1.2 MP
```

Default: `standard`.

Quality is a stable semantic preset. The model must not emit raw megapixels in the core contract.

### `durationSeconds`

Supported values: integer `1` through `10` inclusive.

Default: `5`.

The workflow binder writes this to the vetted duration input. Relative requests may be resolved only when the arithmetic is explicit and the current duration is provided (for example, “two seconds longer”). Vague “a bit longer” must not cause an invented number.

### `enhance`

Supported values: boolean.

Default: `false`.

The semantic meaning is whether Production prompt enhancement is enabled. It is not permission for the tiny model itself to rewrite a prompt.

## Advanced/dev settings excluded from this benchmark

```text
fps
seed / seed2
negativePrompt
megapixelsOverride
sampler
cfg
```

They exist on the feature branch but are explicitly excluded from the public semantic-adapter experiment. If user text asks for these, the benchmark should report unsupported meaning rather than map them into core fields.

## State and execution behavior

- Settings are durable by `(profile_id, tool)` using profile `nolan` and tool `video.t2v`.
- When a T2V prompt is captured, resolved settings are snapshotted into the durable pending action.
- Confirmation shows the snapshotted aspect, quality, duration, and enhancement state.
- Only after deterministic `yes` confirmation does Helix bind the workflow and call `JobService.create()`.
- `bindT2VWorkflow()` validates expected node IDs/class types before mutation.
- The benchmark must not enter this execution path.

## AI research boundary

The candidate model operation is equivalent to:

```text
interpretCoreSettingsDelta(currentSettings, text)
```

It may propose a typed delta. It does not:

- read or write the settings repository;
- resolve a worker;
- alter a workflow;
- rewrite a prompt;
- confirm a generation;
- submit a job.

## Important stale-document warning

Some `main`-era Production documentation still describes T2V as prompt-only because the active source branch is the newer `feature/t2v-settings` work. For this research branch, executable source at commit `128671c` is authoritative for the current experimental settings contract. Project decisions remain authoritative for architectural boundaries.
