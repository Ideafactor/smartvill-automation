import { Pool, PoolClient } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'database' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'smartvill',
  password: process.env.POSTGRES_PASSWORD ?? 'smartvill_password',
  database: process.env.POSTGRES_DB ?? 'smartvill',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

/**
 * Acquire a client with the tenant's search_path set.
 * Caller MUST call client.release() in a finally block.
 */
export async function getTenantClient(tenantId: string): Promise<PoolClient> {
  const client = await pool.connect();
  if (!/^[a-z0-9_]+$/i.test(tenantId)) {
    client.release();
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  await client.query(`SET search_path TO tenant_${tenantId}, public`);
  return client;
}

export { pool };
