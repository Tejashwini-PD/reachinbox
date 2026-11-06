# ReachInbox Full-Stack Email Scheduler

A production-shaped email scheduling assignment built with TypeScript across the stack.
Emails are persisted in PostgreSQL, scheduled as persistent BullMQ delayed jobs in Redis,
sent through Nodemailer/SMTP (Ethereal by default), indexed in Elasticsearch, and protected
by Google OAuth. Slack OAuth is used for real hourly-limit alerts.

> External integrations (Google, Slack, Ethereal, Elasticsearch) are implemented with their
> real APIs. They require credentials/configuration described below. Nothing is faked, and no
> credentials are committed.

## Architecture

```
React + Vite + Tailwind (frontend)
              │  Axios, session cookie
              ▼
Express + TypeScript API ──────► PostgreSQL (source of truth, Prisma)
      │        │                 Elasticsearch (search copy)
      │        │                 Redis (sessions, OAuth state, rate limits)
      │        ▼
      │    BullMQ email queue ──► separate worker process
      │                              │
      │                              ├─ Nodemailer / Ethereal SMTP
      │                              ├─ Redis Lua rate limiter
      │                              ├─ Slack chat.postMessage alerts
      │                              └─ Elasticsearch status indexing
      ▼
  @bull-board queue dashboard (/admin/queues)
```

Key design decisions:

- **PostgreSQL is the source of truth.** Elasticsearch is a best-effort search copy and
  never blocks sending.
- **Stable job IDs.** Each `Email.id` is also the BullMQ `jobId`, so retried scheduling
  requests cannot create duplicate jobs.
- **Idempotency-Key support.** The API stores request hashes and the completed response in
  `IdempotencyRecord`, returning the original response for repeats.
- **Distributed rate limiting.** An atomic Redis Lua script enforces both the minimum delay
  and a sliding one-hour per-sender limit across any number of workers.
- **No cron / no in-memory queue.** All delayed work is persisted by BullMQ/Redis.

## Repository layout

```
backend/    Express API, BullMQ worker, Prisma schema, tests
frontend/   React + Vite + TypeScript + Tailwind foundation
docker-compose.yml  PostgreSQL, Redis, Elasticsearch
```

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop / Docker Compose
- Google OAuth credentials (for login)
- Slack app credentials (optional, for hourly-limit alerts)
- SMTP credentials or Ethereal (test SMTP)

## 1. Install dependencies

From the repository root:

```bash
npm install
```

This installs both workspaces.

## 2. Start infrastructure

```bash
docker compose up -d
docker compose ps
```

Services and ports:

| Service | Port | Persistent volume |
| --- | --- | --- |
| PostgreSQL 16 | 5432 | `postgres_data` |
| Redis 7 (AOF enabled) | 6379 | `redis_data` |
| Elasticsearch 8.15 | 9200 | `elasticsearch_data` |

Health checks are defined in `docker-compose.yml`. Elasticsearch can take ~30–60 seconds to
become healthy on first start.

Stop services with `docker compose down` (volumes are preserved). Use
`docker compose down -v` only when you intentionally want to delete data.

## 3. Configure the backend

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ELASTICSEARCH_URL` | Elasticsearch URL |
| `SESSION_SECRET` | Signs the session cookie (change it) |
| `ENCRYPTION_KEY` | Encrypts SMTP passwords and OAuth tokens at rest |
| `FRONTEND_URL` | Exact frontend origin for CORS/cookies |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Google OAuth |
| `SLACK_CLIENT_ID/SECRET/REDIRECT_URI` | Slack OAuth |
| `SLACK_NOTIFICATION_CHANNEL_ID` | Channel ID for hourly-limit alerts |
| `WORKER_CONCURRENCY` | Number of emails processed concurrently |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum spacing between sends per sender |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Sliding-window hourly limit per sender |
| `MAX_EMAIL_ATTEMPTS` | SMTP attempts for transient failures |
| `QUEUE_DASHBOARD_USER/PASSWORD` | Optional HTTP Basic auth for `/admin/queues` |

Generate secure values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Database setup

Create the schema (development):

```bash
npm run db:push
# or generate a migration:
npm run db:migrate
```

Generate the Prisma client at any time with:

```bash
npm run db:generate
```

The API seeds shared senders from `SENDER_N_*` variables on startup. You can also run:

```bash
npm run senders:sync --workspace backend
```

## 5. Start the backend API

```bash
npm run dev:backend
```

- API: http://localhost:4000
- Liveness: http://localhost:4000/health
- Detailed health: http://localhost:4000/api/health
- Queue dashboard: http://localhost:4000/admin/queues

## 6. Start the worker (separate process)

```bash
npm run dev:worker
```

The worker must run for scheduled emails to be sent. It uses its own Redis connection and
`WORKER_CONCURRENCY`. Start multiple worker processes if you need more throughput; the Redis
rate limiter coordinates them.

Production-style commands after `npm run build`:

```bash
npm run start --workspace backend
npm run worker:prod --workspace backend
```

## 7. Start the frontend

```bash
cp frontend/.env.example frontend/.env
npm run dev:frontend
```

Frontend: http://localhost:5173

`VITE_API_URL` must point at the backend (default `http://localhost:4000`).

