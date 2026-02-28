import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { setTenantContext } from '../middlewares/setTenantContext';
import {
  enqueueInvoiceIssue,
  enqueueCertificateSync,
  getJobStatusHandler,
} from '../controllers/jobController';

const router = Router();

// All job routes require authentication
router.use(authenticate);
router.use(setTenantContext);

// POST /api/jobs/invoice-issue
router.post('/invoice-issue', enqueueInvoiceIssue);

// POST /api/jobs/certificate-sync
router.post('/certificate-sync', enqueueCertificateSync);

// GET /api/jobs/:jobId/status
router.get('/:jobId/status', getJobStatusHandler);

export default router;
