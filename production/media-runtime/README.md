# Helix Media Runtime

Execution service currently used to control the dedicated ComfyUI GPU worker.

The immediate goal is narrow: accept a durable job, submit it to ComfyUI, track execution, and return generated asset metadata.

See [`../comfyui-worker/README.md`](../comfyui-worker/README.md) for the focused ComfyUI worker state and roadmap.

## Current deployed path

```text
n8n / caller
    ↓
helix-runtime
    ↓
WorkerService
    ├── helix-db
    ↓
WorkerRegistry
    ↓
MediaAdapter
    ↓
ComfyAdapter
    ↓
ComfyClient
    ↓
helix-rtx4060-01
    ↓
ComfyUI
```

## Current worker

- ID: `helix-rtx4060-01`
- Profile: `comfy-video-ltx-stable`
- Adapter: `comfy`
- Capability: `video.i2v`
- GPU: RTX 4060
- LTX 2.3: available
- LTX 2.5: available and validated
- Max concurrent GPU jobs: 1

## Current API

- `GET /v1/health`
- `GET /v1/workers`
- `GET /v1/workers/:workerId`
- `GET /v1/workers/:workerId/live`
- `GET /v1/workers/:workerId/readiness`
- `GET /v1/workers/:workerId/health` compatibility route

`/live` performs a cheap Comfy runtime probe.

`/readiness` performs the heavier worker validation using:

- `/system_stats`
- `/queue`
- `/object_info`
- `/ws`

Passing full readiness while idle currently produces `cold_ready`. Readiness observations are persisted in the dedicated runtime PostgreSQL database.

## Durable runtime state

Migration `0001_runtime_core.sql` currently creates:

```text
workers
worker_observations
media_jobs
media_job_events
```

Worker registration and readiness history are active. The job tables are present but job submission/execution APIs are the next implementation target.

## Runtime stack

- TypeScript
- Fastify
- Zod
- ws
- PostgreSQL via `pg`
- Node 24 production container
- strict TypeScript
- multi-stage Docker build

## Current execution boundary

```text
MediaAdapter
    ↑
ComfyAdapter
    ↑
ComfyClient
```

`ComfyClient` owns raw Comfy HTTP/WebSocket transport. `ComfyAdapter` should translate Comfy execution into runtime job states rather than exposing Comfy event shapes to callers.

## Next implementation target

The first real runtime-generated asset should use a Comfy API-format workflow graph directly.

Required path:

```text
POST durable job
    ↓
media_jobs + initial event
    ↓
Comfy POST /prompt
    ↓
store prompt_id as backend_job_id
    ↓
track WebSocket/history
    ↓
collect output metadata
    ↓
mark job succeeded
```

For this milestone, do not add a multi-provider scheduler or freeze a large workflow abstraction. The existing LTX graphs are still being tested; a workflow package/binding layer can be added after one graph is selected as the stable API execution baseline.
