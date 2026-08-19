# Preparation Plan

This is the active workstream before the larger Helix build.

## 1. Preserve working workflows

For every useful n8n workflow, keep a sanitized export plus a short note containing:

- purpose;
- trigger;
- external providers;
- required environment variables/credentials by name only;
- input schema;
- output schema;
- task/status lifecycle;
- known failure modes;
- which data must persist outside n8n.

The first baseline is the current asynchronous video generation pattern:

```text
manual/app trigger
  → generation request
  → provider task id
  → task monitor
  → completed media URL / failure
```

## 2. Define common job metadata

Minimum candidate fields:

```text
job_id
project_id
provider
operation
provider_task_id
status
attempt
created_at
started_at
completed_at
input_asset_ids[]
output_asset_ids[]
request_metadata
provider_metadata
error_code
error_message
```

This is a draft contract and can change before the first service is implemented.

## 3. Define normalized statuses

Candidate state machine:

```text
queued
submitted
running
succeeded
failed
cancelled
```

Provider-specific statuses should be stored separately so we do not lose debugging detail.

## 4. Prepare configuration

Keep real credentials outside git. Add only variable names and local setup guidance. Likely categories include:

- n8n;
- provider APIs;
- database;
- object storage;
- queue/cache;
- platform publishing/analytics credentials;
- application authentication.

## 5. Decide persistence boundaries

Before adding many workflows, decide where each kind of state should live:

- n8n execution state;
- durable job/project state;
- media objects;
- analytics/events;
- provider metadata;
- experiment lineage.

## 6. Add code only when a boundary is clear

The first custom service should solve a concrete limitation rather than exist because the future architecture may need microservices. Likely triggers include durable job state, provider normalization, media ownership, or API access from Reitaard.
