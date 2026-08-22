import {
  Pool
} from "pg";

export interface DatabaseConfig {
  connectionString: string;
}

export function createDatabasePool(
  config: DatabaseConfig
) {
  return new Pool({
    connectionString:
      config.connectionString,

    max: 10,

    idleTimeoutMillis:
      30_000,

    connectionTimeoutMillis:
      5_000
  });
}
