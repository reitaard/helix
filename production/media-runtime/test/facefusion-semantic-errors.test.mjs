import assert from "node:assert/strict";
import test from "node:test";
import { FaceFusionHttpError } from "../dist/adapters/facefusion/client.js";
import { faceFusionExecutionMessage, faceFusionInputMessage } from "../dist/facefusion/errors.js";

test("FaceFusion semantic input errors stay bounded and actionable", () => {
  const source = new FaceFusionHttpError("/v1/inputs", 422, { code: "no_source_face_detected" });
  const target = new FaceFusionHttpError("/v1/inputs", 422, { code: "no_target_face_detected" });
  const analyse = new FaceFusionHttpError("/v1/inputs", 503, { code: "face_analysis_failed" });
  assert.equal(faceFusionInputMessage(source, "source"), "No face detected in the source image.\nSend another source image.");
  assert.equal(faceFusionInputMessage(target, "target"), "No face detected in the target image.\nSend another target image or video.");
  assert.equal(faceFusionInputMessage(analyse, "source"), "Could not analyse faces in the image.\nTry another image.");
  assert.equal(faceFusionInputMessage(source, "target"), null);
});

test("FaceFusion job errors never expose raw worker text", () => {
  assert.equal(faceFusionExecutionMessage("processing_failed"), "FaceFusion execution failed");
  assert.equal(faceFusionExecutionMessage("output_missing"), "FaceFusion completed without an output artifact.");
  assert.equal(faceFusionExecutionMessage("worker_restarted"), "FaceFusion worker restarted during execution.");
});
