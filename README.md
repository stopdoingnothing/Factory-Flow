# AECE Checkpoint — Factory Flow

Workforce management system covering leave management, attendance tracking, org chart, and HR administration.

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or Docker Engine + Compose plugin (Linux)
- Git
- A database backup `.json` file exported from the live system (provided separately — not included in this repository)

---

## First-time setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd "Factory Flow"
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Open `.env` and set the following values:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Password for the database. Use any strong password. |
| `SESSION_SECRET` | Optional. Long random string used to sign session cookies. A default is used if not set — recommended to change for production. |
| `POSTMARK_API_KEY` | Optional. API key for email notifications. Leave empty to disable emails. |

### 3. Start the application

```bash
docker compose up -d
```

This will:
- Pull the PostgreSQL 16 image
- Build the application container
- Apply the database schema automatically
- Start the app on port **5000**

The first build takes a few minutes. Once started, the app is available at:

```
http://localhost:5000
```

Or replace `localhost` with the VM's IP address if accessing from another machine.

### 4. Log in for the first time

The default admin account is created during the first startup. Use the credentials provided by your system administrator.

### 5. Restore the database backup

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

The entrypoint script runs `drizzle-kit push` on every startup to apply any schema changes. If it fails, check the logs:
```bash
docker compose logs app | grep "drizzle\|schema\|migrate"
```
