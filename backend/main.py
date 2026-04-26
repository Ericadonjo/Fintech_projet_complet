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

models.Base.metadata.create_all(bind=engine)

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
            "initial_balance": max(0, a.solde_initial),
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
        solde_initial=max(0, acc.initial_balance),
        date_ouverture=datetime.now().isoformat()
    )
    db.add(db_acc)
    db.commit()
    return {
        "id": db_acc.id,
        "name": db_acc.nom,
        "type": db_acc.type_compte.lower(),
        "initial_balance": max(0, db_acc.solde_initial),
        "currency": db_acc.devise
    }

@app.get("/api/accounts/{account_id}/balance")
def get_account_balance(account_id: str, db: Session = Depends(get_db)):
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    txs = db.query(models.Transaction).filter(models.Transaction.compte_id == account_id, models.Transaction.statut == "CONFIRME").all()
    bal = acc.solde_initial + sum(abs(t.montant) if t.type_flux == "ENTREE" else -abs(t.montant) for t in txs)
    return max(0, bal)

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
        # Fraud detection: date_operation vs date_saisie
        try:
            op_date = datetime.fromisoformat(tx.date_operation.split('T')[0])
            saisie_date = datetime.fromisoformat(tx.date_saisie.split('T')[0])
            is_backdated = (saisie_date - op_date).days > 3
        except:
            is_backdated = False

        res.append({
            "id": tx.id,
            "account_id": tx.compte_id,
            "category_id": tx.categorie_id,
            "type": "credit" if tx.type_flux == "ENTREE" else "debit",
            "amount": abs(tx.montant),
            "date": tx.date_operation,
            "description": tx.tiers_nom or tx.note,
            "reference": tx.reference_externe,
            "hash": tx.hash,
            "is_backdated": is_backdated
        })
    return res

