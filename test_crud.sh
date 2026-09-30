#!/bin/bash
echo "Running Advanced CRUD Integration Tests..."

# 1. Register & Login CPSE
curl -s -X POST -H "Content-Type: application/json" -d '{"email": "crud@test.com", "password": "pass", "role": "CPSE", "tenantCpseId": "TEST_CRUD"}' http://localhost:4000/api/auth/register > /dev/null
LOGIN=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email": "crud@test.com", "password": "pass"}' http://localhost:4000/api/auth/login)
CPSE_TOKEN=$(echo $LOGIN | jq -r .token)

# 2. Create Inventory
echo "-> Creating Inventory Item..."
INV_RES=$(curl -s -X POST -H "Authorization: Bearer $CPSE_TOKEN" -H "Content-Type: application/json" -d '{"localMaterialCode": "T1", "localDescription": "Desc 1", "quantity": 10, "uom": "EA", "statusTag": "ACTIVE"}' http://localhost:4000/api/cpse/TEST_CRUD/inventory)
INV_ID=$(echo $INV_RES | jq -r .id)

# 3. Update Inventory
echo "-> Updating Inventory Item..."
UPD_INV=$(curl -s -X PATCH -H "Authorization: Bearer $CPSE_TOKEN" -H "Content-Type: application/json" -d '{"quantity": 50}' http://localhost:4000/api/cpse/TEST_CRUD/inventory/$INV_ID)
NEW_QTY=$(echo $UPD_INV | jq -r .quantity)
if [ "$NEW_QTY" == "50" ]; then echo "✅ Inventory Update passed"; else echo "❌ Inventory Update failed"; fi

# 4. Delete Inventory
echo "-> Deleting Inventory Item..."
DEL_INV=$(curl -s -X DELETE -H "Authorization: Bearer $CPSE_TOKEN" http://localhost:4000/api/cpse/TEST_CRUD/inventory/$INV_ID)
if [[ $DEL_INV == *"deleted"* ]]; then echo "✅ Inventory Delete passed"; else echo "❌ Inventory Delete failed"; fi

# 5. Create Demand
echo "-> Creating Outbound Demand..."
DEM_RES=$(curl -s -X POST -H "Authorization: Bearer $CPSE_TOKEN" -H "Content-Type: application/json" -d '{"localMaterialCode": "T2", "requestedQty": 100}' http://localhost:4000/api/cpse/TEST_CRUD/demands)
DEM_ID=$(echo $DEM_RES | jq -r .id)

# 6. Update Demand
echo "-> Updating Demand..."
UPD_DEM=$(curl -s -X PATCH -H "Authorization: Bearer $CPSE_TOKEN" -H "Content-Type: application/json" -d '{"requestedQty": 200}' http://localhost:4000/api/cpse/TEST_CRUD/demands/$DEM_ID)
NEW_DEM_QTY=$(echo $UPD_DEM | jq -r .requestedQty)
if [ "$NEW_DEM_QTY" == "200" ]; then echo "✅ Demand Update passed"; else echo "❌ Demand Update failed"; fi

# 7. Cancel Demand
echo "-> Cancelling Demand..."
DEL_DEM=$(curl -s -X DELETE -H "Authorization: Bearer $CPSE_TOKEN" http://localhost:4000/api/cpse/TEST_CRUD/demands/$DEM_ID)
if [[ $DEL_DEM == *"cancelled"* ]]; then echo "✅ Demand Delete passed"; else echo "❌ Demand Delete failed"; fi

# 8. Ministry Login & Delete CPSE
echo "-> Logging in as Ministry to clean up..."
MIN_LOGIN=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email": "test@ministry.gov", "password": "password123"}' http://localhost:4000/api/auth/login)
MIN_TOKEN=$(echo $MIN_LOGIN | jq -r .token)

DEL_CPSE=$(curl -s -X DELETE -H "Authorization: Bearer $MIN_TOKEN" http://localhost:4000/api/ministry/cpse/TEST_CRUD)
if [[ $DEL_CPSE == *"completely removed"* ]]; then echo "✅ Ministry CPSE Delete passed (Cleanup successful)"; else echo "❌ CPSE Delete failed"; fi

echo "All CRUD tests complete!"
