# Unified Material Code - Final Submission

A unified catalog platform that gives India's Central Public Sector Enterprises (CPSEs) and the Ministry a single source of truth for materials, inventory, and demand.

## What it is
`Unified Material Code` assigns every material a **National Code** and maintains an ML-powered mapping layer between each CPSE's unique local codes and that national code. 
- **CPSEs** keep operating in their own local codes, but their inventory and demands become visible on the national registry.
- **The Ministry** gets a consolidated national catalog, approves proposed mappings, and routes demand across CPSEs.

## How it works (Short)
1. **Data Ingestion:** CPSEs upload or sync their inventory. 
2. **AI Mapping:** A Python ML API (FastAPI) running Sentence-Transformers, BM25, and TF-IDF analyzes the raw material descriptions and assigns a predicted National Code along with an AI Confidence Score.
3. **Ministry Review:** If the score is below 90%, it gets flagged in the Ministry's dashboard. The Ministry can then either "Save AI Assignment" or "Override" it manually.
4. **Demand Routing:** Once mapped, CPSEs can request materials, and the Ministry can route that demand to other CPSEs that have excess stock of the exact same mapped National Code.

## Tech Stack
- **Frontend:** Next.js (App Router), React 19, Tailwind CSS 4
- **Core Backend:** Node.js, Express, Prisma ORM, PostgreSQL
- **ML Backend:** Python, FastAPI, PyTorch, Scikit-learn
- **Infrastructure:** Docker Compose

---

## How to Spin Up and Use It

This project is built with a self-bootstrapping Docker architecture. You do **not** need to manually import any databases or run any SQL dumps. 

### 1. Prerequisites
- Docker and Docker Compose installed
- *Note: Ensure ports `4000`, `8000`, and `5432` are free.*

### 2. Start the Backend & ML Services
Run the following command in the project root:
```bash
docker compose up --build -d
```
*Note on first run: The Python `ml_api` container will take several minutes to download the PyTorch/HuggingFace libraries (~2GB). The Node `core_backend` container will wait for the database, automatically generate the PostgreSQL tables from the Prisma schema, and run a seed script that imports 10,000+ rows from the included CSV dataset.*

### 3. Start the Frontend
In a new terminal window, navigate to the frontend directory and start the Next.js development server:
```bash
cd frontend
npm install
npm run dev
```

### 4. Access the Application
Open your browser and navigate to:
**http://localhost:3000**

You can use the built-in demo login buttons on the login screen to instantly bypass authentication and jump into either a **CPSE Dashboard** or the **Ministry Dashboard** to test the flows!
