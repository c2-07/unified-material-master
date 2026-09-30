# Unified Material Code - Technical Project Report

## 1. Tech Stack & Architecture

The **Unified Material Code** project is built as a multi-tenant platform designed to bridge the gap between individual Central Public Sector Enterprises (CPSEs) and a consolidated national registry managed by the Ministry.

### Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4. Uses Axios for API communication and Lucide for iconography.
- **Core Backend:** Node.js (Express 5), TypeScript, Prisma ORM, JSON Web Tokens (JWT) for authentication, and bcrypt for password hashing.
- **Database:** PostgreSQL 15, managed through Prisma schema models.
- **ML Engine / Service:** Python 3.11, FastAPI, Uvicorn, utilizing libraries like `sentence-transformers` (all-MiniLM-L6-v2), `scikit-learn`, `rank-bm25`, and `rapidfuzz`.
- **Infrastructure:** Docker and Docker Compose (with an internal bridge network and Nginx as a reverse proxy/TLS terminator).

### System Architecture
The application employs a **Hub-and-Spoke architecture**:
- **Spokes (CPSEs):** Each CPSE interfaces with its own isolated local tables. Tenant isolation is strictly enforced via the `requireCpseMatch` JWT middleware.
- **Hub (Ministry):** The Ministry has a global view of all data, cross-tenant, enforced by the `requireMinistry` middleware.
The Next.js frontend queries the Express API. In production, Nginx proxies requests to the Express backend while the database and backend stay on an internal Docker network. The ML Engine acts as an independent service (`ml-api`), generating unified mappings either locally for seeding/inference or exposed via an opt-in profile.

---

## 2. System Components & Workflows

### Main Modules
1. **Next.js Portals:** Two distinct routing trees exist in the App Router: `/cpse/*` for CPSE tasks (inventory, demands) and `/ministry/*` for Ministry tasks (catalog review, order routing).
2. **Core Web API (Node.js):** The primary data router, orchestrating JWT-protected endpoints, interacting with Postgres, and performing transaction rollbacks and business logic.
3. **ML API (Python):** An AI matching module that correlates heterogeneous CPSE descriptions with the National Material Catalog codes using a hybrid ensemble model.

### Core User Journeys
**1. AI Mapping Review Process:**
- When a CPSE introduces a new local material code (e.g., via CSV bulk upload), the ML Engine evaluates the material and proposes a standard `nationalMaterialCode`.
- This proposal is stored in the `GlobalCatalogMapping` table with an `aiConfidenceScore`.
- A Ministry reviewer logs into the `/ministry/catalog` dashboard to review these candidates. They can bulk-approve, override, or revert mappings. Approved items receive a 100% confidence score, officially joining the global catalog.

**2. Demand and Supply Routing:**
- **Initiation:** A CPSE creates an `OutboundDemand` for a material.
- **Aggregation:** The backend links this to a `MinistryDemandBatch` and `MinistryDemandItem` translated to the national material code.
- **Routing:** The Ministry searches the global inventory for surplus and calls the `route-order` API, explicitly selecting a supplier CPSE. This generates a `MinistryOrderRouting` record and pushes an `InboundSupplyRequest` to the supplier's local database.
- **Fulfillment:** The supplier CPSE approves the inbound request. The Ministry completes the workflow by issuing a `send-ack`, changing the buyer's status to `FOUND_AVAILABLE` / `CONFIRMED`.

**3. Inventory Tracking:**
- CPSEs use the ERP module to add, edit, or delete `LocalInventory`, or bulk upload via CSV.
- Every modification is immutably logged in `LocalAuditLog` for CPSE-level tracing. 
- Cross-tenant or critical modifications (like deleting mapped items) are captured in the `GlobalAuditLog`.

---

## 3. Pipelines

### Containerization & Deployment
The system relies on a robust `docker-compose.prod.yml` configuration:
- **Core Backend:** Uses a multi-stage `Dockerfile`. It builds TypeScript (`npx tsc`) and prunes devDependencies to produce a slim runtime environment. Prisma migrations and seeding trigger automatically via a custom entrypoint script.
- **ML API:** Utilizes a lightweight `Dockerfile.ml` based on `python:3.11-slim`, leveraging `uv` for lightning-fast caching and installation of PyPI packages. Model weights and embeddings `.pkl` files are mounted securely via volumes (`/app/ai_models`).
- **Nginx Proxy:** Exposes HTTP/HTTPS ports externally while services run securely inside a custom `internal` bridge network.

