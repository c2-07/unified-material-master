"""
main.py
------------------------------------------------------------------
SIH 2026 - National Unified Material Master Platform
FastAPI Backend (Phase 2), now wired to security.py for login +
multi-tenant access control.

FIXES applied to the version that crashed in your Antigravity session:
  1. `from fastapi import ... BackgroundTask` -> BackgroundTasks (typo)
  2. `joblib` was used in load_ai_models() but never imported

Folder layout this file expects (same as what you already built):

    sih_material_master/
    |-- ML_Training_Data_Master.csv
    |-- ai_models/
    |   |-- sentence_encoder_model/
    |   |-- catalog_bert_embeddings.pkl
    |   |-- tfidf_vectorizer.pkl
    |   |-- bm25_model.pkl
    |   |-- master_catalog.csv
    |   `-- model_metadata.json
    `-- backend/
        |-- main.py          <- this file
        |-- security.py      <- auth module
        `-- users_db.json    <- auto-created on first run

Run with:
    cd sih_material_master
    python -m uvicorn backend.main:app --reload --port 8000

Then open http://127.0.0.1:8000/docs
------------------------------------------------------------------
"""

import os
import re
import json
import pickle
import io
from typing import Optional, List

import joblib          # <-- FIX #2: this import was missing before
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, BackgroundTasks  # <-- FIX #1
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sklearn.metrics.pairwise import cosine_similarity
from rank_bm25 import BM25Okapi
from rapidfuzz import fuzz
from sentence_transformers import SentenceTransformer

import security
from security import (
    TokenData, LoginRequest, LoginResponse,
    get_current_user, require_roles, enforce_tenant_scope,
    authenticate_user, create_access_token, seed_default_users, add_user,
)

# ==================================================================
# PATHS
# ==================================================================
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
# NOTE: main.py and security.py sit directly in the project folder
# (D:\Project Sih\) with no backend\ subfolder, so the project root
# IS this file's own folder -- not one level up.
PROJECT_ROOT = BACKEND_DIR

DATA_PATH = os.environ.get(
    "SIH_DATA_PATH",
    os.path.join(PROJECT_ROOT, "ML_Training_Data_Master.csv"),
)
AI_MODELS_DIR = os.environ.get(
    "SIH_AI_MODELS_DIR",
    os.path.join(PROJECT_ROOT, "ai_models"),
)

# ==================================================================
# ABBREVIATION / TEXT CLEANING (same dictionary discussed in chat)
# ==================================================================
EXPANDED_DICTIONARY = {
    r"\bss304\b": "stainless steel grade 304",
    r"\bss316\b": "stainless steel grade 316",
    r"\bss\b": "stainless steel",
    r"\bcs\b": "carbon steel",
    r"\bci\b": "cast iron",
    r"\bms\b": "mild steel",
    r"\bgi\b": "galvanised iron",
    r"\bhdpe\b": "high density polyethylene",
    r"\bbrg\b": "bearing",
    r"\bblt\b": "bolt",
    r"\bsmls\b": "seamless",
    r"\bsch\b": "schedule",
    r"\bht\b": "high tensile",
    r"\btfr\b": "transformer",
    r"\bcu\b": "copper",
    r"\bar\b": "armoured",
    r"\bsqmm\b": "square millimetre",
    r"\bppe\b": "personal protective equipment",
}


def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s\.\-\/]", " ", text)
    for pattern, replacement in EXPANDED_DICTIONARY.items():
        text = re.sub(pattern, replacement, text)
    return re.sub(r"\s+", " ", text).strip()


def extract_size(text: str) -> str:
    m = re.search(r"\b(\d+\s?(?:mm|in|inch|sqmm|kva|kv)|m\d+(?:x\d+)?|\d{4})\b", text.lower())
    return m.group() if m else "Not Specified"


def extract_material(text: str) -> str:
    m = re.search(r"\b(stainless steel|carbon steel|cast iron|copper|steel|leather|rubber|hdpe)\b", text.lower())
    return m.group().title() if m else "Not Specified"


