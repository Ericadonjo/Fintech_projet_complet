-- ============================================================
-- SCHÉMA PostgreSQL — Comptabilité simplifiée PME africaine
-- SUJET 10 HACKATHON — TWIST 01
-- Compatible PostgreSQL 14+
-- ============================================================

-- ------------------------------------------------------------
-- TABLE : devises
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devises (
    code        VARCHAR(3)  PRIMARY KEY,
    nom         TEXT        NOT NULL,
    symbole     TEXT        NOT NULL,
    actif       BOOLEAN     NOT NULL DEFAULT TRUE
);

INSERT INTO devises (code, nom, symbole) VALUES
    ('XAF', 'Franc CFA', 'FCFA'),
    ('USD', 'Dollar US',  '$'),
    ('EUR', 'Euro',       '€')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- TABLE : taux_change
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taux_change (
    id              SERIAL PRIMARY KEY,
    devise_source   VARCHAR(3)  NOT NULL REFERENCES devises(code),
    devise_cible    VARCHAR(3)  NOT NULL DEFAULT 'XAF',
    taux            NUMERIC(18,6) NOT NULL,
    date_taux       DATE        NOT NULL,
    source_taux     TEXT        DEFAULT 'MANUEL'
        CHECK(source_taux IN ('MANUEL', 'API', 'BANQUE'))
);

CREATE INDEX IF NOT EXISTS idx_taux_change_date
    ON taux_change(devise_source, date_taux DESC);

-- ------------------------------------------------------------
-- TABLE : categories
-- RÉSOLUTION TWIST 01 : mapping langage utilisateur → comptable
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id              SERIAL PRIMARY KEY,
    code            TEXT        NOT NULL UNIQUE,
    libelle_user    TEXT        NOT NULL,
    libelle_bilan   TEXT        NOT NULL,
    type_flux       TEXT        NOT NULL
        CHECK(type_flux IN ('ENTREE', 'SORTIE', 'LES_DEUX')),
    groupe_bilan    TEXT        NOT NULL
        CHECK(groupe_bilan IN (
            'CHIFFRE_AFFAIRES',
            'ACHATS_CHARGES_EXPLOITATION',
            'CHARGES_PERSONNEL',
            'CHARGES_EXTERNES',
            'FLUX_FINANCEMENT',
            'FLUX_CAPITAL',
            'PRODUITS_DIVERS',
            'CHARGES_DIVERSES'
        )),
    icone           TEXT,
    actif           BOOLEAN     NOT NULL DEFAULT TRUE
);

INSERT INTO categories (code, libelle_user, libelle_bilan, type_flux, groupe_bilan, icone) VALUES
    ('VENTE_CLIENT',        'Vente / Recette client',          'Chiffre d''affaires',          'ENTREE',   'CHIFFRE_AFFAIRES',            '💰'),
    ('ACHAT_MARCHANDISE',   'Achat marchandise / Stock',       'Achats de biens',              'SORTIE',   'ACHATS_CHARGES_EXPLOITATION', '🛒'),
    ('CHARGE_PERSONNEL',    'Salaire versé',                   'Charges de personnel',         'SORTIE',   'CHARGES_PERSONNEL',           '👤'),
    ('CHARGE_LOYER',        'Loyer / Local',                   'Charges externes — loyer',     'SORTIE',   'CHARGES_EXTERNES',            '🏠'),
    ('CHARGE_TRANSPORT',    'Transport / Livraison',           'Charges externes — transport', 'SORTIE',   'CHARGES_EXTERNES',            '🚚'),
    ('REMBOURSEMENT_DETTE', 'Remboursement emprunt',           'Flux de financement — sortie', 'SORTIE',   'FLUX_FINANCEMENT',            '🏦'),
    ('EMPRUNT_RECU',        'Prêt / Crédit reçu',              'Flux de financement — entrée', 'ENTREE',   'FLUX_FINANCEMENT',            '📥'),
    ('APPORT_DIRIGEANT',    'Dépôt personnel du dirigeant',   'Apport en capital',            'ENTREE',   'FLUX_CAPITAL',                '🔼'),
    ('RETRAIT_DIRIGEANT',   'Retrait personnel du dirigeant', 'Retrait de capital',           'SORTIE',   'FLUX_CAPITAL',                '🔽'),
    ('AUTRE_ENTREE',        'Autre entrée',                    'Produits divers',              'ENTREE',   'PRODUITS_DIVERS',             '➕'),
    ('AUTRE_SORTIE',        'Autre sortie',                    'Charges diverses',             'SORTIE',   'CHARGES_DIVERSES',            '➖')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- TABLE : comptes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comptes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nom             TEXT        NOT NULL,
    type_compte     TEXT        NOT NULL
        CHECK(type_compte IN ('CAISSE', 'BANQUE', 'MOBILE_MONEY', 'AUTRE')),
    operateur       TEXT,
    devise          VARCHAR(3)  NOT NULL DEFAULT 'XAF' REFERENCES devises(code),
    solde_initial   NUMERIC(18,2) NOT NULL DEFAULT 0,
    date_ouverture  DATE        NOT NULL,
    actif           BOOLEAN     NOT NULL DEFAULT TRUE,
    note            TEXT
);