### ML Inference Pipeline
The ML pipeline does not rely on a single string metric. It scores candidate codes utilizing a hybrid ensemble that evaluates five signals:
- **BERT Embeddings (40%):** `all-MiniLM-L6-v2` captures paraphrasing and synonyms.
- **TF-IDF Cosine (20%):** Identifies shared rare domain-specific terms.
- **BM25 (15%):** Length-normalized relevance indexing.
- **Fuzzy String (15%):** Mitigates legacy OCR noise and typos.
- **Jaccard (10%):** Acronym and token overlap mapping.

Confidence tiers dictate governance: $\ge 75\%$ is an auto-approval candidate, $50-74\%$ requires human review, and $< 50\%$ escalates as an unmapped catalog expansion request.

---

## 4. API Endpoints

### Core Web API (Express/Node.js)
**Auth:**
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/dev/login-as`

**CPSE Routes (Requires `cpseId` Match):**
- **Inventory:** `GET /api/cpse/:id/inventory`, `POST /api/cpse/:id/inventory`, `PATCH /api/cpse/:id/inventory/:invId`, `DELETE /api/cpse/:id/inventory/:invId`
- **Bulk Operations:** `POST /api/cpse/:id/inventory/bulk-upload`, `POST /api/cpse/:id/inventory/bulk-rollback`
- **Demands:** `GET /api/cpse/:id/demands`, `POST /api/cpse/:id/demands`, `PATCH /api/cpse/:id/demands/:demandId`
- **Supply:** `GET /api/cpse/:id/inbound-requests`, `PATCH /api/cpse/:id/inbound-requests/:reqId`
- **Views:** `/api/cpse/:id/overview`, `/api/cpse/:id/audit-logs`

**Ministry Routes (Requires Global Ministry Privileges):**
- **Catalog Management:** `GET /api/ministry/catalog`, `PATCH /api/ministry/catalog/:mappingId`, `POST /api/ministry/catalog/bulk-approve`, `POST /api/ministry/catalog/bulk-override`, `POST /api/ministry/catalog/revert`
- **Global Data:** `GET /api/ministry/global-inventory`, `GET /api/ministry/suppliers/:nationalCode`
- **Demand Routing:** `GET /api/ministry/demands`, `POST /api/ministry/route-order`, `POST /api/ministry/send-ack`
- **Views:** `/api/ministry/overview`, `/api/ministry/audit-logs`

### ML API (Python FastAPI)
- `POST /api/match-material`: Central inference endpoint that accepts a material description and evaluates candidate mappings against the loaded BM25/TF-IDF models and precomputed BERT catalog embeddings.

---

## 5. Database Schema & Tables

The schema (`core-backend/prisma/schema.prisma`) represents a clear separation of concerns between tenant silos and the central governing layer.

### CPSE Local Tables (The "Spokes")
- **`LocalInventory`**: Defines the CPSE's stock items, keyed by its own `localMaterialCode`, `quantity`, and `statusTag` (e.g., `ACTIVE_INTERNAL`, `SURPLUS_DECLARED`). Highly isolated via `tenantCpseId`.
- **`LocalAuditLog`**: Tracks historical changes (e.g., `ADDED`, `CONSUMED`) linked to specific inventory items.
- **`OutboundDemand`**: Material the CPSE wishes to procure, logged with their local code.
- **`InboundSupplyRequest`**: Fulfillment tickets issued by the Ministry requiring the CPSE to supply stock.

### Ministry Master Tables (The "Hub")
- **`GlobalCatalogMapping`**: The central dictionary mapping a CPSE’s `cpseLocalCode` to a standard `nationalMaterialCode`. Stores the `aiConfidenceScore` to govern human-in-the-loop review.
- **`MinistryDemandBatch` & `MinistryDemandItem`**: Normalizes `OutboundDemand` rows into centralized Ministry requests utilizing standard national codes.
- **`MinistryOrderRouting`**: Joins a `MinistryDemandItem` to an identified `supplierCpseId`, tracking lifecycle states like `supplierStatus` and `buyerStatus`.
- **`GlobalAuditLog`**: Master ledger auditing all system-wide impacts including AI engine mapping changes, human catalog approvals, and permanent deletions.

### Common/Auth Tables
- **`User`**: Maintains user identity, hashed passwords (`passwordHash`), roles (`CPSE` or `MINISTRY`), and tenant relationships (`tenantCpseId`).

