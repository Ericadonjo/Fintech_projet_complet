import sqlite3
conn = sqlite3.connect('database.sqlite')
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE shared_reports ADD COLUMN decision_status TEXT DEFAULT 'PENDING'")
    cursor.execute("ALTER TABLE shared_reports ADD COLUMN decision_amount REAL")
    cursor.execute("ALTER TABLE shared_reports ADD COLUMN decision_reason TEXT")
    cursor.execute("ALTER TABLE shared_reports ADD COLUMN decision_date TEXT")
    print("Columns added to shared_reports.")
except Exception as e:
    print(f"Notice: {e}")

conn.commit()
conn.close()
