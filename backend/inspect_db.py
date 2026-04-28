import sqlite3

conn = sqlite3.connect('users.db')
cursor = conn.cursor()

# Check if there are any users
users = cursor.execute('SELECT id, name, phone FROM users').fetchall()
print(f"Users: {len(users)}")
for u in users:
    print(f"  ID: {u[0]}, Name: {u[1]}, Phone: {u[2]}")

# Check all claims
claims = cursor.execute('SELECT claim_id, worker_id, status FROM ai_claims').fetchall()
print(f"\nAll claims: {len(claims)}")
for c in claims:
    print(f"  {c[0]} | Worker: {c[1]} | Status: {c[2]}")

# Check specifically for W-1 and W-2 pending claims
print("\nW-1 Pending claims:")
w1_pending = cursor.execute('SELECT claim_id FROM ai_claims WHERE worker_id = "W-1" AND status = "PENDING"').fetchall()
print(f"  Count: {len(w1_pending)}")
for c in w1_pending:
    print(f"    {c[0]}")

print("\nW-2 Pending claims:")
w2_pending = cursor.execute('SELECT claim_id FROM ai_claims WHERE worker_id = "W-2" AND status = "PENDING"').fetchall()
print(f"  Count: {len(w2_pending)}")
for c in w2_pending:
    print(f"    {c[0]}")

conn.close()
