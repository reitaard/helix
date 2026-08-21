# LTX Director installation / validation

**Status:** installation, node loading, and D0 Director-controlled LTX 2.5 generation validated on the local workstation.

Keep this file compact. It records only steps and fixes that were actually required on this machine.

## Confirmed local layout

ComfyUI Desktop is split across two locations:

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

Important rule: **install custom nodes under the active base directory, not beside the Desktop program code.**

## Confirmed install recipe

Stop ComfyUI, then run PowerShell:

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI\custom_nodes

git clone https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git
git clone https://github.com/kijai/ComfyUI-KJNodes.git

& "C:\Users\MSP-PC\Documents\ComfyUI\.venv\Scripts\python.exe" -m pip install -r .\ComfyUI-KJNodes\requirements.txt
```

The active ComfyUI version then failed before custom-node loading with:

```text
ImportError: cannot import name 'ColorPrimaries' from 'av.video.reformatter'
```

Working fix:

```powershell
& "C:\Users\MSP-PC\Documents\ComfyUI\.venv\Scripts\python.exe" -m pip install --upgrade "av>=16.0.0"
```

Restart ComfyUI and confirm these nodes exist:

```text
LTX Director
LTX Director Guide
```

## What was not required

A separate `ComfyUI-LTXVideo` custom-node installation was **not required** for the validated D0 path on this workstation.

Do not add it unless a later Director feature or real runtime error proves it is needed.

## LTX 2.5 workflow adaptation

The upstream Director distilled example still contains LTX 2.3-era assets, so it is used as a **topology reference**, not copied as the final local workflow.

The validated local path keeps the existing LTX 2.5 stack:

- LTX 2.5 22B distilled INT8 ConvRot transformer;
- Gemma 4 12B LTX 2.5 text encoder;
- BF16 video VAE;
- BF16 audio VAE;
- LTX 2.5 BF16 x2 latent spatial upscaler;
- existing two-stage sampler/decode path.

## Critical local runtime rule

Do not leave Director width/height at zero when using a large source image.

First attempt inherited the 3200x1800 source and logged:

```text
Auto-generated LTXV latent: 3168x1792, 193 pixel frames
```

That caused extreme shared-memory/RAM pressure.

Validated D0 settings:

```text
Director custom_width: 1280
Director custom_height: 704
resize_method: maintain aspect ratio
divisible_by: 32
duration: 8 s
fps: 24
```

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
D0 Director generation: PASS
D0 output: LTX-2.5_i2v_00017_.mp4
D0 generation time: ~403.6 s / 6m43s
D0 output target: 1280x704 @ 24 fps, ~8 s
D1 Prompt Relay: PENDING
Pinned WhatDreamsCost commit: PENDING
Pinned KJNodes commit: PENDING
```

Pin exact dependency commits before treating this as a stable Production deployment recipe.
