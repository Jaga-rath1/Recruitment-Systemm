# Employee Service

Part of NexNuv Orbit HRMS platform.

**Port:** 4004
**Schema:** employee

## Setup

```bash
cp .env.example .env
# Set DATABASE_URL to your Neon PostgreSQL connection string
npm install
npm run dev
```

## Health

`GET http://localhost:4004/health`

```json
{ "success": true, "service": "employee-service" }
```

## Migrations

```bash
npm run db:migrate          # run pending migrations
npm run db:migrate:undo     # undo last migration
npm run db:seed             # run all seeders
```

The initial migration creates the `employee` schema on first run.


## Module Structure

```
src/modules/<feature>/
├── <feature>.model.js       Sequelize model
├── <feature>.routes.js      Express router
├── <feature>.controller.js  Request handlers
├── <feature>.service.js     Business logic
└── <feature>.validation.js  Input validation
```
