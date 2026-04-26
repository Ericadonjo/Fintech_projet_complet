import sqlite3
conn = sqlite3.connect('database.sqlite')
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(transactions);")
cols = cursor.fetchall()
for col in cols:
    print(col[1])
conn.close()
