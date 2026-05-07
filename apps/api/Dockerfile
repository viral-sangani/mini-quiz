# syntax=docker/dockerfile:1.7

# ─── Build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /repo

RUN corepack enable && apk add --no-cache openssl

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @mini-quiz/shared build \
 && pnpm --filter @mini-quiz/api prisma generate \
 && pnpm --filter @mini-quiz/api build

RUN pnpm --filter @mini-quiz/api deploy --prod /pruned

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl tini && corepack enable

ENV NODE_ENV=production \
    PORT=4000

COPY --from=build /pruned/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/package.json ./

# pnpm deploy --prod doesn't copy the .prisma generated client (it lives
# outside the package boundary in pnpm's .pnpm store). Re-run generate
# inside the runtime layout so @prisma/client can find the runtime engine.
RUN node_modules/.bin/prisma generate --schema prisma/schema.prisma

EXPOSE 4000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
