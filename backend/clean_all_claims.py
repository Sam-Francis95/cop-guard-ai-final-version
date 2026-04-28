import sqlite3

conn = sqlite3.connect('users.db')
cursor = conn.cursor()

# Delete ALL claims (not just AI ones)
cursor.execute('DELETE FROM ai_claims')
conn.commit()

print('Deleted all AI claims')

# Verify
claims = cursor.execute('SELECT COUNT(*) FROM ai_claims').fetchone()
print(f'Remaining claims: {claims[0]}')

conn.close()
