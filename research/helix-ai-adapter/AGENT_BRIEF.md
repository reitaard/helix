# AI Agent Brief

## Objective

Determine whether Qwen3 0.6B Q8_0 can safely assist with natural-language interpretation of the **existing core T2V Production settings**.

The model is being evaluated as a semantic parser, not as a chatbot, agent, or decision-maker.

## Required reading order

1. `README.md`
2. `INSPECTED_CONTRACT.md`
3. `TEST_PLAN.md`
4. `cases/production-settings-v1.json`
5. `benchmark.py`

The relevant Production source files and exact inspected commit are listed in `INSPECTED_CONTRACT.md`; broad repository discovery is unnecessary unless the source commit changes.

## Hard boundaries

Do not:

- wire AI into `media-runtime` or Telegram;
- modify Production settings or workflows;
- call ComfyUI or submit a media job;
- access or mutate PostgreSQL;
- add natural-language command routing;
- test advanced/dev settings as public AI settings;
- let the model invent unsupported values;
- reinterpret creative prompt text as settings without evidence;
- change gold expectations merely to improve a model score.

## Allowed work

- extend or correct research documentation;
- add well-justified benchmark cases;
- improve benchmark diagnostics without changing semantic expectations;
- test prompt/schema variants one variable at a time;
- compare results and identify reliable subsets;
- propose a later shadow-only design, without implementing it.

## Fixed baseline

```text
model:       helix-qwen3-0.6b
weights:     Qwen3 0.6B Q8_0
endpoint:    http://127.0.0.1:8181
reasoning:   off
temperature: 0
context:     4096
```

Do not resume broad model selection. Qwen was selected by prior corrected benchmarking; this research asks whether its useful subset is narrow enough and reliable enough for Production settings.

## Current model task

Input:

```json
{
  "currentSettings": {
    "aspect": "16:9",
    "quality": "standard",
    "durationSeconds": 5,
    "enhance": false
  },
  "text": "vertical, ten seconds, and do not enhance my prompt"
}
```

Expected semantic result:

```json
{
  "status": "ok",
  "changes": {
    "aspect": "9:16",
    "durationSeconds": 10,
    "enhance": false
  },
  "conflictFields": [],
  "unhandledMeaning": false
}
```

Only changed or explicitly reaffirmed settings belong in `changes`. Unmentioned settings must be omitted.

## Research sequence

1. Run the baseline unchanged.
2. Save and inspect failures by category.
3. Identify whether failures come from semantics, schema adherence, copying, or benchmark ambiguity.
4. Correct genuinely ambiguous/incorrect gold cases before prompt tuning.
5. Test one prompt/schema modification at a time.
6. Re-run the complete suite after each candidate improvement.
7. Report reliable fields and failure modes separately; do not hide them in one aggregate score.

## Completion criteria

This research is complete when it can answer:

- Which core fields are reliable?
- Are corrections and negations reliable?
- What is the false-positive rate on creative prompt text?
- Does the model safely reject conflicts and unsupported values?
- Is there a conservative subset worth a later shadow test?
- Is deterministic `/t2v set` still preferable for every field?

A valid conclusion may be **do not integrate AI**.
