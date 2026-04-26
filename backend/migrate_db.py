import sqlite3
conn = sqlite3.connect('database.sqlite')
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE transactions ADD COLUMN parent_id TEXT;")
    print("Column parent_id added.")
except Exception as e:
    print(f"Error adding column: {e}")

try:
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rapprochements (
        id TEXT PRIMARY KEY,
        transaction_id TEXT REFERENCES transactions(id),
        reference_interne TEXT,
        montant REAL,
        date_creation TEXT
    );
    """)
    print("Table rapprochements created.")
except Exception as e:
    print(f"Error creating table: {e}")

conn.commit()
conn.close()
