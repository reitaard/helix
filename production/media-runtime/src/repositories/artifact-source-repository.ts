import type {
  Pool
} from "pg";

export interface ArtifactSourceJob {
  id: string;
  tool: string;
  workerId: string | null;
  profileId: string | null;
}

interface ArtifactSourceRow {
  id: string;
  tool: string;
  worker_id: string | null;
  profile_id: string | null;
}

export class ArtifactSourceRepository {
  constructor(
    private readonly db: Pool
  ) {}

  async findByBackendJobId(
    backendJobId: string
  ): Promise<ArtifactSourceJob | null> {
    const result =
      await this.db.query<
        ArtifactSourceRow
      >(
        `
        SELECT
          id,
          tool,
          worker_id,
          profile_id
        FROM media_jobs
        WHERE backend_job_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [backendJobId]
      );

    const row = result.rows[0];

    return row
      ? {
          id: row.id,
          tool: row.tool,
          workerId: row.worker_id,
          profileId: row.profile_id
        }
      : null;
  }
}
