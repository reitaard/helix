# LTX Director installation / validation

**Status:** installation and node loading validated on the local LTX 2.5 workstation. Director-controlled generation is still pending.

Keep this file compact. The final recipe should contain only steps that were actually required on this machine.

## Confirmed local layout

ComfyUI Desktop is split across two locations on this workstation:

```text
Program/code:
C:\Users\MSP-PC\AppData\Local\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI

Active base directory:
C:\Users\MSP-PC\Documents\ComfyUI

Active custom nodes:
C:\Users\MSP-PC\Documents\ComfyUI\custom_nodes

Active Python venv:
C:\Users\MSP-PC\Documents\ComfyUI\.venv
```

The important rule is: **install custom nodes under the active base directory, not beside the Desktop program code.** ComfyUI's `--base-directory` changes the default `custom_nodes`, input, output, user, and model paths.

## Confirmed install recipe

Stop ComfyUI first, then run PowerShell:

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI\custom_nodes

git clone https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git
git clone https://github.com/kijai/ComfyUI-KJNodes.git

& "C:\Users\MSP-PC\Documents\ComfyUI\.venv\Scripts\python.exe" -m pip install -r .\ComfyUI-KJNodes\requirements.txt
```

On this workstation ComfyUI then failed before custom-node loading with:

```text
ImportError: cannot import name 'ColorPrimaries' from 'av.video.reformatter'
```

Current ComfyUI requires PyAV 16 or newer. The working fix was:

```powershell
& "C:\Users\MSP-PC\Documents\ComfyUI\.venv\Scripts\python.exe" -m pip install --upgrade "av>=16.0.0"
```

After restarting ComfyUI, both nodes were visible:

```text
LTX Director
LTX Director Guide
```

## What was not required so far

A separate `ComfyUI-LTXVideo` custom-node installation has **not** been required on this workstation to load the current Director nodes or the native LTX 2.5 workflow.

Upstream README text still tells users to update `ComfyUI-LTXVideo`, but the current Director code imports LTX support from ComfyUI core (`comfy_extras.nodes_lt`) and the local node-loading test succeeded without a separate LTXVideo folder.

Do not add that dependency unless a real runtime feature/error proves it is required.

## Important correction from the first install attempt

The nodes were initially cloned into:

```text
C:\Users\MSP-PC\AppData\Local\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI\custom_nodes
```

ComfyUI did not scan that directory because the active base directory is `C:\Users\MSP-PC\Documents\ComfyUI`.

Moving the two repositories into the active `Documents\ComfyUI\custom_nodes` directory fixed discovery.

## Workflow adaptation note

Upstream `example_workflows/LTX_Director_2_Workflow_Distilled.json` still references LTX 2.3 assets. We use it only as the Director topology reference.

The local D0 path keeps the already-working LTX 2.5 stack:

- LTX 2.5 22B distilled INT8 ConvRot transformer;
- Gemma 4 12B LTX 2.5 text encoder;
- BF16 video VAE;
- BF16 audio VAE;
- LTX 2.5 BF16 x2 latent spatial upscaler;
- the existing two-stage LTX 2.5 sampler/decode path.

## Validation record

```text
Date: 2026-08-21
Node loading: PASS
LTX Director visible: PASS
LTX Director Guide visible: PASS
ComfyUI-KJNodes installed: PASS
Separate ComfyUI-LTXVideo installed: NO
PyAV fix required: av>=16.0.0
Known-good native LTX 2.5 workflow preserved: YES
D0 Director workflow built: YES
D0 Director generation: PENDING
Pinned WhatDreamsCost commit: PENDING
Pinned KJNodes commit: PENDING
First successful Comfy prompt id/output: PENDING
```

After D0 generation succeeds, add only the exact working workflow/version and prompt/output record here.
