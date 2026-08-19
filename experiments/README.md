# Experiment Engine

This directory is for the algorithmic testing and evolutionary layer of Helix, not merely a folder of ad-hoc test results.

## Purpose

Convert creative hypotheses into attributable variants, evaluate evidence, and decide what should be preserved, discarded, retested, mutated, or scaled.

## Candidate subareas

```text
experiments/
├── design/
├── scoring/
├── selection/
├── mutation/
└── cohorts/
```

## Required discipline

Every experiment should eventually preserve:

- hypothesis;
- control/base lineage;
- changed variable(s);
- intentionally fixed variables;
- content/asset lineage;
- account/platform/cohort context;
- evaluation window;
- observed metrics;
- production failures separately from audience outcomes;
- uncertainty/confounders;
- conclusion/next action.

Exact scoring and winner-selection algorithms are not decided yet.