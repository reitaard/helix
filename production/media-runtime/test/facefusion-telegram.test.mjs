import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TelegramFaceFusionService, faceFusionDestination, faceFusionTelegramMedia, isAuthorizedFaceFusionMessage } from "../dist/telegram/facefusion-service.js";
import { commandForBot } from "../dist/telegram/context.js";
import { FACEFUSION_BACKEND_MODEL, FACEFUSION_DISPLAY_MODEL, faceFusionAdapterRequest, normalizeFaceFusionSettings } from "../dist/facefusion/settings.js";
import { FACEFUSION_DEV_DURATION_MAX, faceFusionDurationLimit, normalizeFaceFusionProfileSettings } from "../dist/facefusion/profile-settings.js";
import { validateFaceFusionProbeOutput } from "../dist/facefusion/media-validation.js";
import { TelegramDeliveryRouter } from "../dist/delivery/telegram-router.js";
import { TelegramJobLifecycleRepository } from "../dist/repositories/telegram-job-lifecycle-repository.js";
import { parseDestination, telegramBotKey } from "../dist/delivery/worker.js";

const migration = await readFile(new URL("../migrations/0015_multi_backend_dispatch_and_telegram_bots.sql", import.meta.url), "utf8");
const pollRepository = await readFile(new URL("../src/repositories/telegram-poll-offset-repository.ts", import.meta.url), "utf8");
const conversationRepository = await readFile(new URL("../src/repositories/facefusion-conversation-repository.ts", import.meta.url), "utf8");
const lifecycleRepository = await readFile(new URL("../src/repositories/telegram-job-lifecycle-repository.ts", import.meta.url), "utf8");

test("FaceFusion authorization accepts private and only the configured forum topic", () => {
  const forum = { chatId: "-10099", threadId: "154" };
  assert.equal(isAuthorizedFaceFusionMessage({ chat: { id: "42", type: "private" }, from: { id: "42" } }, "42", forum), true);
  assert.deepEqual(faceFusionDestination({ chat: { id: "-10099", type: "supergroup" }, message_thread_id: 154, from: { id: "42" } }, "42", forum), { chatId: "-10099", threadId: "154" });
  assert.equal(isAuthorizedFaceFusionMessage({ chat: { id: "-10099", type: "supergroup" }, message_thread_id: 155, from: { id: "42" } }, "42", forum), false);
  assert.equal(isAuthorizedFaceFusionMessage({ chat: { id: "-10098", type: "supergroup" }, message_thread_id: 154, from: { id: "42" } }, "42", forum), false);
  assert.equal(isAuthorizedFaceFusionMessage({ chat: { id: "42", type: "private" }, from: { id: "7" } }, "42", forum), false);
  assert.equal(isAuthorizedFaceFusionMessage({ chat: { id: "-10099", type: "supergroup" }, message_thread_id: 154, from: { id: "7" } }, "42", forum), true);
});

test("Telegram command suffixes reject malformed bot suffixes", () => {
  assert.equal(commandForBot("/f@face_bot", "face_bot"), "/f");
  assert.equal(commandForBot("/f@face_bot@other", "face_bot"), null);
  assert.equal(commandForBot("/f@@face_bot", "face_bot"), null);
});

test("FaceFusion media capture supports photo, video, and image/video documents", () => {
  assert.equal(faceFusionTelegramMedia.mediaFromMessage({ photo: [{ file_id: "small" }, { file_id: "large" }] }).mediaKind, "image");
  assert.equal(faceFusionTelegramMedia.mediaFromMessage({ video: { file_id: "video", file_name: "target.mp4" } }).mediaKind, "video");
  assert.equal(faceFusionTelegramMedia.mediaFromMessage({ document: { file_id: "image", mime_type: "image/png" } }).mediaKind, "image");
  assert.equal(faceFusionTelegramMedia.mediaFromMessage({ document: { file_id: "video", mime_type: "video/quicktime" } }).mediaKind, "video");
  assert.equal(faceFusionTelegramMedia.mediaFromMessage({ document: { file_id: "text", mime_type: "text/plain" } }), null);
});

