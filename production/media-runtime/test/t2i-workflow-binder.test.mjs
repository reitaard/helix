import assert from "node:assert/strict";
import test from "node:test";

import {
  bindT2IWorkflow
} from "../dist/t2i/workflow-binder.js";

function workflow() {
  return {
    "76": {
      class_type: "PrimitiveStringMultiline",
      inputs: { value: "original" }
    },
    "77:84": {
      class_type: "PrimitiveInt",
      inputs: { value: 1 }
    },
    "77:85": {
      class_type: "PrimitiveInt",
      inputs: { value: 1 }
    },
    "77:86": {
      class_type: "RandomNoise",
      inputs: { noise_seed: 1 }
    },
    frozen: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" }
    }
  };
}

test("bindT2IWorkflow clones and mutates only the approved inputs", () => {
  const template = workflow();
  const bound = bindT2IWorkflow(template, "exact prompt", {
    aspect: "9:16",
    seed: 123456
  });

  assert.notStrictEqual(bound, template);
  assert.equal(template["76"].inputs.value, "original");
  assert.equal(bound["76"].inputs.value, "exact prompt");
  assert.equal(bound["77:84"].inputs.value, 720);
  assert.equal(bound["77:85"].inputs.value, 1280);
  assert.equal(bound["77:86"].inputs.noise_seed, 123456);
  assert.equal(bound.frozen.inputs.sampler_name, "euler");
});

test("bindT2IWorkflow rejects graph drift before mutation", () => {
  const template = workflow();
  delete template["77:86"].inputs.noise_seed;

  assert.throws(
    () => bindT2IWorkflow(template, "prompt", { aspect: "1:1", seed: 4 }),
    /expected node 77:86 RandomNoise\.noise_seed/
  );
  assert.equal(template["76"].inputs.value, "original");
});
