# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @erp-mail/api... build
RUN pnpm --filter @erp-mail/api deploy --prod /out
RUN cp -r apps/api/prisma /out/prisma && cd /out && node_modules/.bin/prisma generate

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
