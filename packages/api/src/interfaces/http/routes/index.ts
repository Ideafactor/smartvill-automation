import { Application, Request, Response, NextFunction } from 'express';
import authRoutes from './authRoutes';
import tenantRoutes from './tenantRoutes';
import jobRoutes from './jobRoutes';
import { createBullBoardRouter } from './bullBoardRoute';

export function registerRoutes(app: Application): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/admin/bull-board', createBullBoardRouter());

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Global error handler
  app.use((err: Error & { statusCode?: number; details?: unknown }, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error' : err.message;

    if (statusCode === 500) {
      console.error(err);
    }

    res.status(statusCode).json({
      error: message,
      ...(err.details ? { details: err.details } : {}),
    });
  });
}
