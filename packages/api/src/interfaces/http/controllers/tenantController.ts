import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import crypto from 'crypto';

const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  businessNumber: z.string().regex(/^\d{10}$/, '사업자등록번호는 10자리 숫자여야 합니다'),
  email: z.string().email(),
  adminPassword: z.string().min(8),
});

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function createTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  const { name, businessNumber, email, adminPassword } = parsed.data;
  const tenantId = crypto.randomUUID().replace(/-/g, '');
  const schemaName = `tenant_${tenantId}`;
  const passwordHash = hashPassword(adminPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert tenant record
    await client.query(
      `INSERT INTO public.tenants (id, name, business_number, email, schema_name, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [tenantId, name, businessNumber, email, schemaName],
    );

    // 2. Insert admin user
    const userId = crypto.randomUUID().replace(/-/g, '');
    await client.query(
      `INSERT INTO public.users (id, tenant_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [userId, tenantId, email, passwordHash],
    );

    // 3. Create tenant schema
    await client.query(`CREATE SCHEMA "${schemaName}"`);

    // 4. Create tenant tables
    await client.query(`
      CREATE TABLE "${schemaName}".accounts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(200) NOT NULL,
        login_id    VARCHAR(100) NOT NULL,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE "${schemaName}".certificates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id      UUID REFERENCES "${schemaName}".accounts(id),
        subject_dn      TEXT NOT NULL,
        issuer_dn       TEXT NOT NULL,
        serial_number   VARCHAR(100) NOT NULL,
        valid_from      TIMESTAMPTZ NOT NULL,
        valid_to        TIMESTAMPTZ NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        fingerprint     VARCHAR(100) NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (account_id, serial_number)
      )
    `);

    await client.query(`
      CREATE TABLE "${schemaName}".transactions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id          VARCHAR(100),
        account_id      UUID REFERENCES "${schemaName}".accounts(id),
        type            VARCHAR(50) NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        payload         JSONB NOT NULL DEFAULT '{}',
        result          JSONB,
        error_message   TEXT,
        issued_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE "${schemaName}".jobs (
        id              VARCHAR(100) PRIMARY KEY,
        type            VARCHAR(50) NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'waiting',
        payload         JSONB NOT NULL DEFAULT '{}',
        result          JSONB,
        error_message   TEXT,
        attempts        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');

    res.status(201).json({
      tenantId,
      schemaName,
      message: 'Tenant created successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
