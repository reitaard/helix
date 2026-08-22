# Infrastructure

Infrastructure should be introduced to support proven system needs rather than to mirror a speculative architecture diagram.

As of 2026-08-22, one infrastructure component is now validated: a dedicated local ComfyUI GPU worker for Production execution.

## Dedicated ComfyUI GPU worker

Purpose:

```text
Helix / n8n
    ↓
future Helix Runtime
    ↓
ComfyAdapter
    ↓
ComfyUI HTTP/WebSocket API
    ↓
Dedicated Windows GPU worker
    ↓
Media artifact
```

The worker is execution infrastructure only. It must not leak ComfyUI-specific graph details into Intelligence, Director, or Experiment Engine contracts.

### Current machine/runtime

- OS: Windows
- GPU: NVIDIA GeForce RTX 4060
- VRAM: 8188 MiB
- system RAM: about 32 GB
- ComfyUI: `0.33.0`
- Python: `3.12.11`
- PyTorch: `2.10.0+cu130`
- CUDA build used by PyTorch: `13.0`
- deploy environment reported by ComfyUI: `local-git`
- production API port: `8188`
- listen address: `0.0.0.0`

The machine has one CUDA device exposed to PyTorch: `cuda:0 NVIDIA GeForce RTX 4060`. Windows "shared GPU memory" is system RAM used through WDDM/offloading; it is not a second GPU.

### Filesystem layout

```text
C:\AI\ComfyUI-CLI\
├── .venv\                 # standalone ComfyUI Python environment
├── custom_nodes\
├── user\
├── input\
├── output\
└── extra_model_paths.yaml

C:\AI\ComfyWorker\.venv\  # comfy-cli management environment
C:\AI\start-comfy.ps1      # permanent worker launcher

C:\AI\HelixWorker\
├── config\worker.yaml      # Helix-facing worker identity/profile
├── scripts\               # endpoint/WebSocket diagnostics
├── inventory\             # frozen environment/node/task snapshots
├── logs\
└── state\

C:\ComfyMigrationBackup\   # migration/recovery backup
```

The migration backup currently preserves:

```text
C:\ComfyMigrationBackup\user\
C:\ComfyMigrationBackup\custom_nodes\
C:\ComfyMigrationBackup\inventory\pip-freeze.txt
C:\ComfyMigrationBackup\inventory\custom-nodes.csv
C:\ComfyMigrationBackup\config\desktop-model-paths.yaml
```

Do not delete this backup until the standalone worker has been stable for a sustained period and rollback is no longer needed.

### Worker identity/profile

The worker is identified to Helix as:

```text
workerId: helix-rtx4060-01
profile: comfy-video-ltx-stable
runtime: comfy
capability: video.i2v
max concurrent GPU jobs: 1
```

Model availability and validation are kept distinct. The worker currently records LTX `2.3` and `2.5` as available model-family versions, while LTX `2.5` is the validated standalone execution path. Availability must not be interpreted as production validation.

Stable tool names should describe intent (`video.i2v`, later `image.generate`, `image.edit`, etc.). Model family/version and workflow implementation are separate routing concerns beneath the tool contract.

### Frozen worker inventory

The known-good worker snapshot is stored locally under `C:\AI\HelixWorker\inventory` and currently includes:

```text
comfy-commit.txt
custom-nodes.txt
gpu.txt
pip-freeze.txt
scheduled-task.xml
node-classes.txt
```

The captured node inventory currently contains 1219 registered ComfyUI node classes. This gives Helix a baseline for later compatibility/readiness checks.

### Model storage

The CLI worker currently reads models from two external roots through `C:\AI\ComfyUI-CLI\extra_model_paths.yaml`:

1. Desktop-owned shared models:
   `C:\Users\MSP-PC\AppData\Local\Comfy-Desktop\ComfyUI-Shared\models`
2. Existing independent WAN models:
   `C:\ComfyUI\models`

Important consequence: ComfyUI Desktop may remain installed and closed as a fallback, but it should not be uninstalled until the Desktop-owned shared model directory has been moved to an independent location and `extra_model_paths.yaml` has been updated. The CLI worker does not require the Desktop application to be running.

### Pinned known-good code state

ComfyUI core:

```text
7dde56176efa71fd74ef7b3930ab5882d1926288
```

