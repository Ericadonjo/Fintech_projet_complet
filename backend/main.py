import uuid
import hashlib
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from sqlalchemy.orm import Session
from typing import List

from database import engine, get_db
import models, schemas

# models.Base.metadata.create_all(bind=engine) # Handled by init_db.py

app = FastAPI(title="PMECompta API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- COMPTES ---

@app.get("/api/accounts", response_model=List[schemas.AccountResponse])
def get_accounts(db: Session = Depends(get_db)):
    accounts = db.query(models.Account).filter(models.Account.actif == 1).all()
    # Map to schema
    res = []
    for a in accounts:
        res.append({
            "id": a.id,
            "name": a.nom,
            "type": a.type_compte.lower(),
            "initial_balance": a.solde_initial,
            "currency": a.devise
        })
    return res

@app.post("/api/accounts", response_model=schemas.AccountResponse)
def create_account(acc: schemas.AccountCreate, db: Session = Depends(get_db)):
    acc_id = str(uuid.uuid4())
    type_compte = acc.type.upper()
    if type_compte not in ['CAISSE', 'BANQUE', 'MOBILE_MONEY', 'AUTRE']:
        type_compte = 'AUTRE'
        
    db_acc = models.Account(
        id=acc_id,
        nom=acc.name,
        type_compte=type_compte,
        devise=acc.currency,
        solde_initial=acc.initial_balance,
        date_ouverture=datetime.now().isoformat()
    )
    db.add(db_acc)
    db.commit()
    return {
        "id": db_acc.id,
        "name": db_acc.nom,
        "type": db_acc.type_compte.lower(),
        "initial_balance": db_acc.solde_initial,
        "currency": db_acc.devise
    }

@app.get("/api/accounts/{account_id}/balance")
def get_account_balance(account_id: str, db: Session = Depends(get_db)):
    # Simple calculation: initial + in - out
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    
    txs = db.query(models.Transaction).filter(models.Transaction.compte_id == account_id, models.Transaction.statut == "CONFIRME").all()
    
    balance = acc.solde_initial
    for tx in txs:
        if tx.type_flux == "ENTREE":
            balance += tx.montant
        else:
            balance -= tx.montant
            
    return balance

@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db)):
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404)
    acc.actif = 0
    db.commit()
    return {"status": "ok"}

# --- CATEGORIES ---

