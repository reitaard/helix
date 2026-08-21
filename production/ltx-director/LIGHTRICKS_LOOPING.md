# Lightricks ComfyUI-LTXVideo / Looping Sampler

**Status:** selected for local comparison against the proven CGlide baseline.  
**Upstream:** `https://github.com/Lightricks/ComfyUI-LTXVideo`

## Why this is being tested

The first CGlide two-chunk continuation proved that long-scene handoff is viable, but two limitations remain visible:

- the seam is not fully smooth in motion/camera velocity;
- the later chunk may lose some realism/detail.

The official Lightricks `LTXVLoopingSampler` attacks this problem differently. Rather than starting each continuation from a single still, it divides a long latent into overlapping temporal tiles and extends later tiles from the preceding temporal context.

Direct upstream documentation exposes:

```text
temporal_tile_size
temporal_overlap
temporal_overlap_cond_strength
cond_image_strength
adain_factor
optional_positive_conditionings
optional_negative_index_latents
optional_normalizing_latents
```

Later temporal tiles use `LTXVExtendSampler`. The official docs specifically recommend temporal overlap and overlap conditioning for long-video continuity, and AdaIN-style normalization is available to reduce accumulated oversaturation/statistic drift.

## Safe local install

This package can be installed alongside the current CGlide 2.5 Director because it registers a different Lightricks node family. For the standalone Lightricks comparison, CGlide nodes simply remain unused in the test graph.

Stop ComfyUI first.

### Option A — direct Git clone (preferred for reproducible testing)

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI\custom_nodes
git clone https://github.com/Lightricks/ComfyUI-LTXVideo.git
```

Install the repository requirements into the **active ComfyUI venv**:

```powershell
& "C:\Users\MSP-PC\Documents\ComfyUI\.venv\Scripts\python.exe" -m pip install -r .\ComfyUI-LTXVideo\requirements.txt
```

Current upstream `requirements.txt` includes:

```text
diffusers
einops
huggingface_hub>=0.25.2
kornia
ninja~=1.11.1.4
transformers[timm]>=4.50.0
```

Restart ComfyUI after installation.

### Option B — ComfyUI Manager

Upstream also recommends Manager -> Install Custom Nodes -> search `LTXVideo` -> Install -> restart.

For Helix workstation notes, prefer the direct clone because the exact folder and git revision are easier to inspect/pin later.

## First node verification

After restart, search for these nodes:

```text
LTXV Looping Sampler
STG Guider Advanced
LTXV Multi Prompt Provider
```

The Lightricks package prefixes display names with its LTX marker in current builds, so searching the distinctive words `Looping Sampler`, `STG Guider Advanced`, and `Multi Prompt Provider` is safest.

The exact registered classes are:

```text
LTXVLoopingSampler
STGGuiderAdvanced
LTXVMultiPromptProvider
```

For the first JSON handoff to Helix, place those three nodes in the workflow without connecting them. Existing native Comfy/LTX model, VAE, sampler, noise, sigma and latent nodes can be reused or adapted after the exported graph is inspected.

## Important hardware caveat

The upstream README lists a much larger nominal GPU requirement than the current workstation. That does not automatically rule this test out because the local machine has already run LTX 2.5 with quantized weights, DynamicVRAM/offload and two-stage generation on an 8 GB RTX 4060.

However, the LoopingSampler comparison must be treated as an empirical local test. Do not assume official high-VRAM examples will fit unchanged.

Initial rules:

- keep one spatial tile (`horizontal_tiles=1`, `vertical_tiles=1`);
- preserve the already-working quantized/offloaded model path where possible;
- avoid adding IC-LoRA for B0/B1;
- keep resolution near the validated 1280x704 target / legal LTX latent size;
- use sequential temporal processing rather than increasing spatial complexity.

## Validation sequence

### B0 — package + graph smoke

Goal: prove the nodes load and can be wired to the existing LTX 2.5 backend without missing types or immediate memory failure.

Do not target a long video yet.

### B1 — controlled long continuation

Use the same motorcycle benchmark as the CGlide comparison so continuity differences are visible.

Questions:

- Is the transition smoother than the CGlide 8-frame/single-anchor handoff?
- Does camera velocity remain more continuous?
- Does the second temporal region keep detail/realism better?
- Does subject identity remain at least as stable?

Candidate starting controls, to be finalized only after the actual exported JSON is inspected:

```text
spatial tiles: 1 x 1
temporal overlap: roughly 25-30% of the temporal tile
previous-tile conditioning strength: moderate, then tune
AdaIN factor: small non-zero value if color/saturation drift appears
```

Do not freeze exact values before the graph is wired and a smoke run succeeds.

### B2 — longer drift/limit test

Only after B1 passes, extend to enough temporal tiles to expose:

- identity accumulation errors;
- softening/detail loss;
- saturation/contrast drift;
- motion stagnation;
- runtime scaling and memory behavior.

## Relationship to CGlide

For comparison purposes:

```text
CGlide only
  = Director + single-anchor chunk continuation + writer/assembler

Lightricks only
  = temporal-overlap continuation inside the sampler

Hybrid
  = CGlide-style high-level control mapped into Lightricks temporal continuation, only if useful
```

Do not build the hybrid before the Lightricks-only behavior is measured.
