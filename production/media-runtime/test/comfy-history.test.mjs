import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectComfyWorkflow,
  parseComfyHistory,
  parseComfyHistoryWithDiagnostics
} from "../dist/adapters/comfy/history.js";

function node(
  classType,
  inputs
) {
  return {
    class_type: classType,
    inputs
  };
}

test("parseComfyHistory returns completed artifacts newest first", () => {
  const workflow = {
    "405:376": node("PrimitiveStringMultiline", { value: "cinematic prompt" })
  };

  const history = {
    old: {
      prompt: [1, "old", workflow, {}, []],
      status: {
        completed: true,
        messages: [["execution_success", { timestamp: 1_700_000_000_000 }]]
      },
      outputs: {
        "10": {
          videos: [
            { filename: "old.mp4", subfolder: "", type: "output" }
          ]
        }
      }
    },
    running: {
      prompt: [2, "running", workflow, {}, []],
      status: { completed: false },
      outputs: {}
    },
    fresh: {
      prompt: [3, "fresh", workflow, {}, []],
      status: {
        completed: true,
        messages: [["execution_success", { timestamp: 1_700_000_100_000 }]]
      },
      outputs: {
        "20": {
          files: [
            { filename: "fresh.mp4", subfolder: "video", type: "output" },
            { filename: "fresh.wav", subfolder: "audio", type: "output" }
          ]
        }
      }
    }
  };

  const items = parseComfyHistory(history);

  assert.equal(items.length, 2);
  assert.equal(items[0].promptId, "fresh");
  assert.equal(items[0].artifacts.length, 2);
  assert.equal(items[0].artifacts[0].filename, "fresh.mp4");
  assert.equal(items[1].promptId, "old");
});

test("inspectComfyWorkflow extracts known LTX settings", () => {
  const workflow = {
    "405:376": node("PrimitiveStringMultiline", { value: "A red car crosses the bridge." }),
    "409": node("ResolutionSelector", { aspect_ratio: "16:9 (Widescreen)", megapixels: 0.9 }),
    "405:362": node("PrimitiveInt", { value: 8 }),
    "405:383": node("PrimitiveBoolean", { value: true }),
    "405:361": node("PrimitiveInt", { value: 24 }),
    "405:339": node("RandomNoise", { noise_seed: 123 }),
    "405:338": node("RandomNoise", { noise_seed: 42 }),
    "405:373": node("CLIPTextEncode", { text: "cartoon" }),
    "405:352": node("KSamplerSelect", { sampler_name: "euler_ancestral" }),
    "405:388": node("LTXVDualCFGGuider", { video_cfg: 1.5 })
  };

  const result = inspectComfyWorkflow(workflow);
  const details = Object.fromEntries(
    result.details.map(item => [item.label, item.value])
  );

  assert.equal(result.workflow, "LTX 2.5 T2V");
  assert.equal(result.prompt, "A red car crosses the bridge.");
  assert.equal(result.promptConfidence, "known");
  assert.equal(details.Aspect, "16:9 (Widescreen)");
  assert.equal(details.Megapixels, "0.9 MP");
  assert.equal(details.Duration, "8s");
  assert.equal(details.Enhance, "ON");
  assert.equal(details.FPS, "24");
  assert.equal(details.Stage1, "123");
  assert.equal(details.Stage2, "42");
  assert.equal(details.Negative, "cartoon");
  assert.equal(details.Sampler, "euler_ancestral");
  assert.equal(details.Guidance, "1.5");
});

