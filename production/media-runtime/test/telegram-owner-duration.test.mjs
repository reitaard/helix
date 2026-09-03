import assert from "node:assert/strict";
import test from "node:test";

import {
  TelegramT2VService
} from "../dist/telegram/t2v-service.js";

function fixture() {
  const calls = [];
  const settingsUi = {
    async panel() {
      return "panel";
    },
    async help() {
      return "help";
    },
    async set(setting, value, dev) {
      calls.push({ setting, value, dev });
      return dev
        ? `override:${setting}:${value}`
        : `normal:${setting}:${value}`;
    }
  };

  const service = new TelegramT2VService(
    "5759927190",
    "helix-rtx4060-01",
    "Christopher Nolan",
    "/unused/workflow.json",
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    settingsUi,
    {}
  );

  return { service, calls };
}

const ownerKey = {
  chatId: "-1004369617758",
  threadId: "7",
  userId: "5759927190"
};

const otherUserKey = {
  chatId: "-1004369617758",
  threadId: "7",
  userId: "999999999"
};

test("forum owner may use t alias to set T2V duration to 15 seconds without opening dev controls", async () => {
  const { service, calls } = fixture();

  const response = await service.handleCommand(
    ["set", "t", "15"],
    ownerKey,
    false,
    true
  );

  assert.equal(response, "override:t:15");
  assert.deepEqual(calls, [
    { setting: "t", value: "15", dev: true }
  ]);
});

test("forum non-owner does not receive the duration override", async () => {
  const { service, calls } = fixture();

  const response = await service.handleCommand(
    ["set", "time", "15"],
    otherUserKey,
    false,
    true
  );

  assert.equal(response, "normal:time:15");
  assert.deepEqual(calls, [
    { setting: "time", value: "15", dev: false }
  ]);
});

test("forum owner duration override stops at 15 seconds", async () => {
  const { service, calls } = fixture();

  const response = await service.handleCommand(
    ["set", "time", "16"],
    ownerKey,
    false,
    true
  );

  assert.match(response, /1 to 15 seconds/);
  assert.equal(calls.length, 0);
});

test("forum owner still cannot open developer settings with -dev", async () => {
  const { service, calls } = fixture();

  const response = await service.handleCommand(
    ["set", "-dev", "time", "15"],
    ownerKey,
    false,
    true
  );

  assert.match(response, /private operator chat only/);
  assert.equal(calls.length, 0);
});
