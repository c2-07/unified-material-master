# Unified Material Code

A unified catalog platform that gives India's Central Public Sector Enterprises (CPSEs) and the Ministry a single source of truth for materials, inventory, and demand.

## The problem

Every CPSE maintains its own material codes and inventory system. ONGC's "MS Plate 10mm" and BHEL's equivalent are stored under completely different identifiers, with no mapping between them. The Ministry has no consolidated view, so it cannot answer basic questions: *how much steel is available across all public sector units? Which supplier can fulfil this demand?*

Matching these by hand is manual, error-prone, and slow.

## The solution

`Unified Material Code` assigns every material a **National Code** and maintains a mapping layer between each CPSE's local codes and that national code.

- **CPSEs** keep operating in their own local codes, but their inventory and demands are visible on the national registry.
- **The Ministry** gets a consolidated national catalog, approves proposed mappings, and routes demand across CPSEs.
- **Matching is assisted by ML** — sentence-transformer embeddings, BM25, and TF-IDF similarity propose candidate mappings, which a Ministry reviewer then approves or overrides. The ML *proposes*; a human *decides*.

### Two role-based interfaces

| Interface | Route | Who uses it |
| --- | --- | --- |
| CPSE portal | `/cpse/*` | A CPSE managing its own inventory, demands, and inbound requests |
| Ministry portal | `/ministry/*` | Ministry reviewing catalog mappings, routing orders, auditing all activity |

## Tech stack

**Frontend** — Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4

**Backend** — Express, TypeScript, Prisma ORM, SQLite, JWT auth, bcrypt

**ML** — sentence-transformers (`all-MiniLM-L6-v2`), BM25, TF-IDF, scikit-learn

## Architecture

```
frontend/          Next.js app — CPSE and Ministry portals
  src/app/cpse/      CPSE pages: overview, erp, demands, inbound, audit
  src/app/ministry/  Ministry pages: overview, catalog, routing, audit, cpses
core-backend/     Express API + Prisma schema
  server.ts         REST API, ~40 endpoints
  prisma/           schema, migrations, seed scripts
ai_models/        Model configs and metadata (weights not committed)
```

Requests flow: **browser → JWT-authenticated Express API → Prisma → SQLite**, with a separate **global audit log** capturing every mutation across all tenants.

### Multi-tenant authorization

CPSE users are scoped to their own tenant by `requireCpseMatch` middleware — a CPSE cannot read another CPSE's inventory even with a valid token. Ministry-only routes are gated by `requireMinistry`. Every CPSE-scoped route carries both.

## Getting started

### Prerequisites

- Node.js 20+
- Docker (optional, for the containerised setup)

### Backend

```bash
cd core-backend
npm install
npx prisma migrate dev
npm run seed      # optional demo data
npm run dev
```

API starts on `http://localhost:3001`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App starts on `http://localhost:3000`.

### Docker

```bash
docker compose up --build
```

### Demo login

Development helper routes let you assume a role without registering:

```bash
curl -X POST http://localhost:3001/api/dev/login-as \
  -H 'Content-Type: application/json' -d '{"role":"MINISTRY"}'
```

## Design

The interface is a dense, utility-first B2B dashboard — see [DESIGN.md](./DESIGN.md) for the full design system (typography, palette, surfaces, and component conventions).

## Project documents

- [DESIGN.md](./DESIGN.md) — design system
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system design and data model
- [docs/SETUP.md](./docs/SETUP.md) — detailed local setup
- [docs/ML.md](./docs/ML.md) — how material matching works
- [docs/API.md](./docs/API.md) — endpoint reference
