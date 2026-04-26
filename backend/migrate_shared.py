import sqlite3
conn = sqlite3.connect('database.sqlite')
cursor = conn.cursor()

try:
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shared_reports (
        token TEXT PRIMARY KEY,
        report_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        is_active INTEGER DEFAULT 1
    );
    """)
    print("Table shared_reports created.")
except Exception as e:
    print(f"Error creating table: {e}")

conn.commit()
conn.close()