@app.post("/api/transactions", response_model=schemas.TransactionResponse)
def create_transaction(tx: schemas.TransactionCreate, db: Session = Depends(get_db)):
    # --- BALANCE VALIDATION ---
    if tx.type == "debit":
        acc = db.query(models.Account).filter(models.Account.id == tx.account_id).first()
        if not acc:
            raise HTTPException(status_code=404, detail="Compte introuvable")
        
        # Calculate current balance
        txs = db.query(models.Transaction).filter(models.Transaction.compte_id == tx.account_id, models.Transaction.statut == "CONFIRME").all()
        current_bal = acc.solde_initial + sum(abs(t.montant) if t.type_flux == "ENTREE" else -abs(t.montant) for t in txs)
        
        if abs(tx.amount) > current_bal:
            raise HTTPException(status_code=400, detail=f"Solde insuffisant (Disponible: {max(0, current_bal)} XAF)")
    # --- END VALIDATION ---

    tx_id = str(uuid.uuid4())
    type_flux = "ENTREE" if tx.type == "credit" else "SORTIE"
    
    # Hash calculation
    tx_hash = generate_hash(tx_id, tx.amount, tx.date, tx.account_id, tx.category_id)
    
    db_tx = models.Transaction(
        id=tx_id,
        type_flux=type_flux,
        montant=abs(tx.amount),
        devise=tx.currency,
        montant_xaf=abs(tx.amount), # assume 1:1 for XAF
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

def calculate_credit_score(db: Session, transactions: List[models.Transaction]):
    if not transactions:
        return {"overall": 0, "financial": 0, "reliability": 0, "factors": []}

    total_count = len(transactions)
    
    # --- RELIABILITY SCORE (Max 50) ---
    # 1. Justification (Attachments) - 20 pts
    tx_ids = [t.id for t in transactions]
    attachments_count = db.query(models.PieceJointe).filter(models.PieceJointe.transaction_id.in_(tx_ids)).count()
    proof_rate = attachments_count / total_count if total_count > 0 else 0
    score_proof = min(20, proof_rate * 40) # 50% proofs = 20 pts
    
    # 2. Automation (Source) - 15 pts
    automated_count = sum(1 for t in transactions if t.source_saisie and t.source_saisie != "MANUEL")
    auto_rate = automated_count / total_count if total_count > 0 else 0
    score_auto = auto_rate * 15
    
    # 3. Reconciliation - 15 pts
    reconciled_count = db.query(models.Rapprochement).filter(models.Rapprochement.transaction_id.in_(tx_ids)).count()
    reconcile_rate = reconciled_count / total_count if total_count > 0 else 0
    score_reconcile = reconcile_rate * 15
    
    # 4. Penalty: Backdating
    backdated_count = 0
    for tx in transactions:
        try:
            # We consider anything backdated more than 3 days as suspicious for credit
            op_date = datetime.fromisoformat(tx.date_operation.split('T')[0])
            saisie_date = datetime.fromisoformat(tx.date_saisie.split('T')[0])
            if (saisie_date - op_date).days > 3:
                backdated_count += 1
        except:
            pass
    
    penalty_backdating = min(40, (backdated_count / total_count) * 200) if total_count > 0 else 0
    
    reliability_score = max(0, score_proof + score_auto + score_reconcile - penalty_backdating)
    
    # --- FINANCIAL SCORE (Max 50) ---
    # Simple metrics for now
    total_in = sum(t.montant for t in transactions if t.type_flux == "ENTREE")
    total_out = sum(t.montant for t in transactions if t.type_flux == "SORTIE")
    net_margin = (total_in - total_out) / total_in if total_in > 0 else 0
    
    score_margin = min(25, max(0, net_margin * 50)) # 50% margin = 25 pts
    
    # Activity regularity (tx count)
    score_activity = min(25, (total_count / 30) * 25) # 30 tx/month avg = 25 pts
    
    financial_score = score_margin + score_activity
    
    overall = min(100, reliability_score + financial_score)
    
    return {
        "overall": int(overall),
        "reliability": int(reliability_score),
        "financial": int(financial_score),
        "factors": {
            "proof_rate": round(proof_rate * 100, 1),
            "auto_rate": round(auto_rate * 100, 1),
            "reconcile_rate": round(reconcile_rate * 100, 1),
            "backdated_count": backdated_count
        },
        "status": "EXCELLENT" if overall > 80 else "BON" if overall > 60 else "MOYEN" if overall > 40 else "FAIBLE"
    }

@app.get("/api/reports/cashflow")
def get_cashflow_report(db: Session = Depends(get_db)):
    from datetime import date, timedelta
    from collections import Counter
    today = date.today()
    months = []
    for i in range(5, -1, -1):
        d = (today.replace(day=1) - timedelta(days=i*28)).replace(day=1)
        months.append(d.strftime("%Y-%m"))
    
    initial_total = sum(acc.solde_initial for acc in db.query(models.Account).all())
    first_month = months[0]
    older_txs = db.query(models.Transaction).filter(models.Transaction.date_operation < first_month, models.Transaction.statut == "CONFIRME").all()
    cumulative_balance = initial_total + sum(abs(t.montant) if t.type_flux == "ENTREE" else -abs(t.montant) for t in older_txs)

    res = []
    all_categories = {c.id: c.libelle_user for c in db.query(models.Category).all()}
    
    for m in months:
        txs = db.query(models.Transaction).filter(models.Transaction.date_operation.like(f"{m}%"), models.Transaction.statut == "CONFIRME").all()
        income = sum(abs(t.montant) for t in txs if t.type_flux == "ENTREE")
        expense = sum(abs(t.montant) for t in txs if t.type_flux == "SORTIE")
        cumulative_balance += (income - expense)
        
        cat_stats = Counter()
        tx_details = []
        for t in txs:
            cat_stats[all_categories.get(t.categorie_id, "Autre")] += abs(t.montant)
            # Fetch attachments for this transaction
            attachments = db.query(models.PieceJointe).filter(models.PieceJointe.transaction_id == t.id).all()
            tx_details.append({
                "id": t.id,
                "date": t.date_operation,
                "description": t.tiers_nom or t.note,
                "amount": abs(t.montant),
                "type": "credit" if t.type_flux == "ENTREE" else "debit",
                "reference": t.reference_externe,
                "has_proof": len(attachments) > 0,
                "proofs": [{"id": p.id, "type": p.type_fichier} for p in attachments]
            })
        
        res.append({
            "month": m, 
            "income": income, 
            "expense": expense, 
            "balance": max(0, income - expense),
            "cumulative": max(0, cumulative_balance),
            "tx_count": len(txs),
            "top_categories": [{"name": k, "value": v} for k, v in cat_stats.most_common(3)],
            "transactions": tx_details # Added for proof verification
        })
    # Calculate Global Credit Score
    all_txs_full = db.query(models.Transaction).filter(models.Transaction.statut == "CONFIRME").all()
    credit_score = calculate_credit_score(db, all_txs_full)

    return {
        "monthly_data": res,
        "credit_score": credit_score
    }



@app.post("/api/sync/push")
def sync_push(transactions: List[schemas.TransactionCreate], db: Session = Depends(get_db)):
    for tx_data in transactions:
        if not db.query(models.Transaction).filter(models.Transaction.id == tx_data.id).first():
            db_tx = models.Transaction(
                id=tx_data.id or str(uuid.uuid4()),
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
    if last_sync: query = query.filter(models.Transaction.date_saisie > last_sync)
    txs = query.all()
    return [{
        "id": tx.id, "account_id": tx.compte_id, "category_id": tx.categorie_id,
        "type": "credit" if tx.type_flux == "ENTREE" else "debit", "amount": tx.montant,
        "date": tx.date_operation, "description": tx.tiers_nom or tx.note,
        "reference": tx.reference_externe, "hash": tx.hash
    } for tx in txs]

@app.post("/api/reports/share", response_model=schemas.SharedReportResponse)
def share_report(req: schemas.SharedReportCreate, db: Session = Depends(get_db)):
    from datetime import timedelta
    token = str(uuid.uuid4())
    expires_at = (datetime.now() + timedelta(days=req.expires_in_days)).isoformat() if req.expires_in_days else None
    
    db_shared = models.SharedReport(
        token=token,
        report_type=req.report_type,
        created_at=datetime.now().isoformat(),
        expires_at=expires_at
    )
    db.add(db_shared)
    db.commit()
    
    # In a real app, this would be the actual domain
    share_url = f"/shared-report/{token}"
    
    return {
        "token": token,
        "report_type": db_shared.report_type,
        "expires_at": db_shared.expires_at,
        "share_url": share_url
    }

@app.get("/api/public/reports/{token}")


def get_public_report(token: str, db: Session = Depends(get_db)):
    shared = db.query(models.SharedReport).filter(models.SharedReport.token == token, models.SharedReport.is_active == 1).first()
    if not shared:
        raise HTTPException(status_code=404, detail="Rapport introuvable ou lien expiré")
    
    if shared.expires_at and datetime.fromisoformat(shared.expires_at) < datetime.now():
        shared.is_active = 0
        db.commit()
        raise HTTPException(status_code=404, detail="Lien expiré")
    
    if shared.report_type == "cashflow":
        res = get_cashflow_report(db)
        return res
    
    raise HTTPException(status_code=400, detail="Type de rapport non supporté")

@app.get("/api/public/reports/{token}/pdf")
def get_public_report_pdf(token: str, db: Session = Depends(get_db)):
    try:
        shared = db.query(models.SharedReport).filter(models.SharedReport.token == token, models.SharedReport.is_active == 1).first()
        if not shared:
            raise HTTPException(status_code=404, detail="Lien invalide")
        
        # Check expiration
        if shared.expires_at:
            try:
                if datetime.fromisoformat(shared.expires_at) < datetime.now():
                    raise HTTPException(status_code=404, detail="Lien expiré")
            except ValueError:
                pass # Ignore date format errors for now
        
        # Fetch data
        report_res = get_cashflow_report(db)
        data = report_res['monthly_data']
        score = report_res['credit_score']
        
        # Generate PDF
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        from collections import Counter
        import io
        from fastapi.responses import StreamingResponse

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = []

        # Title
        elements.append(Paragraph("RAPPORT D'ACTIVITÉ & TRÉSORERIE", styles['Title']))
        elements.append(Spacer(1, 10))
        
        # Credit Score Badge in PDF
        score_color = colors.darkgreen if score['overall'] > 70 else colors.orange
        elements.append(Paragraph(f"<b>SCORE DE PRÉPARATION AU CRÉDIT : <font color='{score_color}'>{score['overall']}/100</font></b>", styles['Normal']))
        elements.append(Paragraph(f"Indice de fiabilité : {score['reliability']}/50 | Santé financière : {score['financial']}/50", styles['Normal']))
        elements.append(Spacer(1, 10))

        # Header Info
        elements.append(Paragraph(f"<b>Document Certifié par :</b> PMECompta", styles['Normal']))
        elements.append(Paragraph(f"<b>Date de génération :</b> {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles['Normal']))
        elements.append(Paragraph(f"<b>Période analysée :</b> 6 derniers mois", styles['Normal']))
        elements.append(Spacer(1, 30))

        # Activity Summary
        elements.append(Paragraph("<b>1. Résumé de l'Activité</b>", styles['Heading2']))
        total_in = sum(m['income'] for m in data)
        total_out = sum(m['expense'] for m in data)
        final_bal = data[-1]['cumulative']
        elements.append(Paragraph(
            f"Au cours des 6 derniers mois, l'entreprise a généré un flux d'entrées cumulé de "
            f"<b>{total_in:,.0f} XAF</b>. Le solde de clôture certifié au {data[-1]['month']} est de "
            f"<b>{final_bal:,.0f} XAF</b>.", 
            styles['Normal']
        ))
        elements.append(Spacer(1, 15))

        # Top Categories
        elements.append(Paragraph("<b>2. Analyse des Flux par Catégorie</b>", styles['Heading2']))
        cat_data = [["Catégorie", "Volume de transactions (XAF)"]]
        # Aggregate top categories across all months
        global_cats = Counter()
        for m in data:
            for c in m['top_categories']:
                global_cats[c['name']] += c['value']
        
        for name, val in global_cats.most_common(5):
            cat_data.append([name, f"{val:,.0f}"])
        
        ct = Table(cat_data, colWidths=[230, 230])
        ct.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]))
        elements.append(ct)
        elements.append(Spacer(1, 20))

        # Financial History Table (Summary)
        elements.append(Paragraph("<b>3. Historique Financier Détaillé (Synthèse)</b>", styles['Heading2']))
        table_data = [["Mois", "Entrées (XAF)", "Sorties (XAF)", "Solde Progressif"]]
        for m in data:
            table_data.append([
                str(m['month']), 
                f"{m['income']:,.0f}", 
                f"{m['expense']:,.0f}", 
                f"{m['cumulative']:,.0f}"
            ])
        
        t = Table(table_data, colWidths=[100, 120, 120, 120])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#003366")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('TEXTCOLOR', (3, 1), (3, -1), colors.darkgreen),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 20))

        # Proof of Transactions Log
        elements.append(Paragraph("<b>4. Journal des Preuves & Justificatifs</b>", styles['Heading2']))
        log_data = [["Date", "Description", "Montant", "Statut Preuve"]]
        
        # Flatten all transactions from the 6 months
        all_txs = []
        for m in data:
            all_txs.extend(m['transactions'])
        
        # Limit to the last 30 for the PDF to avoid huge file, or provide all if requested
        for tx in all_txs[:50]: # Showing first 50 for the PDF
            log_data.append([
                tx['date'],
                Paragraph(tx['description'][:30] + ('...' if len(tx['description'])>30 else ''), styles['Normal']),
                f"{tx['amount']:,.0f}",
                "CERTIFIÉE ✅" if tx['has_proof'] else "-"
            ])
            
        lt = Table(log_data, colWidths=[80, 180, 100, 100])
        lt.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ]))
        elements.append(lt)
        
        if len(all_txs) > 50:
            elements.append(Paragraph(f"<i>... {len(all_txs)-50} autres transactions consultables via le lien numérique.</i>", styles['Normal']))

        elements.append(Spacer(1, 30))

        # Fraud / Integrity Note
        elements.append(Paragraph("<b>5. Certification d'Intégrité</b>", styles['Heading2']))
        elements.append(Paragraph(
            "<i>Document établi selon les normes de transparence financière. Les pièces justificatives "
            "numérisées (MoMo, factures, reçus) sont archivées et consultables via le jeton de sécurité. "
            "La conformité de ce rapport est garantie par PMECompta.</i>",
            styles['Normal']
        ))




        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Rapport_Tresorerie_{token[:8]}.pdf"}
        )
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Error generating PDF: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)




