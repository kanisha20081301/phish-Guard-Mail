import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireRole } from '../../middleware/auth.middleware.js';
import { getThreatSummary, investigateThreat } from './analyst.service.js';

const router = Router();
router.use(requireAuthentication, requireRole('ANALYST', 'ADMIN'));
router.get('/summary', async (_request, response, next) => {
  try {
    response.json(await getThreatSummary());
  } catch (error) {
    next(error);
  }
});
router.get('/threats/:analysisId', async (request, response, next) => {
  try {
    const analysis = await investigateThreat(z.string().uuid().parse(request.params.analysisId));
    if (!analysis) {
      response.status(404).json({ error: 'Threat not found' });
      return;
    }
    response.json({ analysis });
  } catch (error) {
    next(error);
  }
});
export { router as analystRouter };
