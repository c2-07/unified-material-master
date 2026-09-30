"""
security.py
------------------------------------------------------------------
Authentication + Authorization for the SIH National Material
Master Platform.

Provides:
  - bcrypt password hashing (passwords are NEVER stored in plaintext)
  - JWT-based login tokens (stateless auth)
  - Role-Based Access Control: CPSE_USER / CPSE_ADMIN / GOVT_SUPER_ADMIN
  - Multi-tenant isolation: a CPSE account can only ever touch its
    own organisation's data, enforced on the server, not the UI.

Drop this file in the SAME folder as main.py (backend/security.py).
------------------------------------------------------------------
"""

import os
import json
import datetime
from typing import Optional, List

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

# ==================================================================
# CONFIG
# ==================================================================
# In production, set this via an environment variable instead of
# hardcoding it. For SIH demo purposes a fallback is provided.
SECRET_KEY = os.environ.get(
    "SIH_JWT_SECRET",
    "CHANGE_THIS_BEFORE_DEPLOYING__SIH_2026_NATIONAL_MATERIAL_MASTER"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8-hour work shift

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_DB_PATH = os.path.join(BASE_DIR, "users_db.json")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


# ==================================================================
# DATA MODELS
# ==================================================================
class TokenData(BaseModel):
    username: str
    role: str                       # CPSE_USER | CPSE_ADMIN | GOVT_SUPER_ADMIN
    tenant_cpse: Optional[str] = None
    sector: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    tenant_cpse: Optional[str] = None
    sector: Optional[str] = None
    expires_in_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES


# ==================================================================
# PASSWORD HASHING (bcrypt — industry standard, salted, slow-by-design)
# ==================================================================
def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


# ==================================================================
# USER STORE
# A JSON file acting as a lightweight user database. Good enough for
# a hackathon prototype. In a real deployment, swap this for a real
# database (PostgreSQL) — the function signatures below would not
# need to change, only their internals.
# ==================================================================
def _load_users_db() -> dict:
    if not os.path.exists(USERS_DB_PATH):
        return {}
    with open(USERS_DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_users_db(db: dict) -> None:
    with open(USERS_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)


def seed_default_users() -> None:
    """
    Creates a starter set of demo accounts the FIRST time the server
    runs (only if users_db.json does not already exist).
    Passwords are hashed with bcrypt before they ever touch disk —
    plaintext passwords are never written anywhere.

    CHANGE THESE PASSWORDS before showing this to judges / going live.
    """
    if os.path.exists(USERS_DB_PATH):
        return

    demo_accounts = [
        # username,          password,          role,               tenant_cpse,   sector
        ("ongc_admin",       "Ongc@2026!",       "CPSE_ADMIN",       "ONGC",        "Oil_and_Gas"),
        ("ongc_user",        "Ongc@2026!",       "CPSE_USER",        "ONGC",        "Oil_and_Gas"),
        ("bhel_admin",       "Bhel@2026!",       "CPSE_ADMIN",       "BHEL",        "Heavy_Engineering"),
        ("sail_admin",       "Sail@2026!",       "CPSE_ADMIN",       "SAIL",        "Steel"),
        ("ntpc_admin",       "Ntpc@2026!",       "CPSE_ADMIN",       "NTPC",        "Power"),
        ("coalindia_admin",  "Coal@2026!",       "CPSE_ADMIN",       "COAL_INDIA",  "Mining"),
        ("ministry_admin",   "Ministry@2026!",   "GOVT_SUPER_ADMIN", None,          None),
    ]

    db = {}
    for username, password, role, tenant, sector in demo_accounts:
        db[username] = {
            "username": username,
            "hashed_password": hash_password(password),
            "role": role,
            "tenant_cpse": tenant,
            "sector": sector,
        }
    _save_users_db(db)
    print(f"[security] Seeded {len(db)} demo accounts -> {USERS_DB_PATH}")


def get_user(username: str) -> Optional[dict]:
    db = _load_users_db()
    return db.get(username)


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = get_user(username)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


def add_user(username: str, password: str, role: str,
             tenant_cpse: Optional[str], sector: Optional[str]) -> None:
    """Used by an admin-only endpoint to onboard a new CPSE account."""
    db = _load_users_db()
    if username in db:
        raise HTTPException(status_code=400, detail="Username already exists.")
    db[username] = {
        "username": username,
        "hashed_password": hash_password(password),
        "role": role,
        "tenant_cpse": tenant_cpse,
        "sector": sector,
    }
    _save_users_db(db)


# ==================================================================
# JWT TOKEN HANDLING
# ==================================================================
def create_access_token(user: dict) -> str:
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user["username"],
        "role": user["role"],
        "tenant_cpse": user.get("tenant_cpse"),
        "sector": user.get("sector"),
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    return TokenData(
        username=payload.get("sub"),
        role=payload.get("role"),
        tenant_cpse=payload.get("tenant_cpse"),
        sector=payload.get("sector"),
    )


# ==================================================================
# FASTAPI DEPENDENCIES — use these directly in route signatures
# ==================================================================
def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    """Any protected route: current_user: TokenData = Depends(get_current_user)"""
    return decode_access_token(token)


def require_roles(allowed_roles: List[str]):
    """
    Dependency factory for role-gated routes.
    Usage:
        @app.get("/api/national-inventory/{code}")
        def route(current_user: TokenData = Depends(require_roles(["GOVT_SUPER_ADMIN"]))):
            ...
    """
    def _checker(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not permitted to access this resource.",
            )
        return current_user
    return _checker


def enforce_tenant_scope(current_user: TokenData, requested_cpse: Optional[str] = None) -> Optional[str]:
    """
    THE CORE MULTI-TENANT SECURITY GUARD.

    - GOVT_SUPER_ADMIN: may see any CPSE, or all of them (returns whatever
      was requested, including None meaning "all").
    - CPSE_USER / CPSE_ADMIN: are hard-locked to their own tenant_cpse.
      Even if they tamper with the request and ask for another
      company's code, this raises 403 rather than silently returning
      their own data — that failure mode would be worse (looks like
      it worked, but returns wrong data).

    Returns the CPSE name that the calling route should actually use.
    """
    if current_user.role == "GOVT_SUPER_ADMIN":
        return requested_cpse

    if not current_user.tenant_cpse:
        raise HTTPException(status_code=403, detail="Account has no tenant organisation assigned.")

    if requested_cpse and requested_cpse != current_user.tenant_cpse:
        raise HTTPException(
            status_code=403,
            detail="Access denied: you can only access your own organisation's data.",
        )
    return current_user.tenant_cpse