test("normal FaceFusion settings cannot select an arbitrary model", () => {
  const settings = normalizeFaceFusionSettings({ model: "attacker_model", weight: 99, pixelBoost: "4096x4096", outputQuality: "high" });
  assert.deepEqual(settings, {});
  assert.equal(FACEFUSION_DISPLAY_MODEL, "HyperSwap B");
  assert.equal(FACEFUSION_BACKEND_MODEL, "hyperswap_1b_256");
  const request = faceFusionAdapterRequest({
    sourceInputId: "00112233445546778899aabbccddeeff",
    targetInputId: "ffeeddccbbaa4988bbaa009988776655",
    settings: { faceSelectorMode: "reference", weight: 0.5, outputQuality: "high", model: "attacker_model" }
  }, "job_123");
  assert.deepEqual(request.settings, { faceSelectorMode: "reference", weight: 0.5 });
  assert.equal("model" in request, false);
  assert.equal("outputQuality" in request.settings, false);
  assert.deepEqual(normalizeFaceFusionProfileSettings({ generation: { faceSelectorMode: "reference", referenceFacePosition: 2 } }).generation, {});
});

test("private and forum /face flows persist and reply to their originating destinations", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 900, username: "face_bot" } }), { headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/getUpdates")) return new Response(JSON.stringify({ ok: true, result: [] }), { headers: { "content-type": "application/json" } });
    throw new Error(`unexpected ${url}`);
  };
  const begun = [];
  const sent = [];
  const conversations = {
    async remove() { return null; },
    async begin(botId, chatId, threadId, userId) { begun.push({ botId, chatId, threadId, userId }); }
  };
  const telegram = { async sendHtml(_html, destination) { sent.push(destination); return { messageId: "1" }; } };
  const service = new TelegramFaceFusionService(
    "runtime-test-token", "42", "facefusion-worker", {}, conversations,
    { async get() { return { generation: {}, normalDurationSeconds: 60, devDurationSeconds: null }; }, async save() {} }, {},
    { async get() { return null; }, async save() {} }, {}, telegram, "/tmp/test", 1024,
    { async list() { return []; }, async get() { return null; }, async queue() { return []; } },
    { chatId: "-10099", threadId: "154" }
  );
  try {
    await service.initialize();
    await service.processUpdate({ update_id: 1, message: { text: "/face", chat: { id: "42", type: "private" }, from: { id: "42" } } });
    await service.processUpdate({ update_id: 2, message: { text: "/face", chat: { id: "-10099", type: "supergroup" }, message_thread_id: 154, from: { id: "42" } } });
    await service.processUpdate({ update_id: 3, message: { text: "/face", chat: { id: "-10099", type: "supergroup" }, message_thread_id: 155, from: { id: "42" } } });
    await service.processUpdate({ update_id: 4, message: { text: "/face", chat: { id: "-10098", type: "supergroup" }, message_thread_id: 154, from: { id: "42" } } });
    assert.deepEqual(begun, [
      { botId: "900", chatId: "42", threadId: null, userId: "42" },
      { botId: "900", chatId: "-10099", threadId: "154", userId: "42" }
    ]);
    assert.deepEqual(sent, [{ chatId: "42", threadId: null }, { chatId: "-10099", threadId: "154" }]);
  }
  finally { globalThis.fetch = original; }
});

