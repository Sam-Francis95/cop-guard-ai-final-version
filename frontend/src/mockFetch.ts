const originalFetch = window.fetch;

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = '';
    if (typeof input === 'string') {
        url = input;
    } else if (input instanceof URL) {
        url = input.toString();
    } else if (input instanceof Request) {
        url = input.url;
    }

    // Only intercept requests directed to our internal APIs
    if (url.includes('/api/')) {
        console.log(`[Mock Interceptor] Caught request to ${url}`);

        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        await delay(500); // Simulate network latency

        const createResponse = (body: any, status = 200) => {
            return new Response(JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        // 1. Auth Routes
        if (url.includes('/api/auth/register') || url.includes('/api/auth/login') || url.includes('/api/auth/admin/login')) {
            return createResponse({
                status: 'success',
                success: true,
                token: 'mock-jwt-token-123',
                user: {
                    id: 1,
                    name: 'Demo User',
                    phone: '1234567890',
                    role: url.includes('admin') ? 'admin' : 'worker'
                }
            });
        }

        if (url.includes('/api/auth/update-location')) {
            return createResponse({ success: true, message: 'Location updated' });
        }

        // 2. Claims Routes
        if (url.includes('/api/claims')) {
            const method = init?.method || 'GET';
            
            if (method === 'POST') {
                return createResponse({
                    success: true,
                    claimId: `CLM-MOCK-${Date.now()}`,
                    message: "Claim submitted successfully in Demo Mode"
                }, 201);
            }

            // GET Claims
            return createResponse({
                success: true,
                status: 'success',
                claims: [
                    {
                        claimId: 'CLM-1',
                        workerName: 'Sam (Demo)',
                        issueType: 'INJURY',
                        description: 'Mock data claim',
                        status: 'PENDING',
                        createdAt: new Date().toISOString(),
                        location: { lat: 13.0827, lng: 80.2707 },
                        qrCode: 'data:image/png;base64,mock',
                        aiConfidence: 85,
                        aiReason: 'Mocked assessment'
                    },
                    {
                        claimId: 'CLM-2',
                        workerName: 'John (Demo)',
                        issueType: 'TERRAIN',
                        description: 'Slippery floor',
                        status: 'APPROVED',
                        createdAt: new Date().toISOString(),
                        location: { lat: 13.05, lng: 80.25 },
                        qrCode: 'data:image/png;base64,mock',
                        aiConfidence: 92,
                        aiReason: 'Hazard detected'
                    }
                ]
            });
        }

        // 3. Worker Locations & Worker Info
        if (url.includes('/api/workers/locations')) {
            return createResponse({
                success: true,
                locations: [
                    { worker_id: 'W-1', lat: 13.0827, lng: 80.2707, name: 'Sam (Demo)' },
                    { worker_id: 'W-2', lat: 13.05, lng: 80.25, name: 'John (Demo)' }
                ]
            });
        }
        
        if (url.includes('/api/workers/') && url.includes('/qr')) {
            // Worker QR fetch/create
            return createResponse({
                success: true,
                qrCodeUrl: 'data:image/png;base64,mock'
            });
        }

        if (url.includes('/api/worker/simulate-emergency') || url.includes('/api/simulate-risk')) {
            return createResponse({ success: true, message: "Emergency simulated" });
        }

        if (url.includes('/api/worker/') && url.includes('/risk')) {
             return createResponse({
                success: true,
                risk_score: 45,
                risk_level: 'MEDIUM',
                factors: [{ name: 'Test Factor', impact: 45 }]
            });
        }

        // 4. Syndicate & Towers
        if (url.includes('/api/syndicate') || url.includes('/api/network/towers')) {
            return createResponse({
                success: true,
                towers: [],
                syndicates: []
            });
        }

        // Fallback for any other API route
        return createResponse({ success: true, message: 'Mock fallback response' });
    }

    // Let external requests (e.g. OpenWeatherMap, OpenStreetMap) pass through
    return originalFetch(input, init);
};

console.log("[Mock Interceptor] Injected successfully. Backend APIs are now mocked.");
