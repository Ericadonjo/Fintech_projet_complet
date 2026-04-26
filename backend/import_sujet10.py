import csv
import sqlite3
import os
from datetime import datetime

# Path to the database
DB_PATH = '/home/erica/pme-compta/backend/database.sqlite'
CSV_PATH = '/home/erica/pme-compta/sujet10/transactions_pme.csv'

def import_data():
    if not os.path.exists(DB_PATH):
        print("Database not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Cleaning database...")
    # Delete all data from main tables
    for table in ["transactions", "pieces_jointes", "shared_reports", "categories", "comptes"]:
        try:
            cursor.execute(f"DELETE FROM {table}")
        except sqlite3.OperationalError:
            print(f"Table {table} not found, skipping...")
    conn.commit()

    print("Importing from transactions_pme.csv...")
    
    pmes = {} # pme_id -> account_id
    categories = {} # cat_name -> cat_id
    now_iso = datetime.now().isoformat()
    
    with open(CSV_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # 1. Handle Account
            pme_id = row['pme_id']
            pme_nom = row['pme_nom']
            if pme_id not in pmes:
                # Create account
                cursor.execute(
                    "INSERT INTO comptes (id, nom, type_compte, devise, solde_initial, date_ouverture) VALUES (?, ?, ?, ?, ?, ?)",
                    (pme_id, pme_nom, 'BANQUE', 'XAF', 1000000.0, now_iso) 
                )

                pmes[pme_id] = pme_id
            
            # 3. Handle Transaction (moved up for type_flux)
            type_flux = "ENTREE" if row['type'] == 'recette' else "SORTIE"
            
            # 2. Handle Category
            cat_name = row['categorie']
            if cat_name not in categories:
                g_bilan = 'CHIFFRE_AFFAIRES' if type_flux == 'ENTREE' else 'ACHATS_CHARGES_EXPLOITATION'
                cursor.execute(
                    "INSERT INTO categories (code, libelle_user, libelle_bilan, type_flux, groupe_bilan, icone) VALUES (?, ?, ?, ?, ?, ?)",
                    (cat_name.upper().replace(' ', '_'), cat_name, cat_name, type_flux, g_bilan, 'Package')
                )

                cursor.execute("SELECT id FROM categories WHERE code = ?", (cat_name.upper().replace(' ', '_'),))
                cat_id = cursor.fetchone()[0]
                categories[cat_name] = cat_id

            
            # Generate a simple hash
            tx_hash = f"HASH_{row['tx_id']}"
            
            cursor.execute(
                """INSERT INTO transactions 
                   (id, type_flux, montant, devise, montant_xaf, taux_applique, 
                    categorie_id, compte_id, tiers_nom, reference_externe, 
                    date_operation, date_saisie, date_sync, note, statut, hash) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    row['tx_id'],
                    type_flux,
                    float(row['montant_devise_origine']),
                    row['devise_origine'],
                    float(row['montant_xof']),
                    float(row['taux_change_applique']),
                    categories[cat_name],
                    pmes[pme_id],
                    pme_nom,
                    row['reference'],
                    row['date'],
                    now_iso,
                    now_iso,
                    row['note'],
                    'CONFIRME',
                    tx_hash
                )
            )


    conn.commit()
    conn.close()
    print("Import successful!")

if __name__ == "__main__":
    import_data()
