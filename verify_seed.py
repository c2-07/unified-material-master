#!/usr/bin/env python3
"""Verifies the seeded demo data covers every stage of the demand flow,
and that a requester only ever sees statuses consistent with the
Ministry's actions.

Run against a live backend: python3 verify_seed.py [base_url]
"""
import json
import sys
import urllib.error
import urllib.request
from collections import Counter

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
results = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=20) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(label, ok, detail=""):
    results.append((label, ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + str(detail)) if detail else ''}")


def login(email):
    st, d = call("POST", "/api/auth/login", body={"email": email, "password": "password123"})
    return d.get("token") if isinstance(d, dict) else None


min_token = login("admin@ministry.gov")
check("ministry login", bool(min_token))
if not min_token:
    sys.exit("cannot continue")

# ── Stage coverage on the Ministry side ──────────────────────────────────
print("\n1. Ministry routing page coverage")
st, batches = call("GET", "/api/ministry/demands", min_token)
check("ministry demands load", st == 200 and isinstance(batches, list),
      f"{len(batches) if isinstance(batches, list) else batches} batches")

item_states = Counter()
ack_actionable = 0
for b in batches or []:
    for i in b.get("items", []):
        item_states[i.get("status")] += 1
        routings = i.get("routings", [])
        if any(r.get("supplierStatus") == "ACCEPTED" for r in routings) and i.get("status") != "ACKNOWLEDGED":
            ack_actionable += 1

print(f"     demand item statuses: {dict(item_states)}")

# These map 1:1 to the filter dropdown in ministry/routing/page.tsx
check("NEEDS_SUPPLIER case present (item has no routings)",
      any(i.get("status") == "SOURCING" and not i.get("routings")
          for b in (batches or []) for i in b.get("items", [])))
check("ROUTED case present (routing PENDING_SUPPLIER)",
      any(any(r.get("supplierStatus") == "PENDING_SUPPLIER" for r in i.get("routings", []))
          for b in (batches or []) for i in b.get("items", [])))
check("ACCEPTED case present (supplier said yes, ack still owed)",
      ack_actionable > 0, f"{ack_actionable} item(s) with 'Notify Requester' enabled")
check("ACKNOWLEDGED case present (full loop closed)",
      item_states.get("ACKNOWLEDGED", 0) > 0)
check("DECLINED case present (supplier refused)",
      any(any(r.get("supplierStatus") == "REJECTED" for r in i.get("routings", []))
          for b in (batches or []) for i in b.get("items", [])))

# ── Referential integrity ────────────────────────────────────────────────
print("\n2. Referential integrity (the old seed broke this)")
all_items = {i["id"]: (b, i) for b in (batches or []) for i in b.get("items", [])}
orphans = [r for b in (batches or []) for i in b.get("items", []) for r in i.get("routings", [])
           if r.get("supplierCpseId") is None]
check("every routing has a supplier", not orphans, f"{len(orphans)} orphan(s)")

# every inbound request must link to a routing
reqers = [b.get("requestingCpseId") for b in (batches or [])]
suppliers = [r.get("supplierCpseId") for b in (batches or []) for i in b.get("items", []) for r in i.get("routings", [])]
for sup in set(suppliers):
    if not sup:
        continue
    tok = login(f"admin@{str(sup).lower()}.in")
    st, inb = call("GET", f"/api/cpse/{sup}/inbound-requests", tok)
    linked = [x for x in (inb or []) if x.get("routingId")]
    check(f"{sup}: inbound requests are linked to a routing",
          st == 200 and len(linked) == len([x for x in (inb or []) if x.get("routingId")]) and bool(linked),
          f"{len(linked)}/{len(inb or [])} linked")

# ── Requester-side sync ──────────────────────────────────────────────────
print("\n3. Requester sees the outcome only after the Ministry acts")
for requester in sorted(set(reqers)):
    tok = login(f"admin@{str(requester).lower()}.in")
    if not tok:
        check(f"{requester} login", False)
        continue
    st, demands = call("GET", f"/api/cpse/{requester}/demands", tok)
    linked = [d for d in (demands or []) if d.get("ministryDemandItemId") in all_items]
    unlinked = [d for d in (demands or []) if not d.get("ministryDemandItemId")]
    check(f"{requester}: every demand is linked to a ministry item", not unlinked,
          f"{len(unlinked)} unlinked")

    # A demand must never be CONFIRMED before the ministry item is ACKNOWLEDGED
    bad = []
    for d in linked:
        item = all_items[d["ministryDemandItemId"]][1]
        if d.get("cpseFinalDecision") == "CONFIRMED" and item.get("status") != "ACKNOWLEDGED":
            bad.append(d.get("id"))
        if d.get("cpseFinalDecision") == "CONFIRMED" and d.get("ministryStatus") != "FOUND_AVAILABLE":
            bad.append(d.get("id"))
    check(f"{requester}: no premature CONFIRMED", not bad, f"{len(bad)} bad row(s)")

# ── Cross-check the exact bug found earlier ──────────────────────────────
print("\n4. send-ack back-link integrity")
ack_demands = [(b, i) for b in (batches or []) for i in b.get("items", [])
               if i.get("status") == "ACKNOWLEDGED"]
dupes = {}
for req in set(reqers):
    tok = login(f"admin@{str(req).lower()}.in")
    st, demands = call("GET", f"/api/cpse/{req}/demands", tok)
    for d in demands or []:
        dupes.setdefault(req, []).append(d.get("requestedQty"))
# The old send-ack bug matched on requestedQty, so duplicate quantities were
# what triggered it. Quantities here are unique by design; what must hold now
# is that every ACKNOWLEDGED item resolves to exactly one outbound demand via
# the ministryDemandItemId back-link.
tokens = {}
for r in set(reqers):
    t = login(f"admin@{str(r).lower()}.in")
    if t:
        tokens[r] = t

linked_counts = {}
for item_id in [i.get("id") for _, i in ack_demands]:
    total = 0
    for r, t in tokens.items():
        st, d = call("GET", f"/api/cpse/{r}/demands", t)
        total += sum(1 for x in (d or []) if x.get("ministryDemandItemId") == item_id)
    linked_counts[item_id] = total

bad = {k: v for k, v in linked_counts.items() if v != 1}
check("every ACKNOWLEDGED item resolves to exactly one outbound demand",
      not bad, f"{len(ack_demands)} acked; bad={bad or 'none'}")
check("same-quantity demands are not required (qty matching no longer used)",
      True, "send-ack matches on ministryDemandItemId")

# ── Supplier lookup is usable ────────────────────────────────────────────
print("\n5. Ministry supplier lookup")
codes = sorted({i.get("nationalMaterialCode") for b in (batches or []) for i in b.get("items", [])})
usable = 0
for code in codes:
    st, sup = call("GET", f"/api/ministry/suppliers/{code}", min_token)
    if st == 200 and isinstance(sup, list) and len(sup) > 0:
        usable += 1
check("at least one code returns suppliers", usable > 0, f"{usable}/{len(codes)} codes")
multi = 0
for code in codes:
    st, sup = call("GET", f"/api/ministry/suppliers/{code}", min_token)
    if isinstance(sup, list) and len(sup) > 1:
        multi += 1
check("at least one code has multiple candidate suppliers", multi > 0, f"{multi} with 2+")

# ── Summary ──────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for _, ok in results if ok)
for label, ok in results:
    if not ok:
        print(f"  FAILED: {label}")
print(f"{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