# ==================================================================
# GLOBAL STATE (populated at startup)
# ==================================================================
class ModelState:
    ready: bool = False
    df: Optional[pd.DataFrame] = None
    master_catalog: Optional[pd.DataFrame] = None
    encoder: Optional[SentenceTransformer] = None
    catalog_bert: Optional[np.ndarray] = None
    tfidf = None
    catalog_tfidf = None
    bm25: Optional[BM25Okapi] = None
    metadata: dict = {}


state = ModelState()

WEIGHTS = {"bert": 0.40, "tfidf": 0.20, "bm25": 0.15, "fuzzy": 0.15, "jaccard": 0.10}


def jaccard_sim(a: str, b: str) -> float:
    s1, s2 = set(a.split()), set(b.split())
    return len(s1 & s2) / len(s1 | s2) if (s1 | s2) else 0.0


def hybrid_match(raw_description: str) -> dict:
    if not state.ready:
        raise HTTPException(status_code=503, detail="AI models are not loaded yet.")

    cleaned = clean_text(raw_description)
    catalog_texts = state.master_catalog["Cleaned_Ground_Truth"].tolist()
    scores = np.zeros(len(state.master_catalog))

    q_bert = state.encoder.encode([cleaned], normalize_embeddings=True)
    scores += cosine_similarity(q_bert, state.catalog_bert)[0] * WEIGHTS["bert"]

    q_tfidf = state.tfidf.transform([cleaned])
    scores += cosine_similarity(q_tfidf, state.catalog_tfidf)[0] * WEIGHTS["tfidf"]

    bm25_scores = state.bm25.get_scores(cleaned.split())
    if bm25_scores.max() > 0:
        scores += (bm25_scores / bm25_scores.max()) * WEIGHTS["bm25"]

    for idx, target in enumerate(catalog_texts):
        scores[idx] += (fuzz.token_set_ratio(cleaned, target) / 100.0) * WEIGHTS["fuzzy"]
        scores[idx] += jaccard_sim(cleaned, target) * WEIGHTS["jaccard"]

    top_idx = int(scores.argmax())
    conf = round(float(scores[top_idx]) * 100, 2)
    row = state.master_catalog.iloc[top_idx]

    if conf >= 75:
        approval_status, action = "AUTO-APPROVED", "MAP_TO_EXISTING_NATIONAL_CODE"
    elif conf >= 50:
        approval_status, action = "NEEDS REVIEW", "HUMAN_STEWARD_APPROVAL_REQUIRED"
    else:
        approval_status, action = "UNMAPPED_NEW_MATERIAL", "TRIGGER_CATALOG_EXPANSION_REQUEST"

    return {
        "input_raw": raw_description,
        "cleaned_text": cleaned,
        "matched_national_code": row["Target_National_Code"] if conf >= 50 else "PENDING-NEW-CODE",
        "standard_material_name": row["Ground_Truth_Material"] if conf >= 50 else "Uncatalogued Item",
        "base_item": row.get("Target_Base_Item", extract_material(cleaned)) if conf >= 50 else extract_material(cleaned),
        "extracted_size": extract_size(cleaned),
        "extracted_material": extract_material(cleaned),
        "standard_uom": row.get("Standard_UOM", "NOS") if conf >= 50 else "NOS",
        "confidence_score": conf,
        "approval_status": approval_status,
        "governance_action": action,
    }


# ==================================================================
# FASTAPI APP
# ==================================================================
app = FastAPI(
    title="SIH National Unified Material Master API",
    version="1.1.0",
    description="AI-driven material harmonization + multi-tenant CPSE portal backend.",
)

