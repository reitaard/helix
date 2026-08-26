# Production Settings Test Plan

> **Research status:** POSTPONED AND LOCKED — do not execute this plan without explicit Creator approval; see `RESEARCH_LOCK.md`.

## Question

Can the detached Qwen3 0.6B semantic adapter reliably translate a short natural-language settings instruction into a safe typed delta for the current T2V core settings?

## Non-goal

This test does not prove that AI should be integrated. It only identifies whether a conservative useful subset exists.

## Output contract under test

```json
{
  "status": "ok | no_settings | conflict | unsupported",
  "changes": {
    "aspect": "optional supported ratio",
    "quality": "optional low | standard | high",
    "durationSeconds": "optional integer 1-10",
    "enhance": "optional boolean"
  },
  "conflictFields": [],
  "unhandledMeaning": false
}
```

Rules:

- `changes` is a delta, not a reconstructed settings object.
- Omit every unmentioned field.
- `no_settings` means the text contains no request to change core settings.
- `conflict` means contradictory values remain unresolved; name the affected field(s).
- `unsupported` means at least one requested setting is outside the core contract or supported range.
- A partially useful unsupported request may retain safe recognized changes while setting `unhandledMeaning=true`.
- Never invent an exact value for vague relative language.

## Case groups

1. **Direct values** — exact ratios, presets, durations, booleans.
2. **Natural terminology** — vertical, widescreen, best quality, leave prompt unchanged.
3. **Multiple settings** — several independent changes in one sentence.
4. **Corrections** — final explicit correction wins.
5. **Negation** — especially enhancement language.
6. **Current-state arithmetic** — only explicit relative arithmetic.
7. **Conflict detection** — unresolved contradictory requests.
8. **Unsupported requests** — out-of-range duration and advanced/raw controls.
9. **No-settings controls** — creative prompt text must not be misread as settings.

## Metrics

Report all of these:

- exact-object accuracy;
- status accuracy;
- per-category exact accuracy;
- per-field value accuracy;
- change precision (avoid extra fields);
- change recall (capture requested fields);
- false-positive rate on `no_settings` cases;
- conflict detection accuracy;
- unsupported detection accuracy;
- JSON/schema failure count;
- p50 and p95 wall latency.

Do not select an integration based on aggregate accuracy alone.

## Initial research gates

These are research gates, not production SLAs:

```text
JSON/schema validity                  100%
No-settings false-positive rate       <= 2%
Direct core values                    >= 95%
Corrections + negation                >= 90%
Conflict detection                    >= 90%
Unsupported/out-of-range rejection    >= 95%
p95 latency                           <= 1500 ms
```

A field may be proposed for later shadow research only if its own accuracy clears the relevant gate. Failure by one field must not be hidden by stronger fields.

## Experiment order

### Baseline

Run the checked-in prompt, schema, and V1 cases without modification.

### Failure audit

For every failure, classify it as:

```text
benchmark ambiguity
wrong semantic mapping
missed field
extra/false-positive field
conflict handling
unsupported handling
schema/JSON failure
```

Correct benchmark ambiguity before tuning the model prompt.

### Prompt experiments

Change one item per experiment, for example:

- add one explicit vertical/landscape mapping;
- add one positive and one negative example;
- split conflict detection from extraction;
- use per-field calls only if the monolithic delta remains unreliable.

Record the baseline, changed variable, expected effect, measured effect, and regressions.

### Conservative-subset test

If the full task fails, test narrower operations independently:

```text
interpretAspect(text)
interpretDuration(text, currentDuration)
interpretEnhance(text)
interpretQuality(text)
detectSettingsConflict(text)
```

The likely successful outcome may be only one or two of these operations.

## Decision outcomes

- **No integration:** deterministic `/t2v set` remains preferable.
- **Shadow candidate:** reliable subset is logged but never applied.
- **Assisted explicit settings flow:** only after later review, typed validation, and confirmation.
- **Research another use case:** unfamiliar-error interpretation remains separate and must get its own contract and cases.

## Reproducibility

Every saved result must include:

- Git commit;
- model/API alias;
- case-file SHA-256;
- benchmark prompt and schema version;
- timestamp;
- raw response and timing for every case.

Generated result files stay local unless a human explicitly chooses a concise result to commit as research evidence.
