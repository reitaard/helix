# Infrastructure

Infrastructure should be introduced to support proven system needs rather than to mirror a speculative architecture diagram.

As of 2026-08-22, one infrastructure component is now validated: a dedicated local ComfyUI GPU worker for Production execution.

## Dedicated ComfyUI GPU worker

Purpose:

```text
Helix / n8n
    ↓
future ComfyAdapter
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

One early CLI generation stalled at `Requested to load CausalDiffusionVAE`. The old Desktop log showed that the same VAE normally loads in roughly one second and the full comparable generation completed in about 182 seconds. The stalled process was interrupted, ComfyUI was fully restarted, and an LM Studio `llama-server.exe` process sharing the RTX 4060 was stopped. Subsequent generations completed successfully. Treat this as a transient runtime/GPU-state incident unless it becomes reproducible.

### Operational rules

1. Keep ComfyUI Desktop installed but normally closed for now. Desktop used port `8000`; the production CLI worker uses `8188`.
2. Avoid running Desktop ComfyUI and the CLI worker simultaneously because they compete for the same 8 GB RTX 4060 and system RAM.
3. Avoid other GPU inference workloads such as LM Studio while validating or running heavy LTX jobs on this worker.
4. Do not auto-update the worker. This stack has known compatibility-sensitive pins.
5. Before any update, record the current git commit and `pip freeze`, update deliberately, run `pip check`, and execute a known LTX smoke generation.
6. Keep generation workflows as ComfyUI/API JSON execution assets. Helix code should modify inputs and submit graphs rather than rewrite Comfy graphs as Python.
7. The future `ComfyAdapter` should normalize ComfyUI into a provider-neutral asynchronous contract similar to `submit -> job id -> progress/status -> artifact + metadata`.

## Remaining infrastructure concerns

Future concerns still include durable state, evidence/experiment databases, object storage, queues, retries, observability, cost accounting, media retention, and secure remote worker access.

The current priority remains system boundaries and Intelligence/Director/Experiment design. The GPU worker is a validated Production execution primitive, not a reason to expand infrastructure speculatively.