## Ethereal SMTP configuration

Ethereal is a real sandbox SMTP service. Emails are not delivered to real inboxes; they are
captured and viewable through preview links.

Option A — generate an account:

```bash
npm run ethereal:create --workspace backend
```

Copy the printed values into `backend/.env`:

```env
SENDER_1_NAME=Ethereal Sandbox
SENDER_1_EMAIL=<printed user>
SENDER_1_SMTP_HOST=smtp.ethereal.email
SENDER_1_SMTP_PORT=587
SENDER_1_SMTP_SECURE=false
SENDER_1_SMTP_USER=<printed user>
SENDER_1_SMTP_PASS=<printed pass>
```

Option B — automatic fallback:

Set `USE_ETHEREAL_FALLBACK=true`. If no valid sender is configured, the backend creates a
real Ethereal test account through Nodemailer and stores it as a shared sender.

For every send, the API stores the Nodemailer message id, SMTP response and
`previewUrl` (when the SMTP server is Ethereal). Open the preview URL from the email record
(`previewUrl`) or log in at https://ethereal.email with the generated account to view the
message. Preview links only exist for Ethereal messages.

Multiple senders can be configured with `SENDER_2_*`, `SENDER_3_*`, etc. Increase
`SENDER_COUNT` accordingly. The same mechanism works with any real SMTP provider.

## Google OAuth 2.0 configuration

1. Go to Google Cloud Console → APIs & Services → Credentials.
2. Configure the OAuth consent screen.
3. Create an OAuth client of type **Web application**.
4. Add an authorized redirect URI:
   `http://localhost:4000/api/auth/google/callback`
5. Put the client id/secret into `backend/.env`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Login flow:

- `GET /api/auth/google` creates a random state stored in Redis (10 min TTL), then redirects
  to Google.
- `GET /api/auth/google/callback` consumes the state once, exchanges the code, verifies the
  Google ID token, upserts the user, stores the OAuth connection (encrypted tokens), and
  regenerates the session (session-fixation protection).
- Sessions are stored in Redis and sent in an HTTP-only, SameSite=Lax cookie. Set
  `COOKIE_SECURE=true` when using HTTPS.

Endpoints: `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/auth/config`.
Protected routes require the session cookie. There is no fake login path.

## Slack OAuth 2.0 configuration

1. Create a Slack app at https://api.slack.com/apps.
2. Add an OAuth redirect URL:
   `http://localhost:4000/api/slack/callback`
3. Add bot token scopes: `chat:write`, `team:read`.
4. Install the app to your workspace.
5. Set:

```env
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback
SLACK_NOTIFICATION_CHANNEL_ID=C0123456789
```

6. Invite the bot to the notification channel (`/invite @your-app`).

Behaviour:

- `GET /api/slack/connect` redirects to Slack with a validated state tied to the logged-in
  user.
- `GET /api/slack/callback` validates state, exchanges the code, and upserts the encrypted
  bot token for that user.
- `GET /api/slack/status` reports connection state.
- `POST /api/slack/disconnect` marks the connection revoked. Reconnecting uses the same
  connect flow.
- When a sender reaches its hourly limit, the worker calls Slack `chat.postMessage` once per
  sender per hour bucket. Redis `SET NX EX` prevents repeated alerts. Missing/revoked
  connections are skipped safely; revoked tokens mark the connection as `REVOKED`.

## Elasticsearch

- The email index mapping is created automatically on startup (`ELASTICSEARCH_EMAILS_INDEX`).
- Documents include recipient, subject, body, sender, status, scheduled/sent timestamps.
- `GET /api/search/emails?q=&recipient=&subject=&sender=&status=&page=&limit=` searches with
  pagination.
- PostgreSQL remains the source of truth. If Elasticsearch is down, scheduling/sending
  continues and indexing failures are logged.
- Recovery:
  - `POST /api/search/reindex` reindexes the current user's emails.
  - `npm run reindex --workspace backend` rebuilds the whole index from PostgreSQL.
  - `Email.searchIndexedAt` tracks successful indexing.

## Scheduling, persistence, and concurrency

Scheduling request (`POST /api/emails/schedule`):

```json
{
  "subject": "Hello",
  "body": "This is a test",
  "recipients": ["alice@example.com", { "email": "bob@example.com", "name": "Bob" }],
  "senderId": "<sender id>",
  "startAt": "2030-01-01T10:00:00.000Z",
  "delayMs": 1000,
  "hourlyLimit": 100
}
```

