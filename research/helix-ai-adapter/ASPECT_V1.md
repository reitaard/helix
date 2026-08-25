# Aspect V1 Observation

**Run:** 2026-08-25  
**Git commit:** `92181a9c50b88bb98c46e42065495ea976b849cc`  
**Model:** `helix-qwen3-0.6b` (Qwen3 0.6B Q8_0)  
**Operation:** `interpretAspect(text) -> {matched, value}`  
**Fixture:** `cases/aspect-v1.json` (43 cases; SHA-256 `42f590a1e67cf2bd812d2c15fd8b126b93e0545c1fc5e3a9ee672f4bd4285ad7`)  
**Prompt/schema:** `interpret-aspect-v1`

## Result

```text
Exact accuracy:       26/43 (60.5%)
Schema validity:      100.0%
Match precision:      59.3%
Match recall:         64.0%
Negative false pos.:   8/18 (44.4%)
Latency p50 / p95:    664 / 1323 ms
```

| Category | Exact |
|---|---:|
| Exact supported ratios | 8/8 (100.0%) |
| Vertical / portrait | 0/4 (0.0%) |
| Landscape / widescreen | 2/4 (50.0%) |
| Square / ultrawide | 2/4 (50.0%) |
| Corrections / negation | 5/6 (83.3%) |
| Creative-text distractors | 4/8 (50.0%) |
| Conflicts | 2/4 (50.0%) |
| Unsupported language | 3/5 (60.0%) |

## Failure pattern

The reduced output contract eliminates the V1 full-settings copying failure, but it does not make aspect interpretation safe:

- all vertical/portrait aliases were wrong or missed; three were mapped to `1:1`;
- creative scene text mentioning portrait, widescreen, or a `16:9` monitor produced aspect matches;
- two conflicting requests produced a fabricated supported ratio or retained the first value;
- unsupported ratios were silently coerced (`4:5` to `4:3`, `2.39:1` to `2:3`).

This misses the research gates for no-settings false positives (<=2%), corrections/negation (>=90%), conflict detection (>=90%), and unsupported rejection (>=95%). Exact-ratio recognition alone is insufficient because a later parser must distinguish setting instructions from prompt text and reject unsafe requests.

## Decision

Aspect does **not** qualify as a shadow candidate. Per the decomposition plan, quality, duration, and enhancement will not be tested or recombined from this result. T2V mode inference remains a separate, untested experiment. No AI integration is recommended from V1 or Aspect V1.

The raw run is local only under `results/aspect-v1-20260825T045213Z.json`.
