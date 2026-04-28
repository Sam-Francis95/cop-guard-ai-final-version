import sqlite3

conn = sqlite3.connect('users.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

print('=== USERS TABLE ===')
users = c.execute('SELECT * FROM users').fetchall()
for u in users:
    print(f'ID: {u["id"]}, Name: {u["name"]}, Phone: {u["phone"]}')

print('\n=== AI CLAIMS TABLE ===')
claims = c.execute('SELECT * FROM ai_claims').fetchall()
for claim in claims:
    print(f'ID: {claim["claim_id"]}, Worker: {claim["worker_id"]}, Status: {claim["status"]}, Source: {claim["source"]}')

print(f'\nTotal Users: {len(users)}')
print(f'Total AI Claims: {len(claims)}')

conn.close()
