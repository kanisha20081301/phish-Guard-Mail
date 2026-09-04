# PhishGuard

Full-stack email security platform for phishing and spam detection.

## Stack

- React + TypeScript + Vite
- Node.js + Express REST API
- PostgreSQL for users, mailboxes, messages, and analysis results
- Redis for scan queues and dashboard caching
- Docker Compose for local services

## Run locally

1. Install Node.js 20+ and Docker Desktop.
2. Run `npm install`.
3. Run `docker compose up -d postgres redis`.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

The UI is wired to the REST API. Mail providers must be connected through server-side OAuth; never collect provider passwords. Set a strong `SESSION_SECRET` and real OAuth credentials before deployment.

The Phase 4 worker runs separately from the API with `npm run worker`. Docker Compose starts it as the `worker` service to consume BullMQ scan jobs from Redis.

## Phase 8 quality checks

Run `npm test` for parser and detection tests. Run `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build` before release. The API contract is documented in `docs/openapi.yaml`, and GitHub Actions runs these checks on pushes and pull requests.

Run `npm audit --omit=dev` to audit deployable packages. Express and `qs` are pinned to patched versions. The remaining Prisma `deepmerge-ts` advisory is in the Prisma CLI/config toolchain used during development and schema generation; do not use `npm audit fix --force` because it proposes an incompatible major/RC Prisma upgrade. Revisit it when Prisma publishes a stable patched release.

## Phase 2 API

- `POST /api/v1/auth/register` creates a PostgreSQL-backed user and sets an HTTP-only JWT cookie.
- `POST /api/v1/auth/login` verifies a bcrypt password hash and sets a short-lived HTTP-only JWT cookie.
- `POST /api/v1/auth/logout` clears the authentication cookie.
- `GET /api/v1/auth/me` returns the authenticated user.
- `GET /api/v1/private` demonstrates authentication middleware.

Authentication requests are rate-limited, input-validated, protected by Helmet/CORS, and use role-aware middleware. Passwords are never stored in plaintext. Configure a real `SESSION_SECRET` with at least 32 characters before running the server.

## Phase 6 API

- `GET /api/v1/alerts` lists the authenticated user's alerts.
- `PATCH /api/v1/alerts/:alertId` acknowledges or resolves an owned alert and writes an audit log.
- `GET /api/v1/analyst/summary` returns PostgreSQL-backed threat totals for analysts/admins.
- `GET /api/v1/analyst/threats/:analysisId` returns the full investigation record for analysts/admins.

## Phase 7 API

- `GET /api/v1/admin/users` lists real users and activity counts.
- `PATCH /api/v1/admin/users/:userId/role` updates a user's role and writes an audit log.
- `GET /api/v1/admin/threats` filters persisted analyses by category and risk level.
- `GET /api/v1/admin/audit-logs` returns the administrative audit trail.
