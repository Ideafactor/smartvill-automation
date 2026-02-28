import { Router } from 'express';
import { createTenant } from '../controllers/tenantController';

const router = Router();

// POST /api/tenants — Public route (no auth required for initial setup)
router.post('/', createTenant);

export default router;