async function faceFusionServiceHarness(catalog = { async list() { return []; }, async get() { return null; }, async queue() { return []; } }, jobs = {}) {
  const states = new Map();
  const sent = [];
  const deleted = [];
  const profiles = new Map();
  const apiMethods = [];
  let uploaded = 0;
  const key = (_botId, chatId, threadId, userId) => `${chatId}:${threadId ?? "private"}:${userId}`;
  const conversations = {
    async get(...args) { return states.get(key(...args)) ?? null; },
    async remove(...args) { const k = key(...args); const value = states.get(k) ?? null; states.delete(k); return value; },
    async begin(botId, chatId, threadId, userId, settings) {
      states.set(key(botId, chatId, threadId, userId), { botId, chatId, threadId, userId, phase: "awaiting_source", sourceInputHandle: null, targetInputHandle: null, settings, confirmationMessageId: null });
    },
    async setSource(botId, chatId, threadId, userId, handle, mediaKind) {
      const value = states.get(key(botId, chatId, threadId, userId));
      if (!value || value.phase !== "awaiting_source") return false;
      states.set(key(botId, chatId, threadId, userId), { ...value, phase: "awaiting_target", sourceInputHandle: handle, sourceMediaKind: mediaKind }); return true;
    },
    async setTarget(botId, chatId, threadId, userId, handle, mediaKind, settings) {
      const value = states.get(key(botId, chatId, threadId, userId));
      if (!value || value.phase !== "awaiting_target") return false;
      states.set(key(botId, chatId, threadId, userId), { ...value, phase: "confirming", targetInputHandle: handle, targetMediaKind: mediaKind, settings }); return true;
    },
    async setConfirmation(botId, chatId, threadId, userId, messageId) { states.get(key(botId, chatId, threadId, userId)).confirmationMessageId = messageId; },
    async setSettings(botId, chatId, threadId, userId, settings) { const value = states.get(key(botId, chatId, threadId, userId)); if (value) states.set(key(botId, chatId, threadId, userId), { ...value, settings: structuredClone(settings) }); }
  };
  const telegram = {
    async sendHtml(html, destination) { sent.push({ html, destination }); return { messageId: String(sent.length) }; },
    async sendHtmlWithInlineKeyboard(html, destination) { sent.push({ html, destination, keyboard: true }); return { messageId: String(sent.length) }; },
    async editHtmlClearingKeyboard(_messageId, html, destination) { sent.push({ html, destination, edited: true }); return { messageId: String(sent.length) }; }
  };
  const workers = {
    async uploadInput() { uploaded += 1; return { handle: `handle-${uploaded}` }; },
    async deleteInput(_workerId, handle) { deleted.push(handle); return true; }
  };
  const spool = await mkdtemp(join(tmpdir(), "facefusion-telegram-test-"));
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const method = String(url).split("/").at(-1);
    if (method === "getMe") return Response.json({ ok: true, result: { id: 900, username: "face_bot" } });
    if (method === "getFile") return Response.json({ ok: true, result: { file_path: "inputs/test.bin", file_size: 4 } });
    if (String(url).includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3, 4]));
    if (method === "editMessageReplyMarkup" || method === "answerCallbackQuery") { apiMethods.push(method); return Response.json({ ok: true, result: true }); }
    throw new Error(`unexpected ${url}`);
  };
  const settings = {
    async get(scope) { return profiles.get(key(scope.botId, scope.chatId, scope.threadId, scope.userId)) ?? { generation: {}, normalDurationSeconds: 60, devDurationSeconds: null }; },
    async save(scope, value) { profiles.set(key(scope.botId, scope.chatId, scope.threadId, scope.userId), structuredClone(value)); }
  };
  const service = new TelegramFaceFusionService(
    "runtime-test-token", "42", "facefusion-worker", jobs, conversations, settings, { async attach() {} },
    { async get() { return 0; }, async save() {} },  workers, telegram, spool, 1024,
    catalog,
    { chatId: "-10099", threadId: "154" }, 1800,
    async (_path, filename, mediaKind) => ({ mediaKind, width: 1080, height: 1920, durationSeconds: mediaKind === "video" ? (filename.match(/([0-9]+(?:\.[0-9]+)?)s/) ? Number(filename.match(/([0-9]+(?:\.[0-9]+)?)s/)[1]) : 42.3) : null })
  );
  await service.initialize();
  return { service, states, profiles, sent, deleted, apiMethods, workers, uploads: () => uploaded, restore: async () => { globalThis.fetch = original; await rm(spool, { recursive: true, force: true }); } };
}

const privateMessage = (message) => ({ update_id: Math.random(), message: { chat: { id: "42", type: "private" }, from: { id: "42" }, ...message } });
const forumMessage = (threadId, message) => ({ update_id: Math.random(), message: { chat: { id: "-10099", type: "supergroup" }, message_thread_id: threadId, from: { id: "42" }, ...message } });
const rendered = html => html.replaceAll(/<[^>]+>/g, "");

