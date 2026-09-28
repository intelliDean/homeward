# Homeward — Production Docker Containerization Guide

This guide details the containerized architecture and operational procedures for deploying Homeward in production using Docker and Docker Compose.

---

## 1. Containerized Architecture Overview

Homeward's production topology consists of four containerized services orchestrated within an isolated bridge network (`homeward-network`):

```
                       [ Public Traffic ]
                                │
                                ▼
                       ┌─────────────────┐
                       │    frontend     │ (Next.js Standalone / Node 20)
                       │   :3000 -> :3000│
                       └────────┬────────┘
                                │
         ┌──────────────────────┴──────────────────────┐
         │                                             │
         ▼                                             ▼
┌──────────────────┐                         ┌──────────────────┐
│     postgres     │                         │      worker      │ (Daemon / Node 20)
│  :5432 (Internal)│◄────────────────────────┤  (Background)    │
│  (Persistent)    │                         └────────┬─────────┘
└──────────────────┘                                  │
                                                      ▼
                                             ┌──────────────────┐
                                             │      redis       │
                                             │  :6379 (Internal)│
                                             │  (BullMQ queues) │
                                             └──────────────────┘
```

### Services Summary

| Service | Image / Base | Role & Responsibilities | Resource / Volume |
| :--- | :--- | :--- | :--- |
| **`worker`** | Multi-stage `node:20-alpine` (63.5 MB) | Background daemon scanning Nova, tracking finality, executing Outbox claims, and dispatching retryable tickets. | Protected by non-root user (`node`) & `tini` init supervisor. |
| **`frontend`** | Multi-stage `node:20-alpine` (55.4 MB) | Web UI and REST API querying migration status. Uses Next.js `output: 'standalone'`. | Non-root `nextjs` user. Exposes `:3000`. |
| **`postgres`** | `postgres:16-alpine` | Relational store for migration jobs, tx hashes, block checkpoints, and timestamps. | Volume: `postgres_prod_data` with health check. |
| **`redis`** | `redis:7-alpine` | BullMQ message broker with AOF persistence and LRU eviction policy (`512mb` cap). | Volume: `redis_prod_data` with health check. |

---

## 2. Image Optimization Highlights

* **Multi-Stage Builds**:
  * Dependencies and dev tools (`tsc`, TypeScript compiler) are contained in the builder stage.
  * Runtime images only contain the minimal production dependencies and compiled artifacts.
  * Image sizes: Worker (`63.5 MB`), Frontend (`55.4 MB`).
* **Process Lifecycle Supervision**:
  * Worker uses `tini` as PID 1 to properly handle `SIGTERM` and `SIGINT` signals, ensuring in-flight blockchain transactions exit gracefully without leaving orphaned state.
* **Security & Non-Root Execution**:
  * Both application containers run as dedicated unprivileged users (`node` UID 1000 and `nextjs` UID 1001).
* **Network Health Dependencies**:
  * Worker and Frontend will wait for PostgreSQL and Redis to be completely ready (`service_healthy`) before initiating database connection pools.

---

## 3. Deployment Instructions

### Step 1: Prepare Production Environment

Ensure `.env.production` is populated with your production RPCs and contract addresses:

```bash
cp .env.production.example .env.production
# Edit .env.production with your production keys and endpoints
```

### Step 2: Build Production Images

```bash
npm run docker:prod:build
```

*(Or directly via Docker Compose)*:
```bash
docker compose -f docker-compose.prod.yml build
```

### Step 3: Launch Containers

```bash
npm run docker:prod:up
```

Verify that all containers are healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

### Step 4: Inspect Live Logs

To tail logs across all services:

```bash
npm run docker:prod:logs
```

Or for a specific service:

```bash
docker compose -f docker-compose.prod.yml logs -f worker
```

---

## 4. Maintenance & Operations

### Stopping the Stack
```bash
npm run docker:prod:down
```

### Database Backups
To take a zero-downtime backup of the production database:
```bash
docker exec -t homeward-prod-postgres pg_dump -U postgres homeward_production > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Database Restore
```bash
docker exec -i homeward-prod-postgres psql -U postgres homeward_production < backup.sql
```
