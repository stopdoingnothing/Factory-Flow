# 07 — Infrastructure

## Overview

Factory Flow is deployed as a **Docker Compose stack** on a single host. Three containers run together: the application, the database, and a backup daemon. All persistent data is stored on the host filesystem, not in Docker-managed volumes.

---

## Docker Compose Services

```mermaid
graph LR
    subgraph Host
        subgraph "Docker Compose Stack"
            app["app\nNode.js 20\nport 5000"]
            db["db\nPostgreSQL 16\nport 5432 (internal)"]
            backup["backup\npg_dump daemon\nevery 6 hours"]
        end
        data["./data/\n├── postgres/\n└── backups/"]
    end
    internet["Internet / Reverse Proxy"] -->|"port 5000 or 443"| app
    app -->|"SQL"| db
    backup -->|"pg_dump"| db
    db -->|"bind mount"| data
    backup -->|"bind mount"| data
```

| Service | Image | Exposed ports | Role |
|---------|-------|---------------|------|
| `app` | custom (Dockerfile) | `5000:5000` | Express API + React SPA |
| `db` | `postgres:16-alpine` | internal only | PostgreSQL database |
| `backup` | `postgres:16-alpine` | none | 6-hourly pg_dump daemon |

The database name and user are both `factoryflow`.

---

## Container Build (`Dockerfile`)

Multi-stage build to minimise the runtime image size:

```
Stage 1 — Build (node:20-alpine)
  ├── npm ci (install all deps including devDeps)
  ├── vite build → dist/
  └── esbuild server → dist/index.cjs

Stage 2 — Runtime (node:20-alpine)
  ├── npm ci --omit=dev (production deps only)
  ├── COPY dist/ from Stage 1
  └── ENTRYPOINT docker-entrypoint.sh
```

The build stage includes all dev dependencies (TypeScript, Vite, etc.) but the runtime stage only installs production dependencies, keeping the final image lean.

---

## Startup Sequence (`docker-entrypoint.sh`)

On every container start:
1. Wait for PostgreSQL to accept TCP connections (`pg_isready -h db -p 5432 -U factoryflow`)
2. Run `npx drizzle-kit migrate --config=drizzle.config.ts` — applies any pending migrations
3. Run idempotent SQL to create unmanaged tables (`sessions`, `audit_logs`) not tracked by Drizzle
4. Start the application: `node dist/index.cjs`

This ensures the database schema is always up to date before the application accepts traffic.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `POSTGRES_PASSWORD` | Yes | `changeme` | PostgreSQL password (shared between all services) |
| `SESSION_SECRET` | No | dev default | Session cookie signing key — **set this in production** |
| `POSTMARK_API_KEY` | No | — | Email sending; if absent, all emails are silently skipped |
| `NODE_ENV` | No | `development` | Set to `production` in Docker Compose |
| `PORT` | No | `5000` | Port the Express server listens on |
| `TRUST_PROXY` | No | — | Set to `true` when behind a reverse proxy (enables secure cookies) |
| `DATABASE_URL` | Yes (runtime) | Set by Compose | Full PostgreSQL connection string |

In Docker Compose, `DATABASE_URL` is assembled from other variables:
```yaml
DATABASE_URL: postgres://factoryflow:${POSTGRES_PASSWORD}@db:5432/factoryflow
```

---

## Data Persistence

All persistent data lives under `./data/` on the host:

```
./data/
├── postgres/     ← PostgreSQL data directory (bind-mounted into db container)
└── backups/      ← pg_dump .sql.gz files (bind-mounted into backup container)
```

**Why host bind-mounts instead of Docker volumes?** See [ADR-005](08-decision-log.md#adr-005-host-bind-mounts-for-data-storage).

### Backup retention
The backup daemon runs a continuous while/sleep loop (not cron):
```bash
while true; do
  FILENAME=/backups/factoryflow_$(date +%Y%m%d_%H%M%S).sql.gz
  pg_dump -h db -U factoryflow factoryflow | gzip > $FILENAME
  find /backups -name 'factoryflow_*.sql.gz' -mtime +90 -delete
  sleep 21600   # 6 hours
done
```
Up to ~360 backup files (90 days × 4 per day) are retained at any time. Each file is gzip-compressed SQL.

---

## Deployment Steps

### First-time deployment

```bash
# 1. Clone the repository
git clone <repo-url>
cd "Factory Flow"

# 2. Create .env
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and SESSION_SECRET

# 3. Start the stack
docker compose up -d

# 4. Verify
docker compose logs app --follow
```

The application is available at `http://localhost:5000` after the startup sequence completes (typically 10–20 seconds on first run while migrations run).

### Upgrading

```bash
# 1. Pull latest code
git pull

# 2. Rebuild and restart the app container only
docker compose up -d --build app

# Migrations run automatically on startup
```

The `db` and `backup` containers do not need to be rebuilt for application updates.

---

## Reverse Proxy

For production deployments with HTTPS, place a reverse proxy (Nginx, Caddy, Traefik) in front of port 5000 and set `TRUST_PROXY=true` in the app's environment. This enables:
- `secure` flag on session cookies (HTTPS-only)
- Correct client IP extraction from `X-Forwarded-For` headers

Example Nginx location block:
```nginx
location / {
    proxy_pass http://localhost:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## Network

All three containers share a single Docker Compose default network. The `app` and `backup` containers reference the database as `db` (the service name). No ports are exposed externally except `5000` on the app container.

---

## Development

For local development outside Docker, node/npm must be available in the dev container — not the host shell.

```bash
# Start PostgreSQL (e.g. via Docker)
docker run -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=factoryflow -e POSTGRES_DB=factoryflow \
  -p 5432:5432 -d postgres:16-alpine

# Set environment
export DATABASE_URL=postgres://factoryflow:dev@localhost:5432/factoryflow

# Run migrations
npm run db:push

# Start development servers
npm run dev          # Express with tsx (hot reload) + Vite dev server
```

Development uses Vite's dev server with a proxy to the Express backend, so both run on port 5000 from the browser's perspective.
