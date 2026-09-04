import { Router } from 'express';
import { requireAuthentication } from '../../middleware/auth.middleware.js';
import { getDashboard } from './dashboard.service.js';

const router = Router();
router.get('/', requireAuthentication, async (request, response, next) => {
  try {
    response.json(await getDashboard(request.authenticatedUser!.id));
  } catch (error) {
    next(error);
  }
});

export { router as dashboardRouter };
