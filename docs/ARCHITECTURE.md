# Architecture

## Overview

Unified Material Code is a multi-tenant platform connecting individual CPSE systems to a national material registry managed by the Ministry.

```
┌──────────────────┐        ┌──────────────────┐
│  CPSE Portal     │        │ Ministry Portal  │
│  /cpse/*         │        │ /ministry/*      │
└────────┬─────────┘        └────────┬─────────┘
         │  JWT bearer token          │
         └─────────────┬──────────────┘
                       ▼
         ┌─────────────────────────────┐
         │   Express API (server.ts)   │
         │  authenticateToken          │
         │  requireCpseMatch           │
         │  requireMinistry            │
         └─────────────┬───────────────┘
                       ▼
         ┌─────────────────────────────┐
         │      Prisma ORM             │
         └─────────────┬───────────────┘
                       ▼
         ┌─────────────────────────────┐
         │       PostgreSQL             │
         └─────────────────────────────┘
```

## Data model

The schema splits into two halves, mirroring the "spokes and hub" model.

### Local tables — the spokes

One CPSE's private data. Every row carries `tenantCpseId` for isolation.

| Model | Purpose |
| --- | --- |
| `LocalInventory` | A CPSE's stock, keyed by its own local material code |
| `LocalAuditLog` | That CPSE's local change history |
| `OutboundDemand` | Material a CPSE needs from others |
| `InboundSupplyRequest` | Material other CPSEs have offered this CPSE |

### Global tables — the hub

Ministry-owned, cross-tenant.

| Model | Purpose |
| --- | --- |
| `GlobalAuditLog` | Every mutation across **all** tenants, in one stream |
| `GlobalCatalogMapping` | Local code ↔ National Code mapping, with approval state |
| `MinistryDemandBatch` | A demand batch raised by the Ministry |
| `MinistryDemandItem` | One line item within a batch |
| `MinistryOrderRouting` | Which CPSE was routed to fulfil which item |

### Users

`User` carries `role` (`CPSE` or `MINISTRY`) and `tenantCpseId`. Ministry users have a null `tenantCpseId`.

## Authorization model

Three Express middlewares, applied per route:

1. **`authenticateToken`** — verifies the JWT and attaches the decoded payload to `req.user`. Every `/api/cpse/*` and `/api/ministry/*` route requires it.
2. **`requireCpseMatch`** — allows the request only if the caller is Ministry, or `req.user.tenantCpseId` matches the `:id` in the path. This is the tenant isolation boundary.
3. **`requireMinistry`** — rejects any caller whose role is not `MINISTRY`.

CPSE-scoped routes carry both `authenticateToken` and `requireCpseMatch`; Ministry routes carry `authenticateToken` and `requireMinistry`.

The distinction matters: a valid CPSE token is still rejected on a foreign tenant's inventory, and rejected outright on Ministry routes.

## Material matching

The mapping problem — "is ONGC's `MS-PLATE-10` the same as BHEL's `MSPL10T`?" — is handled by the ML layer described in [ML.md](./ML.md). The flow is:

1. A local code with no mapping is flagged for review.
2. The ML layer scores candidate national codes (embeddings, BM25, TF-IDF).
3. High-confidence candidates are **proposed** as `GlobalCatalogMapping` rows.
4. A Ministry reviewer approves, overrides, or reverts.

Human approval is mandatory. Nothing is auto-mapped into the national catalog.

## Auditability

Two audit layers:

- **Local** (`LocalAuditLog`) — per-tenant history, used by the CPSE audit page.
- **Global** (`GlobalAuditLog`) — cross-tenant stream including Ministry actions, used by the Ministry audit page.

Ministry approvals of catalog mappings are the highest-stakes events, since they define the national registry.

## Frontend structure

Next.js App Router, two parallel route trees sharing components:

- `src/app/cpse/` — `overview`, `erp` (inventory), `demands`, `inbound`, `audit`
- `src/app/ministry/` — `overview`, `catalog`, `routing`, `audit`, `cpses`
- `src/components/` — `Dialog`, `PaginationControls`, `PageLoader`, `AshokaChakraSpinner`
- `src/hooks/` — `useFirstLoad`

Each tree has its own `layout.tsx` (shell + nav) and `loading.tsx` (route-level fallback).