test("FaceFusion queue and job history are catalog-scoped", async () => {
  const catalog = {
    async queue(owner) {
      assert.deepEqual(owner, { chatId: "-10099", threadId: "154", userId: "42" });
      return [{ total: 1, face_running: 0, face_waiting: 2, current_tool: "video.t2v", current_job_number: "184", own_job_number: "186", own_status: "accepted", own_position: 1 }];
    },
    async list() { return [{ id: "face-1", jobNumber: "186", status: "succeeded", workerId: "facefusion-worker", backendJobId: "face-1", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 74000).toISOString(), finishedAt: new Date().toISOString(), generation: { targetMediaKind: "video", target: { width: 1080, height: 1920, durationSeconds: 18.4 } }, artifact: { filename: "result.mp4", type: "output", artifactId: "face-1", mediaKind: "video" } }]; },
    async get(_owner, number) { return number === "186" ? (await this.list())[0] : null; }
  };
  const h = await faceFusionServiceHarness(catalog);
  try {
    await h.service.processUpdate(forumMessage(154, { text: "/fq" }));
    assert.match(rendered(h.sent.at(-1).html), /Current GPU\nComfy · #184/);
    assert.match(rendered(h.sent.at(-1).html), /#186 · accepted · position 1/);
    await h.service.processUpdate(forumMessage(154, { text: "/fj" }));
    assert.match(rendered(h.sent.at(-1).html), /#186 · succeeded/);
    assert.doesNotMatch(rendered(h.sent.at(-1).html), /t2v/i);
    await h.service.processUpdate(forumMessage(154, { text: "/fj 186" }));
    assert.match(rendered(h.sent.at(-1).html), /Duration · 18.4s/);
    await h.service.processUpdate(forumMessage(154, { text: "/fj nope" }));
    assert.match(rendered(h.sent.at(-1).html), /Job not found/);
  } finally { await h.restore(); }
});

test("FaceFusion commands take precedence and cancel/reset private conversations", async () => {
  const h = await faceFusionServiceHarness();
  try {
    await h.service.processUpdate(privateMessage({ text: "/face" }));
    assert.equal([...h.states.values()][0].phase, "awaiting_source");
    await h.service.processUpdate(privateMessage({ text: "/cancel" }));
    assert.equal(h.states.size, 0);
    assert.equal(rendered(h.sent.at(-1).html), "[ FaceFusion ]\nRequest cancelled.");
    await h.service.processUpdate(privateMessage({ text: "/cancel" }));
    assert.equal(rendered(h.sent.at(-1).html), "[ FaceFusion ]\nNothing to cancel.");

    await h.service.processUpdate(privateMessage({ text: "/face" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source" }] }));
    assert.equal([...h.states.values()][0].phase, "awaiting_target");
    await h.service.processUpdate(privateMessage({ text: "/cancel" }));
    assert.deepEqual(h.deleted, ["handle-1"]);

    await h.service.processUpdate(privateMessage({ text: "/face" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-2" }] }));
    await h.service.processUpdate(privateMessage({ text: "/face" }));
    assert.equal([...h.states.values()][0].phase, "awaiting_source");
    assert.deepEqual(h.deleted, ["handle-1", "handle-2"]);
    assert.match(rendered(h.sent.at(-1).html), /^\[ FaceFusion \]\nSend the source face image\./);
  }
  finally { await h.restore(); }
});

test("FaceFusion source accepts only images and target accepts images or videos", async () => {
  const h = await faceFusionServiceHarness();
  try {
    await h.service.processUpdate(privateMessage({ text: "/face" }));
    await h.service.processUpdate(privateMessage({ text: "not media" }));
    assert.equal(rendered(h.sent.at(-1).html), "[ FaceFusion ]\nSend a valid source face image.");
    await h.service.processUpdate(privateMessage({ video: { file_id: "bad-source" } }));
    assert.equal(rendered(h.sent.at(-1).html), "[ FaceFusion ]\nSend a valid source face image.");
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source" }] }));
    assert.equal([...h.states.values()][0].phase, "awaiting_target");
    await h.service.processUpdate(privateMessage({ text: "not media" }));
    assert.equal(rendered(h.sent.at(-1).html), "[ FaceFusion ]\nSend the target image or video.");
    await h.service.processUpdate(privateMessage({ video: { file_id: "target-video" } }));
    assert.equal([...h.states.values()][0].phase, "confirming");

    await h.service.processUpdate(privateMessage({ text: "/face" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-2" }] }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "target-image" }] }));
    assert.equal([...h.states.values()][0].phase, "confirming");
  }
  finally { await h.restore(); }
});

test("FaceFusion forum commands are scoped to the exact topic and clean confirmation state", async () => {
  const h = await faceFusionServiceHarness();
  try {
    await h.service.processUpdate(forumMessage(154, { text: "/face" }));
    await h.service.processUpdate(forumMessage(154, { photo: [{ file_id: "source" }] }));
    await h.service.processUpdate(forumMessage(154, { video: { file_id: "target" } }));
    assert.equal([...h.states.values()][0].phase, "confirming");
    await h.service.processUpdate(forumMessage(155, { text: "/cancel" }));
    assert.equal(h.states.size, 1);
    await h.service.processUpdate(forumMessage(154, { text: "/cancel" }));
    assert.equal(h.states.size, 0);
    assert.deepEqual(h.deleted, ["handle-1", "handle-2"]);
    assert.deepEqual(h.apiMethods, ["editMessageReplyMarkup"]);
    assert.deepEqual(h.sent.at(-1).destination, { chatId: "-10099", threadId: "154" });
    assert.equal(rendered(h.sent.at(-1).html), "[ FaceFusion ]\nRequest cancelled.");
  }
  finally { await h.restore(); }
});

test("FaceFusion command aliases, suffixes, help, cancel, and settings forms are equivalent", async () => {
  const h = await faceFusionServiceHarness();
  try {
    for (const command of ["/face", "/f", "/face@face_bot", "/f@face_bot"]) {
      await h.service.processUpdate(privateMessage({ text: command }));
      assert.equal([...h.states.values()][0].phase, "awaiting_source");
    }
    for (const command of ["/face settings", "/face s", "/f settings", "/f s", "/fs"]) {
      await h.service.processUpdate(privateMessage({ text: command }));
      assert.match(rendered(h.sent.at(-1).html), /FaceFusion \/ SETTINGS/);
      assert.doesNotMatch(rendered(h.sent.at(-1).html), /Reference/);
    }
    for (const command of ["/help", "/h", "/h@face_bot"]) {
      await h.service.processUpdate(privateMessage({ text: command }));
      assert.match(rendered(h.sent.at(-1).html), /\/f     Start face swap/);
      assert.match(rendered(h.sent.at(-1).html), /\/fq    Queue/);
      assert.doesNotMatch(rendered(h.sent.at(-1).html), /\/queue|\/downloads|\/t2v|\/t2i/);
    }
    for (const command of ["/cancel", "/cc", "/c"]) {
      await h.service.processUpdate(privateMessage({ text: "/f" }));
      await h.service.processUpdate(privateMessage({ text: command }));
      assert.equal(h.states.size, 0);
      assert.match(rendered(h.sent.at(-1).html), /Request cancelled/);
    }
  }
  finally { await h.restore(); }
});

test("FaceFusion semantic settings aliases persist, normalize native values, and reset", async () => {
  const h = await faceFusionServiceHarness();
  try {
    for (const command of ["/face set mode one", "/f set strength 0.5", "/face s boost 512", "/f s time 30"]) {
      await h.service.processUpdate(privateMessage({ text: command }));
    }
    let profile = [...h.profiles.values()][0];
    assert.deepEqual(profile, { generation: { faceSelectorMode: "one", weight: 0.5, pixelBoost: "512x512" }, normalDurationSeconds: 30, devDurationSeconds: null });
    await h.service.processUpdate(privateMessage({ text: "/f set m native" }));
    await h.service.processUpdate(privateMessage({ text: "/f set w native" }));
    await h.service.processUpdate(privateMessage({ text: "/f set pb 256" }));
    profile = [...h.profiles.values()][0];
    assert.deepEqual(profile.generation, { pixelBoost: "256x256" });
    await h.service.processUpdate(privateMessage({ text: "/f reset" }));
    profile = [...h.profiles.values()][0];
    assert.deepEqual(profile.generation, {});
    assert.equal(profile.normalDurationSeconds, 60);
    await h.service.processUpdate(privateMessage({ text: "/f set mode" }));
    assert.match(rendered(h.sent.at(-1).html), /Native\nOne/);
    await h.service.processUpdate(privateMessage({ text: "/f set t 60" }));
    assert.equal([...h.profiles.values()][0].normalDurationSeconds, 60);
    await h.service.processUpdate(privateMessage({ text: "/f set t 61" }));
    assert.match(rendered(h.sent.at(-1).html), /Normal duration limit must be between 1 and 60 seconds/);
    await h.service.processUpdate(privateMessage({ text: "/f set boost 1024" }));
    assert.match(rendered(h.sent.at(-1).html), /Invalid value/);
  }
  finally { await h.restore(); }
});

test("FaceFusion developer commands are private-only and duration overrides are bounded", async () => {
  const h = await faceFusionServiceHarness();
  try {
    for (const command of ["/f -d", "/f -dev"]) {
      await h.service.processUpdate(privateMessage({ text: command }));
      assert.equal([...h.states.values()][0].settings.dev, true);
    }
    await h.service.processUpdate(privateMessage({ text: "/f set -d t 90" }));
    assert.equal([...h.profiles.values()][0].devDurationSeconds, 90);
    await h.service.processUpdate(privateMessage({ text: "/face set -dev time 30" }));
    assert.equal([...h.profiles.values()][0].devDurationSeconds, 30);
    await h.service.processUpdate(privateMessage({ text: "/fs -d" }));
    assert.match(rendered(h.sent.at(-1).html), /Duration Override : 30s Max/);
    await h.service.processUpdate(privateMessage({ text: `/f set -d t ${FACEFUSION_DEV_DURATION_MAX + 1}` }));
    assert.match(rendered(h.sent.at(-1).html), /Invalid value/);
    await h.service.processUpdate(privateMessage({ text: "/f reset -dev" }));
    assert.deepEqual([...h.profiles.values()][0], { generation: {}, normalDurationSeconds: 60, devDurationSeconds: null });

    for (const command of ["/f -d", "/f -dev", "/fs -d", "/f set -d t 90"]) {
      await h.service.processUpdate(forumMessage(154, { text: command, from: { id: "7" } }));
      assert.match(rendered(h.sent.at(-1).html), /private operator chat only/);
    }
  }
  finally { await h.restore(); }
});

test("FaceFusion normal and developer duration policies run before worker upload", async () => {
  const h = await faceFusionServiceHarness();
  const target = seconds => ({ video: { file_id: `target-${seconds}s`, file_name: `target-${seconds}s.mp4` } });
  try {
    for (const seconds of [59.9, 60]) {
      await h.service.processUpdate(privateMessage({ text: "/f" }));
      await h.service.processUpdate(privateMessage({ photo: [{ file_id: `source-${seconds}` }] }));
      await h.service.processUpdate(privateMessage(target(seconds)));
      assert.equal([...h.states.values()][0].phase, "confirming");
    }
    await h.service.processUpdate(privateMessage({ text: "/f" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-long" }] }));
    const before = h.uploads();
    await h.service.processUpdate(privateMessage(target(60.1)));
    assert.equal(h.uploads(), before);
    assert.match(rendered(h.sent.at(-1).html), /Current limit · 60s/);

    await h.service.processUpdate(privateMessage({ text: "/f set time 30" }));
    await h.service.processUpdate(privateMessage({ text: "/f" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-30" }] }));
    await h.service.processUpdate(privateMessage(target(30.1)));
    assert.match(rendered(h.sent.at(-1).html), /Current limit · 30s/);

    await h.service.processUpdate(privateMessage({ text: "/f set -d t 90" }));
    await h.service.processUpdate(privateMessage({ text: "/f -d" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-dev" }] }));
    await h.service.processUpdate(privateMessage(target(90)));
    assert.equal([...h.states.values()][0].phase, "confirming");
    assert.equal(faceFusionDurationLimit({ ...normalizeFaceFusionProfileSettings({}), dev: true }), 3600);
    await h.service.processUpdate(privateMessage({ text: "/f set -d time native" }));
    await h.service.processUpdate(privateMessage({ text: "/f -d" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-ceiling" }] }));
    const beforeCeiling = h.uploads();
    await h.service.processUpdate(privateMessage(target(3600.1)));
    assert.equal(h.uploads(), beforeCeiling);
    assert.match(rendered(h.sent.at(-1).html), /Current limit · 3600s/);
  }
  finally { await h.restore(); }
});

test("FaceFusion media probe policy accepts supported decoded formats and rejects spoofing", () => {
  const image = format => ({ streams: [{ codec_type: "video", width: 512, height: 640 }], format: { format_name: format } });
  for (const [name, format] of [["face.jpg", "jpeg_pipe"], ["face.jpeg", "jpeg_pipe"], ["face.png", "png_pipe"], ["face.webp", "webp_pipe"]]) {
    assert.equal(validateFaceFusionProbeOutput(image(format), name, "image").width, 512);
  }
  const video = { streams: [{ codec_type: "video", width: 1080, height: 1920 }], format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "42.3" } };
  assert.equal(validateFaceFusionProbeOutput(video, "target.mp4", "video").durationSeconds, 42.3);
  assert.throws(() => validateFaceFusionProbeOutput({}, "fake.jpg", "image"));
  assert.throws(() => validateFaceFusionProbeOutput(video, "spoof.jpg", "image"));
  assert.throws(() => validateFaceFusionProbeOutput(image("jpeg_pipe"), "spoof.mp4", "video"));
  assert.throws(() => validateFaceFusionProbeOutput({ ...video, format: { ...video.format, duration: "NaN" } }, "bad.mp4", "video"));
});

test("FaceFusion forum users have isolated state and stale callbacks cannot mutate newer conversations", async () => {
  const h = await faceFusionServiceHarness();
  try {
    await h.service.processUpdate(forumMessage(154, { text: "/f", from: { id: "7" } }));
    await h.service.processUpdate(forumMessage(154, { text: "/f", from: { id: "8" } }));
    assert.equal(h.states.size, 2);
    await h.service.processUpdate(forumMessage(154, { text: "/c", from: { id: "7" } }));
    assert.equal(h.states.size, 1);
    assert.equal([...h.states.values()][0].userId, "8");
    await h.service.processUpdate(forumMessage(154, { photo: [{ file_id: "source-8" }], from: { id: "8" } }));
    await h.service.processUpdate(forumMessage(154, { photo: [{ file_id: "target-8" }], from: { id: "8" } }));
    const oldMessageId = [...h.states.values()][0].confirmationMessageId;
    await h.service.processUpdate(forumMessage(154, { text: "/f", from: { id: "8" } }));
    await h.service.processUpdate({ update_id: 99, callback_query: { id: "cb", data: "ff:generate", from: { id: "8" }, message: { message_id: oldMessageId, chat: { id: "-10099", type: "supergroup" }, message_thread_id: 154 } } });
    assert.equal([...h.states.values()][0].phase, "awaiting_source");
    await h.service.processUpdate(forumMessage(155, { text: "/f", from: { id: "9" } }));
    assert.equal(h.states.size, 1);
  }
  finally { await h.restore(); }
});

test("FaceFusion conversation persists source, target, and restart-safe destination", () => {
  assert.match(conversationRepository, /thread_id/);
  assert.match(conversationRepository, /phase='awaiting_target'[\s\S]*source_input_handle=\$5/);
  assert.match(conversationRepository, /phase='confirming'[\s\S]*target_input_handle=\$5/);
  assert.match(conversationRepository, /WHERE bot_id = \$1 AND chat_id = \$2 AND thread_id = \$3 AND user_id = \$4/);
  assert.match(conversationRepository, /takeExpired/);
});

test("second bot reuses bot-keyed poll offsets and lifecycle bot identity", () => {
  assert.match(pollRepository, /WHERE bot_id = \$1/);
  assert.match(migration, /bot_key TEXT NOT NULL DEFAULT 'primary'/);
  assert.match(migration, /PRIMARY KEY \(bot_id, chat_id, thread_id, user_id\)/);
  assert.match(lifecycleRepository, /thread_id/);
  assert.match(lifecycleRepository, /bot_key/);
});

test("delivery routing selects independent primary and FaceFusion identities", () => {
  const primary = { sendHtml() {} };
  const facefusion = { sendHtml() {} };
  const router = new TelegramDeliveryRouter([
    { key: "primary", delivery: primary, privateChatId: "1", forum: null },
    { key: "facefusion", delivery: facefusion, privateChatId: "2", forum: null }
  ]);
  assert.equal(router.get("primary").delivery, primary);
  assert.equal(router.get(telegramBotKey({ botKey: "facefusion" })).delivery, facefusion);
  assert.equal(telegramBotKey(null), "primary");
});

test("restart-safe lifecycle repository persists and restores FaceFusion thread identity", async () => {
  const queries = [];
  const row = {
    job_id: "job_1", bot_key: "facefusion", chat_id: "-10099", thread_id: "154", message_id: "200",
    presentation_state: "active", last_job_status: "running", job_number: "1", status: "running",
    worker_id: "ff", profile_id: "faceswap", tool: "face.swap", backend_job_id: "job_1",
    request: {}, error: null, created_at: new Date(0), started_at: null, finished_at: null
  };
  const repository = new TelegramJobLifecycleRepository({
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      return String(sql).includes("WHERE l.job_id") ? { rows: [row] } : { rows: [] };
    }
  });
  await repository.attach({ jobId: "job_1", botKey: "facefusion", chatId: "-10099", threadId: "154", messageId: "200" });
  assert.deepEqual(queries[0].params.slice(0, 5), ["job_1", "facefusion", "-10099", "154", "200"]);
  const restored = await repository.get("job_1");
  assert.equal(restored.threadId, "154");
  assert.equal(restored.botKey, "facefusion");
});

test("FaceFusion result delivery remains private or in the originating forum topic", () => {
  const forum = { chatId: "-10099", faceFusionThreadId: "154" };
  assert.deepEqual(parseDestination({ provider: "telegram", botKey: "facefusion", chatId: "42", threadId: null }, "face.swap", "42", forum), { chatId: "42", threadId: null });
  assert.deepEqual(parseDestination({ provider: "telegram", botKey: "facefusion", chatId: "-10099", threadId: "154" }, "face.swap", "42", forum), { chatId: "-10099", threadId: "154" });
  assert.throws(() => parseDestination({ provider: "telegram", botKey: "facefusion", chatId: "-10099", threadId: "155" }, "face.swap", "42", forum), /does not match job tool/);
});

test("FaceFusion active-session profile changes preserve captured handles and update generation", async () => {
  const created = [];
  const h = await faceFusionServiceHarness(undefined, { async create(input) { created.push(input); return { id: "job-1", jobNumber: "123" }; } });
  try {
    await h.service.processUpdate(privateMessage({ text: "/f -d" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source" }] }));
    await h.service.processUpdate(privateMessage({ video: { file_id: "target", file_name: "target-42s.mp4" } }));
    await h.service.processUpdate(privateMessage({ text: "/f set strength 0.5" }));
    await h.service.processUpdate(privateMessage({ text: "/f set boost 512" }));
    await h.service.processUpdate(privateMessage({ text: "/f set mode one" }));
    await h.service.processUpdate(privateMessage({ text: "/f set time 30" }));
    await h.service.processUpdate(privateMessage({ text: "/f set -d time 90" }));
    let state = [...h.states.values()][0];
    assert.equal(state.phase, "confirming");
    assert.equal(state.sourceInputHandle, "handle-1");
    assert.equal(state.targetInputHandle, "handle-2");
    assert.deepEqual(state.settings.generation, { weight: 0.5, pixelBoost: "512x512", faceSelectorMode: "one" });
    assert.equal(state.settings.normalDurationSeconds, 30);
    assert.equal(state.settings.devDurationSeconds, 90);
    await h.service.processUpdate(privateMessage({ text: "/f reset -d" }));
    assert.equal([...h.states.values()][0].settings.devDurationSeconds, null);
    await h.service.processUpdate(privateMessage({ text: "/f set -d time 90" }));
    state = [...h.states.values()][0];
    assert.equal(state.settings.dev, true);
    assert.equal(state.settings.target.mediaKind, "video");
    await h.service.processUpdate({ update_id: 77, callback_query: { id: "cb", data: "ff:generate", from: { id: "42" }, message: { message_id: state.confirmationMessageId, chat: { id: "42", type: "private" } } } });
    assert.deepEqual(created[0].workflow.settings, { faceSelectorMode: "one", weight: 0.5, pixelBoost: "512x512" });
    assert.equal(created[0].generation.durationLimitSeconds, 90);
  } finally { await h.restore(); }
});

test("FaceFusion reset syncs only its owned active session", async () => {
  const h = await faceFusionServiceHarness();
  try {
    await h.service.processUpdate(forumMessage(154, { text: "/f", from: { id: "7" } }));
    await h.service.processUpdate(forumMessage(154, { text: "/f", from: { id: "8" } }));
    await h.service.processUpdate(forumMessage(154, { text: "/f set strength 0.5", from: { id: "7" } }));
    await h.service.processUpdate(forumMessage(154, { text: "/f set strength 0.65", from: { id: "8" } }));
    await h.service.processUpdate(forumMessage(154, { text: "/f reset", from: { id: "7" } }));
    const states = [...h.states.values()];
    assert.deepEqual(states.find(state => state.userId === "7").settings.generation, {});
    assert.deepEqual(states.find(state => state.userId === "8").settings.generation, { weight: 0.65 });
    assert.equal(states.find(state => state.userId === "7").phase, "awaiting_source");
  } finally { await h.restore(); }
});

test("FaceFusion numbered cancellation is owned and bare cancellation remains conversational", async () => {
  const jobs = new Map([["123", { id: "waiting", jobNumber: "123", status: "queued" }], ["124", { id: "running", jobNumber: "124", status: "running" }], ["125", { id: "done", jobNumber: "125", status: "succeeded" }]]);
  const seen = [];
  const catalog = { async list() { return []; }, async queue() { return []; }, async get(owner, number) { seen.push(owner); return owner.userId === "42" && owner.threadId === null ? jobs.get(number) ?? null : owner.userId === "7" && owner.threadId === "154" && number === "126" ? { id: "forum", jobNumber: "126", status: "queued" } : null; } };
  const h = await faceFusionServiceHarness(catalog, { async cancel(id) { return id === "done" ? { cancelled: false, status: "succeeded" } : { cancelled: true, status: "cancelled" }; } });
  try {
    await h.service.processUpdate(privateMessage({ text: "/c 123" }));
    assert.match(rendered(h.sent.at(-1).html), /Job #123 cancelled/);
    await h.service.processUpdate(privateMessage({ text: "/cc 124" }));
    assert.match(rendered(h.sent.at(-1).html), /Job #124 cancelled/);
    await h.service.processUpdate(privateMessage({ text: "/cancel 125" }));
    assert.match(rendered(h.sent.at(-1).html), /already succeeded/);
    await h.service.processUpdate(forumMessage(154, { text: "/c 126", from: { id: "7" } }));
    assert.match(rendered(h.sent.at(-1).html), /Job #126 cancelled/);
    await h.service.processUpdate(forumMessage(154, { text: "/c 123", from: { id: "8" } }));
    assert.match(rendered(h.sent.at(-1).html), /Job not found/);
    await h.service.processUpdate(forumMessage(155, { text: "/c 123", from: { id: "42" } }));
    assert.equal(seen.length, 5, "wrong thread is ignored before catalog lookup");
    await h.service.processUpdate(privateMessage({ text: "/f" }));
    await h.service.processUpdate(privateMessage({ text: "/c" }));
    assert.equal(h.states.size, 0);
    assert.equal(seen[4].threadId, "154");
  } finally { await h.restore(); }
});
