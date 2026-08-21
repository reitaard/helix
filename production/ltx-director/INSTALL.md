# LTX Director installation / validation

Status: not yet validated on the local LTX 2.5 workstation. Keep this file short; after the first successful generation, replace the planned section with only the commands/fixes that actually worked.

## Upstream requirements

Current upstream README (`WhatDreamsCost/WhatDreamsCost-ComfyUI`) says to:

1. install the repository under `ComfyUI/custom_nodes` by cloning it, or install it through ComfyUI Manager;
2. if Manager does not show the current release, use the nightly/current listing;
3. update `ComfyUI-LTXVideo` to the latest version — upstream marks this as required;
4. update `ComfyUI-KJNodes` to the latest version;
5. restart ComfyUI and use the example workflows from the upstream `example_workflows/` folder.

Upstream clone command:

```powershell
git clone https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git
```

## Planned install on this workstation

The active ComfyUI root is expected to be:

```text
C:\Users\MSP-PC\Documents\ComfyUI
```

From PowerShell:

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI\custom_nodes
git clone https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git
```

Then update the two required dependencies using ComfyUI Manager if they are already Manager-managed. Do not blindly reinstall them into a second location. First confirm where the active `ComfyUI-LTXVideo` and `ComfyUI-KJNodes` folders live, update those copies, restart ComfyUI, and inspect startup output for import errors.

## Workflow note

The upstream example folder currently contains `LTX_Director_2_Workflow_Distilled.json`, but that workflow still references LTX 2.3 assets such as the 2.3 spatial upscaler. Use it as the Director/timeline reference, not as the final LTX 2.5 workflow. The first local task is to keep the Director plumbing and adapt the generation side to the already-working LTX 2.5 stack.

## Validation sequence

1. Preserve the currently working native LTX 2.5 workflow; do not modify it.
2. Install WhatDreamsCost-ComfyUI.
3. Update the active ComfyUI-LTXVideo and ComfyUI-KJNodes copies.
4. Restart ComfyUI.
5. Confirm `LTX Director` and `LTX Director Guide` nodes are available.
6. Import `LTX_Director_2_Workflow_Distilled.json` only as a reference/base for Director wiring.
7. Adapt its model/generation side to the LTX 2.5 models already installed locally rather than downloading duplicate 2.3 assets.
8. Run the smallest baseline: one image, one global/local prompt segment, no IC-LoRA, no retake, no extension, no custom audio.
9. Record exact versions/commits and any local changes once that generation succeeds.

## Confirmed local recipe

_Not populated yet._

After validation this should become the compact reinstall/recovery recipe and contain only proven steps.

## Validation record

```text
Date:
ComfyUI version/commit:
WhatDreamsCost-ComfyUI version/commit:
ComfyUI-LTXVideo version/commit:
ComfyUI-KJNodes version/commit:
LTX 2.5 model files used:
Workflow file/version:
Install/update commands actually required:
Local fixes:
First successful Comfy prompt id/output:
```
