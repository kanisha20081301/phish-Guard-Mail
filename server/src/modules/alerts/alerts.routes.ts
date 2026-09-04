import { AlertStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication } from '../../middleware/auth.middleware.js';
import { listAlerts, updateAlert } from './alerts.service.js';

const router = Router();
const statusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
router.use(requireAuthentication);
router.get('/', async (request, response, next) => {
  try {
    const status = request.query.status
      ? (statusSchema.parse(request.query.status) as AlertStatus)
      : undefined;
    response.json({ alerts: await listAlerts(request.authenticatedUser!.id, status) });
  } catch (error) {
    next(error);
  }
});
router.patch('/:alertId', async (request, response, next) => {
  try {
    const alert = await updateAlert(
      request.authenticatedUser!.id,
      request.params.alertId,
      statusSchema.parse(request.body.status) as AlertStatus,
    );
    if (!alert) {
      response.status(404).json({ error: 'Alert not found' });
      return;
    }
    response.json({ alert });
  } catch (error) {
    next(error);
  }
});
export { router as alertsRouter };
