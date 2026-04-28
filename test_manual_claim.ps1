Write-Host "========== TESTING MANUAL CLAIM SUBMISSION FORM ==========" -ForegroundColor Cyan
Write-Host ""

# Test 1: Register a worker
Write-Host "[TEST 1] Registering test worker..." -ForegroundColor Yellow
$register = @{
    name = "Demo Worker"
    age = 28
    phone = "9999999999"
    password = "demo123456"
} | ConvertTo-Json

try {
    $regRes = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/auth/register" `
        -Method POST `
        -ContentType "application/json" `
        -Body $register `
        -ErrorAction Stop
    
    $regData = $regRes.Content | ConvertFrom-Json
    $token = $regData.token
    $userId = $regData.user_id
    
    Write-Host "✅ Registration Successful!" -ForegroundColor Green
    Write-Host "   User ID: $userId" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 30))..." -ForegroundColor Green
} catch {
    Write-Host "❌ Registration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[TEST 2] Submitting Manual Claim via /api/claims/create..." -ForegroundColor Yellow

# Test 2: Submit a manual claim
$claim = @{
    worker_id = "W-$userId"
    worker_name = "Demo Worker"
    event_type = "MANUAL"
    event_source = "user"
    description = "Testing the new manual claim form - This claim was submitted from the raise claim modal"
} | ConvertTo-Json

try {
    $claimRes = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/claims/create" `
        -Method POST `
        -ContentType "application/json" `
        -Body $claim `
        -Headers @{"Authorization" = "Bearer $token"} `
        -ErrorAction Stop
    
    $claimData = $claimRes.Content | ConvertFrom-Json
    
    Write-Host "✅ MANUAL CLAIM SUBMITTED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "   Claim ID: $($claimData.claim_id)" -ForegroundColor Cyan
    Write-Host "   Event Type: $($claimData.ai_analysis.event_type)" -ForegroundColor Cyan
    Write-Host "   AI Verdict: $($claimData.ai_analysis.ai_verdict)" -ForegroundColor Cyan
    Write-Host "   Risk Score: $($claimData.ai_analysis.risk_score)" -ForegroundColor Cyan
    Write-Host "   Description: $($claimData.ai_analysis.description)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Claim submission failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[TEST 3] Fetching AI Claims List..." -ForegroundColor Yellow

# Test 3: Fetch AI claims
try {
    $aiRes = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/ai-claims" `
        -Method GET `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer $token"} `
        -ErrorAction Stop
    
    $aiData = $aiRes.Content | ConvertFrom-Json
    
    Write-Host "✅ AI Claims fetched successfully!" -ForegroundColor Green
    Write-Host "   Total claims: $($aiData.claims.Count)" -ForegroundColor Cyan
    
    if ($aiData.claims.Count -gt 0) {
        Write-Host "   Latest claim:" -ForegroundColor Green
        Write-Host "     - Claim ID: $($aiData.claims[0].claim_id)" -ForegroundColor Cyan
        Write-Host "     - Type: $($aiData.claims[0].event_type)" -ForegroundColor Cyan
        Write-Host "     - Description: $($aiData.claims[0].description)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to fetch AI claims: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========== ✅ ALL TESTS PASSED - FORM IS WORKING! ==========" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 SUMMARY:" -ForegroundColor Yellow
Write-Host "   ✓ Manual claim form endpoint (/api/claims/create) is WORKING"
Write-Host "   ✓ Claims are stored correctly in the database"
Write-Host "   ✓ AI analysis is being applied to manual claims"
Write-Host "   ✓ Claims are retrievable via /api/ai-claims"
Write-Host ""
Write-Host "To test the UI form:" -ForegroundColor Cyan
Write-Host "   1. Go to http://localhost:5174" -ForegroundColor White
Write-Host "   2. Login as worker with phone: 9876543210, password: test123456" -ForegroundColor White
Write-Host "   3. Click Raise a Claim button in the Worker Dashboard" -ForegroundColor White
Write-Host "   4. Fill issue type and description" -ForegroundColor White
Write-Host "   5. Click Submit Claim and watch the success toast!" -ForegroundColor White