-- ------------------------------------------------------------
-- TABLE : transactions
-- Registre append-only — ne jamais UPDATE ni DELETE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type_flux           TEXT        NOT NULL
        CHECK(type_flux IN ('ENTREE', 'SORTIE')),

    montant             NUMERIC(18,2) NOT NULL CHECK(montant > 0),
    devise              VARCHAR(3)  NOT NULL REFERENCES devises(code),
    montant_xaf         NUMERIC(18,2) NOT NULL,
    taux_applique       NUMERIC(18,6) NOT NULL DEFAULT 1,

    categorie_id        INTEGER     NOT NULL REFERENCES categories(id),
    compte_id           UUID        NOT NULL REFERENCES comptes(id),

    tiers_nom           TEXT,
    reference_externe   TEXT,

    date_operation      DATE        NOT NULL,
    date_saisie         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_sync           TIMESTAMPTZ,

    statut              TEXT        NOT NULL DEFAULT 'CONFIRME'
        CHECK(statut IN ('CONFIRME', 'EN_ATTENTE', 'LITIGE', 'ANNULE')),
    source_saisie       TEXT        NOT NULL DEFAULT 'MANUEL'
        CHECK(source_saisie IN ('MANUEL', 'MOBILE_MONEY_WEBHOOK', 'IMPORT_CSV', 'CORRECTION')),

    correction_de       UUID        REFERENCES transactions(id),
    note                TEXT,
    hash                TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date_op    ON transactions(date_operation);
CREATE INDEX IF NOT EXISTS idx_tx_compte     ON transactions(compte_id, date_operation);
CREATE INDEX IF NOT EXISTS idx_tx_categorie  ON transactions(categorie_id);
CREATE INDEX IF NOT EXISTS idx_tx_statut     ON transactions(statut);
CREATE INDEX IF NOT EXISTS idx_tx_sync       ON transactions(date_sync) WHERE date_sync IS NULL;

-- ------------------------------------------------------------
-- TABLE : pieces_jointes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pieces_jointes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID        NOT NULL REFERENCES transactions(id),
    type_fichier    TEXT        NOT NULL
        CHECK(type_fichier IN ('IMAGE', 'PDF', 'SMS_SCREENSHOT')),
    chemin_local    TEXT        NOT NULL,
    chemin_cloud    TEXT,
    date_ajout      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    taille_octets   INTEGER,
    ocr_extrait     JSONB,
    ocr_statut      TEXT
        CHECK(ocr_statut IN ('EN_ATTENTE', 'TRAITE', 'ECHEC'))
);

CREATE INDEX IF NOT EXISTS idx_pj_transaction ON pieces_jointes(transaction_id);

-- ------------------------------------------------------------
-- TABLE : sync_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
    id                  SERIAL      PRIMARY KEY,
    transaction_id      UUID        NOT NULL REFERENCES transactions(id),
    evenement           TEXT        NOT NULL
        CHECK(evenement IN (
            'CREE_OFFLINE',
            'SYNC_ENVOI',
            'SYNC_CONFIRME',
            'CONFLIT_DETECTE',
            'CONFLIT_RESOLU',
            'DOUBLON_REJETE'
        )),
    timestamp_local     TIMESTAMPTZ NOT NULL,
    timestamp_serveur   TIMESTAMPTZ,
    detail              JSONB
);

-- ------------------------------------------------------------
-- TABLE : exports_bilan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exports_bilan (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date_generation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    periode_debut   DATE        NOT NULL,
    periode_fin     DATE        NOT NULL,
    format          TEXT        NOT NULL
        CHECK(format IN ('PDF', 'XLSX', 'CSV')),
    total_entrees   NUMERIC(18,2) NOT NULL,
    total_sorties   NUMERIC(18,2) NOT NULL,
    solde_net       NUMERIC(18,2) NOT NULL,
    devise_bilan    VARCHAR(3)  NOT NULL DEFAULT 'XAF',
    nb_transactions INTEGER     NOT NULL,
    hash_contenu    TEXT        NOT NULL,
    chemin_fichier  TEXT
);

-- ------------------------------------------------------------
-- VUE : trésorerie mensuelle
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_tresorerie_mensuelle AS
SELECT
    TO_CHAR(t.date_operation, 'YYYY-MM')    AS mois,
    c.code                                  AS categorie_code,
    c.groupe_bilan,
    c.libelle_bilan,
    t.type_flux,
    COUNT(*)                                AS nb_operations,
    SUM(t.montant_xaf)                      AS total_xaf
FROM transactions t
JOIN categories c ON t.categorie_id = c.id
WHERE t.statut = 'CONFIRME'
GROUP BY mois, c.id, c.code, c.groupe_bilan, c.libelle_bilan, t.type_flux
ORDER BY mois DESC, c.groupe_bilan;

-- ------------------------------------------------------------
-- VUE : solde courant par compte
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_solde_comptes AS
SELECT
    cp.id,
    cp.nom,
    cp.type_compte,
    cp.operateur,
    cp.devise,
    cp.solde_initial,
    cp.solde_initial
        + COALESCE(SUM(CASE WHEN t.type_flux = 'ENTREE' AND t.statut = 'CONFIRME' THEN t.montant ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN t.type_flux = 'SORTIE' AND t.statut = 'CONFIRME' THEN t.montant ELSE 0 END), 0)
    AS solde_actuel
FROM comptes cp
LEFT JOIN transactions t ON t.compte_id = cp.id
WHERE cp.actif = TRUE
GROUP BY cp.id, cp.nom, cp.type_compte, cp.operateur, cp.devise, cp.solde_initial;
