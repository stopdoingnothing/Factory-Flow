# AECE Checkpoint — Factory Flow

Workforce management system covering leave management, attendance tracking, org chart, and HR administration.

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or Docker Engine + Compose plugin (Linux)
- Git
- A database backup `.json` file exported from the live system (provided separately — not included in this repository)

---

## Deploying on a new machine

There are two ways to deploy. Choose one.

---

### Option A — Deploy from pre-built image (recommended)

No source code needed. Downloads the pre-built image from the GitHub Container Registry.

**1. Download the two required files**

```bash
curl -O https://raw.githubusercontent.com/stopdoingnothing/Factory-Flow/SDN/docker-compose.release.yml
curl -O https://raw.githubusercontent.com/stopdoingnothing/Factory-Flow/SDN/.env.example
```

**2. Run the setup script** *(or skip to step 3 and edit `.env` manually)*

```bash
curl -O https://raw.githubusercontent.com/stopdoingnothing/Factory-Flow/SDN/setup.sh
bash setup.sh
```

The script generates a `SESSION_SECRET` automatically and prompts for your database password and app URL.

**3. Start the application**

```bash
docker compose -f docker-compose.release.yml up -d
```

---

### Option B — Deploy from source

Builds the image locally. Requires cloning the repository.

**1. Clone the repository**

```bash
git clone https://github.com/stopdoingnothing/Factory-Flow.git
cd "Factory Flow"
```

**2. Run the setup script** *(or copy `.env.example` to `.env` and edit manually)*

```bash
bash setup.sh
```

**3. Start the application**

```bash
docker compose up -d
```

---

### Environment file reference

If setting up `.env` manually instead of using `setup.sh`:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Password for the database. Use any strong password. |
| `SESSION_SECRET` | Long random string used to sign session cookies. Generate with: `openssl rand -hex 32` |
| `APP_URL` | Public URL of this app, used in email links (no trailing slash). |
| `POSTMARK_API_KEY` | Optional. API key for email notifications. Leave empty to disable emails. |

Once started, the app is available at:

```
http://localhost:5000
```

Or replace `localhost` with the machine's IP address if accessing from another machine.

### Log in for the first time

The default admin account is created during the first startup. Use the credentials provided by your system administrator.

### Restore the database backup

On a fresh install the database contains only the schema — no employees, org chart, or settings. To load the full dataset:

1. Log in as an administrator
2. Click **Database Backup** in the left sidebar
3. On the **Restore from Backup** panel, click the upload area and select the `.json` backup file
4. Review the record counts shown in the validation summary
5. Click **Restore Data**

The restore is additive — it will never overwrite records that already exist.

---

## Updating an existing installation

To pull the latest changes and redeploy:

```bash
git pull
docker compose build app
docker compose up -d app
```

The database schema is updated automatically on startup.

---

## Data storage

All persistent data lives on the host machine under `./data/` — it is never stored inside Docker containers or volumes that Docker controls. This means:

| Path | Contents |
|---|---|
| `./data/postgres/` | Live PostgreSQL database files |
| `./data/backups/` | Hourly automated backups (`.sql.gz`), retained for 7 days |

You can back up or migrate the entire system by copying the `./data/` directory.

> **Important:** The `./data/` directory is excluded from git. It is never committed to the repository.

---

## Taking a manual backup

From the admin interface: **Database Backup → Download Backup**

This exports the full database as a `.json` file that can be restored on any instance of this system using the restore panel.

---

## Stopping the application

```bash
# Stop without removing data
docker compose down

# Stop and remove containers (data in ./data/ is preserved)
docker compose down --volumes
```

---

## Ports

| Port | Service |
|---|---|
| `5000` | Application (API + frontend) |

The database port is not exposed outside the Docker network.

---

## Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | `changeme` | Database password |
| `SESSION_SECRET` | No | built-in default | Session signing key — recommended to set in production |
| `POSTMARK_API_KEY` | No | _(empty)_ | Postmark API key for email. Leave empty to disable. |

---

## Troubleshooting

**App not reachable after startup**

Check that the containers are running:
```bash
docker compose ps
```

Check the application logs:
```bash
docker compose logs app --tail 50
```

**Database connection errors on startup**

The app waits for the database to be healthy before starting. If this fails repeatedly, check that `POSTGRES_PASSWORD` in `.env` matches what is expected, then restart:
```bash
docker compose down
docker compose up -d
```

**Schema errors / missing tables**

On every startup the entrypoint applies each `migrations/0*.sql` file in order via `psql` (it no longer uses `drizzle-kit push`, which could exit 0 on failure). The files are written to be idempotent, so re-applying them is safe. If it fails, check the logs:
```bash
docker compose logs app | grep "entrypoint\|ERROR\|migrate"
```

Adding a schema change means adding a new numbered file under `migrations/` — a column that exists only in `shared/schema.ts` will be missing from every deployed database.