Custom nodes:

```text
ComfyUI-KJNodes
3f20054214fec9f9234fd3841ae6f1e4287948f6

ComfyUI-LTXVideo
15d09abb5a187a8dcaea2fc31fe51ee96e6c9d0d

CGlide/LTX-2.5-Director
17aa8bc3e6dcebb8ebcd7265a04f3750c12ee1d7
```

Important compatibility pins discovered during migration:

```text
torch==2.10.0+cu130
torchvision==0.25.0+cu130
torchaudio==2.10.0+cu130
kornia==0.8.2
kornia_rs==0.1.10
transformers==5.0.0
diffusers==0.40.0
einops==0.8.2
ninja==1.11.1.4
```

A newer Kornia (`0.8.3`) broke the LTXVideo import because `kornia.geometry.transform.pyramid.pad` was unavailable in the expected form. Pinning back to `0.8.2` restored the node pack.

Triton is intentionally not installed at this stage. KJNodes therefore logs that `PatchTritonVAE` is unavailable, but KJNodes, LTXVideo, LTX 2.5 Director, and normal VAE operation all load successfully. The previous working Desktop environment also had no Triton, so Triton should be treated as a later performance experiment rather than a migration requirement.

### Startup / service behavior

Windows Task Scheduler contains:

```text
Task name: Helix ComfyUI Worker
Trigger: AtStartup
Account: SYSTEM
Run level: Highest
Restart on failure: 1 minute
```

The task launches `C:\AI\start-comfy.ps1`, which starts `C:\AI\ComfyUI-CLI\main.py` directly on port `8188`.

The task has been manually started successfully and the ComfyUI browser reconnected to the worker. The `AtStartup` behavior has not yet been verified by an actual Windows reboot; that remains a pending operational check.

Useful health endpoint:

```text
GET http://127.0.0.1:8188/system_stats
```

Expected ComfyUI API surfaces for the later adapter include:

```text
GET  /system_stats
GET  /queue
GET  /history
GET  /object_info
POST /prompt
GET  /history/{prompt_id}
GET  /view
WS   /ws
```

### Validation status

The standalone CLI migration is considered operationally successful:

- standalone server starts and exposes the API;
- RTX 4060 is detected correctly;
- model roots are visible;
- KJNodes loads;
- ComfyUI-LTXVideo loads;
- CGlide LTX 2.5 Director loads;
- restored workflows are available under the new user directory;
- native LTX 2.5 generation has completed successfully multiple times after migration;
- output is written under `C:\AI\ComfyUI-CLI\output`.

Read-only execution-interface validation has also passed:

- local worker `GET /system_stats`;
- local worker `GET /queue`;
- local worker `GET /history`;
- local worker `GET /object_info` with 1219 registered classes;
- local worker WebSocket `/ws` connection and initial status event;
- remote Windows main-PC HTTP access over Tailscale;
- remote Windows main-PC WebSocket access over Tailscale;
- VPS-host HTTP access over Tailscale;
- VPS-host WebSocket access over Tailscale;
- an existing n8n Docker container on the VPS can reach the worker through the same private path.

No generation was required for these connectivity tests.

One early CLI generation stalled at `Requested to load CausalDiffusionVAE`. The old Desktop log showed that the same VAE normally loads in roughly one second and the full comparable generation completed in about 182 seconds. The stalled process was interrupted, ComfyUI was fully restarted, and an LM Studio `llama-server.exe` process sharing the RTX 4060 was stopped. Subsequent generations completed successfully. Treat this as a transient runtime/GPU-state incident unless it becomes reproducible.

## VPS control-plane checkpoint

The live VPS has been validated as the future Helix control-plane host. Current relevant host capabilities include Ubuntu 24.04 LTS, Docker/Compose, Tailscale, Caddy, n8n, and existing unrelated PostgreSQL/Redis services.

A temporary container named `helix-probe` is running on localhost port `8787`. Its only purpose is to prove the future control-plane path:

```text
n8n
  ↓
helix-probe
  ↓
VPS private/Tailscale route
  ↓
helix-rtx4060-01
  ↓
ComfyUI HTTP + WebSocket
```