test("parseComfyHistory accepts the real Comfy prompt-array image shape", () => {
  const workflow = {
    "76": node("PrimitiveStringMultiline", { value: "A studio portrait." }),
    "77:84": node("PrimitiveInt", { value: 1280 }),
    "77:85": node("PrimitiveInt", { value: 720 }),
    "77:86": node("RandomNoise", { noise_seed: 42 }),
    "77:80": node("KSamplerSelect", { sampler_name: "euler" }),
    "77:90": node("FluxGuidance", { cfg: 1.0 }),
    "77:93": node("Flux2Scheduler", { steps: 4 })
  };
  const history = {
    image_prompt_id: {
      prompt: [7, "image_prompt_id", workflow, { create_time: 1_700_000_000 }, ["78"]],
      outputs: {
        "78": {
          images: [{
            filename: "Flux2-Klein-Distilled_00014_.png",
            subfolder: "",
            type: "output"
          }]
        }
      },
      status: {
        status_str: "success",
        completed: true,
        messages: [["execution_success", { timestamp: 1_700_000_100_000 }]]
      }
    }
  };

  const parsed = parseComfyHistoryWithDiagnostics(history);
  const item = parsed.items[0];
  const inspection = inspectComfyWorkflow(item.workflow);
  const details = Object.fromEntries(
    inspection.details.map(detail => [detail.label, detail.value])
  );

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.diagnostics.raw, 1);
  assert.equal(parsed.diagnostics.completed, 1);
  assert.equal(parsed.diagnostics.outputs, 1);
  assert.equal(parsed.diagnostics.artifacts, 1);
  assert.equal(item.promptId, "image_prompt_id");
  assert.equal(item.artifacts[0].filename, "Flux2-Klein-Distilled_00014_.png");
  assert.equal(item.workflow, workflow);
  assert.equal(inspection.prompt, "A studio portrait.");
  assert.equal(details.Image, "1280×720");
  assert.equal(details.Seed, "42");
  assert.equal(details.Sampler, "euler");
  assert.equal(details.Guidance, "1");
  assert.equal(details.Steps, "4");
});

test("parseComfyHistory detects completed video outputs recursively", () => {
  const items = parseComfyHistory({
    video_prompt_id: {
      prompt: [1, "video_prompt_id", {}, {}, ["90"]],
      outputs: {
        "90": {
          video: {
            files: [{ filename: "clip.mp4", subfolder: "video", type: "output" }]
          }
        }
      },
      status: {
        status_str: "success",
        completed: true,
        messages: []
      }
    }
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].artifacts[0].filename, "clip.mp4");
});

test("parseComfyHistory ignores malformed records when valid records remain", () => {
  const parsed = parseComfyHistoryWithDiagnostics({
    malformed: "not a history record",
    valid: {
      prompt: [1, "valid", {}, {}, []],
      outputs: {},
      status: {
        status_str: "success",
        completed: true,
        messages: []
      }
    }
  });

  assert.equal(parsed.items.length, 0);
  assert.equal(parsed.diagnostics.raw, 2);
  assert.equal(parsed.diagnostics.valid, 1);
  assert.equal(parsed.diagnostics.malformed, 1);
});

test("parseComfyHistory accepts genuinely empty history", () => {
  const parsed = parseComfyHistoryWithDiagnostics({});

  assert.deepEqual(parsed.items, []);
  assert.deepEqual(parsed.diagnostics, {
    raw: 0,
    valid: 0,
    completed: 0,
    outputs: 0,
    artifacts: 0,
    malformed: 0
  });
});

test("parseComfyHistory rejects malformed top-level history", () => {
  assert.throws(
    () => parseComfyHistoryWithDiagnostics([]),
    /malformed/
  );
  assert.throws(
    () => parseComfyHistoryWithDiagnostics({ wrapper: { unexpected: true } }),
    /no valid records/
  );
});

test("inspectComfyWorkflow identifies the native FLUX.2 Klein INT8 W8A8 loader", () => {
  const workflow = {
    "76": node("PrimitiveStringMultiline", { value: "An editorial portrait." }),
    "77:87": node("OTUNetLoaderW8A8", {
      unet_name: "flux-2-klein-4b-int8.safetensors",
      model_type: "flux2",
      on_the_fly_quantization: false,
      enable_convrot: false,
      lora_mode: "None"
    })
  };

  const result = inspectComfyWorkflow(workflow);

  assert.equal(result.workflow, "FLUX.2 Klein 4B INT8 W8A8");
  assert.equal(result.prompt, "An editorial portrait.");
  assert.equal(result.promptConfidence, "known");
});

test("inspectComfyWorkflow does not mislabel unknown node ids", () => {
  const workflow = {
    "76": node("OtherNode", { value: "not a FLUX prompt" }),
    "99": node("PrimitiveStringMultiline", { value: "best effort prompt" })
  };

  const result = inspectComfyWorkflow(workflow);

  assert.equal(result.workflow, "Comfy workflow");
  assert.equal(result.prompt, "best effort prompt");
  assert.equal(result.promptConfidence, "best_effort");
});
