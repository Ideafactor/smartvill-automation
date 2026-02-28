/**
 * DB Migration Script
 * Run: pnpm db:migrate
 *
 * Creates the public schema tables (tenants, users) and verifies connectivity.
 * Tenant-specific schemas are created on-demand during tenant onboarding.
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'smartvill',
  password: process.env.POSTGRES_PASSWORD ?? 'smartvill_password',
  database: process.env.POSTGRES_DB ?? 'smartvill',
});

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_enable_extensions',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `,
  },
  {
    name: '002_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL UNIQUE,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: '003_create_tenants_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.tenants (
        id              VARCHAR(32) PRIMARY KEY,
        name            VARCHAR(200) NOT NULL,
        business_number VARCHAR(10)  NOT NULL UNIQUE,
        email           VARCHAR(255) NOT NULL UNIQUE,
        schema_name     VARCHAR(50)  NOT NULL UNIQUE,
        is_active       BOOLEAN      NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      COMMENT ON TABLE public.tenants IS '글로벌 테넌트 레지스트리';
      COMMENT ON COLUMN public.tenants.schema_name IS 'PostgreSQL 스키마명 (tenant_{id})';
    `,
  },
  {
    name: '004_create_users_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.users (
        id            VARCHAR(32) PRIMARY KEY,
        tenant_id     VARCHAR(32) NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        email         VARCHAR(255) NOT NULL,
        password_hash VARCHAR(64)  NOT NULL,
        role          VARCHAR(20)  NOT NULL DEFAULT 'admin',
        is_active     BOOLEAN      NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, email)
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);

      COMMENT ON TABLE public.users IS '글로벌 사용자 테이블 (테넌트별 격리)';
    `,
  },
  {
    name: '005_create_update_trigger',
    sql: `
      CREATE OR REPLACE FUNCTION public.update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
      CREATE TRIGGER trg_tenants_updated_at
        BEFORE UPDATE ON public.tenants
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

      DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
      CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON public.users
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    `,
  },
];

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting database migration...\n');

    // Run each migration
    for (const migration of MIGRATIONS) {
      // Check if already applied (skip the bootstrap migrations)
      if (migration.name !== '001_enable_extensions' && migration.name !== '002_create_migrations_table') {
        const check = await client.query(
          'SELECT id FROM public.schema_migrations WHERE name = $1',
          [migration.name],
        );
        if (check.rows.length > 0) {
          console.log(`  ⏭  [SKIP] ${migration.name}`);
          continue;
        }
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);

        if (migration.name !== '001_enable_extensions' && migration.name !== '002_create_migrations_table') {
          await client.query(
            'INSERT INTO public.schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
            [migration.name],
          );
        }

        await client.query('COMMIT');
        console.log(`  ✅ [DONE] ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ [FAIL] ${migration.name}:`, err);
        throw err;
      }
    }

    // Print summary
    const result = await client.query<{ name: string; applied_at: Date }>(
      'SELECT name, applied_at FROM public.schema_migrations ORDER BY id',
    );
    console.log(`\n📋 Applied migrations (${result.rows.length} total):`);
    result.rows.forEach((row) => {
      console.log(`   - ${row.name} (${row.applied_at.toISOString()})`);
    });

    console.log('\n✨ Migration completed successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('\n💥 Migration failed:', err);
  process.exit(1);
});
