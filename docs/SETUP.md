# Setup

## Prerequisites

- **Node.js 20+**
- **PostgreSQL 14+** (local, or via Docker)
- **Python 3.10+** (only for the ML model pipeline)
- **Docker** (optional — for the containerised setup)

## 1. Backend

```bash
cd core-backend
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://user:password@localhost:5432/umc?schema=public"
JWT_SECRET="replace-with-a-long-random-string"
```

Apply migrations and generate the Prisma client:

```bash
npx prisma migrate dev
npx prisma generate
```

Optionally load demo data:

```bash
npm run seed
```

Start the API:

```bash
npm run dev
```

Listens on `http://localhost:3001`. Verify with:

```bash
curl http://localhost:3001/api/dev/users
```

## 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

The frontend reads the API base URL from `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:3001`:

```bash
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001' > .env.local
```

## 3. Docker

To run the stack without local Postgres or Node setup:

```bash
docker compose up --build
```

This brings up the database and the backend. The frontend can still be run locally against it, or exposed through the compose file.

## ML models

Model weights are **not** committed to the repo — only configuration and metadata. To rebuild them:

```bash
pip install -r requirements.txt
python -m ai_models.train
```

See [ML.md](./ML.md) for what each model does.

## Demo login

Two development routes let you switch roles without registering. Both are development-only and should not be exposed in a production deployment.

```bash
# List seeded users
curl http://localhost:3001/api/dev/users

# Mint a token for a role
curl -X POST http://localhost:3001/api/dev/login-as \
  -H 'Content-Type: application/json' \
  -d '{"role":"MINISTRY"}'
```

Paste the returned `token` into the browser as a bearer token to explore the portals.

## Troubleshooting

**`P1012: Environment variable not found: DATABASE_URL`** — `.env` is missing in `core-backend/`, or `prisma` was run from the wrong directory.

**`P3005: Database does not exist`** — create it, then re-run `npx prisma migrate dev`. `prisma migrate dev` creates it automatically on most setups.

**Frontend requests fail with CORS errors** — the API must be running, and `cors()` must be enabled on it (it is, in `server.ts`).

**`model.safetensors` missing** — expected. Weights are ignored via `.gitignore`; run the ML training step.

**Port 3000 or 3001 in use** — Next.js will offer 3002 for the frontend. The backend port is set in `core-backend/server.ts`.
