# NEXNUV Recruitment

Enterprise multi-tenant SaaS Recruitment microservice and React web platform designed to operate independently during development and integrate seamlessly with the NEXNUV HRMS shared microservices ecosystem (Platform Admin, Auth Service, Employee Service, Notification Service, API Gateway, and HRMS Core).

## Architecture Overview

```
NEXNUV-Recruitment/
├── client/                # React + Vite + Tailwind CSS SaaS Marketing, Org Dashboard & Candidate Portal
├── recruitment-service/   # Node.js + Express + PostgreSQL + Sequelize microservice (Routes → Controllers → Services → Repositories → DB)
├── docs/                  # Architecture, Database Schema, ERD, Integration Contracts, OpenAPI & Implementation Status
├── infrastructure/        # Docker Compose, Dockerfiles, Nginx gateway proxy, Postgres initialization
└── scripts/               # Setup, migration, backup, restore, and automated test scripts
```

## Key Architectural Principles

- **Independent Recruitment Microservice**: Dedicated PostgreSQL database (`recruitment_service`) with UUID primary keys, tenant isolation via `organisation_id`, Sequelize migrations, and ACID transactions.
- **Zero Message Brokers**: All integrations and notifications execute via synchronous/resilient REST adapters—no RabbitMQ, BullMQ, Kafka, or Redis queues.
- **Adapter-Based Shared Service Integration**: Cleanly decoupled adapters in `recruitment-service/src/integrations/` (`auth`, `employee`, `notification`, `platform-admin`, `hrms`, `storage`). Supports `INTEGRATION_MODE=standalone` for local independent development and `INTEGRATION_MODE=live` for production shared-service APIs.
- **Enterprise Security**: JWT verification, granular backend RBAC (`Organisation Admin`, `Recruiter`, `Technical Interviewer`, `Senior Interviewer`, `Candidate`), strict tenant isolation, idempotency keys, secure file storage & authorized download URLs, rate limiting, Helmet security headers, and full audit logging.

## Quick Start

### 1. Backend (`recruitment-service`)

```bash
cd recruitment-service
cp .env.example .env
npm install
npm run db:migrate
npm run seed
npm run dev
```

### 2. Frontend (`client`)

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

### 3. Automated Tests

```bash
# Backend unit + integration tests
cd recruitment-service && npm test

# Frontend component + workflow tests
cd client && npm test
```

See `docs/` for detailed documentation:
- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [ERD](docs/ERD.md)
- [Integration Contracts](docs/INTEGRATION_CONTRACTS.md)
- [OpenAPI Spec](docs/OPENAPI.yaml)
- [Backup & Recovery](docs/BACKUP_RECOVERY_STRATEGY.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)