Optional header: `Idempotency-Key: <unique-key>` (or `idempotencyKey` in the body).

What happens:

1. Zod validates the payload, normalizes/deduplicates recipients.
2. A `Campaign` and one `Email` row per recipient are created in a transaction with
   `scheduledAt = startAt + index * delayMs`.
3. BullMQ jobs are added with `jobId = email.id` and the computed delay.
4. Rows move from `SCHEDULED` to `PENDING` once queued.
5. The worker claims a row (`PROCESSING`), reserves a rate-limit slot, sends SMTP, then marks
   `SENT` with `sentAt`, message id and preview URL — or records a `DeliveryAttempt` failure
   and retries transient errors with exponential backoff.

Statuses: `SCHEDULED`, `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED`.

Cancellation is allowed only for `SCHEDULED`/`PENDING` rows; the BullMQ job is removed.

### Persistence and restart recovery

- PostgreSQL and Redis use named Docker volumes, and Redis runs with AOF enabled.
- BullMQ delayed jobs survive API/worker restarts because they live in Redis.
- On startup, the server/worker re-queues `SCHEDULED`/`PENDING` rows whose BullMQ job is
  missing.
- Emails stuck in `PROCESSING` longer than `STALE_PROCESSING_MINUTES` are marked `FAILED`
  with an "unknown delivery state" error and are **not** retried automatically.
- Workers handle `SIGINT`/`SIGTERM` with `worker.close()` so in-flight jobs finish.

### Exactly-once delivery limitation (honest note)

SMTP does not provide an exactly-once guarantee. If the worker crashes after the SMTP server
accepted a message but before PostgreSQL was updated, the true delivery state is unknown.
This project deliberately does **not** blindly resend such rows; it marks them `FAILED` for
manual review. True exactly-once delivery would require idempotency support from the receiving
mail system, which SMTP does not offer.

## Distributed rate limiting

Environment variables:

```env
WORKER_CONCURRENCY=2
MIN_DELAY_BETWEEN_EMAILS_MS=1000
MAX_EMAILS_PER_HOUR_PER_SENDER=100
```

A single Redis Lua script atomically:

1. Checks the last-send timestamp for the sender (minimum delay).
2. Removes old entries from a one-hour sorted set.
3. Rejects the slot if the hourly count is at the limit.
4. Otherwise records the send timestamp and returns how many sends remain.

When a slot is unavailable, the worker calls `job.moveToDelayed()` and returns without
consuming an attempt. Jobs are never dropped or permanently failed because of rate limits.
The delay applies per sender, so ordering is preserved as reasonably as possible while
allowing concurrency.

## REST API summary

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/health` | DB/Redis/Elasticsearch/queue health |
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/config` | Provider configuration flags |
| POST | `/api/emails/schedule` | Schedule a batch |
| GET | `/api/emails` | List emails (filter/paginate) |
| GET | `/api/emails/scheduled` | Scheduled/pending emails |
| GET | `/api/emails/sent` | Sent emails |
| GET | `/api/emails/failed` | Failed emails |
| GET | `/api/emails/:id` | Email detail + delivery attempts |
| POST | `/api/emails/:id/cancel` | Cancel eligible email |
| GET | `/api/senders` | List usable senders |
| POST | `/api/senders` | Create a personal sender |
| PATCH | `/api/senders/:id` | Update a personal sender |
| GET | `/api/search/emails` | Elasticsearch search |
| POST | `/api/search/reindex` | Reindex current user's emails |
| GET | `/api/slack/connect` | Start Slack OAuth |
| GET | `/api/slack/callback` | Slack OAuth callback |
| GET | `/api/slack/status` | Slack connection status |
| POST | `/api/slack/disconnect` | Disconnect Slack |
| GET | `/admin/queues` | BullMQ dashboard |

## Tests and checks

```bash
npm test                         # backend Vitest suite
npm run build                    # backend tsc + frontend tsc/vite build
npm run typecheck --workspace frontend
```

Tests cover scheduling time calculation, Zod validation, idempotency hashing/stable job IDs,
rate-limit delay math, and rate-limited job rescheduling.

## Useful commands

```bash
npm run docker:up
npm run docker:down
npm run db:push
npm run db:generate
npm run dev:backend
npm run dev:worker
npm run dev:frontend
npm test
npm run build
npm run reindex --workspace backend
npm run ethereal:create --workspace backend
```

## Production notes

- Change `SESSION_SECRET` and `ENCRYPTION_KEY`.
- Set `COOKIE_SECURE=true` and serve over HTTPS.
- Restrict CORS to the real frontend origin.
- Protect `/admin/queues` with `QUEUE_DASHBOARD_USER/PASSWORD` or a reverse proxy.
- Run the API and worker as separate processes/containers.
- Back up the PostgreSQL and Redis volumes.
