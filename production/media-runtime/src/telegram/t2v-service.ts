import {
  readFile
} from "node:fs/promises";

import type {
  JobService
} from "../jobs/service.js";

import {
  T2VPendingRepository
} from "../repositories/t2v-pending-repository.js";

import {
  escapeHtml,
  title
} from "./presentation.js";

type Workflow =
  Record<
    string,
    Record<string, unknown>
  >;

export class TelegramT2VService {
  private timer:
    ReturnType<
      typeof setInterval
    > |
    null =
      null;

  constructor(
    private readonly chatId:
      string,

    private readonly workerId:
      string,

    private readonly workerName:
      string,

    private readonly workflowPath:
      string,

    private readonly jobs:
      JobService,

    private readonly pending:
      T2VPendingRepository,

    private readonly promptSeconds =
      300,

    private readonly confirmSeconds =
      60,

    private readonly maxInvalid =
      3,

    private readonly maxPromptLength =
      2800
  ) {}

  private noPendingHtml() {
    return (
      `${title("T2V")}\n` +
      `<b><i>No T2V generation is pending.</i></b>`
    );
  }

  private confirmationHtml(
    prompt: string
  ) {
    return (
      `${title("T2V")}\n` +

      `<b>Prompt</b>\n` +
      `<blockquote expandable>${escapeHtml(
        prompt
      )}</blockquote>\n` +

      `<b>Model</b> · <b>LTX 2.5</b>\n` +
      `<b>Duration</b> · <b><i>5s</i></b>\n` +
      `<b>Aspect</b> · <b>16:9</b>\n` +
      `<b>Worker</b> · <b>${escapeHtml(
        this.workerName
      )}</b>\n\n` +

      `<b>Generate this video?</b>  ` +
      `<b><i>Type</i></b> ` +
      `<b>[</b> ` +
      `<code>yes</code> ` +
      `<b>/</b> ` +
      `<code>no</code> ` +
      `<b>]</b>`
    );
  }

  private async sweepExpiry() {
    try {
      await this.pending
        .expireDue(
          this.chatId
        );
    }
    catch (error) {
      console.error(
        "[telegram] T2V expiry sweep failed",
        error
      );
    }
  }

  start() {
    if (this.timer) {
      return;
    }

    void this.sweepExpiry();

    this.timer =
      setInterval(
        () => {
          void this.sweepExpiry();
        },
        5000
      );

    this.timer.unref();
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer
    );

    this.timer = null;
  }

  async begin() {
    await this.pending
      .beginPrompt(
        this.chatId,
        new Date(
          Date.now() +
          this.promptSeconds *
          1000
        )
      );

    return (
      `${title("T2V")}\n` +
      `<b><i>Send the generation prompt.</i></b>`
    );
  }

  async hasPending() {
    await this.pending
      .expireDue(
        this.chatId
      );

    return (
      await this.pending.get(
        this.chatId
      )
    ) !== null;
  }

  async abandonPendingForCommand() {
    await this.pending
      .remove(
        this.chatId
      );
  }

  private async workflowFor(
    prompt: string
  ): Promise<Workflow> {
    const raw =
      await readFile(
        this.workflowPath,
        "utf8"
      );

    const parsed:
      unknown =
        JSON.parse(raw);

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "T2V workflow is not a valid API workflow"
      );
    }

    const workflow =
      structuredClone(
        parsed
      ) as Workflow;

    const promptNode =
      workflow["405:376"];

    if (
      !promptNode ||
      promptNode.class_type !==
        "PrimitiveStringMultiline"
    ) {
      throw new Error(
        "T2V prompt node 405:376 is missing or changed"
      );
    }

    const inputs =
      promptNode.inputs;

    if (
      inputs === null ||
      typeof inputs !== "object" ||
      Array.isArray(inputs)
    ) {
      throw new Error(
        "T2V prompt node inputs are invalid"
      );
    }

    (
      inputs as
        Record<string, unknown>
    ).value =
      prompt;

    const enhanceNode =
      workflow["405:383"];

    const enhanceInputs =
      enhanceNode?.inputs;

    if (
      enhanceInputs === null ||
      typeof enhanceInputs !== "object" ||
      Array.isArray(enhanceInputs) ||
      (
        enhanceInputs as
          Record<string, unknown>
      ).value !== false
    ) {
      throw new Error(
        "T2V template prompt-enhance state changed"
      );
    }

    return workflow;
  }

  async handlePlainText(
    text: string
  ): Promise<
    string |
    null
  > {
    const answer =
      text
        .trim();

    const lower =
      answer.toLowerCase();

    await this.pending
      .expireDue(
        this.chatId
      );

    const state =
      await this.pending.get(
        this.chatId
      );

    if (!state) {
      if (
        lower === "yes" ||
        lower === "no"
      ) {
        return this.noPendingHtml();
      }

      return null;
    }

    if (
      state.phase ===
      "awaiting_prompt"
    ) {
      if (!answer) {
        return (
          `${title("T2V")}\n` +
          `<b><i>Prompt cannot be empty.</i></b>`
        );
      }

      if (
        answer.length >
        this.maxPromptLength
      ) {
        return (
          `${title("T2V")}\n` +
          `<b><i>Prompt is too long.</i></b>`
        );
      }

      const stored =
        await this.pending
          .setPrompt(
            this.chatId,
            answer,
            new Date(
              Date.now() +
              this.confirmSeconds *
              1000
            )
          );

      if (!stored) {
        return this.noPendingHtml();
      }

      return this.confirmationHtml(
        answer
      );
    }

    if (
      state.phase !==
        "awaiting_confirmation" ||
      !state.prompt
    ) {
      await this.pending
        .remove(
          this.chatId
        );

      return this.noPendingHtml();
    }

    if (lower === "no") {
      await this.pending
        .remove(
          this.chatId
        );

      return (
        `${title("T2V")}\n` +
        `<b>Generation aborted.</b>\n\n` +
        `<b><i>No job was submitted.</i></b>`
      );
    }

    if (lower === "yes") {
      const prompt =
        state.prompt;

      await this.pending
        .remove(
          this.chatId
        );

      const workflow =
        await this.workflowFor(
          prompt
        );

      const job =
        await this.jobs.create({
          tool:
            "video.t2v",

          workerId:
            this.workerId,

          workflow,

          inputs: {},

          idempotencyKey:
            null
        });

      return (
        `${title("T2V")}\n` +

        `<b>ID</b> · ` +
        `<code>${escapeHtml(
          job.id
        )}</code>\n` +

        `<b>Worker</b> · ` +
        `<b>${escapeHtml(
          this.workerName
        )}</b>\n` +

        `<b>State</b> · ` +
        `<b>[${escapeHtml(
          job.status
        )}]</b>`
      );
    }

    const updated =
      await this.pending
        .incrementInvalid(
          this.chatId
        );

    if (!updated) {
      return this.noPendingHtml();
    }

    if (
      updated.invalidAttempts >=
      this.maxInvalid
    ) {
      await this.pending
        .remove(
          this.chatId
        );

      return (
        `${title("T2V")}\n` +
        `<b>Generation aborted after 3 invalid responses.</b>\n\n` +
        `<b><i>No job was submitted.</i></b>`
      );
    }

    return (
      `${title("T2V")}\n` +
      `<b>Invalid response!</b>\n\n` +

      `<b><i>Type</i></b> ` +
      `‘<code>yes</code>’ ` +
      `<b><i>or</i></b> ` +
      `‘<code>no</code>’ ` +

      `<b><i>(Attempt · ${
        updated.invalidAttempts
      }/${this.maxInvalid})</i></b>`
    );
  }
}
