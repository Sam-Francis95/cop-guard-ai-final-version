import sqlite3

conn = sqlite3.connect('users.db')
cursor = conn.cursor()

# Clear old test claims
cursor.execute('DELETE FROM ai_claims WHERE claim_id LIKE "AIC-%"')
conn.commit()

print('Cleared all AI claims')
print('Recent claims:')
claims = cursor.execute('SELECT claim_id, worker_id, status FROM ai_claims LIMIT 5').fetchall()
print(f'Total remaining claims: {len(claims)}')
conn.close()
