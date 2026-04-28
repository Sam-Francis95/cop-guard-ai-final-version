import sqlite3

conn = sqlite3.connect('users.db')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Tables:", [t[0] for t in tables])

# Get columns in users table
cursor.execute("PRAGMA table_info(users)")
columns = cursor.fetchall()
print("\nUsers table columns:")
for col in columns:
    print(f"  {col[1]} ({col[2]})")

# Count users
cursor.execute('SELECT COUNT(*) FROM users')
user_count = cursor.fetchone()[0]
print("\nUsers count:", user_count)

# List users
cursor.execute('SELECT id, name, age, phone FROM users')
users = cursor.fetchall()
print("\nUsers:")
if not users:
    print("  (no users yet)")
else:
    for user in users:
        print(f"  ID: {user[0]}, Name: {user[1]}, Age: {user[2]}, Phone: {user[3]}")

conn.close()