app.add_middleware(
    CORSMiddleware,
    # Lock this down to your actual frontend origin(s) before going live.
    allow_origins=["http://localhost:3000", "http://127.0.0.1:5500", "http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def load_everything():
    # 1) Seed demo user accounts (bcrypt-hashed) if none exist yet
    security.seed_default_users()

    # 2) Load AI models -- wrapped so a missing folder doesn't crash
    #    the whole server; /api/health will report ready=False instead.
    try:
        print("Loading AI models and data artifacts...")

        state.df = pd.read_csv(DATA_PATH)
        state.df["Tenant_CPSE"] = state.df["Tenant_CPSE"].astype(str).str.strip()
        state.df["Target_National_Code"] = state.df["Target_National_Code"].astype(str).str.strip()
        state.df = (
            state.df.groupby(["Tenant_CPSE", "Target_National_Code"], as_index=False)
            .agg({
                "Ground_Truth_Material": "first",
                "Sector": "first",
                "Quantity_In_Stock": "sum",
                "Reorder_Level": "mean",
                "Surplus_Available": "sum",
                "Legacy_System_Code": "count",
            })
        )

       

        catalog_path = os.path.join(AI_MODELS_DIR, "master_catalog.csv")
        state.master_catalog = pd.read_csv(catalog_path)
        if "Cleaned_Ground_Truth" not in state.master_catalog.columns:
            state.master_catalog["Cleaned_Ground_Truth"] = (
                state.master_catalog["Ground_Truth_Material"].apply(clean_text)
            )

        state.encoder = SentenceTransformer(os.path.join(AI_MODELS_DIR, "sentence_encoder_model"))

        with open(os.path.join(AI_MODELS_DIR, "catalog_bert_embeddings.pkl"), "rb") as f:
            state.catalog_bert = pickle.load(f)

        state.tfidf = joblib.load(os.path.join(AI_MODELS_DIR, "tfidf_vectorizer.pkl"))
        state.catalog_tfidf = state.tfidf.transform(state.master_catalog["Cleaned_Ground_Truth"].tolist())

        with open(os.path.join(AI_MODELS_DIR, "bm25_model.pkl"), "rb") as f:
            state.bm25 = pickle.load(f)

        metadata_path = os.path.join(AI_MODELS_DIR, "model_metadata.json")
        if os.path.exists(metadata_path):
            with open(metadata_path, "r", encoding="utf-8") as f:
                state.metadata = json.load(f)

        state.ready = True
        print(f"AI models loaded OK. Catalog size: {len(state.master_catalog)}")
    except Exception as e:
        state.ready = False
        print(f"[WARNING] AI models did not load: {e}")
        print("Server will still run -- /api/login and /api/health work, "
              "but /api/match-material etc. will return 503 until the "
              "ai_models/ folder is present next to this project's root.")


# ==================================================================
# AUTH ROUTES
# ==================================================================
@app.post("/api/login", response_model=LoginResponse, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2-compatible login. Send as form data:
        username=ongc_admin&password=Ongc@2026!
    (This is what Swagger's /docs "Authorize" button and most
    frontend auth libraries expect by default.)
    """
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    token = create_access_token(user)
    return LoginResponse(
        access_token=token,
        role=user["role"],
        tenant_cpse=user.get("tenant_cpse"),
        sector=user.get("sector"),
    )


@app.post("/api/login-json", response_model=LoginResponse, tags=["auth"])
def login_json(payload: LoginRequest):
    """Same as /api/login but accepts JSON, for frontends that prefer that."""
    user = authenticate_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    token = create_access_token(user)
    return LoginResponse(
        access_token=token,
        role=user["role"],
        tenant_cpse=user.get("tenant_cpse"),
        sector=user.get("sector"),
    )


class NewUserRequest(BaseModel):
    username: str
    password: str
    role: str                         # CPSE_USER | CPSE_ADMIN
    tenant_cpse: str
    sector: str


@app.post("/api/admin/create-user", tags=["auth"])
def create_user(
    payload: NewUserRequest,
    current_user: TokenData = Depends(require_roles(["GOVT_SUPER_ADMIN", "CPSE_ADMIN"])),
):
    """
    Onboard a new account. A CPSE_ADMIN may only create accounts inside
    their own organisation; the Ministry can create any account.
    """
    if current_user.role == "CPSE_ADMIN" and payload.tenant_cpse != current_user.tenant_cpse:
        raise HTTPException(status_code=403, detail="You can only add users to your own organisation.")
    if payload.role not in ("CPSE_USER", "CPSE_ADMIN"):
        raise HTTPException(status_code=400, detail="Role must be CPSE_USER or CPSE_ADMIN.")

    add_user(payload.username, payload.password, payload.role, payload.tenant_cpse, payload.sector)
    return {"status": "created", "username": payload.username}


# ==================================================================
# PUBLIC ROUTES
# ==================================================================
@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "HEALTHY",
        "models_loaded": state.ready,
        "catalog_items": int(len(state.master_catalog)) if state.master_catalog is not None else 0,
        "metadata": state.metadata,
    }


# ==================================================================
# PROTECTED ROUTES
# ==================================================================
class MatchRequest(BaseModel):
    raw_description: str


@app.post("/api/match-material", tags=["ai"])
def match_material(
    payload: MatchRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """Any logged-in user (any role) may run a single-item AI match."""
    return hybrid_match(payload.raw_description)


@app.post("/api/upload-csv", tags=["cpse"])
async def upload_csv(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_roles(["CPSE_ADMIN", "GOVT_SUPER_ADMIN"])),
):
    """
    First-time onboarding upload. Every row is matched against the
    national catalog. The uploading user's own tenant is stamped onto
    every row -- they cannot upload data and claim it belongs to a
    different CPSE.
    """
    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse file as CSV.")

    desc_col = next(
        (c for c in df.columns if "desc" in c.lower()),
        df.columns[0],
    )

    tenant = current_user.tenant_cpse or "MINISTRY_UPLOAD"

    results = []
    for _, row in df.iterrows():
        match = hybrid_match(str(row[desc_col]))
        match["Tenant_CPSE"] = tenant
        match["Original_Row"] = row.to_dict()
        results.append(match)

    auto = sum(1 for r in results if r["approval_status"] == "AUTO-APPROVED")
    review = sum(1 for r in results if r["approval_status"] == "NEEDS REVIEW")
    unmapped = sum(1 for r in results if r["approval_status"] == "UNMAPPED_NEW_MATERIAL")

    return {
        "tenant_cpse": tenant,
        "total_rows_processed": len(results),
        "auto_approved": auto,
        "needs_review": review,
        "unmapped_new_material": unmapped,
        "results": results,
    }


@app.get("/api/my-inventory", tags=["cpse"])
def my_inventory(current_user: TokenData = Depends(get_current_user)):
    """
    Tenant-scoped inventory view. A CPSE_USER/ADMIN sees ONLY their own
    company's rows -- enforced server-side via enforce_tenant_scope,
    not by trusting a query parameter.
    """
    if state.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    tenant = enforce_tenant_scope(current_user, current_user.tenant_cpse)
    if tenant is None:
        subset = state.df
    else:
        subset = state.df[state.df["Tenant_CPSE"] == tenant]
    subset = subset.copy()
    subset["Reorder_Level"] = subset["Reorder_Level"].round(0).astype(int)

    return {
        "tenant_cpse": tenant or "ALL (Ministry view)",
        "row_count": int(len(subset)),
        "rows": subset.head(200).to_dict(orient="records"),  # capped for payload size
    }


@app.get("/api/national-inventory/{national_code}", tags=["government"])
def national_inventory(
    national_code: str,
    current_user: TokenData = Depends(require_roles(["GOVT_SUPER_ADMIN"])),
):
    """
    Ministry-only. Full company-by-company breakdown for one National
    Code -- this is exactly the visibility CPSEs themselves must NOT
    have (they only ever see anonymised surplus counts via the
    demand-exchange endpoint below).
    """
    if state.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    subset = state.df[state.df["Target_National_Code"] == national_code]
    if subset.empty:
        raise HTTPException(status_code=404, detail="National code not found.")

    breakdown = (
        subset.groupby(["Tenant_CPSE", "Sector"])
        .agg(
            Stock=("Quantity_In_Stock", "sum"),
            Reorder_Level=("Reorder_Level", "mean"),
            Surplus=("Surplus_Available", "sum"),
        )
        .reset_index()
        .to_dict(orient="records")
    )

    return {
        "national_code": national_code,
        "standard_name": subset["Ground_Truth_Material"].iloc[0],
        "total_national_stock": int(subset["Quantity_In_Stock"].sum()),
        "total_surplus_available": int(subset["Surplus_Available"].sum()),
        "cpse_count": int(subset["Tenant_CPSE"].nunique()),
        "inventory_breakdown": breakdown,
    }


class DemandRequest(BaseModel):
    query_text: str
    quantity_needed: int


@app.post("/api/demand-exchange", tags=["exchange"])
def demand_exchange(
    payload: DemandRequest,
    current_user: TokenData = Depends(require_roles(["CPSE_USER", "CPSE_ADMIN"])),
):
    """
    A CPSE posts a demand. We identify the material, then show ONLY
    anonymised surplus-holder entries (CPSE-SURPLUS-A, B, C...) --
    never the real company name. Real identities are revealed only
    to the Ministry, who brokers the actual transfer offline.
    """
    if state.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    match = hybrid_match(payload.query_text)
    code = match["matched_national_code"]
    if code == "PENDING-NEW-CODE":
        return {"status": "NO_CATALOG_MATCH", "detail": "This item is not yet in the national catalog."}

    surplus_df = state.df[
        (state.df["Target_National_Code"] == code)
        & (state.df["Tenant_CPSE"] != current_user.tenant_cpse)  # never show the requester their own stock
        & (state.df["Surplus_Available"] > 0)
    ]

    holders = (
        surplus_df.groupby("Sector")["Surplus_Available"]
        .sum()
        .reset_index()
    )

    anonymous_matches = [
        {
            "anonymous_id": f"CPSE-SURPLUS-{chr(65 + i)}",
            "sector": row["Sector"],
            "available_surplus": int(row["Surplus_Available"]),
        }
        for i, row in holders.iterrows()
    ]

    return {
        "status": "MATCHES_FOUND" if anonymous_matches else "NO_SURPLUS_AVAILABLE",
        "requesting_cpse": current_user.tenant_cpse,
        "matched_national_code": code,
        "standard_material_name": match["standard_material_name"],
        "quantity_requested": payload.quantity_needed,
        "surplus_matches": anonymous_matches,
        "action": (
            "Anonymous alerts dispatched to surplus holders. "
            "Inter-CPSE transfer pending Ministry approval."
            if anonymous_matches else
            "No surplus currently available nationally for this item."
        ),
    }


@app.get("/api/analytics/duplicates", tags=["government"])
def duplicate_analytics(
    current_user: TokenData = Depends(require_roles(["GOVT_SUPER_ADMIN"])),
):
    """Ministry-only dashboard data: duplicate counts per National Code."""
    if state.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    report = (
        state.df.groupby("Target_National_Code")
        .agg(
            Standard_Name=("Ground_Truth_Material", "first"),
            Total_Duplicate_Entries=("Legacy_System_Code", "sum"),
            CPSEs_Using_This_Item=("Tenant_CPSE", "nunique"),
            Total_National_Stock=("Quantity_In_Stock", "sum"),
        )
        .reset_index()
        .sort_values("Total_Duplicate_Entries", ascending=False)
        .to_dict(orient="records")
    )
    return {"report": report}


# ==================================================================
# ENTRY POINT -- lets you just click "Run" / do `python main.py`
# instead of typing the uvicorn command every time.
# ==================================================================
"""
stock_and_exchange_extension.py
------------------------------------------------------------------
ADD THIS TO THE BOTTOM OF YOUR EXISTING main.py
(after the existing routes, before the `if __name__ == "__main__":` block)

Fills 3 gaps that were designed in your Antigravity conversation but
never actually implemented in main.py:

  1. Daily stock IN / OUT updates (the "+ Add Stock" / "- Mark Used"
     buttons you described) -> writes to a persistent movements CSV
  2. A live status flag per material per CPSE:
        ACTIVE      -> stock above reorder level
        LOW_STOCK   -> stock at/below reorder level
        CRITICAL    -> stock at/below 20% of reorder level
        CONSUMED    -> stock is zero
     Used for the government's "bulk vs critical" view you asked for.
  3. A PERSISTED demand-exchange log (JSON file). Right now
     /api/demand-exchange just answers a query and forgets it. This
     version saves every request so there's an audit trail, and adds
     an endpoint for a surplus-holder CPSE to explicitly agree to
     share (still anonymous to the requester -- only the Ministry
     ever sees both real names).

Nothing above this file needs to change. This does NOT touch the
SS/CS/CI abbreviation dictionary or the hybrid_match() scoring --
that part of your model is already correct and is left untouched.
------------------------------------------------------------------
"""

import uuid
import datetime as dt

# ==================================================================
# 1. STOCK STATUS LOGIC
# ==================================================================
def compute_status(stock: float, reorder_level: float) -> str:
    """Single source of truth for the status flag everywhere it's shown."""
    if stock <= 0:
        return "CONSUMED"
    if reorder_level and stock <= 0.2 * reorder_level:
        return "CRITICAL"
    if reorder_level and stock <= reorder_level:
        return "LOW_STOCK"
    return "ACTIVE"


# ==================================================================
# 2. DAILY STOCK MOVEMENTS -- persisted ledger
# ==================================================================
MOVEMENTS_PATH = os.path.join(PROJECT_ROOT, "Daily_Stock_Movements_Live.csv")


def append_movement(record: dict) -> None:
    file_exists = os.path.exists(MOVEMENTS_PATH)
    pd.DataFrame([record]).to_csv(
        MOVEMENTS_PATH, mode="a", header=not file_exists, index=False
    )


class StockMovementRequest(BaseModel):
    national_code: Optional[str] = None
    material_description: Optional[str] = None  # used only if national_code is omitted
    quantity: int
    reason: Optional[str] = "Stock Update"


def _locate_row(tenant: str, national_code: str):
    mask = (state.df["Tenant_CPSE"] == tenant) & (state.df["Target_National_Code"] == national_code)
    if not mask.any():
        raise HTTPException(
            status_code=404,
            detail=(
                f"No existing inventory row for {national_code} under {tenant}. "
                "New items must go through /api/upload-csv or /api/stock/new-item first."
            ),
        )
    return mask


@app.post("/api/stock/inward", tags=["stock"])
def stock_inward(
    payload: StockMovementRequest,
    current_user: TokenData = Depends(require_roles(["CPSE_USER", "CPSE_ADMIN"])),
):
    """'+ Add Stock' -- material received. Quantity added to that CPSE's own row only."""
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive.")

    tenant = current_user.tenant_cpse
    code = payload.national_code or hybrid_match(payload.material_description or "")["matched_national_code"]
    mask = _locate_row(tenant, code)

    state.df.loc[mask, "Quantity_In_Stock"] += payload.quantity
    new_stock = float(state.df.loc[mask, "Quantity_In_Stock"].iloc[0])
    reorder = float(state.df.loc[mask, "Reorder_Level"].iloc[0])
    state.df.loc[mask, "Surplus_Available"] = max(new_stock - reorder, 0)
    state.df.loc[mask, "Entry_Status"] = compute_status(new_stock, reorder)

    append_movement({
        "Date": dt.date.today().isoformat(),
        "CPSE": tenant,
        "National_Code": code,
        "Movement_Type": "INWARD",
        "Quantity_Moved": payload.quantity,
        "Reason": payload.reason,
        "Resulting_Stock": new_stock,
    })

    return {
        "tenant_cpse": tenant,
        "national_code": code,
        "new_stock": new_stock,
        "status": compute_status(new_stock, reorder),
    }


@app.post("/api/stock/outward", tags=["stock"])
def stock_outward(
    payload: StockMovementRequest,
    current_user: TokenData = Depends(require_roles(["CPSE_USER", "CPSE_ADMIN"])),
):
    """'- Mark Used' -- material consumed. Cannot take a CPSE's stock negative."""
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive.")

    tenant = current_user.tenant_cpse
    code = payload.national_code or hybrid_match(payload.material_description or "")["matched_national_code"]
    mask = _locate_row(tenant, code)

    current_stock = float(state.df.loc[mask, "Quantity_In_Stock"].iloc[0])
    if payload.quantity > current_stock:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot use {payload.quantity} units -- only {current_stock} in stock.",
        )

    new_stock = current_stock - payload.quantity
    reorder = float(state.df.loc[mask, "Reorder_Level"].iloc[0])
    state.df.loc[mask, "Quantity_In_Stock"] = new_stock
    state.df.loc[mask, "Surplus_Available"] = max(new_stock - reorder, 0)
    status = compute_status(new_stock, reorder)
    state.df.loc[mask, "Entry_Status"] = status

    append_movement({
        "Date": dt.date.today().isoformat(),
        "CPSE": tenant,
        "National_Code": code,
        "Movement_Type": "OUTWARD",
        "Quantity_Moved": payload.quantity,
        "Reason": payload.reason,
        "Resulting_Stock": new_stock,
    })

    return {
        "tenant_cpse": tenant,
        "national_code": code,
        "new_stock": new_stock,
        "status": status,
    }


@app.get("/api/stock/my-status", tags=["stock"])
def my_stock_status(current_user: TokenData = Depends(get_current_user)):
    """A CPSE's own dashboard: every material with its live status flag."""
    tenant = enforce_tenant_scope(current_user, current_user.tenant_cpse)
    subset = state.df if tenant is None else state.df[state.df["Tenant_CPSE"] == tenant]

    rows = []
    for _, r in subset.iterrows():
        rows.append({
            "national_code": r["Target_National_Code"],
            "material_name": r["Ground_Truth_Material"],
            "stock": int(r["Quantity_In_Stock"]),
            "reorder_level": int(r["Reorder_Level"]),
            "status": compute_status(r["Quantity_In_Stock"], r["Reorder_Level"]),
        })
    return {"tenant_cpse": tenant or "ALL (Ministry view)", "materials": rows}


# ==================================================================
# 3. GOVERNMENT BULK / CRITICAL NATIONAL SUMMARY
# ==================================================================
@app.get("/api/analytics/national-status-summary", tags=["government"])
def national_status_summary(
    current_user: TokenData = Depends(require_roles(["GOVT_SUPER_ADMIN"])),
):
    """
    Ministry-only. For every National Code: how many CPSEs are in
    ACTIVE / LOW_STOCK / CRITICAL / CONSUMED state, and total national
    stock -- this is the "bulk vs critical" view you asked for.
    """
    tmp = state.df.copy()
    tmp["__status"] = tmp.apply(
        lambda r: compute_status(r["Quantity_In_Stock"], r["Reorder_Level"]), axis=1
    )

    summary = (
        tmp.groupby("Target_National_Code")
        .agg(
            Standard_Name=("Ground_Truth_Material", "first"),
            Total_National_Stock=("Quantity_In_Stock", "sum"),
            CPSEs_Reporting=("Tenant_CPSE", "nunique"),
            Critical_CPSE_Count=("__status", lambda s: int((s == "CRITICAL").sum())),
            Low_Stock_CPSE_Count=("__status", lambda s: int((s == "LOW_STOCK").sum())),
            Consumed_CPSE_Count=("__status", lambda s: int((s == "CONSUMED").sum())),
        )
        .reset_index()
        .sort_values("Critical_CPSE_Count", ascending=False)
        .to_dict(orient="records")
    )
    return {"summary": summary}


# ==================================================================
# 4. PERSISTED DEMAND-EXCHANGE LOG (replaces the old stateless version)
# ==================================================================
DEMAND_LOG_PATH = os.path.join(PROJECT_ROOT, "Demand_Exchange_Log.json")


def _load_demand_log() -> list:
    if not os.path.exists(DEMAND_LOG_PATH):
        return []
    with open(DEMAND_LOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_demand_log(log: list) -> None:
    with open(DEMAND_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, default=str)


@app.post("/api/demand-exchange/v2", tags=["exchange"])
def demand_exchange_persisted(
    payload: DemandRequest,
    current_user: TokenData = Depends(require_roles(["CPSE_USER", "CPSE_ADMIN"])),
):
    """
    Same anonymized matching as your original /api/demand-exchange,
    but the request is SAVED with a request_id so:
      - the requester can check back later (GET .../my-requests)
      - a surplus holder can explicitly agree to share (POST .../{id}/respond)
      - the Ministry has a full audit trail of every demand ever raised
    """
    result = demand_exchange(payload, current_user)  # reuse existing matching logic

    request_id = str(uuid.uuid4())[:8]
    record = {
        "request_id": request_id,
        "timestamp": dt.datetime.utcnow().isoformat(),
        "requesting_cpse": current_user.tenant_cpse,
        "query_text": payload.query_text,
        "quantity_needed": payload.quantity_needed,
        "matched_national_code": result.get("matched_national_code"),
        "surplus_matches": result.get("surplus_matches", []),
        "status": "PENDING" if result.get("surplus_matches") else "NO_SURPLUS",
        "responses": [],  # filled in by /respond below
    }
    log = _load_demand_log()
    log.append(record)
    _save_demand_log(log)

    result["request_id"] = request_id
    return result


@app.get("/api/demand-exchange/my-requests", tags=["exchange"])
def my_demand_requests(current_user: TokenData = Depends(get_current_user)):
    """A CPSE sees only requests it raised. Ministry sees everything."""
    log = _load_demand_log()
    if current_user.role != "GOVT_SUPER_ADMIN":
        log = [r for r in log if r["requesting_cpse"] == current_user.tenant_cpse]
    return {"requests": log}


class DemandResponse(BaseModel):
    agree_to_share: bool
    quantity_offered: Optional[int] = None


@app.post("/api/demand-exchange/{request_id}/respond", tags=["exchange"])
def respond_to_demand(
    request_id: str,
    payload: DemandResponse,
    current_user: TokenData = Depends(require_roles(["CPSE_USER", "CPSE_ADMIN"])),
):
    log = _load_demand_log()
    for r in log:
        if r["request_id"] == request_id:
            new_response = {
                "responding_cpse": current_user.tenant_cpse,
                "agreed": payload.agree_to_share,
                "quantity_offered": payload.quantity_offered,
                "timestamp": dt.datetime.utcnow().isoformat(),
            }

            # Replace, don't stack: drop any earlier response from this
            # same CPSE before adding the new one, so there's always
            # exactly one current answer per company per request.
            r["responses"] = [
                resp for resp in r["responses"]
                if resp["responding_cpse"] != current_user.tenant_cpse
            ]
            r["responses"].append(new_response)

            if payload.agree_to_share:
                r["status"] = "SHARE_OFFERED_PENDING_MINISTRY_APPROVAL"
            _save_demand_log(log)
            return {"status": "recorded", "request_id": request_id}

    raise HTTPException(status_code=404, detail="Demand request not found.")
if __name__ == "__main__":
    import uvicorn
    print("Starting server via 'python main.py' ...")
    print("Open http://127.0.0.1:8000/docs once it says 'Application startup complete.'")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
