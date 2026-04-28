# Frontend Fix: AI Autonomous Claims Dashboard Integration

## Fixed Issues

### 1. **Absolute URL with Backend Port**
**Problem:** Component used relative paths (`/api/admin/claims`)
**Fix:** Now uses `import.meta.env.VITE_API_URL` from .env file
```typescript
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';
const endpoint = `${apiBaseUrl}/api/admin/claims`;
```

### 2. **Status Case Sensitivity Mismatch**
**Problem:** Backend returns uppercase (`PENDING`, `SENT`, `REJECTED`), UI expected lowercase
**Fix:** Added `normalizeStatus()` transformer function
```typescript
const normalizeStatus = (backendStatus: string): 'pending' | 'approved' | 'rejected' => {
  const upper = backendStatus.toUpperCase();
  if (upper === 'PENDING') return 'pending';
  if (upper === 'SENT') return 'approved';
  if (upper === 'REJECTED') return 'rejected';
  return 'pending';
};
```

### 3. **AI Claims Source Filtering**
**Problem:** Component fetched all claims, not just AI-generated ones
**Fix:** Added explicit filter for `source === 'AI_GENERATED'`
```typescript
let aiClaims = backendClaims.filter(c => {
  const source = c.source || 'AI_GENERATED';
  return source === 'AI_GENERATED';
});
```

### 4. **Response Data Transformation**
**Problem:** Backend response struct didn't match UI interface
**Fix:** Added `transformClaim()` to normalize backend claims
```typescript
const transformClaim = (backendClaim: BackendAIClaim): AIClaim => {
  return {
    claim_id: backendClaim.claim_id,
    status: normalizeStatus(backendClaim.status),
    location: backendClaim.location || {
      lat: backendClaim.location_lat || 0,
      lng: backendClaim.location_lng || 0
    },
    ai_confidence: backendClaim.ai_confidence || backendClaim.risk_score || 0,
    // ... other fields
  };
};
```

### 5. **Comprehensive Logging**
**Problem:** No visibility into API calls and data transformations
**Fix:** Added detailed console logging at every step
```
[AIClaimsPanel] Loading claims with filter: pending
[AIClaimsPanel] Fetching from: http://127.0.0.1:5000/api/admin/claims
[AIClaimsPanel] Response status: 200
[AIClaimsPanel] Claims Response: {...}
[AIClaimsPanel] Received 2 claims from backend
[AIClaimsPanel] After source filter: 2 AI-generated claims
[AIClaimsPanel] Transformed claims: [...]
[AIClaimsPanel] After pending filter: 1 claims
[AIClaimsPanel] Final claims to display: 1
```

### 6. **Debug Mode UI**
**Problem:** No way to see raw API response
**Fix:** Added "Show Debug" button that displays:
- Raw API response JSON
- Transformed claims array
- Filter status and API base URL
```typescript
{debugMode && rawResponse && (
  <div className="mt-3 p-3 bg-yellow-100 border border-yellow-400 rounded text-xs overflow-auto max-h-40">
    <strong>API Response Debug:</strong>
    <pre>{JSON.stringify(rawResponse, null, 2)}</pre>
  </div>
)}
```

### 7. **Error Handling**
**Problem:** Vague error messages
**Fix:** Enhanced error messaging with context
```typescript
if (!response.ok) {
  throw new Error(`API Error: ${response.status} ${response.statusText}`);
}

} catch (error) {
  console.error('[AIClaimsPanel] Error loading claims:', error);
  setClaims([]);
  setRawResponse({ error: String(error) });
}
```

### 8. **Updated Type Interfaces**
Created separate interfaces for backend vs UI data:
```typescript
interface BackendAIClaim {
  status: 'PENDING' | 'SENT' | 'REJECTED' | 'pending' | 'approved' | 'rejected';
  source?: 'AI_GENERATED' | 'MANUAL';
  location_lat?: number;
  location_lng?: number;
  ai_confidence?: number;
  risk_score?: number;
  // ... other fields as returned from backend
}

interface AIClaim {
  status: 'pending' | 'approved' | 'rejected';
  source: 'AI_GENERATED' | 'MANUAL';
  location: { lat: number; lng: number };
  ai_confidence: number;
  // ... normalized fields for UI
}
```

## Environment Configuration

