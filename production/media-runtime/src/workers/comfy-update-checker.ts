export interface ComfyUpdateStatus {
  state:
    | "current"
    | "available"
    | "custom"
    | "unavailable";

  commitsAvailable: number;

  currentRevision: string;

  upstreamRevision:
    string | null;

  error?: string;
}


interface GithubCompareResponse {
  ahead_by?: number;
  behind_by?: number;

  head_commit?: {
    sha?: string;
  };

  message?: string;
}


export class ComfyUpdateChecker {
  private cache:
    {
      expiresAt: number;
      value: ComfyUpdateStatus;
    } |
    null = null;


  constructor(
    private readonly revision:
      string,

    private readonly ttlMs =
      15 * 60 * 1000
  ) {}


  async check():
    Promise<ComfyUpdateStatus> {

    const now =
      Date.now();

    if (
      this.cache &&
      this.cache.expiresAt > now
    ) {
      return this.cache.value;
    }

    try {
      const base =
        encodeURIComponent(
          this.revision
        );

      const response =
        await fetch(
          "https://api.github.com/" +
          "repos/Comfy-Org/ComfyUI/" +
          `compare/${base}...master`,
          {
            headers: {
              accept:
                "application/vnd.github+json",

              "user-agent":
                "comfy-runtime"
            },

            signal:
              AbortSignal.timeout(
                5000
              )
          }
        );

      const body =
        await response.json() as
          GithubCompareResponse;

      if (!response.ok) {
        throw new Error(
          body.message ??
          `GitHub HTTP ${response.status}`
        );
      }

      const ahead =
        typeof body.ahead_by ===
          "number"
          ? body.ahead_by
          : 0;

      const behind =
        typeof body.behind_by ===
          "number"
          ? body.behind_by
          : 0;

      let state:
        ComfyUpdateStatus["state"];

      if (
        ahead === 0 &&
        behind === 0
      ) {
        state = "current";
      }
      else if (
        ahead > 0 &&
        behind === 0
      ) {
        state = "available";
      }
      else {
        state = "custom";
      }

      const value:
        ComfyUpdateStatus = {
          state,

          commitsAvailable:
            ahead,

          currentRevision:
            this.revision,

          upstreamRevision:
            body.head_commit
              ?.sha ??
            null
        };

      this.cache = {
        expiresAt:
          now + this.ttlMs,

        value
      };

      return value;
    }
    catch (error) {
      const value:
        ComfyUpdateStatus = {
          state:
            "unavailable",

          commitsAvailable:
            0,

          currentRevision:
            this.revision,

          upstreamRevision:
            null,

          error:
            error instanceof Error
              ? error.message
              : String(error)
        };

      // Retry temporary failures sooner.
      this.cache = {
        expiresAt:
          now + 60_000,

        value
      };

      return value;
    }
  }
}