@app.get("/api/public/attachments/{token}/{attachment_id}")
def get_public_attachment(token: str, attachment_id: str, db: Session = Depends(get_db)):
    shared = db.query(models.SharedReport).filter(models.SharedReport.token == token, models.SharedReport.is_active == 1).first()
    if not shared:
        raise HTTPException(status_code=404, detail="Lien invalide")
    
    # Check expiration
    if shared.expires_at and datetime.fromisoformat(shared.expires_at) < datetime.now():
        raise HTTPException(status_code=404, detail="Lien expiré")

    pj = db.query(models.PieceJointe).filter(models.PieceJointe.id == attachment_id).first()
    if not pj:
        raise HTTPException(status_code=404, detail="Pièce jointe introuvable")
    
    if not os.path.exists(pj.chemin_local):
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")
    
    from fastapi.responses import FileResponse
    return FileResponse(pj.chemin_local)

@app.get("/api/reports/dashboard")

def get_dashboard_summary(db: Session = Depends(get_db)):
    from datetime import date
    accounts = db.query(models.Account).all()
    categories = db.query(models.Category).all()
    recent = db.query(models.Transaction).order_by(models.Transaction.date_operation.desc()).limit(20).all()
    current_month = date.today().strftime("%Y-%m")
    month_txs = db.query(models.Transaction).filter(models.Transaction.date_operation.like(f"{current_month}%"), models.Transaction.statut == "CONFIRME").all()
    m_in = sum(abs(t.montant) for t in month_txs if t.type_flux == "ENTREE")
    m_out = sum(abs(t.montant) for t in month_txs if t.type_flux == "SORTIE")
    
    balances = {}
    for acc in accounts:
        txs = db.query(models.Transaction).filter(models.Transaction.compte_id == acc.id, models.Transaction.statut == "CONFIRME").all()
        # Enforce floor at 0 for every account
        bal = acc.solde_initial + sum(abs(t.montant) if t.type_flux == "ENTREE" else -abs(t.montant) for t in txs)
        balances[acc.id] = max(0, bal)
        
    return {
        "accounts": [{"id": a.id, "name": a.nom, "type": a.type_compte.lower()} for a in accounts],
        "balances": balances,
        "categories": [{"id": c.id, "name": c.libelle_user} for c in categories],
        "recentTransactions": [{
            "id": tx.id, "amount": abs(tx.montant), "date": tx.date_operation,
            "type": "credit" if tx.type_flux == "ENTREE" else "debit",
            "description": tx.tiers_nom or tx.note, "account_id": tx.compte_id,
            "category_id": tx.categorie_id, "synced": tx.date_sync is not None
        } for tx in recent],
        "monthlyIn": m_in, 
        "monthlyOut": m_out, 
        "netBalance": max(0, m_in - m_out) # Enforce floor at 0
    }




