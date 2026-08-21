# LTX Director installation / validation

Status: installation on the local LTX 2.5 workstation has not yet been validated. This file intentionally separates upstream requirements from the compact checklist we will keep after validation.

## Upstream project

Repository: `WhatDreamsCost/WhatDreamsCost-ComfyUI`

Before installing, confirm the current upstream README because the project is actively changing around LTX 2.5 support.

## Planned local validation

1. Back up / preserve the currently working native LTX 2.5 ComfyUI workflow.
2. Install WhatDreamsCost-ComfyUI under the active ComfyUI `custom_nodes` directory.
3. Update/install the dependencies explicitly required by the upstream project, especially ComfyUI-LTXVideo and ComfyUI-KJNodes if the current README still requires them.
4. Restart ComfyUI and confirm the WhatDreamsCost / LTX Director nodes load without import errors.
5. Import a Director workflow and replace/update model selectors to use the already installed LTX 2.5 models rather than downloading duplicate model copies where possible.
6. Run a minimal one-image, one-prompt generation before enabling Prompt Relay, additional keyframes, IC-LoRA, retake, extension, or custom audio.
7. Record the exact working node versions, install commands, model mapping, and any fixes below. Remove steps that were unnecessary.

## Confirmed local recipe

_Not populated yet._

Only commands and fixes that actually work on the local system should be kept here after the first successful generation. This section is intended to become the short reinstall/recovery checklist.

## Validation record

Record after the first success:

```text
Date:
ComfyUI version/commit:
WhatDreamsCost-ComfyUI version/commit:
ComfyUI-LTXVideo version/commit:
ComfyUI-KJNodes version/commit:
LTX model files used:
Workflow file/version:
Install commands that were actually required:
Local fixes:
First successful prompt id/output:
```
