import sqlite3
import os

DB_PATH = "database.sqlite"
SCHEMA_PATH = "../schema_v2.sql"

def init_db():
    if not os.path.exists(SCHEMA_PATH):
        print(f"Erreur: Fichier {SCHEMA_PATH} introuvable.")
        return

    print("Initialisation de la base de données avec schema_v2.sql...")
    
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        sql_script = f.read()

    # Connexion à la base de données SQLite
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Exécuter le script SQL complet
        cursor.executescript(sql_script)
        conn.commit()
        print("Base de données initialisée avec succès !")
    except sqlite3.Error as e:
        print(f"Erreur SQLite lors de l'initialisation : {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
