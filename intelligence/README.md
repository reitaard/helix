# Intelligence

This is the next major Helix design area after preparation.

## Purpose

Turn a niche and its observable content environment into structured, queryable, evidence-aware knowledge that the Director can use.

## Candidate subareas

```text
intelligence/
├── niche/
├── discovery/
├── ingestion/
├── features/
├── clustering/
└── trends/
```

These folders are conceptual until implementation requires them.

## Initial questions

- How is a niche represented?
- What is a source versus an observation versus an inference?
- What content/examples should be sampled?
- Which creative/performance features can be extracted reliably?
- How should trends decay over time?
- How do we represent evergreen formats separately from temporal topics?
- How do we measure saturation and novelty without pretending uncertain estimates are facts?
- What minimum `NicheModel` does the Director need?

## Output

The working output concept is `NicheModel`, with provenance and uncertainty preserved. Schema is not yet finalized.