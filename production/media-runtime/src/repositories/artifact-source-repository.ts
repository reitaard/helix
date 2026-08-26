import type {
  Pool
} from "pg";

export interface ArtifactSourceJob {
  id: string;
  jobNumber: string;
  backendJobId: string | null;
  tool: string;
  workerId: string | null;
  profileId: string | null;
}

interface ArtifactSourceRow {
  id: string;
  job_number: string;
  backend_job_id: string | null;
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
          job_number,
          backend_job_id,
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
          jobNumber: row.job_number,
          backendJobId: row.backend_job_id,
          tool: row.tool,
          workerId: row.worker_id,
          profileId: row.profile_id
        }
      : null;
  }

  async findByJobNumber(
    jobNumber: string
  ): Promise<ArtifactSourceJob | null> {
    const result =
      await this.db.query<
        ArtifactSourceRow
      >(
        `
        SELECT
          id,
          job_number,
          backend_job_id,
          tool,
          worker_id,
          profile_id
        FROM media_jobs
        WHERE job_number = $1::bigint
        `,
        [jobNumber]
      );

    const row = result.rows[0];

    return row
      ? {
          id: row.id,
          jobNumber: row.job_number,
          backendJobId: row.backend_job_id,
          tool: row.tool,
          workerId: row.worker_id,
          profileId: row.profile_id
        }
      : null;
  }
}
