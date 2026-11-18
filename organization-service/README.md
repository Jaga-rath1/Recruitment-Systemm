# Organization Service

Part of NexNuv Orbit HRMS platform.

**Port:** 4003
**Schema:** organization

## Setup

```bash
cp .env.example .env
# Set DATABASE_URL to your Neon PostgreSQL connection string
npm install
npm run dev
```

## Health

`GET http://localhost:4003/health`

```json
{ "success": true, "service": "organization-service" }
```

## Migrations

```bash
npm run db:migrate          # run pending migrations
npm run db:migrate:undo     # undo last migration
npm run db:seed             # run all seeders
```

The initial migration creates the `organization` schema on first run.


## Module Structure

```
src/modules/<feature>/
├── <feature>.model.js       Sequelize model
├── <feature>.routes.js      Express router
├── <feature>.controller.js  Request handlers
├── <feature>.service.js     Business logic
└── <feature>.validation.js  Input validation
```
