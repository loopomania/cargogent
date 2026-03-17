# CargoGent

CargoGent tracks **AWBs (Air Waybills)** across carriers and updates status for multi-tenant workflows (email ingestion, status checks, notifications).

**Repository**: [https://github.com/loopomania/cargogent](https://github.com/loopomania/cargogent)

## What's in this repo

| Item | Description |
|------|-------------|
| **Caddy** | Reverse proxy (port 80): routes `/api/*` → backend, `/track/*` and `/health` → AWBTrackers, `/n8n/*` → n8n, `/*` → frontend. |
| **Backend** | Node.js (Express) API: auth placeholder, proxy to AWBTrackers at `/api/track/*`, health, DB connection (dev: Postgres, prod: Neon REST). |
| **Frontend** | React (Vite) SPA: login, admin dashboard (AWB query), customer placeholder, left sidebar layout. |
| **AWBTrackers** | Python/FastAPI service that retrieves tracking info for AWBs from airline sites. Used by backend and n8n. |
| **n8n** | Workflow engine; Workflow 2 (AWB status check) stub in `n8n-workflows/`. |
| **Specs & docs** | System requirements, Excel format, AWB status details, design/architecture. |
| **awbs/** | Reference Excel files and DSV tracing specification. |
| **scripts/** | Deploy (Hetzner), post-deploy tests (accessibility + AWBTrackers benchmark), Markdown → Docx. |

## Local development (full stack)

1. Copy `.env.example` to `.env` (it includes the first admin: `alon@cargogent.com`; set optional `PROXY_URL` for AWBTrackers).
2. Run with Docker Compose:

```bash
docker compose up --build
```

- **Caddy**: http://localhost (port 80)
- **Frontend**: http://localhost (served via Caddy)
- **Backend**: http://localhost/api/health, http://localhost/api/track/:awb
- **AWBTrackers**: http://localhost/track/*, http://localhost/health
- **n8n**: http://localhost/n8n
- **Postgres**: localhost:5432 (user `cargogent`, password `dev`, db `cargogent`)

3. Apply DB migrations once (optional, for backend DB health check):

```bash
docker compose exec -T postgres psql -U cargogent -d cargogent -f - < backend/migrations/001_tenants.sql
```

## Post-deploy tests

After deployment (or locally), run accessibility and AWBTrackers benchmark:

```bash
./scripts/post-deploy-test.sh [BASE_URL]
# Examples:
./scripts/post-deploy-test.sh
./scripts/post-deploy-test.sh http://localhost:80
AWBTRACKERS_BASE_URL=http://168.119.228.149:8000 ./scripts/post-deploy-test.sh
```

- **Accessibility**: GET /health, GET /api/health, GET /track/elal/11463874650
- **Benchmark**: runs `AWBTrackers/benchmark_trackers.py` with `AWBTRACKERS_BASE_URL` (uses `/track/:awb`)

The existing **deploy script** (`scripts/deploy.sh`) deploys AWBTrackers to Hetzner and then runs these tests against the deployed URL.

## Documentation

- **[System-requirmets.md](System-requirmets.md)** — System purpose, multi-tenancy, workflows, database design.
- **[design-architecture.md](design-architecture.md)** — Architecture, Caddy, backend, frontend, n8n, AWBTrackers.
- **[Excel-format.md](Excel-format.md)** — Expected format of Excel attachments (AWBs and column mapping).
- **[awb-status_details.md](awb-status_details.md)** — Fields for status details (ETD, ATD, ETA, ATA, pieces, etc.).

## AWBTrackers (tracking service)

- **Location**: [AWBTrackers/](AWBTrackers/)
- **Docker image**: `cargogent` (build from `AWBTrackers/`).
- **API**: `GET /track/{airline}/{awb}`, `GET /track/{awb}`, `GET /health`. See [AWBTrackers/architecture.md](AWBTrackers/architecture.md).

## Production (Hetzner + Neon)

- **Stack**: `docker-compose.prod.yml` — Caddy, frontend (static build), backend, AWBTrackers, n8n. No local Postgres; backend uses **Neon** via `DATABASE_URL` (Postgres connection string from [Neon Console](https://console.neon.tech)).
- **Env**: Copy [.env.prod.example](.env.prod.example) into `.env` and set `DATABASE_URL` (Neon connection string), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, optional `PROXY_URL`.
- **Deploy**:
  ```bash
  ./scripts/deploy-prod.sh
  ```
  Syncs repo to Hetzner, runs `docker compose -f docker-compose.prod.yml up -d --build`. Server: `CARGOGENT_SERVER_IP=168.119.228.149` (default).
- **Neon schema**: Run [backend/migrations/001_tenants.sql](backend/migrations/001_tenants.sql) once against your Neon DB (e.g. via Neon SQL Editor or `psql` with the Neon connection string).

## Israel ground handling (Swissport / Maman)

Once cargo lands in Israel it is transferred to a local distributor before delivery. Swissport Israel and Maman are terminal/ground handling providers. To query AWB status you may need AWB and house bill. For outbound cargo they are handled by Swissport Israel or Maman before being loaded onto the airline. An airline typically works with one of the two. In the Excel you have **Master** and **House Ref**; query Swissport and Maman to map. See: https://www.swissport.co.il/heb/Main/

## Version control

```bash
git remote -v   # origin → https://github.com/loopomania/cargogent.git
```
