import {
  EventRepository
} from "../repositories/event-repository.js";

import {
  JobRepository
} from "../repositories/job-repository.js";

import {
  resolveJobReference
} from "./job-reference.js";

import {
  compactError,
  escapeHtml,
  formatEventTimestamp,
  title
} from "./presentation.js";

export class TelegramDebugService {
  constructor(
    private readonly jobs:
      JobRepository,

    private readonly events:
      EventRepository
  ) {}

  async errorsHtml() {
    const errors =
      await this.events
        .listRecentErrors(5);

    if (
      errors.length === 0
    ) {
      return (
        `${title("ERRORS")}\n` +
        `<b><i>No recent errors.</i></b>`
      );
    }

    const blocks =
      errors.map(
        item => {
          const type =
            item.kind === "job"
              ? "Job"
              : "Outbox";

          return (
            `<code>${escapeHtml(
              item.jobId
            )}</code> · ` +

            `<b>[${type} · ${escapeHtml(
              item.status
            )}]</b>\n` +

            `<blockquote><b><i>${escapeHtml(
              compactError(
                item.message
              )
            )}</i></b></blockquote>`
          );
        }
      );

    return (
      `${title("ERRORS")}\n` +
      blocks.join("\n")
    );
  }

  async eventsHtml(
    reference: string
  ) {
    const resolved =
      await resolveJobReference(
        this.jobs,
        reference
      );

    if (
      resolved.kind ===
      "invalid"
    ) {
      return (
        `${title("EVENTS")}\n` +
        `<b>Usage</b> · ` +
        `<code>/events &lt;id&gt;</code>`
      );
    }

    if (
      resolved.kind ===
      "not_found"
    ) {
      return (
        `${title("EVENTS")}\n` +
        `<b><i>Job not found.</i></b>`
      );
    }

    if (
      resolved.kind ===
      "ambiguous"
    ) {
      return (
        `${title("EVENTS")}\n` +
        `<b><i>Prefix is ambiguous.</i></b>\n` +
        `<b><i>Use more characters.</i></b>`
      );
    }

    const events =
      await this.events
        .listForJob(
          resolved.job.id
        );

    if (events.length === 0) {
      return (
        `${title("EVENTS")}\n` +
        `<b>Job</b> · <code>${escapeHtml(
          resolved.job.id
        )}</code>\n` +
        `<b><i>No events recorded.</i></b>`
      );
    }

    const timeline =
      events.map(
        event =>
          `<b><i>#${event.sequence}</i></b>` +
          ` · <i>${escapeHtml(
            formatEventTimestamp(
              event.createdAt
            )
          )}</i>` +
          ` · <code>${escapeHtml(
            event.eventType
          )}</code>`
      );

    return (
      `${title("EVENTS")}\n` +

      `<b>Job</b> · <code>${escapeHtml(
        resolved.job.id
      )}</code>\n` +

      `<blockquote expandable>${timeline.join(
        "\n"
      )}</blockquote>`
    );
  }
}
