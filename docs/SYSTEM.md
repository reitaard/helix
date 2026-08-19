# Helix System Outline

> Candidate future system shape. This document is intentionally provisional.

## Objective

Build a reliable system that can coordinate many original short-form video experiments, produce media through interchangeable backends, publish through supported platform workflows, collect performance data, and use the data to improve later creative decisions.

## Candidate long-term loop

```text
Topic / niche inputs
      ↓
Idea + hook generation
      ↓
Script / shot planning
      ↓
Asset + video production
      ↓
Quality control
      ↓
Publishing queue
      ↓
Platform analytics
      ↓
Experiment scoring
      ↓
Variant generation
      ↺
```

## Components we may need later

These are design candidates, not commitments:

- planning/director layer;
- niche and trend inputs;
- hook/script/shot planning;
- reusable media/reference asset management;
- provider/model router;
- asynchronous generation job API;
- worker queue and GPU/hosted generation workers;
- object storage for media;
- publishing adapters;
- analytics ingestion;
- experiment/project database;
- scoring and iteration logic;
- Reitaard app interface;
- n8n orchestration where it remains the simplest fit.

## Preparation boundary

Before implementing the larger architecture, Helix should first standardize the interfaces between the pieces we already know we will touch:

```text
request
  → create job
  → receive provider task id
  → poll/receive status
  → normalize result
  → store output metadata
  → hand off to next workflow stage
```

The existing asynchronous Runway/n8n pattern is the first concrete workflow pattern to preserve. Other providers or self-hosted workers should eventually fit the same normalized contract where practical.

## Model/provider strategy

No video model or provider is selected as the permanent default. Open-weight, self-hosted, rented-GPU, and hosted API options remain candidates. Selection will depend on measured quality, latency, controllability, reliability, hardware requirements, and cost for the actual Helix workload.

## Principle

Prefer stable contracts and replaceable components over committing the system to one model vendor too early.
