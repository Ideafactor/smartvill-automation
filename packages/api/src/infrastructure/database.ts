import { Pool, PoolClient } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'database' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'smartvill',
  password: process.env.POSTGRES_PASSWORD ?? 'smartvill_password',
  database: process.env.POSTGRES_DB ?? 'smartvill',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

/**
 * Execute a query in the public schema context.
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/**
 * Acquire a client with the tenant's search_path set.
 * Caller is responsible for calling client.release() in a finally block.
 */
export async function getTenantClient(tenantId: string): Promise<PoolClient> {
  const client = await pool.connect();
  // Sanitise tenantId — must be alphanumeric / underscore only
  if (!/^[a-z0-9_]+$/i.test(tenantId)) {
    client.release();
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  await client.query(
    `SET search_path TO tenant_${tenantId}, public`,
  );
  return client;
}

/**
 * Run a callback inside a tenant-scoped transaction.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getTenantClient(tenantId);
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
