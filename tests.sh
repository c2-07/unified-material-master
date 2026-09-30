#!/bin/bash

# Ensure services are up
echo "Running E2E Integration Tests..."

# 1. Test ML API Health
echo -e "\n1. Testing ML API /api/health..."
ML_HEALTH=$(curl -s http://localhost:8000/api/health)
if [[ $ML_HEALTH == *"\"status\":\"HEALTHY\""* ]]; then
  echo "✅ ML API Health check passed"
else
  echo "❌ ML API Health check failed"
fi

# 2. Test ML API Match
echo -e "\n2. Testing ML API /api/match-material..."
ML_MATCH=$(curl -s -X POST -H "Content-Type: application/json" -d '{"raw_description": "Test Material"}' http://localhost:8000/api/match-material)
if [[ $ML_MATCH == *"approval_status"* ]]; then
  echo "✅ ML Match returned successfully"
else
  echo "❌ ML Match failed"
fi

# 3. Test Core Backend Auth
echo -e "\n3. Testing Core Backend Auth Registration & Login..."
REGISTER=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email": "test@ministry.gov", "password": "password123", "role": "MINISTRY"}' http://localhost:4000/api/auth/register)
LOGIN=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email": "test@ministry.gov", "password": "password123"}' http://localhost:4000/api/auth/login)

TOKEN=$(echo $LOGIN | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -n "$TOKEN" ]; then
  echo "✅ Auth Login passed (Token received)"
else
  echo "❌ Auth Login failed"
fi

# 4. Test Protected Route Access
echo -e "\n4. Testing Protected Route (Ministry Demands)..."
PROTECTED=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/ministry/demands)

if [[ $PROTECTED == *"requestingCpseId"* ]]; then
  echo "✅ Secure Route access passed"
else
  echo "❌ Secure Route access failed"
fi

echo -e "\nTesting Complete!"


# 5. Test Bulk CSV Upload (Isolated Test CPSE)
echo -e "\n5. Testing Bulk CSV Upload for a new CPSE..."
# Create a tiny temporary CSV
cat <<EOF > test_upload.csv
localMaterialCode,localDescription,localBaseCategory,quantity,uom
TEST-100,Test Item 1,Test,10,EA
TEST-200,Test Item 2,Test,20,MTR
EOF

# Register & Login isolated test user
curl -s -X POST -H "Content-Type: application/json" -d '{"email": "test@testcpse.com", "password": "password123", "role": "CPSE", "tenantCpseId": "TEST_CPSE"}' http://localhost:4000/api/auth/register > /dev/null
TEST_LOGIN=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email": "test@testcpse.com", "password": "password123"}' http://localhost:4000/api/auth/login)
TEST_TOKEN=$(echo $TEST_LOGIN | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

# Upload the CSV
UPLOAD_RES=$(curl -s -X POST -H "Authorization: Bearer $TEST_TOKEN" -F "file=@test_upload.csv" http://localhost:4000/api/cpse/TEST_CPSE/inventory/bulk-upload)

if [[ $UPLOAD_RES == *"\"rowsImported\":2"* ]]; then
  echo "✅ Bulk CSV Upload passed (2 rows imported)"
else
  echo "❌ Bulk CSV Upload failed: $UPLOAD_RES"
fi

# Cleanup temp file
rm test_upload.csv
echo -e "\nTesting Complete!"
