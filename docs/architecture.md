# PhishGuard Architecture

## Runtime flow

1. React client calls the versioned Express REST API.
2. Express validates input with Zod and enforces authentication and role checks.
3. Prisma persists users, mailboxes, emails, scans, analyses, alerts, and audit logs in PostgreSQL.
4. Redis stores short-lived dashboard cache entries and BullMQ scan jobs.
5. The worker consumes scan jobs, retrieves provider mail through server-side OAuth, runs the detection engine, and writes analysis results.
6. Alerts and dashboard aggregates are read from PostgreSQL, with Redis used only as a cache.

## Boundaries

- `client/`: presentation and API client only; no provider secrets or database access.
- `server/src/config/`: validated environment configuration.
- `server/src/infrastructure/`: Prisma, Redis, provider clients, and queue adapters.
- `server/src/modules/`: feature modules added in later phases.
- `server/prisma/`: schema, migrations, and development seed.
- `docker-compose.yml`: local PostgreSQL, Redis, API, and client services.

Provider passwords are never collected. Mailbox access must use OAuth with the minimum read-only scopes required by each provider.
