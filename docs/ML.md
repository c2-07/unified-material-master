# Material Matching (ML)

## The problem

Every CPSE describes the same physical material differently. Comparing them on string equality fails immediately:

| CPSE | Local code | Description |
| --- | --- | --- |
| NALCO | `NAL-O5S3IM` | Castrol Magna 68 20L |
| ONGC | `ONG-CHM-8823` | GEAR OIL ISO VG68 MIN 20L CAN |
| BHEL | `BHL-4417` | Gear Oil 20L Can |

These are one material. The national registry needs them collapsed onto a single code — and the mapping has to be defensible, because a wrong mapping means the Ministry routes supply orders to the wrong supplier.

## Approach: hybrid ensemble

No single method handles this. Pure string similarity misses synonyms and reorderings; pure embeddings miss exact code matches and unit abbreviations. So the matcher combines five signals into a weighted score.

Per `ai_models/model_metadata.json` (v1.1.0):

| Signal | Weight | What it catches |
| --- | --- | --- |
| BERT embeddings | 0.40 | Paraphrases, synonyms, reordered descriptors |
| TF-IDF cosine | 0.20 | Shared rare terms ("Magna", "VG68") |
| BM25 | 0.15 | Length-normalised relevance, robust to verbose descriptions |
| Fuzzy string | 0.15 | Typos and OCR noise in legacy codes |
| Jaccard | 0.10 | Acronym/token overlap after normalisation |

Embeddings come from `all-MiniLM-L6-v2` via sentence-transformers, giving a 384-dimensional vector per description.

## Normalisation

Before scoring, raw descriptions are cleaned: lowercasing, unit expansion (e.g. `20L` → `20 L`), punctuation stripping, and acronym dictionary expansion (23 entries). An expanded acronym dictionary matters because Indian industrial procurement documents use a lot of domain shorthand — `MS` for mild steel, `SS` for stainless, `GM` for gear motor.

Both the raw and cleaned forms are kept in the training data so the normalisation steps stay auditable.

## Training data

`ML_Training_Data_Master.csv` — 20,603 labelled records against 22 national codes.

Columns capture the real messy reality of the source systems: `Tenant_CPSE`, `Legacy_System_Code`, `Material_Description_Raw`, `ML_Cleaned_Description`, `UOM_Used_By_CPSE` (units-of-measure differ between CPSEs for the same material), and a `Target_National_Code` ground truth.

Reference catalog: `Standard_National_Catalog.csv`.

## Measured performance

| Metric | Value |
| --- | --- |
| Overall accuracy | 99.75% |
| Cross-validation | 99.75% ± 0.06% |
| Validation gap | 0.08% |
| Unseen-CPSE accuracy | 99.63% |

A 0.08% train/validation gap is the number that matters most — it indicates the model generalises rather than memorising. Unseen-CPSE accuracy at 99.63% is the honest test, since every real query comes from a CPSE the model may not have seen.

## Governance: confidence thresholds

Accuracy is not the whole story. A 99.75%-accurate model still mis-maps roughly 1 in 400 items, and a mis-mapped item means supply orders go to the wrong place. So confidence, not just prediction, determines the action:

| Confidence | Action |
| --- | --- |
| **≥ 75%** | Auto-approval candidate |
| **50–74%** | Routed to human review |
| **< 50%** | Unmapped — triggers catalog expansion request |

The third tier escalates rather than guessing: the item goes to the **Ministry Data Governance Board** with a request to expand the national catalog. The system is designed to admit when it does not know.

## Human in the loop

The ML layer **proposes**. A Ministry reviewer approves, overrides, or reverts every mapping before it becomes part of the national registry. This is a deliberate constraint:

- Auto-approval is a *candidate* state, not a final one, for anything below full confidence.
- Overrides and reverts are tracked, so the system learns which of its own predictions were wrong.
- The Ministry audit page exposes the full `GlobalAuditLog` — every mapping decision is traceable to the person who made it.

An automatic catalog that silently mis-routes procurement is worse than one that asks a human to check.

## Models on disk

| Path | Contents |
| --- | --- |
| `ai_models/bm25_model.pkl` | BM25 index over material descriptions |
| `ai_models/tfidf_vectorizer.pkl` | Fitted TF-IDF vectorizer |
| `ai_models/catalog_bert_embeddings.pkl` | Precomputed catalog embeddings |
| `ai_models/sentence_encoder_model/` | MiniLM config + tokenizer (weights gitignored) |
| `ai_models/model_metadata.json` | Weights, thresholds, and evaluation metrics |
| `ai_models/master_catalog.csv` | Catalog the index was built from |

`.pkl` and `.safetensors` are gitignored — these are reproducible build artifacts, not source. `model_metadata.json` is tracked so the evaluation numbers above are verifiable in the repo.
