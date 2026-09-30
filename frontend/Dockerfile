# syntax=docker/dockerfile:1

# ── deps ────────────────────────────────────────────────────────────────────
# deps stage: full dependency tree, used only for building
FROM node:22-alpine AS deps
WORKDIR /app

# libc6-compat is needed by the Prisma-less Next build for some native deps.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
# `npm ci` when a lockfile exists (reproducible), `npm install` otherwise.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked into the client bundle at build time. Empty means "same origin", which
# is what we want behind nginx: /api is proxied to the backend on the same
# host, so the browser needs no absolute origin and no CORS.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat curl

# next/image writes here at runtime; /tmp is used for the build cache.
RUN mkdir -p .next/cache && chown -R node:node /app/.next

# Run unprivileged. The node image ships a `node` user (uid 1000).
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
