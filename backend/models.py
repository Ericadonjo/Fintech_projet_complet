from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Devise(Base):
    __tablename__ = "devises"
    code = Column(String, primary_key=True, index=True)
    nom = Column(String, nullable=False)
    symbole = Column(String, nullable=False)
    actif = Column(Integer, default=1, nullable=False)

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    libelle_user = Column(String, nullable=False)
    libelle_bilan = Column(String, nullable=False)
    type_flux = Column(String, nullable=False)
    groupe_bilan = Column(String, nullable=False)
    icone = Column(String)
    actif = Column(Integer, default=1, nullable=False)

class Account(Base):
    __tablename__ = "comptes"
    id = Column(String, primary_key=True, index=True)
    nom = Column(String, nullable=False)
    type_compte = Column(String, nullable=False)
    operateur = Column(String)
    devise = Column(String, ForeignKey("devises.code"), default="XAF", nullable=False)
    solde_initial = Column(Float, default=0.0, nullable=False)
    date_ouverture = Column(String, nullable=False)
    actif = Column(Integer, default=1, nullable=False)
    note = Column(String)

class PieceJointe(Base):
    __tablename__ = "pieces_jointes"
    id = Column(String, primary_key=True, index=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False)
    type_fichier = Column(String, nullable=False)
    chemin_local = Column(String, nullable=False)
    chemin_cloud = Column(String)
    date_ajout = Column(String, nullable=False)
    taille_octets = Column(Integer)
    ocr_extrait = Column(String)
    ocr_statut = Column(String)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(String, primary_key=True, index=True)
    type_flux = Column(String, nullable=False)
    montant = Column(Float, nullable=False)
    devise = Column(String, ForeignKey("devises.code"), nullable=False)
    montant_xaf = Column(Float, nullable=False)
    taux_applique = Column(Float, default=1.0, nullable=False)
    categorie_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    compte_id = Column(String, ForeignKey("comptes.id"), nullable=False)
    tiers_nom = Column(String)
    reference_externe = Column(String)
    date_operation = Column(String, nullable=False, index=True)
    date_saisie = Column(String, nullable=False)
    date_sync = Column(String)
    statut = Column(String, default="CONFIRME", nullable=False)
    source_saisie = Column(String, default="MANUEL", nullable=False)
    correction_de = Column(String, ForeignKey("transactions.id"))
    parent_id = Column(String, ForeignKey("transactions.id"))
    note = Column(String)
    hash = Column(String, nullable=False)

class Rapprochement(Base):
    __tablename__ = "rapprochements"
    id = Column(String, primary_key=True, index=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False)
    reference_interne = Column(String, nullable=False)
    montant = Column(Float, nullable=False)
    date_creation = Column(String, nullable=False)
