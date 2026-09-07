# Helix FaceFusion Worker

Source-controlled Windows-side HTTP worker for Helix FaceFusion. It wraps the existing native FaceFusion installation; it does **not** modify or upgrade `C:\AI\FaceFusion`.

## Production pin

- Worker contract: `0.3.0`
- FaceFusion root: `C:\AI\FaceFusion`
- Pinned FaceFusion commit: `4b1dedb853e4838ca7f3cf70b572be241aee2497`
- FaceFusion Python: `C:\Users\MSP-PC\.conda\envs\facefusion\python.exe`
- Worker Python: `C:\Users\MSP-PC\.conda\envs\helix-facefusion-worker\python.exe`
- Production model: HyperSwap B / `hyperswap_1b_256`
- Tailscale listener: `100.110.21.79:8791`
- Capacity: one active FaceFusion job

## Contract

```text
GET    /v1/health
GET    /v1/readiness
POST   /v1/inputs
DELETE /v1/inputs/{input_id}
POST   /v1/jobs
GET    /v1/jobs/{job_id}
POST   /v1/jobs/{job_id}/cancel
GET    /v1/jobs/{job_id}/artifact
```

Protected routes require `Authorization: Bearer <token>`. The token is loaded from the existing machine-local token file by `start.ps1`; no token belongs in Git.

### Semantic image validation

`POST /v1/inputs` validates the file container and then, for images, invokes `face_probe.py` with the **pinned FaceFusion Python environment**. The probe uses FaceFusion's own `get_static_faces` path, so source/target image face detection follows the pinned FaceFusion detector/config rather than a second detector implementation.

The probe deliberately uses the **CPU execution provider**. Input validation happens before Helix has claimed the shared RTX 4060 execution resource, so face probing must not create unscheduled GPU work.

Image input responses include `faceCount`. Video inputs return `faceCount: null` and are not sampled for faces in V1.

Zero-face images are rejected before a worker input handle is committed:

```json
{"detail":{"code":"no_source_face_detected"}}
```

or

```json
{"detail":{"code":"no_target_face_detected"}}
```

The rejected temporary input is deleted. No FaceFusion generation job is created and no GPU queue slot is consumed.

### Safe structured failures

Failed jobs return only a bounded semantic error code, never raw stderr, Python tracebacks, filesystem paths, or credentials:

```json
{"status":"failed","error":{"code":"processing_failed"}}
```

Known codes are `no_source_face_detected`, `no_target_face_detected`, `face_analysis_failed`, `processing_failed`, `output_missing`, and `worker_restarted`.

Raw subprocess stdout/stderr remain local under the job directory for operator diagnosis.

## Settings owned by the worker

The worker fixes:

```text
processors = face_swapper
face-swapper-model = hyperswap_1b_256
execution-providers = cuda
```

Optional validated settings are limited to FaceFusion V1 capabilities: selector mode, reference position, pixel boost, swapper weight, and output image/video quality. Arbitrary model/provider/CLI selection is rejected.

## Windows install/update

The repository copy is the canonical source. Sync this directory to:

```text
C:\AI\helix-facefusion-worker
```

Install/update the worker environment only as needed:

```powershell
conda activate helix-facefusion-worker
pip install -r requirements.txt
python -m unittest discover -s tests -v
```

Do not install these packages into the FaceFusion environment and do not edit the FaceFusion repository.

The scheduled task can continue to invoke `start.ps1` as SYSTEM/highest at startup.

## 0.2.0 -> 0.3.0 deployment order

This is a wire-contract bump. Do not deploy runtime 0.3.0 against worker 0.2.0.

1. Verify no active FaceFusion job.
2. Back up `C:\AI\helix-facefusion-worker`.
3. Sync this worker directory and restart only `Helix FaceFusion Worker`.
4. Verify `/v1/health` reports `0.3.0`, readiness is true, auth works, and source/target image face rejection works.
5. Set VPS `HELIX_FACEFUSION_WORKER_REVISION=0.3.0`.
6. Rebuild/recreate only `helix-runtime` from the matching branch revision.
7. Run private/forum smoke tests and the shared Comfy↔FaceFusion GPU serialization test.

During the short version mismatch, the old runtime should treat FaceFusion as unavailable rather than dispatching through an unverified contract.

## Out of scope for 0.3.0

- video face sampling/validation
- visual multi-face selection
- Telegram Reference mode
- real progress percentages
- worker TTL/garbage collection
- model changes
