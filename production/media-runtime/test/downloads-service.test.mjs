import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  TelegramDownloadsService
} from "../dist/telegram/downloads-service.js";

function node(classType, inputs) {
  return {
    class_type: classType,
    inputs
  };
}

function imageRecord(id, index = 0) {
  const workflow = {
    "76": node("PrimitiveStringMultiline", {
      value: `Prompt for ${id}`
    }),
    "77:84": node("PrimitiveInt", { value: 1280 }),
    "77:85": node("PrimitiveInt", { value: 720 }),
    "77:86": node("RandomNoise", { noise_seed: 42 }),
    "77:80": node("KSamplerSelect", { sampler_name: "euler" }),
    "77:90": node("FluxGuidance", { cfg: 1 }),
    "77:93": node("Flux2Scheduler", { steps: 4 })
  };

  return {
    prompt: [index, id, workflow, { create_time: index }, ["78"]],
    outputs: {
      "78": {
        images: [{
          filename: `${id}.png`,
          subfolder: "",
          type: "output"
        }]
      }
    },
    status: {
      status_str: "success",
      completed: true,
      messages: [[
        "execution_success",
        { timestamp: 1_700_000_000_000 + index }
      ]]
    }
  };
}

function history(count) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const id = `item${String(index + 1).padStart(4, "0")}`;
      return [id, imageRecord(id, index)];
    })
  );
}

function serviceWith(rawHistory, mapping = null) {
  const workers = {
    async history() {
      if (rawHistory instanceof Error) {
        throw rawHistory;
      }
      return rawHistory;
    },
    async downloadArtifact(_workerId, _artifact, destination) {
      await writeFile(destination, "fixture");
      return true;
    },
    profileDisplayName(_workerId, profileId) {
      return profileId === "leibovitz"
        ? "Annie Leibovitz"
        : "Comfy UI";
    }
  };
  const sources = {
    async findByBackendJobId(backendJobId) {
      if (mapping?.backendJobId !== backendJobId) {
        return null;
      }

      return mapping;
    },
    async findByJobNumber(jobNumber) {
      if (mapping?.jobNumber !== jobNumber) {
        return null;
      }

      return mapping;
    }
  };
  const telegram = {
    async sendDocumentFile() {},
    async sendHtml() {}
  };

  return new TelegramDownloadsService(
    "helix-rtx4060-01",
    "/tmp/helix-download-tests",
    workers,
    sources,
    telegram
  );
}

function blockquoteCount(html) {
  return (html.match(/<blockquote>/g) ?? []).length;
}

test("Downloads paginates 20 items per page", async () => {
  const service = serviceWith(history(21));

  const first = await service.handleCommand([]);
  const second = await service.handleCommand(["p", "2"]);

  assert.equal(blockquoteCount(first), 20);
  assert.match(first, /<b>Page<\/b> · <b>1\/2<\/b> · <b>20<\/b> <i>shown<\/i>/);
  assert.equal(blockquoteCount(second), 1);
  assert.match(second, /<b>Page<\/b> · <b>2\/2<\/b> · <b>1<\/b> <i>shown<\/i>/);
  assert.doesNotMatch(first, /\n\n/);
  assert.doesNotMatch(second, /\n\n/);
});

test("Downloads inspect resolves a compact prompt prefix", async () => {
  const service = serviceWith({
    imageabc123: imageRecord("imageabc123")
  });

  const html = await service.handleCommand(["i", "imagea"]);

  assert.match(html, /<blockquote expandable>/);
  assert.match(html, /Prompt for imageabc123/);
  assert.match(html, /<b>Image<\/b> · 1280×720/);
  assert.match(html, /<b>Sampler<\/b> · euler/);
  assert.match(html, /<b>Guidance<\/b> · 1/);
  assert.match(html, /<b>Steps<\/b> · 4/);
  assert.match(html, /<i>Get<\/i> · <code>\/dl g imagea<\/code>/);
  assert.doesNotMatch(html, /\n\n/);
});

test("Downloads uses one numeric Job reference for mapped artifacts", async () => {
  const backendJobId = "imageabc123";
  const mapping = {
    id: "job_internal",
    jobNumber: "51",
    backendJobId,
    tool: "image.t2i",
    workerId: "helix-rtx4060-01",
    profileId: "leibovitz"
  };
  const service = serviceWith(
    {
      [backendJobId]: imageRecord(backendJobId)
    },
    mapping
  );

  const list = await service.handleCommand([]);
  const inspect = await service.handleCommand(["i", "51"]);
  const get = await service.handleCommand(["g", "51"]);

  assert.match(list, /<code>51<\/code>/);
  assert.doesNotMatch(list, /<code>imagea<\/code>/);
  assert.match(inspect, /<b>Job<\/b> · <code>51<\/code>/);
  assert.match(inspect, /<b>Comfy Prompt<\/b> · <code>imageabc123<\/code>/);
  assert.match(inspect, /<i>Get<\/i> · <code>\/dl g 51<\/code>/);
  assert.match(get, /Transfer started.<\/b> · <code>51<\/code>/);
});

test("Downloads does not report valid populated history as empty", async () => {
  const service = serviceWith(history(11));

  const html = await service.handleCommand([]);

  assert.match(html, /<b>11<\/b> <i>shown<\/i>/);
  assert.doesNotMatch(html, /No completed Comfy artifacts found/);
});

test("Downloads reports genuinely empty valid history", async () => {
  const service = serviceWith({});

  const html = await service.handleCommand([]);

  assert.match(html, /No completed Comfy artifacts found/);
  assert.doesNotMatch(html, /Comfy history unavailable/);
});

test("Downloads reports transport failure as unavailable, not empty", async () => {
  const service = serviceWith(
    new DOMException("request timed out", "TimeoutError")
  );

  const html = await service.handleCommand([]);

  assert.match(html, /Comfy history unavailable/);
  assert.doesNotMatch(html, /No completed Comfy artifacts found/);
});

test("Downloads reports malformed history as unavailable, not empty", async () => {
  const service = serviceWith([]);

  const html = await service.handleCommand([]);

  assert.match(html, /Comfy history unavailable/);
  assert.doesNotMatch(html, /No completed Comfy artifacts found/);
});

test("Downloads inspect preserves unavailable history state", async () => {
  const service = serviceWith(
    new Error("fetch failed")
  );

  const html = await service.handleCommand(["i", "abcd"]);

  assert.match(html, /Comfy history unavailable/);
  assert.doesNotMatch(html, /Artifact history entry not found/);
});
