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

interface ExternalArtifactReferenceRow {
  reference_number: string;
  backend_job_id: string;
}

function mapJobRow(
  row: ArtifactSourceRow
): ArtifactSourceJob {
  return {
    id: row.id,
    jobNumber: row.job_number,
    backendJobId: row.backend_job_id,
    tool: row.tool,
    workerId: row.worker_id,
    profileId: row.profile_id
  };
}

function mapExternalReference(
  row: ExternalArtifactReferenceRow
): ArtifactSourceJob {
  return {
    id: `comfy_ref_${row.reference_number}`,
    jobNumber: row.reference_number,
    backendJobId: row.backend_job_id,
    tool: "comfy.artifact",
    workerId: "Comfy UI",
    profileId: null
  };
}

export class ArtifactSourceRepository {
  constructor(
    private readonly db: Pool
  ) {}

  private async findExternalByBackendJobId(
    backendJobId: string
  ): Promise<ArtifactSourceJob | null> {
    const result =
      await this.db.query<
        ExternalArtifactReferenceRow
      >(
        `
        SELECT
          reference_number,
          backend_job_id
        FROM media_references
        WHERE kind = 'comfy_artifact'
          AND backend_job_id = $1
        `,
        [backendJobId]
      );

    const row = result.rows[0];

    return row
      ? mapExternalReference(row)
      : null;
  }

  private async ensureExternalReference(
    backendJobId: string
  ): Promise<ArtifactSourceJob> {
    const existing =
      await this.findExternalByBackendJobId(
        backendJobId
      );

    if (existing) {
      return existing;
    }

    const inserted =
      await this.db.query<
        ExternalArtifactReferenceRow
      >(
        `
        INSERT INTO media_references (
          kind,
          backend_job_id
        )
        VALUES (
          'comfy_artifact',
          $1
        )
        ON CONFLICT DO NOTHING
        RETURNING
          reference_number,
          backend_job_id
        `,
        [backendJobId]
      );

    const row = inserted.rows[0];

    if (row) {
      return mapExternalReference(row);
    }

    const raced =
      await this.findExternalByBackendJobId(
        backendJobId
      );

    if (!raced) {
      throw new Error(
        `Failed to allocate media reference for Comfy prompt ${backendJobId}`
      );
    }

    return raced;
  }

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

    if (row) {
      return mapJobRow(row);
    }

    return this.ensureExternalReference(
      backendJobId
    );
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

    if (row) {
      return mapJobRow(row);
    }

    const external =
      await this.db.query<
        ExternalArtifactReferenceRow
      >(
        `
        SELECT
          reference_number,
          backend_job_id
        FROM media_references
        WHERE kind = 'comfy_artifact'
          AND reference_number = $1::bigint
        `,
        [jobNumber]
      );

    const externalRow =
      external.rows[0];

    return externalRow
      ? mapExternalReference(
          externalRow
        )
      : null;
  }
}
