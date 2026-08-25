import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectComfyWorkflow,
  parseComfyHistory
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
