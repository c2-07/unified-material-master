# SIH Backend — Flat Folder Setup (matches your D:\Project Sih\ layout)

## Where files go

```
D:\Project Sih\
|-- main.py                       <- replace with the one attached
|-- security.py                   <- add this (new file)
|-- ML_Training_Data_Master.csv   <- already there
|-- ai_models\                    <- already there (from training notebook)
|   |-- sentence_encoder_model\
|   |-- catalog_bert_embeddings.pkl
|   |-- tfidf_vectorizer.pkl
|   |-- bm25_model.pkl
|   |-- master_catalog.csv
|   `-- model_metadata.json
`-- users_db.json                 <- auto-created on first run, don't make manually
```

No `backend\` subfolder. Everything sits directly in `D:\Project Sih\`.

## Install (one time)

```
pip install fastapi uvicorn[standard] python-multipart pydantic sentence-transformers scikit-learn pandas numpy rank-bm25 rapidfuzz joblib bcrypt PyJWT
```

## Run it — either way works now

**A) Click Run in VS Code / `python main.py`** — now starts the server directly.

**B) Terminal:**
```
cd "D:\Project Sih"
python -m uvicorn main:app --reload --port 8000
```

Then open **http://127.0.0.1:8000/docs**

## Demo logins (created automatically in users_db.json on first run)

| username | password | role |
|---|---|---|
| ongc_admin | Ongc@2026! | CPSE_ADMIN |
| ministry_admin | Ministry@2026! | GOVT_SUPER_ADMIN |

Click **Authorize** in the docs page, log in, then try `POST /api/match-material`.