@app.get("/api/categories", response_model=List[schemas.CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    cats = db.query(models.Category).filter(models.Category.actif == 1).all()
    res = []
    for c in cats:
        res.append({
            "id": c.id,
            "name": c.libelle_user,
            "group_name": c.groupe_bilan,
            "icon": c.icone
        })
    return res

@app.post("/api/categories", response_model=schemas.CategoryResponse)
def create_category(cat: schemas.CategoryCreate, db: Session = Depends(get_db)):
    # basic mapping
    groupe = cat.group_name.upper() if cat.group_name else "CHARGES_DIVERSES"
    type_flux = "SORTIE" if "CHARGE" in groupe or "ACHAT" in groupe else "ENTREE"
    
    db_cat = models.Category(
        code=f"CUSTOM_{uuid.uuid4().hex[:8].upper()}",
        libelle_user=cat.name,
        libelle_bilan="Divers",
        type_flux=type_flux,
        groupe_bilan=groupe,
        icone=cat.icon or "📌"
    )
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return {
        "id": db_cat.id,
        "name": db_cat.libelle_user,
        "group_name": db_cat.groupe_bilan,
        "icon": db_cat.icone
    }

# --- TRANSACTIONS ---

def generate_hash(tx_id, montant, date_op, compte_id, categorie_id):
    data = f"{tx_id}|{montant}|{date_op}|{compte_id}|{categorie_id}"
    return hashlib.sha256(data.encode()).hexdigest()

@app.get("/api/transactions", response_model=List[schemas.TransactionResponse])
def get_transactions(db: Session = Depends(get_db)):
    txs = db.query(models.Transaction).order_by(models.Transaction.date_operation.desc()).all()
    res = []
    for tx in txs:
        res.append({
            "id": tx.id,
            "account_id": tx.compte_id,
            "category_id": tx.categorie_id,
            "type": "credit" if tx.type_flux == "ENTREE" else "debit",
            "amount": tx.montant,
            "date": tx.date_operation,
            "description": tx.tiers_nom or tx.note,
            "reference": tx.reference_externe,
            "hash": tx.hash
        })
    return res

@app.post("/api/transactions", response_model=schemas.TransactionResponse)
def create_transaction(tx: schemas.TransactionCreate, db: Session = Depends(get_db)):
    tx_id = str(uuid.uuid4())
    type_flux = "ENTREE" if tx.type == "credit" else "SORTIE"
    
    # Hash calculation
    tx_hash = generate_hash(tx_id, tx.amount, tx.date, tx.account_id, tx.category_id)
    
    db_tx = models.Transaction(
        id=tx_id,
        type_flux=type_flux,
        montant=tx.amount,
        devise=tx.currency,
        montant_xaf=tx.amount, # assume 1:1 for XAF
        categorie_id=tx.category_id,
        compte_id=tx.account_id,
        tiers_nom=tx.description,
        reference_externe=tx.reference,
        date_operation=tx.date,
        date_saisie=datetime.now().isoformat(),
        statut="CONFIRME",
        hash=tx_hash
    )
    db.add(db_tx)
    db.commit()
    
    return {
        "id": db_tx.id,
        "account_id": db_tx.compte_id,
        "category_id": db_tx.categorie_id,
        "type": "credit" if db_tx.type_flux == "ENTREE" else "debit",
        "amount": db_tx.montant,
        "date": db_tx.date_operation,
        "description": db_tx.tiers_nom,
        "reference": db_tx.reference_externe,
        "hash": db_tx.hash
    }

@app.post("/api/transactions/{tx_id}/cancel", response_model=schemas.TransactionResponse)
def cancel_transaction(tx_id: str, db: Session = Depends(get_db)):
    # 1. Fetch original transaction
    orig_tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not orig_tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    
    if orig_tx.statut == "ANNULE":
        raise HTTPException(status_code=400, detail="Cette transaction est déjà annulée")

    # 2. Update original status
    orig_tx.statut = "ANNULE"

    # 3. Create inverse transaction
    new_tx_id = str(uuid.uuid4())
    inverse_type_flux = "SORTIE" if orig_tx.type_flux == "ENTREE" else "ENTREE"
    
    # Hash calculation for the new transaction
    date_saisie = datetime.now().isoformat()
    # date_operation can be the same as original or today. We use today's date for the correction operation.
    date_op = datetime.now().isoformat().split('T')[0]
    
    tx_hash = generate_hash(new_tx_id, orig_tx.montant, date_op, orig_tx.compte_id, orig_tx.categorie_id)
    
    db_inverse_tx = models.Transaction(
        id=new_tx_id,
        type_flux=inverse_type_flux,
        montant=orig_tx.montant,
        devise=orig_tx.devise,
        montant_xaf=orig_tx.montant_xaf,
        taux_applique=orig_tx.taux_applique,
        categorie_id=orig_tx.categorie_id,
        compte_id=orig_tx.compte_id,
        tiers_nom=orig_tx.tiers_nom,
        reference_externe=orig_tx.reference_externe,
        date_operation=date_op,
        date_saisie=date_saisie,
        statut="CONFIRME",
        source_saisie="CORRECTION",
        correction_de=orig_tx.id,
        note=f"Annulation de la transaction {tx_id}",
        hash=tx_hash
    )
    
    db.add(db_inverse_tx)
    db.commit()
    db.refresh(db_inverse_tx)
    
    return {
        "id": db_inverse_tx.id,
        "account_id": db_inverse_tx.compte_id,
        "category_id": db_inverse_tx.categorie_id,
        "type": "credit" if db_inverse_tx.type_flux == "ENTREE" else "debit",
        "amount": db_inverse_tx.montant,
        "date": db_inverse_tx.date_operation,
        "description": db_inverse_tx.note,
        "reference": db_inverse_tx.reference_externe,
        "hash": db_inverse_tx.hash
    }

@app.post("/api/transactions/{tx_id}/attachments")
def upload_attachment(tx_id: str, type: str = "IMAGE", file: UploadFile = File(...), db: Session = Depends(get_db)):
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")

    ext = file.filename.split(".")[-1]
    safe_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join("uploads", safe_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    pj_id = str(uuid.uuid4())
    
    # Validation of the type against schema constraint if possible
    # Allowed: 'IMAGE', 'PDF', 'SMS_SCREENSHOT', 'AUDIO'
    type_fichier = type.upper()
    if ext.lower() in ["m4a", "webm", "mp3", "wav"]:
        type_fichier = "AUDIO"
    elif type_fichier not in ["IMAGE", "PDF", "SMS_SCREENSHOT", "AUDIO"]:
        type_fichier = "IMAGE" if ext.lower() in ["jpg", "jpeg", "png", "webp"] else "PDF"

    db_pj = models.PieceJointe(
        id=pj_id,
        transaction_id=tx_id,
        type_fichier=type_fichier,
        chemin_local=file_path,
        date_ajout=datetime.now().isoformat(),
        taille_octets=os.path.getsize(file_path)
    )
    db.add(db_pj)
    db.commit()

    return {"id": pj_id, "url": f"/uploads/{safe_filename}"}

# --- SETTINGS ---
# Mocked settings since schema doesn't have a settings table

settings_db = {
    "withdrawal_limit": "0"
}

@app.get("/api/settings/{key}")
def get_setting(key: str):
    return settings_db.get(key)

@app.post("/api/settings/{key}")
def set_setting(key: str, payload: dict):
    settings_db[key] = payload.get("value")
    return {"status": "ok"}

# --- SYNC ---

@app.post("/api/sync/push")
def sync_push(transactions: List[schemas.TransactionCreate], db: Session = Depends(get_db)):
    # Simple upsert based on provided IDs (if we had IDs in TransactionCreate)
    # Actually, we should probably use a dedicated Sync schema that includes IDs
    for tx_data in transactions:
        # Check if already exists
        existing = db.query(models.Transaction).filter(models.Transaction.id == tx_data.id).first()
        if not existing:
            # Create new
            tx_id = tx_data.id or str(uuid.uuid4())
            db_tx = models.Transaction(
                id=tx_id,
                type_flux="ENTREE" if tx_data.type == "credit" else "SORTIE",
                montant=tx_data.amount,
                devise=tx_data.currency,
                montant_xaf=tx_data.amount,
                categorie_id=tx_data.category_id,
                compte_id=tx_data.account_id,
                tiers_nom=tx_data.description,
                reference_externe=tx_data.reference,
                date_operation=tx_data.date,
                date_saisie=datetime.now().isoformat(),
                date_sync=datetime.now().isoformat(),
                statut="CONFIRME",
                hash=tx_data.hash or ""
            )
            db.add(db_tx)
    db.commit()
    return {"status": "ok"}

@app.get("/api/sync/pull")
def sync_pull(last_sync: str = None, db: Session = Depends(get_db)):
    query = db.query(models.Transaction)
    if last_sync:
        query = query.filter(models.Transaction.date_saisie > last_sync)
    
    txs = query.all()
    res = []
    for tx in txs:
        res.append({
            "id": tx.id,
            "account_id": tx.compte_id,
            "category_id": tx.categorie_id,
            "type": "credit" if tx.type_flux == "ENTREE" else "debit",
            "amount": tx.montant,
            "date": tx.date_operation,
            "description": tx.tiers_nom or tx.note,
            "reference": tx.reference_externe,
            "hash": tx.hash
        })
    return res
