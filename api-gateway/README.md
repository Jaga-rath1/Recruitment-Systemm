# API Gateway

Single public entry point for all NexNuv Orbit API requests.

**Port:** 4000

## Routes

| Path | Target Service |
|------|----------------|
| /api/v1/auth/* | auth-service:4001 (public) |
| /api/v1/platform/* | platform-service:4002 |
| /api/v1/organizations/* | organization-service:4003 |
| /api/v1/employees/* | employee-service:4004 |
| /api/v1/attendance/* | attendance-leave-service:4005 |
| /api/v1/leave/* | attendance-leave-service:4005 |
| /api/v1/notifications/* | notification-service:4006 |

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

## Health

`GET http://localhost:4000/health`
