-- ============================================================
-- SCHÉMA SQLite v2 — Comptabilité simplifiée PME africaine
-- SUJET 10 HACKATHON — TWIST 01 (version finale)
-- ============================================================
-- DÉCISIONS D'ARCHITECTURE (documentées, ne pas modifier sans révision globale)
--
-- [D1] TEMPORALITÉ : La date qui fait foi pour les bilans est `date_operation`
--      (choisie par l'utilisateur), pas `date_sync` ni `date_saisie`.
--      Un événement arrivé hors-ordre est intégré sur sa date_operation.
--
-- [D2] IMMUTABILITÉ : Les transactions ne sont jamais modifiées ni supprimées.
--      Toute correction se fait par une transaction inverse liée via `correction_de`.
--
-- [D3] OCR : Le champ `ocr_extrait` est prévu dans pieces_jointes mais non activé.
--      L'OCR sera activé uniquement après validation de fiabilité sur les
--      formats de reçus MoMo locaux (MTN / Orange Cameroun).
--
-- [D4] MAPPING CATÉGORIES : Le libellé utilisateur n'est jamais stocké dans
--      transactions. Seul categorie_id est stocké — jointure pour affichage.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- TABLE : devises
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devises (
    code        TEXT PRIMARY KEY,       -- 'XAF' | 'USD' | 'EUR'
    nom         TEXT NOT NULL,
    symbole     TEXT NOT NULL,
    actif       INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO devises (code, nom, symbole) VALUES
    ('XAF', 'Franc CFA', 'FCFA'),
    ('USD', 'Dollar US',  '$'),
    ('EUR', 'Euro',       '€');

-- ------------------------------------------------------------
-- TABLE : taux_change
-- Taux stocké au moment de la saisie — jamais recalculé a posteriori
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taux_change (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    devise_source   TEXT NOT NULL REFERENCES devises(code),
    devise_cible    TEXT NOT NULL DEFAULT 'XAF',
    taux            REAL NOT NULL,
    date_taux       TEXT NOT NULL,          -- ISO 8601 : '2026-04-25'
    source_taux     TEXT DEFAULT 'MANUEL'   -- 'MANUEL' | 'API' | 'BANQUE'
);

CREATE INDEX IF NOT EXISTS idx_taux_change_date
    ON taux_change(devise_source, date_taux DESC);

-- ------------------------------------------------------------
-- TABLE : categories
-- RÉSOLUTION TWIST 01 : mapping langage utilisateur → catégorie comptable
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    libelle_user    TEXT NOT NULL,              -- ce que l'utilisateur voit
    libelle_bilan   TEXT NOT NULL,              -- ce que le banquier lit
    type_flux       TEXT NOT NULL
        CHECK(type_flux IN ('ENTREE', 'SORTIE', 'LES_DEUX')),
    groupe_bilan    TEXT NOT NULL
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
    actif           INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO categories
    (code, libelle_user, libelle_bilan, type_flux, groupe_bilan, icone)
VALUES
    ('VENTE_CLIENT',       'Vente / Recette client',          'Chiffre d''affaires',          'ENTREE',   'CHIFFRE_AFFAIRES',            '💰'),
    ('ACHAT_MARCHANDISE',  'Achat marchandise / Stock',       'Achats de biens',              'SORTIE',   'ACHATS_CHARGES_EXPLOITATION', '🛒'),
    ('CHARGE_PERSONNEL',   'Salaire versé',                   'Charges de personnel',         'SORTIE',   'CHARGES_PERSONNEL',           '👤'),
    ('CHARGE_LOYER',       'Loyer / Local',                   'Charges externes — loyer',     'SORTIE',   'CHARGES_EXTERNES',            '🏠'),
    ('CHARGE_TRANSPORT',   'Transport / Livraison',           'Charges externes — transport', 'SORTIE',   'CHARGES_EXTERNES',            '🚚'),
    ('REMBOURSEMENT_DETTE','Remboursement emprunt',           'Flux de financement — sortie', 'SORTIE',   'FLUX_FINANCEMENT',            '🏦'),
    ('EMPRUNT_RECU',       'Prêt / Crédit reçu',              'Flux de financement — entrée', 'ENTREE',   'FLUX_FINANCEMENT',            '📥'),
    ('APPORT_DIRIGEANT',   'Dépôt personnel du dirigeant',   'Apport en capital',            'ENTREE',   'FLUX_CAPITAL',                '🔼'),
    ('RETRAIT_DIRIGEANT',  'Retrait personnel du dirigeant', 'Retrait de capital',           'SORTIE',   'FLUX_CAPITAL',                '🔽'),
    ('AUTRE_ENTREE',       'Autre entrée',                    'Produits divers',              'ENTREE',   'PRODUITS_DIVERS',             '➕'),
    ('AUTRE_SORTIE',       'Autre sortie',                    'Charges diverses',             'SORTIE',   'CHARGES_DIVERSES',            '➖');

-- ------------------------------------------------------------
-- TABLE : comptes
-- Caisse physique, compte bancaire, Mobile Money MTN, Orange...
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comptes (
    id              TEXT PRIMARY KEY,       -- UUID v4
    nom             TEXT NOT NULL,
    type_compte     TEXT NOT NULL
        CHECK(type_compte IN ('CAISSE', 'BANQUE', 'MOBILE_MONEY', 'AUTRE')),
    operateur       TEXT,                   -- 'MTN' | 'ORANGE' | 'EXPRESS_UNION' | NULL
    devise          TEXT NOT NULL DEFAULT 'XAF' REFERENCES devises(code),
    solde_initial   REAL NOT NULL DEFAULT 0,
    date_ouverture  TEXT NOT NULL,
    actif           INTEGER NOT NULL DEFAULT 1,
    note            TEXT
);

-- ------------------------------------------------------------
-- TABLE : transactions
-- Registre append-only — cœur du système
-- Voir décisions [D1] et [D2] en tête de fichier
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,       -- UUID v4 — idempotency key

    type_flux           TEXT NOT NULL
        CHECK(type_flux IN ('ENTREE', 'SORTIE')),

    -- Montant
    montant             REAL NOT NULL CHECK(montant > 0),
    devise              TEXT NOT NULL REFERENCES devises(code),
    montant_xaf         REAL NOT NULL,          -- converti à la saisie, jamais recalculé
    taux_applique       REAL NOT NULL DEFAULT 1,

    -- Catégorie — voir [D4]
    categorie_id        INTEGER NOT NULL REFERENCES categories(id),

    -- Compte
    compte_id           TEXT NOT NULL REFERENCES comptes(id),

    -- Tiers et référence externe
    tiers_nom           TEXT,                   -- nom client / fournisseur
    reference_externe   TEXT,                   -- n° transaction MoMo, n° facture

    -- Temporalité — voir [D1]
    date_operation      TEXT NOT NULL,          -- ← fait foi pour le bilan
    date_saisie         TEXT NOT NULL,          -- timestamp système
    date_sync           TEXT,                   -- null si pas encore synchronisé

    -- Statut (l'ambiguïté est représentée, pas cachée)
    statut              TEXT NOT NULL DEFAULT 'CONFIRME'
        CHECK(statut IN ('CONFIRME', 'EN_ATTENTE', 'LITIGE', 'ANNULE')),

    source_saisie       TEXT NOT NULL DEFAULT 'MANUEL'
        CHECK(source_saisie IN ('MANUEL', 'MOBILE_MONEY_WEBHOOK', 'IMPORT_CSV', 'CORRECTION')),

    -- Correction — voir [D2]
    correction_de       TEXT REFERENCES transactions(id),

    note                TEXT,

    -- Intégrité
    hash                TEXT NOT NULL   -- SHA-256(id|montant|date_operation|compte_id|categorie_id)
);

CREATE INDEX IF NOT EXISTS idx_tx_date_op    ON transactions(date_operation);
CREATE INDEX IF NOT EXISTS idx_tx_compte     ON transactions(compte_id, date_operation);
CREATE INDEX IF NOT EXISTS idx_tx_categorie  ON transactions(categorie_id);
CREATE INDEX IF NOT EXISTS idx_tx_statut     ON transactions(statut);
CREATE INDEX IF NOT EXISTS idx_tx_sync       ON transactions(date_sync) WHERE date_sync IS NULL;

-- ------------------------------------------------------------
-- TABLE : pieces_jointes
-- Justificatifs attachés à une transaction (reçu MoMo, facture...)
-- Voir décision [D3] pour l'OCR
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pieces_jointes (
    id              TEXT PRIMARY KEY,           -- UUID v4
    transaction_id  TEXT NOT NULL REFERENCES transactions(id),

    type_fichier    TEXT NOT NULL
        CHECK(type_fichier IN ('IMAGE', 'PDF', 'SMS_SCREENSHOT')),

    chemin_local    TEXT NOT NULL,              -- path sur l'appareil mobile
    chemin_cloud    TEXT,                       -- URL après sync (null jusqu'à upload)

    date_ajout      TEXT NOT NULL,
    taille_octets   INTEGER,

    -- OCR — prévu, non activé (voir [D3])
    -- Null par défaut. Rempli uniquement si l'utilisateur déclenche l'OCR manuellement.
    ocr_extrait     TEXT,                       -- JSON : { montant, reference, date, operateur }
    ocr_statut      TEXT DEFAULT NULL
        CHECK(ocr_statut IN (NULL, 'EN_ATTENTE', 'TRAITE', 'ECHEC'))
);

CREATE INDEX IF NOT EXISTS idx_pj_transaction
    ON pieces_jointes(transaction_id);

-- ------------------------------------------------------------
-- TABLE : sync_log
-- Traçabilité complète des synchronisations offline → serveur
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id      TEXT NOT NULL REFERENCES transactions(id),
    evenement           TEXT NOT NULL
        CHECK(evenement IN (
            'CREE_OFFLINE',
            'SYNC_ENVOI',
            'SYNC_CONFIRME',
            'CONFLIT_DETECTE',
            'CONFLIT_RESOLU',
            'DOUBLON_REJETE'
        )),
    timestamp_local     TEXT NOT NULL,
    timestamp_serveur   TEXT,
    detail              TEXT    -- JSON libre pour contexte du conflit
);

-- ------------------------------------------------------------
-- TABLE : exports_bilan
-- Historique des bilans générés — chaque export est signé
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exports_bilan (
    id              TEXT PRIMARY KEY,
    date_generation TEXT NOT NULL,
    periode_debut   TEXT NOT NULL,
    periode_fin     TEXT NOT NULL,
    format          TEXT NOT NULL
        CHECK(format IN ('PDF', 'XLSX', 'CSV')),
    total_entrees   REAL NOT NULL,
    total_sorties   REAL NOT NULL,
    solde_net       REAL NOT NULL,
    devise_bilan    TEXT NOT NULL DEFAULT 'XAF',
    nb_transactions INTEGER NOT NULL,
    hash_contenu    TEXT NOT NULL,  -- SHA-256 du contenu — infalsifiable après export
    chemin_fichier  TEXT
);

-- ============================================================
-- VUE : trésorerie mensuelle par catégorie
-- ============================================================
CREATE VIEW IF NOT EXISTS v_tresorerie_mensuelle AS
SELECT
    strftime('%Y-%m', t.date_operation)     AS mois,
    c.code                                  AS categorie_code,
    c.groupe_bilan,
    c.libelle_bilan,
    t.type_flux,
    COUNT(*)                                AS nb_operations,
    SUM(t.montant_xaf)                      AS total_xaf
FROM transactions t
JOIN categories c ON t.categorie_id = c.id
WHERE t.statut = 'CONFIRME'
GROUP BY mois, c.id, t.type_flux
ORDER BY mois DESC, c.groupe_bilan;

-- ============================================================
-- VUE : solde courant par compte
-- ============================================================
CREATE VIEW IF NOT EXISTS v_solde_comptes AS
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
WHERE cp.actif = 1
GROUP BY cp.id;
