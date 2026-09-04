import { Router } from 'express';
import { requireAuthentication } from '../../middleware/auth.middleware.js';
import { createAnalysisSchema } from './analysis.schemas.js';
import { analyzeEmail, getAnalysis, syncAndScanUserMailbox } from './analysis.service.js';
import { enqueueScan, getScan } from './scan.service.js';
import { z } from 'zod';

const router = Router();
router.use(requireAuthentication);

const scanSchema = z.object({ mailboxId: z.string().uuid() });

router.post('/scans', async (request, response, next) => {
  try {
    const scan = await enqueueScan(
      request.authenticatedUser!.id,
      scanSchema.parse(request.body).mailboxId,
    );
    response
      .status(202)
      .json({ scanId: scan.id, status: scan.status, requestedAt: scan.requestedAt });
  } catch (error) {
    next(error);
  }
});

router.get('/scans/:scanId', async (request, response, next) => {
  try {
    const scan = await getScan(request.authenticatedUser!.id, request.params.scanId);
    if (!scan) {
      response.status(404).json({ error: 'Scan not found' });
      return;
    }
    response.json({
      scanId: scan.id,
      status: scan.status,
      requestedAt: scan.requestedAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      error: scan.error,
      analysesCount: scan._count.analyses,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (request, response, next) => {
  try {
    const input = createAnalysisSchema.parse(request.body);
    const result = await analyzeEmail(request.authenticatedUser!.id, input);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:analysisId', async (request, response, next) => {
  try {
    const result = await getAnalysis(request.authenticatedUser!.id, request.params.analysisId);
    if (!result) {
      response.status(404).json({ error: 'Analysis not found' });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/sync-inbox', async (request, response, next) => {
  try {
    const emails = await syncAndScanUserMailbox(request.authenticatedUser!.id);
    response.json({
      message: 'Gmail inbox synced and scanned successfully',
      count: emails.length,
      emails,
    });
  } catch (error) {
    next(error);
  }
});

export { router as analysisRouter };
