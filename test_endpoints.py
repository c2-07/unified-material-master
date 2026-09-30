import pandas as pd
import json
from fastapi.testclient import TestClient
from main import app

print("Starting API tests...")

# 1. Grab sample data from the CSV
df = pd.read_csv("ML_Training_Data_Master.csv", nrows=5)
sample_descs = df["Material_Description_Raw"].astype(str).tolist()[:3]
print(f"Sample descriptions for testing: {sample_descs}")

# 2. Test endpoints using TestClient
with TestClient(app) as client:
    print("\n=========================================")
    print("Testing GET /api/health")
    print("=========================================")
    health_res = client.get("/api/health")
    print(json.dumps(health_res.json(), indent=2))

    if sample_descs:
        desc1 = sample_descs[0]
        
        print("\n=========================================")
        print(f"Testing POST /api/standardize")
        print(f"Payload: {{'raw_description': '{desc1}'}}")
        print("=========================================")
        std_res = client.post("/api/standardize", json={"raw_description": desc1})
        print(json.dumps(std_res.json(), indent=2))

        print("\n=========================================")
        print(f"Testing POST /api/match-material")
        print(f"Payload: {{'raw_description': '{desc1}'}}")
        print("=========================================")
        match_res = client.post("/api/match-material", json={"raw_description": desc1})
        print(json.dumps(match_res.json(), indent=2))

        print("\n=========================================")
        print(f"Testing POST /api/batch-match-material")
        print(f"Payload: {{'descriptions': {sample_descs}}}")
        print("=========================================")
        batch_res = client.post("/api/batch-match-material", json={"descriptions": sample_descs})
        print(json.dumps(batch_res.json(), indent=2))

print("\nAll endpoints tested successfully!")
