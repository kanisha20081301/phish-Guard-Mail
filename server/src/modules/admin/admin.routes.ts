import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireRole } from '../../middleware/auth.middleware.js';
import { listAuditLogs, listThreats, listUsers, updateUserRole } from './admin.service.js';

const router = Router();
const roleSchema = z.enum(['USER', 'ANALYST', 'ADMIN']);
const categorySchema = z.enum(['SAFE', 'MARKETING', 'SPAM', 'PHISHING']);
const riskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
router.use(requireAuthentication, requireRole('ADMIN'));
router.get('/users', async (request, response, next) => {
  try {
    response.json({
      users: await listUsers(
        typeof request.query.search === 'string' ? request.query.search : undefined,
      ),
    });
  } catch (error) {
    next(error);
  }
});
router.patch('/users/:userId/role', async (request, response, next) => {
  try {
    const user = await updateUserRole(
      request.authenticatedUser!.id,
      z.string().uuid().parse(request.params.userId),
      roleSchema.parse(request.body.role) as UserRole,
    );
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }
    response.json({ user });
  } catch (error) {
    next(error);
  }
});
router.get('/threats', async (request, response, next) => {
  try {
    const category =
      typeof request.query.category === 'string'
        ? categorySchema.parse(request.query.category)
        : undefined;
    const riskLevel =
      typeof request.query.riskLevel === 'string'
        ? riskSchema.parse(request.query.riskLevel)
        : undefined;
    response.json({ threats: await listThreats(category, riskLevel) });
  } catch (error) {
    next(error);
  }
});
router.get('/audit-logs', async (_request, response, next) => {
  try {
    response.json({ auditLogs: await listAuditLogs() });
  } catch (error) {
    next(error);
  }
});
export { router as adminRouter };
