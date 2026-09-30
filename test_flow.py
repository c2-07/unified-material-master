#!/usr/bin/env python3
"""End-to-end test of the material request flow.

CPSE requests material -> Ministry selects a supplier -> Supplier accepts
-> Ministry notifies the requester.

Run against a live backend: python3 test_flow.py [base_url]
"""
import json
import sys
import urllib.error
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
REQUESTER = "NALCO"
CANDIDATE_SUPPLIERS = ["OIL", "ONGC", "GAIL", "NTPC", "SAIL", "HCL"]  # seed data varies

results = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=15) as r:
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


print(f"Target: {API}\n")

# ── 1. Auth ──────────────────────────────────────────────────────────────
print("1. Authentication")
req_token = login(f"admin@{REQUESTER.lower()}.in")
min_token = login("admin@ministry.gov")
check(f"requester ({REQUESTER}) login", bool(req_token))
check("ministry login", bool(min_token))
if not (req_token and min_token):
    sys.exit("cannot continue without tokens")

# ── 2. Requester raises a demand ─────────────────────────────────────────
QTY = 777
print(f"\n2. {REQUESTER} requests material (qty {QTY})")
st, d = call("POST", f"/api/cpse/{REQUESTER}/demands", req_token,
             {"localMaterialCode": "NAL-O5S3IM", "requestedQty": QTY})
check("demand created", st == 200, f"HTTP {st}")

st, demands = call("GET", f"/api/cpse/{REQUESTER}/demands", req_token)
mine = [x for x in demands if x.get("requestedQty") == QTY and x.get("ministryDemandItemId")] if isinstance(demands, list) else []
check("demand visible to requester", len(mine) >= 1, f"{len(mine)} match")
demand = sorted(mine, key=lambda x: x.get("createdAt",""))[-1] if mine else {}
item_id = demand.get("ministryDemandItemId")
check("linked to a ministry demand item", bool(item_id), item_id)
check("initial ministryStatus is PENDING_MINISTRY",
      demand.get("ministryStatus") == "PENDING_MINISTRY", demand.get("ministryStatus"))

# ── 3. Ministry finds suppliers ──────────────────────────────────────────
print("\n3. Ministry looks up suppliers")
# find the national code for the requested local material via the demand item
st, batches0 = call("GET", "/api/ministry/demands", min_token)
nat_code = None
for b in (batches0 or []):
    for i in b.get("items", []):
        if i.get("id") == item_id:
            nat_code = i.get("nationalMaterialCode")
check("demand item carries a nationalMaterialCode", bool(nat_code), nat_code)

st, supply = call("GET", f"/api/ministry/suppliers/{nat_code}?exclude={REQUESTER}", min_token)
check("supplier list returned", st == 200 and isinstance(supply, list),
      f"{len(supply) if isinstance(supply, list) else supply} suppliers")
# NOTE: this endpoint returns { cpse, qty } - key is `cpse`, not `cpseId`
excluded = [s for s in (supply or []) if s.get("cpse") == REQUESTER] if isinstance(supply, list) else []
check(f"requester ({REQUESTER}) excluded from its own supplier list", not excluded,
      [s.get("cpse") for s in (supply or [])])

# ── 4. Ministry routes to a supplier ─────────────────────────────────────
print("\n4. Ministry routes the order to a supplier")
supplier = None
supplier = (supply or [{}])[0] if supply else {}
check("found a routable supplier", bool(supplier.get("cpse")),
      [s.get("cpse") for s in (supply or [])])
if not supplier:
    supplier = (supply or [{}])[0] if supply else {}

sup_id = supplier.get("cpse")
code = nat_code
print(f"     supplier qty available: {supplier.get('qty')}")
print(f"     routing to {sup_id} for {code}")

st, r = call("POST", "/api/ministry/route-order", min_token,
             {"demandItemId": item_id, "nationalMaterialCode": code, "supplierCpseId": sup_id})
check("route-order accepted", st == 200, f"HTTP {st} {r if st != 200 else ''}")
routing_id = r.get("id") if isinstance(r, dict) else None

st2, dbl = call("POST", "/api/ministry/route-order", min_token,
                {"demandItemId": item_id, "nationalMaterialCode": code, "supplierCpseId": sup_id})
check("duplicate routing to same supplier rejected", st2 == 400, f"HTTP {st2}: {dbl}")

# ── 5. Supplier is notified ──────────────────────────────────────────────
print(f"\n5. {sup_id} receives the inbound request")
sup_token = login(f"admin@{str(sup_id).lower()}.in")
check(f"{sup_id} login", bool(sup_token))
st, inbounds = call("GET", f"/api/cpse/{sup_id}/inbound-requests", sup_token)
mine_in = [x for x in inbounds if x.get("routingId") == routing_id] if isinstance(inbounds, list) else []
check("inbound request created for supplier", len(mine_in) == 1)
inb = mine_in[0] if mine_in else {}
check("inbound links back to routing", inb.get("routingId") == routing_id)
check("supplier sees it in their LOCAL code", inb.get("localMaterialCode") not in (None, "UNKNOWN"),
      inb.get("localMaterialCode"))

# ── 6. Supplier accepts ──────────────────────────────────────────────────
print("\n6. Supplier accepts the request")
st, _ = call("PATCH", f"/api/cpse/{sup_id}/inbound-requests/{inb.get('id')}", sup_token,
             {"decision": "APPROVED"})
check("supplier approval accepted", st == 200, f"HTTP {st}")

# ── 7. Ministry sees the acceptance and notifies the requester ───────────
print("\n7. Ministry notifies the requester")
st, batches = call("GET", "/api/ministry/demands", min_token)
item = None
for b in (batches or []):
    for i in b.get("items", []):
        if i.get("id") == item_id:
            item, batch = i, b
check("demand item visible to ministry", item is not None)
routings = (item or {}).get("routings", [])
check("routing shows supplierStatus=ACCEPTED",
      any(x.get("supplierStatus") == "ACCEPTED" for x in routings),
      [x.get("supplierStatus") for x in routings])
check("Notify Requester button is enabled (not yet ACKNOWLEDGED)",
      (item or {}).get("status") != "ACKNOWLEDGED", (item or {}).get("status"))

st, _ = call("POST", "/api/ministry/send-ack", min_token,
             {"demandItemId": item_id, "requesterCpseId": REQUESTER, "requestedQty": QTY})
check("send-ack accepted", st == 200, f"HTTP {st}")

# ── 8. Requester sees the final status ───────────────────────────────────
print("\n8. Requester sees the outcome")
st, batches2 = call("GET", "/api/ministry/demands", min_token)
final = None
for b in (batches2 or []):
    for i in b.get("items", []):
        if i.get("id") == item_id:
            final = i
check("item status is ACKNOWLEDGED", (final or {}).get("status") == "ACKNOWLEDGED",
      (final or {}).get("status"))

st, demands2 = call("GET", f"/api/cpse/{REQUESTER}/demands", req_token)
mine2 = [x for x in demands2 if x.get("requestedQty") == QTY]
final_demand = mine2[0] if mine2 else {}
check("requester demand is FOUND_AVAILABLE",
      final_demand.get("ministryStatus") == "FOUND_AVAILABLE", final_demand.get("ministryStatus"))
check("requester demand is CONFIRMED",
      final_demand.get("cpseFinalDecision") == "CONFIRMED", final_demand.get("cpseFinalDecision"))

# ── Summary ──────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for _, ok in results if ok)
for label, ok in results:
    if not ok:
        print(f"  FAILED: {label}")
print(f"{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
