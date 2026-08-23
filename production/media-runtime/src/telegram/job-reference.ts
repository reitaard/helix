import type {
  MediaJob
} from "../repositories/job-repository.js";

import {
  JobRepository
} from "../repositories/job-repository.js";

export type JobReferenceResolution =
  | {
      kind: "invalid";
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "ambiguous";
    }
  | {
      kind: "found";
      job: MediaJob;
    };

export async function resolveJobReference(
  jobs: JobRepository,
  reference: string
): Promise<JobReferenceResolution> {
  let clean =
    reference
      .trim()
      .replace(
        /\.+$/,
        ""
      );

  if (
    clean.startsWith(
      "job_"
    )
  ) {
    clean =
      clean.slice(4);
  }

  if (
    clean.length < 4 ||
    !/^[a-zA-Z0-9_-]+$/
      .test(clean)
  ) {
    return {
      kind: "invalid"
    };
  }

  const matches =
    await jobs.findByPrefix(
      `job_${clean}`
    );

  if (
    matches.length === 0
  ) {
    return {
      kind: "not_found"
    };
  }

  if (
    matches.length > 1
  ) {
    return {
      kind: "ambiguous"
    };
  }

  return {
    kind: "found",
    job: matches[0]!
  };
}
