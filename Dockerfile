# Satu Dockerfile untuk semua aplikasi monorepo; pilih dengan --target (api | web).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@lifestore/api... --filter=@lifestore/web...

# API NestJS. Migrasi: `node dist/database/migrate.cli.js` (perintah terpisah, ADR 0005).
FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]

# Web Next.js (output standalone).
FROM node:22-alpine AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
