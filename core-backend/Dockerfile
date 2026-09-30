# syntax=docker/dockerfile:1

# Build context is the REPOSITORY ROOT, not this directory:
#   dockerfile: core-backend/Dockerfile
#   context: .
# so the image can copy the root ML_Training_Data_Master.csv that prisma/seed.ts
# reads. Building from ./core-backend left the CSV out of the image and the
# seed silently produced an empty catalog.

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# openssl is required by Prisma's query engine; ca-certificates for outbound TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY core-backend/package.json core-backend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY core-backend/ ./

# Prisma Client must exist before tsc runs: without it every Prisma delegate
# resolves to `any` and strict mode fails with TS7006 across server.ts.
RUN npx prisma generate

# Compile TypeScript so the runtime image needs no ts-node/tsx.
RUN npx tsc -p tsconfig.json

# ── prod-deps ───────────────────────────────────────────────────────────────
# A dependency-only stage so the runtime image carries neither the TypeScript
# toolchain nor the devDependencies. prisma/seed.ts and db push run at boot and
# both need the prisma CLI, so it stays a (runtime) dependency.
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY core-backend/package.json core-backend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ── runner ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node core-backend/package.json ./package.json
COPY --chown=node:node core-backend/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma

# `npm ci --omit=dev` leaves @prisma/client ungenerated, and every Prisma call
# then throws "did not initialize yet". Generate against the runtime's own
# node_modules rather than copying the build stage's client, so the engine
# matches the libraries actually installed here.
RUN npx prisma generate

# prisma/seed.ts resolves this via path.join(__dirname, '../...'). Baked into
# the image so seeding works from a plain `docker run` with no bind mount.
COPY --chown=node:node ML_Training_Data_Master.csv ./ML_Training_Data_Master.csv

COPY --chown=node:node deploy/core-backend-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
