import { Request, Response, NextFunction } from 'express';
import { pool } from '../../../infrastructure/database';

/**
 * Attaches a tenant-scoped DB client to the request.
 * Must be used AFTER `authenticate` middleware.
 *
 * Note: For route handlers that need a tenant client, they should use
 * `getTenantClient` or `withTenantTransaction` from database.ts directly.
 * This middleware validates tenant existence and sets context.
 */
export async function setTenantContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Tenant context not established' });
    return;
  }

  // Validate tenant exists in public schema
  const client = await pool.connect();
  try {
    const result = await client.query<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM public.tenants WHERE id = $1',
      [tenantId],
    );

    if (result.rows.length === 0) {
      res.status(403).json({ error: 'Tenant not found' });
      return;
    }

    if (!result.rows[0].is_active) {
      res.status(403).json({ error: 'Tenant account is inactive' });
      return;
    }

    next();
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}
