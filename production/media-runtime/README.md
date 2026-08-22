# Helix Media Runtime

Provider-neutral Production control plane for media execution.

## Current checkpoint

Read-only worker discovery and health validation are operational.

Current path:

    Helix / n8n
        ↓
    helix-runtime
        ↓
    Worker Registry
        ↓
    Adapter layer
        ↓
    Comfy transport
        ↓
    GPU worker

## Current worker

- ID: `helix-rtx4060-01`
- Profile: `comfy-video-ltx-stable`
- Adapter: `comfy`
- Capability: `video.i2v`
- GPU: RTX 4060
- LTX 2.3: available
- LTX 2.5: available and validated

## Current API

- `GET /v1/health`
- `GET /v1/workers`
- `GET /v1/workers/:workerId`
- `GET /v1/workers/:workerId/health`

Current worker health checks:

- `/system_stats`
- `/queue`
- `/object_info`
- `/ws`

Passing these checks produces `cold_ready`.

`ready` is reserved for a later versioned production canary.

## Runtime stack

- TypeScript
- Fastify
- Zod
- ws
- Node 24 production container
- strict TypeScript
- multi-stage Docker build

## Deliberately deferred

- workflow packages
- semantic bindings
- prompt submission
- cancellation
- artifacts
- scheduler
- durable jobs
- production canaries
