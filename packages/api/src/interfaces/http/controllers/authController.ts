import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../../../infrastructure/database';
import crypto from 'crypto';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { email, password } = parsed.data;
    const passwordHash = hashPassword(password);

    const users = await query<{
      id: string;
      tenant_id: string;
      email: string;
    }>(
      `SELECT u.id, u.tenant_id, u.email
       FROM public.users u
       JOIN public.tenants t ON t.id = u.tenant_id
       WHERE u.email = $1
         AND u.password_hash = $2
         AND t.is_active = true`,
      [email, passwordHash],
    );

    if (users.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = users[0];
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const token = jwt.sign(
      { tenantId: user.tenant_id, userId: user.id, email: user.email },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '24h' },
    );

    res.json({ token, tenantId: user.tenant_id });
  } catch (err) {
    next(err);
  }
}