The probe successfully performs HTTP health/queue requests and establishes a ComfyUI WebSocket from inside its Node container. n8n can call the probe across the existing private Docker network. The probe is temporary and should be replaced by the real `helix-runtime`; it must not accumulate production responsibilities.

The probe remains bound to `127.0.0.1:8787` and is not exposed through Caddy. Raw ComfyUI is also not intended to become a public Internet endpoint.

## Runtime / adapter boundary

The current Production execution direction is:

```text
Project / Agent
      ↓
Tool or capability
      ↓
Helix Runtime
      ├── worker registry
      ├── scheduler
      ├── durable jobs/events
      ├── artifact/lineage services
      └── adapters
            └── ComfyAdapter
                  ↓
               ComfyUI
```

The adapter is a layer, not the whole runtime. `ComfyAdapter` should remain deliberately small and normalize backend transport such as HTTP, WebSocket events, queue/history reconciliation, cancellation, and artifact retrieval. Helix owns worker identity, job IDs, scheduling, workflow/tool routing, durable state, and project/asset lineage.

The next runtime checkpoint should be a read-only `helix-runtime` shell with a generic Comfy transport and worker registry. Workflow graph design, semantic node bindings, and `/prompt` generation submission can wait until the currently tested LTX workflow is ready to be frozen.

## Operational rules

1. Keep ComfyUI Desktop installed but normally closed for now. Desktop used port `8000`; the production CLI worker uses `8188`.
2. Avoid running Desktop ComfyUI and the CLI worker simultaneously because they compete for the same 8 GB RTX 4060 and system RAM.
3. Avoid other GPU inference workloads such as LM Studio while validating or running heavy LTX jobs on this worker.
4. Do not auto-update the worker. This stack has known compatibility-sensitive pins.
5. Before any update, record the current git commit and `pip freeze`, update deliberately, run `pip check`, and execute a known LTX smoke generation.
6. Keep generation workflows as ComfyUI/API JSON execution assets. Helix code should modify inputs and submit graphs rather than rewrite Comfy graphs as Python.
7. The `ComfyAdapter` should normalize ComfyUI into a provider-neutral asynchronous contract rather than exposing node IDs or Comfy-specific event formats to agents/n8n.
8. Keep n8n at the high-level orchestration boundary. It should call Helix tools/runtime APIs rather than poll Comfy every second or parse node execution events.

## Remaining infrastructure concerns

Future concerns still include durable state, evidence/experiment databases, object storage, queues, retries, observability, cost accounting, media retention, and secure remote worker access.

The current priority remains system boundaries and Intelligence/Director/Experiment design. The GPU worker and runtime workstream are validated Production execution primitives, not a reason to let generation infrastructure reshape the upstream Helix brain.

## Helix Media Runtime — Checkpoint 1

Validated on 2026-08-22.

The temporary connectivity probe has been replaced by the real read-only Helix Media Runtime.

Current control path:

    n8n
      ↓
    helix-runtime
      ↓
    Worker Registry
      ↓
    adapter layer
      ↓
    Comfy transport
      ↓
    Tailscale
      ↓
    helix-rtx4060-01
      ↓
    ComfyUI

Validated runtime behavior:

- `helix-runtime` runs in a Node 24 production container;
- TypeScript strict typecheck passes;
- production TypeScript build passes;
- Worker Registry exposes the RTX 4060 worker;
- Comfy transport validates `/system_stats`, `/queue`, `/object_info`, and `/ws`;
- the worker exposes 1219 registered node classes;
- HTTP and WebSocket communication work from the VPS to the Windows worker over Tailscale;
- n8n communicates with the worker through `helix-runtime`;
- canonical runtime port is `127.0.0.1:8787`;
- the temporary `helix-probe` container has been removed.

The current worker state is intentionally `cold_ready`.

`ready` is reserved for a later versioned workflow canary.

The runtime is currently read-only against ComfyUI. Prompt submission, cancellation, workflow bindings, generation jobs, artifacts, and scheduling remain deferred while production workflows are still being tested.

The Comfy transport is intentionally kept below a future provider-neutral adapter boundary:

    MediaAdapter
        ↑
    ComfyAdapter
        ↑
    ComfyClient

Frequent liveness checks should later be separated from expensive readiness/capability checks because `/object_info` is substantially heavier than basic worker health endpoints.

