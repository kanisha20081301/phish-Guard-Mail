import './config/load-environment.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { environment } from './config/environment.js';
import { cache } from './infrastructure/cache.js';
import { database } from './infrastructure/database.js';
import { requireAuthentication } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { authRouter } from './modules/auth/index.js';
import { analysisRouter } from './modules/analysis/index.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { alertsRouter } from './modules/alerts/index.js';
import { analystRouter } from './modules/analyst/index.js';
import { adminRouter } from './modules/admin/index.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: environment.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (_request, response) => {
  const dependencies = { database: 'unavailable', cache: 'unavailable' };
  try {
    await database.$queryRaw`SELECT 1`;
    dependencies.database = 'ok';
  } catch {
    /* report dependency state */
  }
  try {
    if (cache.status === 'wait') await cache.connect();
    await cache.ping();
    dependencies.cache = 'ok';
  } catch {
    /* report dependency state */
  }
  response.json({ service: 'phishguard-api', ...dependencies });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/analyses', analysisRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/alerts', alertsRouter);
app.use('/api/v1/analyst', analystRouter);
app.use('/api/v1/admin', adminRouter);
app.get('/api/v1/private', requireAuthentication, (request, response) =>
  response.json({ user: request.authenticatedUser }),
);
app.use(errorHandler);

app.listen(environment.PORT, () => console.log(`PhishGuard API listening on ${environment.PORT}`));
