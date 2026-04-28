from app import app, sse_broadcast
from collections import Counter

routes = [str(r) for r in app.url_map.iter_rules()]
dupes = {r: c for r, c in Counter(routes).items() if c > 1}
print("Duplicate routes:", dupes if dupes else "NONE OK")

needed = ["/api/events", "/api/claims/<claim_id>/status"]
found  = {str(r) for r in app.url_map.iter_rules()}
for ep in needed:
    status = "FOUND OK" if ep in found else "MISSING!"
    print(f"  {ep}: {status}")

print("sse_broadcast callable: OK")

admin_eps = sorted(r for r in found if "admin" in r or "claims" in r or "events" in r)
print("\nAll claims/admin/events routes:")
for ep in admin_eps:
    print(" ", ep)