File: `frontend/.env`
```
VITE_API_URL=http://localhost:5000
VITE_OPENWEATHER_API_KEY=YOUR_OPENWEATHERMAP_API_KEY_HERE
```

The VITE_API_URL environment variable is used to construct absolute URLs to the backend API.

## Component Integration

### Location: `frontend/src/components/AIClaimsPanel.tsx`
- Imports: `import { useState, useEffect } from 'react'`
- Props: None
- State: 
  - `claims`: Normalized claims for display
  - `rawResponse`: Raw API response (for debugging)
  - `filterStatus`: 'all' | 'pending' | 'approved' | 'rejected'
  - `debugMode`: Boolean toggle for debug overlay

### Usage in Dashboard: `frontend/src/pages/Dashboard.tsx`
```tsx
import AIClaimsPanel from '../components/AIClaimsPanel';

// In return JSX:
<div className="mt-12">
  <AIClaimsPanel />
</div>
```

## API Endpoints Used

1. **Fetch AI Claims**
   - Endpoint: `GET /api/admin/claims`
   - Headers: `Authorization: Bearer {token}`
   - Auto-filtered by component for `source='AI_GENERATED'`

2. **Fetch Pending Claims** (for stats)
   - Endpoint: `GET /api/admin/claims/pending`
   - Returns only PENDING status claims

3. **Update Claim Status**
   - Endpoint: `PUT /api/claims/{claim_id}/status`
   - Body: `{ status: 'SENT' | 'REJECTED', admin_notes?: string }`
   - Used for approve/reject actions

## Data Flow

```
1. Component mounts
   ↓
2. loadClaims() called with apiBaseUrl
   ↓
3. Fetch from http://127.0.0.1:5000/api/admin/claims
   ↓
4. Log raw response
   ↓
5. Filter: source === 'AI_GENERATED'
   ↓
6. Transform each claim (normalizeStatus + field mapping)
   ↓
7. Apply UI filter (pending/approved/rejected/all)
   ↓
8. setState(transformedClaims)
   ↓
9. Render claims in grid
```

## Testing the Fix

### Step 1: Check Console Logs
Browser DevTools Console should show:
```
[AIClaimsPanel] Loading claims with filter: pending
[AIClaimsPanel] Fetching from: http://127.0.0.1:5000/api/admin/claims
[AIClaimsPanel] Response status: 200
[AIClaimsPanel] Received 2 claims from backend
[AIClaimsPanel] After source filter: 2 AI-generated claims
```

### Step 2: Enable Debug Mode
Click "Show Debug" button in component header
- Should display raw API response JSON
- Should show transformed claims array
- Should display current filter and API base URL

### Step 3: Verify Claims Display
- Claims should appear in the grid
- Each claim shows:
  - Worker name
  - Claim ID
  - Distress condition
  - AI Confidence percentage
  - Timestamp
  - Contact info
  - Location (lat/lng)

### Step 4: Test Filters
- Click "Pending" filter
- Claims should update to only show PENDING status
- Click "Approved" filter
- Claims should update to show SENT status
- Click "All" filter
- Should show PENDING + SENT + REJECTED

### Step 5: Verify Actions
- Click a claim to open modal
- Click "Approve Claim" button
- Should update status to SENT
- Claim should move from Pending to Approved section

## Troubleshooting

### "No claims found" message
**Check:**
1. Open browser console → look for [AIClaimsPanel] logs
2. Click "Show Debug" button
3. Verify API response has `claims` array
4. Check if claims have `source: 'AI_GENERATED'`
5. Verify backend is running on http://127.0.0.1:5000

### API Error responses
**Common issues:**
- 401 Unauthorized → Token expired, need to login again
- 403 Forbidden → User role is not 'admin'
- 500 Internal Server Error → Backend crashed, restart Flask server

### Wrong claims showing
**Check:**
- Verify claims have correct source field ('AI_GENERATED')
- Check filter logic in console logs
- Verify status values match (PENDING/SENT/REJECTED)

## Files Modified

- `frontend/src/components/AIClaimsPanel.tsx` - Complete rewrite with fixes
- `frontend/.env` - Already configured correctly

## No Breaking Changes

- Component maintains same props interface (none)
- Component maintains same placement in Dashboard
- Component maintains same visual styling
- Backwards compatible with existing claims data structure

All fixes are internal logic improvements with no impact on consuming components.
