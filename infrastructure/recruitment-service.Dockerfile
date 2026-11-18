FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY .sequelizerc ./
COPY src ./src

RUN mkdir -p /app/storage /app/storage/_quarantine && addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app && chmod 750 /app/storage /app/storage/_quarantine
USER appuser

EXPOSE 4007
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node src/db/seed.js && node src/server.js"]
