# PRD — Application LMNP Réel Simplifié (Open Source)

> **Version :** 1.0
> **Date :** 2026-02-18
> **Statut :** En cours de développement
> **Instruction permanente :** Claude Code doit continuer à itérer sur ce PRD jusqu'à ce que TOUTES les étapes soient implémentées, testées et validées. La progression est enregistrée dans `PROGRESS.md` à la racine du projet pour permettre la reprise en cas d'interruption de session.

---

## 1. Contexte et objectif

### 1.1 Problème
Les loueurs meublés non professionnels (LMNP) sous régime réel simplifié doivent produire une liasse fiscale complexe (formulaires CERFA 2031 + 2033-A à G) chaque année. Les outils commerciaux existants (decla.fr, lmnp.ai) coûtent entre 100 € et 300 €/an. Il n'existe pas d'alternative open-source complète, gratuite et maintenue.

### 1.2 Objectif
Construire une application web open-source, entièrement dockerisée, permettant à un particulier LMNP de :
- Saisir ses données fiscales de manière guidée
- Obtenir une liasse fiscale conforme au format 2026
- Exporter les CERFA en PDF et/ou XML pour dépôt sur impots.gouv.fr
- Archiver ses données localement de façon chiffrée

### 1.3 Public cible
Particuliers français propriétaires de biens meublés loués, déclarant au régime LMNP réel simplifié, sans connaissances comptables avancées.

---

## 2. Stack technique

| Couche | Technologie | Justification |
|--------|------------|---------------|
| Backend | Python 3.12 + FastAPI | Ecosystème fiscal Python riche, typage strict, async |
| Frontend | React 18 + TypeScript + Vite | Composants réutilisables, typage fort |
| UI | TailwindCSS + shadcn/ui | Design system cohérent et accessible |
| Base de données | SQLite (via SQLAlchemy) | Zéro serveur, portable, chiffrement via SQLCipher |
| PDF | WeasyPrint ou ReportLab | Génération CERFA fidèle au format officiel |
| XML | lxml | Export EDI/XML impots.gouv |
| Constantes fiscales | YAML versionné | Mise à jour sans recompilation |
| Conteneurisation | Docker + Docker Compose | Zéro dépendance locale |
| Tests | pytest (backend) + Vitest + Playwright (frontend) | Couverture complète |
| CI | GitHub Actions | Validation automatique |

---

## 3. Architecture du projet

```
lmnp/
├── docker-compose.yml
├── Makefile
├── PROGRESS.md                    # Suivi de progression (voir §10)
├── fiscal_constants/
│   ├── 2025.yaml
│   └── 2026.yaml                  # Barèmes, seuils, plafonds
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── properties.py
│   │   │   ├── revenues.py
│   │   │   ├── expenses.py
│   │   │   ├── depreciation.py
│   │   │   ├── fiscal.py
│   │   │   └── assistant.py
│   │   ├── core/
│   │   │   ├── accounting.py      # Moteur comptable
│   │   │   ├── depreciation.py    # Calcul amortissements
│   │   │   ├── deficit.py         # Report déficits
│   │   │   ├── cerfa_2031.py
│   │   │   ├── cerfa_2033.py
│   │   │   └── comparator.py      # Micro-BIC vs réel
│   │   ├── models/
│   │   │   ├── property.py
│   │   │   ├── revenue.py
│   │   │   ├── expense.py
│   │   │   ├── depreciation.py
│   │   │   └── fiscal_year.py
│   │   ├── db/
│   │   │   ├── database.py
│   │   │   └── migrations/
│   │   └── utils/
│   │       ├── pdf_generator.py
│   │       ├── xml_generator.py
│   │       └── fiscal_loader.py
│   └── tests/
│       ├── test_accounting.py
│       ├── test_depreciation.py
│       ├── test_cerfa.py
│       ├── test_comparator.py
│       └── fixtures/
│           └── sample_dataset.json
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Onboarding.tsx
│   │   │   ├── Properties.tsx
│   │   │   ├── Revenues.tsx
│   │   │   ├── Expenses.tsx
│   │   │   ├── Depreciation.tsx
│   │   │   ├── FiscalSummary.tsx
│   │   │   ├── Export.tsx
│   │   │   └── Assistant.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/                 # Zustand ou Redux Toolkit
│   │   └── lib/
│   │       └── api.ts
│   └── tests/
│       ├── unit/
│       └── e2e/
└── nginx/
    └── nginx.conf
```

---

## 4. Schéma de base de données

```sql
-- Bien immobilier
CREATE TABLE properties (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    acquisition_date DATE NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    land_value DECIMAL(12,2) NOT NULL,          -- non amortissable
    furniture_value DECIMAL(12,2) NOT NULL,
    building_value DECIMAL(12,2) NOT NULL,
    siret TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Revenus locatifs
CREATE TABLE revenues (
    id INTEGER PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    fiscal_year INTEGER NOT NULL,
    month INTEGER NOT NULL,                      -- 1-12
    amount DECIMAL(10,2) NOT NULL,
    type TEXT NOT NULL,                          -- 'loyer', 'charges_recuperables'
    notes TEXT
);

-- Charges déductibles
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    fiscal_year INTEGER NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL,                      -- enum (voir §5.2)
    description TEXT,
    deductible_pct DECIMAL(5,2) DEFAULT 100.0,
    receipt_path TEXT                            -- chemin fichier justificatif
);

-- Plan d'amortissement
CREATE TABLE depreciations (
    id INTEGER PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    component TEXT NOT NULL,                     -- 'structure', 'toiture', 'mobilier', etc.
    value DECIMAL(12,2) NOT NULL,
    duration_years INTEGER NOT NULL,
    start_date DATE NOT NULL,
    method TEXT DEFAULT 'linear',                -- 'linear' | 'degressive'
    fiscal_year INTEGER NOT NULL,
    annual_amount DECIMAL(10,2) NOT NULL,        -- calculé
    deductible_amount DECIMAL(10,2) NOT NULL,    -- peut être plafonné
    carried_over DECIMAL(10,2) DEFAULT 0         -- amortissement non déductible reporté
);

-- Report de déficits
CREATE TABLE deficit_carryovers (
    id INTEGER PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    origin_year INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    remaining DECIMAL(10,2) NOT NULL,
    exhausted_year INTEGER
);

-- Exercice fiscal (snapshot annuel)
CREATE TABLE fiscal_years (
    id INTEGER PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    year INTEGER NOT NULL,
    total_revenue DECIMAL(12,2),
    total_expenses DECIMAL(12,2),
    total_depreciation_deductible DECIMAL(12,2),
    fiscal_result DECIMAL(12,2),                 -- bénéfice ou déficit
    cerfa_2031_data JSON,
    cerfa_2033_data JSON,
    locked BOOLEAN DEFAULT FALSE,                -- exercice clôturé
    UNIQUE(property_id, year)
);
```

---

## 5. Fonctionnalités détaillées

### Phase 1 — Fondations (MVP)

#### 5.1 Saisie guidée des biens

**Description :** Formulaire pas-à-pas permettant de créer un bien immobilier avec sa décomposition patrimoniale.

**Champs obligatoires :**
- Nom du bien (ex. "Studio Paris 11e")
- Adresse complète
- Date d'acquisition
- Prix total d'acquisition
- Ventilation : valeur terrain / bâtiment / mobilier / frais d'acquisition
- SIRET (si applicable)

**Règles métier :**
- Le terrain ne peut jamais être amorti (CGI art. 39 C)
- La somme terrain + bâtiment + mobilier doit être ≤ prix total
- Alerte si ratio terrain < 15 % (risque de contrôle fiscal)

**Tests de validation Phase 1.1 :**
- [ ] Création d'un bien avec toutes les données
- [ ] Rejet si terrain + bâtiment + mobilier > prix total
- [ ] Rejet si date d'acquisition > date du jour
- [ ] Modification et suppression d'un bien
- [ ] Persistance après redémarrage du conteneur

#### 5.2 Saisie des revenus

**Description :** Saisie mensuelle ou trimestrielle des loyers par bien.

**Catégories :**
- Loyers nus
- Charges récupérables
- Indemnités d'assurance

**Règles métier :**
- Loyers saisis charges comprises ou hors charges (avec déduction automatique)
- Ventilation possible au mois ou au trimestre

**Tests de validation Phase 1.2 :**
- [ ] Saisie 12 mois d'un bien, total cohérent
- [ ] Saisie trimestrielle convertie en mensuel
- [ ] Modification d'un mois existant
- [ ] Affichage du total annuel par bien

#### 5.3 Saisie des charges

**Catégories de charges déductibles :**
- Intérêts d'emprunt (compte 661)
- Frais de gestion locative (compte 622)
- Primes d'assurance (compte 616)
- Taxe foncière (compte 635)
- Charges de copropriété non récupérables (compte 614)
- Travaux d'entretien et réparation (compte 615)
- Frais de comptabilité (compte 622)
- CFE (compte 635)
- Frais divers de gestion (compte 627)

**Tests de validation Phase 1.3 :**
- [ ] Saisie d'une charge avec justificatif
- [ ] Rejet d'une charge à 0 €
- [ ] Calcul du total par catégorie
- [ ] Taux de déductibilité partielle (ex. 80 %)

---

### Phase 2 — Moteur comptable

#### 5.4 Calcul des amortissements

**Description :** Génération automatique du plan d'amortissement selon les règles LMNP.

**Composants amortissables et durées usuelles :**
| Composant | Durée (ans) | Méthode |
|-----------|------------|---------|
| Structure/gros œuvre | 50-80 | Linéaire |
| Toiture | 20-30 | Linéaire |
| Façades | 20-30 | Linéaire |
| Équipements | 10-15 | Linéaire |
| Mobilier | 5-10 | Linéaire |
| Frais d'acquisition | 5-10 | Linéaire |

**Règles métier :**
- Prorata temporis la première année (au jour près)
- Amortissement plafonné au résultat avant amortissement (ne peut pas créer de déficit)
- Excédent reporté sans limite de durée (CGI art. 39 C)
- Le terrain n'est jamais amorti

**Tests de validation Phase 2.1 :**
- [ ] Calcul linéaire simple (bien acheté au 01/01, 50 ans → 2 % / an)
- [ ] Prorata temporis pour acquisition le 15/07
- [ ] Plafonnement si résultat avant amortissement = 0
- [ ] Report correct de l'excédent sur N+1
- [ ] Vérification que terrain = 0 dans le plan

#### 5.5 Grand livre et journaux

**Description :** Génération des écritures comptables conformes au plan comptable général.

**Journaux requis :**
- Journal des achats (charges)
- Journal des ventes (loyers)
- Journal des opérations diverses (amortissements)

**Tests de validation Phase 2.2 :**
- [ ] Équilibre débit/crédit de chaque écriture
- [ ] Correspondance comptes utilisés vs plan comptable LMNP
- [ ] Export du grand livre en CSV

#### 5.6 Bilan et compte de résultat simplifiés

**Tests de validation Phase 2.3 :**
- [ ] Total actif = total passif
- [ ] Résultat compte de résultat = résultat bilan
- [ ] Amortissements cumulés cohérents avec plan

#### 5.7 Comparatif Micro-BIC vs Réel

**Description :** Calcul automatique de l'impôt théorique dans les deux régimes pour recommander le plus avantageux.

**Règles Micro-BIC 2026 :**
- Abattement forfaitaire 50 % (30 % pour meublés de tourisme non classés)
- Seuil de recettes : 77 700 € (meublés classiques) / 15 000 € (MT non classés)

**Tests de validation Phase 2.4 :**
- [ ] Calcul correct abattement 50 %
- [ ] Affichage comparatif avec économie/surcoût du régime réel
- [ ] Alerte si Micro-BIC plus avantageux cette année

---

### Phase 3 — Liasse fiscale

#### 5.8 Formulaire 2031 (BNC/BIC)

**Description :** Génération automatique du formulaire 2031-SD (déclaration de résultats).

**Cadres couverts :**
- Cadre A : Identification
- Cadre B : Résultats
- Cadre C : Renseignements divers (CGA, option TVA…)

**Tests de validation Phase 3.1 :**
- [ ] Pré-remplissage automatique depuis données saisies
- [ ] Validation croisée avec résultat comptable
- [ ] Génération PDF conforme au CERFA officiel
- [ ] Vérification visuelle page par page avec exemple DGFIP

#### 5.9 Formulaires 2033-A à 2033-G

| Formulaire | Contenu |
|-----------|---------|
| 2033-A | Bilan simplifié |
| 2033-B | Compte de résultat simplifié |
| 2033-C | Immobilisations et amortissements |
| 2033-D | Relevé des provisions, amortissements dérogatoires |
| 2033-E | Détermination de la valeur ajoutée |
| 2033-F | Composition du capital |
| 2033-G | Filiales et participations |

**Tests de validation Phase 3.2 :**
- [ ] 2033-A : total actif = total passif
- [ ] 2033-B : résultat = résultat 2031
- [ ] 2033-C : amortissements cumulés = bilan 2033-A
- [ ] Génération PDF de chaque formulaire
- [ ] Export XML validé contre le schéma XSD impots.gouv

#### 5.10 Export PDF et XML

**Tests de validation Phase 3.3 :**
- [ ] PDF lisible et imprimable (contrôle visuel)
- [ ] XML valide contre le schéma officiel EDI-TDFC
- [ ] Liasse complète exportable en un clic (ZIP)
- [ ] Métadonnées PDF correctes (auteur, date, titre)

---

### Phase 4 — Assistant fiscal et vérifications

#### 5.11 Vérification automatique des erreurs

**Contrôles à implémenter :**
- Bilan déséquilibré (tolérance ±1 €)
- Loyers négatifs
- Charges > 300 % des revenus (alerte)
- Amortissement non calculé pour un bien actif
- SIRET manquant si TVA applicable
- Exercice non complet (mois manquants)

**Tests de validation Phase 4.1 :**
- [ ] Chaque règle déclenchée sur un jeu de données erroné
- [ ] Messages d'erreur clairs avec lien vers le champ concerné
- [ ] Blocage de l'export si erreurs bloquantes présentes

#### 5.12 Suggestions d'optimisation

**Description :** Recommandations non prescriptives pour maximiser les déductions légales.

**Suggestions implémentées :**
- Décomposition en composants pour augmenter les amortissements
- Déductibilité des frais d'acquisition (option 5 ans)
- Rappel de charges oubliées (CFE, assurance…)

**Tests de validation Phase 4.2 :**
- [ ] Suggestion affichée si bien non décomposé en composants
- [ ] Suggestion absente si déjà optimisé
- [ ] Lien vers article CGI dans chaque suggestion

#### 5.13 Aide contextuelle

**Description :** Tooltip et panneau d'aide pour chaque champ, avec référence légale.

**Tests de validation Phase 4.3 :**
- [ ] Tooltip présent sur tous les champs des CERFA
- [ ] Lien vers texte de loi fonctionnel (légifrance.gouv.fr)
- [ ] Mode "novice" avec explications détaillées activable

---

### Phase 5 — Sauvegarde et import/export

#### 5.14 Sauvegarde locale chiffrée

**Description :** Base SQLite chiffrée via SQLCipher, mot de passe utilisateur.

**Tests de validation Phase 5.1 :**
- [ ] Fichier DB illisible sans mot de passe (vérification hex)
- [ ] Déverrouillage correct avec bon mot de passe
- [ ] Rejet avec mauvais mot de passe

#### 5.15 Export/Import des données

**Formats supportés :**
- JSON (toutes données, avec schéma versionné)
- CSV (par table)

**Tests de validation Phase 5.2 :**
- [ ] Export JSON complet puis import dans une instance vide → données identiques
- [ ] Export CSV lisible dans Excel/LibreOffice
- [ ] Versioning du schéma JSON pour migrations futures

#### 5.16 Fiche récapitulative d'archivage

**Description :** PDF de synthèse d'une page résumant la déclaration de l'année.

**Tests de validation Phase 5.3 :**
- [ ] PDF généré avec toutes les données clés
- [ ] PDF lisible après 10 ans (format PDF/A)

---

### Phase 6 — Interface utilisateur

#### 5.17 Design et accessibilité

**Exigences :**
- Responsive (mobile, tablette, desktop)
- WCAG 2.1 niveau AA
- Mode clair/sombre
- Multilingue prêt (i18n, FR uniquement pour le MVP)

**Tests de validation Phase 6.1 :**
- [ ] Score Lighthouse ≥ 90 (Performance, Accessibility, Best Practices)
- [ ] Aucune erreur axe (accessibilité)
- [ ] Rendu correct sur Chrome, Firefox, Safari

#### 5.18 Mode pas-à-pas (wizard)

**Description :** Onboarding guidé en 7 étapes pour l'utilisateur novice.

**Étapes :**
1. Bienvenue + explication du régime réel
2. Création du bien
3. Saisie des revenus
4. Saisie des charges
5. Validation du plan d'amortissement
6. Vérification et erreurs
7. Export de la liasse

**Tests de validation Phase 6.2 :**
- [ ] Navigation avant/arrière sans perte de données
- [ ] Impossibilité de passer une étape avec données invalides
- [ ] Sauvegarde automatique à chaque étape

---

### Phase 7 — Bonus et intégrations (optionnel)

#### 5.19 Assistant IA fiscal (bonus)

**Description :** Chat intégré connecté à un LLM (Claude API) pour répondre aux questions fiscales LMNP.

**Contraintes :**
- Réponses balisées "à titre informatif, non conseil fiscal"
- Pas de stockage des conversations
- Clé API configurable via variable d'environnement

**Tests de validation Phase 7.1 :**
- [ ] Réponse pertinente à "Puis-je déduire les travaux d'amélioration ?"
- [ ] Disclaimer affiché sur chaque réponse
- [ ] Fonctionnement sans clé API (mode désactivé gracieux)

#### 5.20 Intégration API impots.gouv (bonus)

**Description :** Soumission automatique via l'API officielle si disponible publiquement.

**Tests de validation Phase 7.2 :**
- [ ] Documentation de l'API vérifiée et référencée
- [ ] Authentification OAuth2 fonctionnelle
- [ ] Envoi d'une liasse test en sandbox

---

## 6. Constantes fiscales (fiscal_constants/2026.yaml)

```yaml
# fiscal_constants/2026.yaml
version: "2026"
micro_bic:
  standard_threshold: 77700
  tourism_classified_threshold: 188700
  tourism_unclassified_threshold: 15000
  standard_abatement: 0.50
  tourism_classified_abatement: 0.71
  tourism_unclassified_abatement: 0.30

depreciation:
  land_deductible: false
  components:
    structure:
      min_years: 50
      max_years: 80
    roof:
      min_years: 20
      max_years: 30
    facade:
      min_years: 20
      max_years: 30
    equipment:
      min_years: 10
      max_years: 15
    furniture:
      min_years: 5
      max_years: 10
    acquisition_costs:
      min_years: 5
      max_years: 10

cerfa:
  forms:
    - id: "2031"
      name: "Déclaration de résultats BIC"
      version: "2026"
    - id: "2033-A"
      name: "Bilan simplifié"
      version: "2026"
    - id: "2033-B"
      name: "Compte de résultat simplifié"
      version: "2026"
    - id: "2033-C"
      name: "Immobilisations et amortissements"
      version: "2026"
    - id: "2033-D"
      name: "Provisions et amortissements dérogatoires"
      version: "2026"
    - id: "2033-E"
      name: "Détermination de la valeur ajoutée"
      version: "2026"
    - id: "2033-F"
      name: "Composition du capital"
      version: "2026"
    - id: "2033-G"
      name: "Filiales et participations"
      version: "2026"

filing:
  deadline_resident: "2026-05-15"
  deadline_non_resident: "2026-06-01"
```

---

## 7. Jeu de données de test (`backend/tests/fixtures/sample_dataset.json`)

```json
{
  "description": "Propriétaire d'un studio à Paris, acheté en 2022, loué depuis jan 2023",
  "property": {
    "name": "Studio Oberkampf",
    "address": "42 rue Oberkampf, 75011 Paris",
    "acquisition_date": "2022-06-15",
    "total_price": 180000,
    "land_value": 27000,
    "building_value": 126000,
    "furniture_value": 18000,
    "acquisition_costs": 9000
  },
  "fiscal_year": 2025,
  "revenues": [
    {"month": 1, "amount": 850, "type": "loyer"},
    {"month": 2, "amount": 850, "type": "loyer"},
    {"month": 3, "amount": 850, "type": "loyer"},
    {"month": 4, "amount": 850, "type": "loyer"},
    {"month": 5, "amount": 850, "type": "loyer"},
    {"month": 6, "amount": 900, "type": "loyer"},
    {"month": 7, "amount": 900, "type": "loyer"},
    {"month": 8, "amount": 900, "type": "loyer"},
    {"month": 9, "amount": 900, "type": "loyer"},
    {"month": 10, "amount": 900, "type": "loyer"},
    {"month": 11, "amount": 900, "type": "loyer"},
    {"month": 12, "amount": 900, "type": "loyer"}
  ],
  "expenses": [
    {"date": "2025-01-15", "amount": 3200, "category": "loan_interest", "description": "Intérêts emprunt jan-déc"},
    {"date": "2025-03-10", "amount": 850, "category": "property_tax", "description": "Taxe foncière 2025"},
    {"date": "2025-06-01", "amount": 420, "category": "insurance", "description": "Assurance PNO"},
    {"date": "2025-09-15", "amount": 1200, "category": "maintenance", "description": "Remplacement chauffe-eau"},
    {"date": "2025-12-01", "amount": 380, "category": "management_fees", "description": "Frais agence T4"}
  ],
  "expected_results": {
    "total_revenue": 10600,
    "total_expenses": 6050,
    "result_before_depreciation": 4550,
    "annual_depreciation_building": 2520,
    "annual_depreciation_furniture": 1800,
    "annual_depreciation_costs": 900,
    "total_deductible_depreciation": 4550,
    "fiscal_result": 0,
    "carried_over_depreciation": 670
  }
}
```

---

## 8. Déploiement Docker

### 8.1 `docker-compose.yml`

```yaml
version: '3.9'

services:
  backend:
    build: ./backend
    container_name: lmnp-backend
    restart: unless-stopped
    environment:
      - DATABASE_URL=sqlite:////data/lmnp.db
      - FISCAL_CONSTANTS_PATH=/app/fiscal_constants
      - SECRET_KEY=${SECRET_KEY:-changeme-in-production}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
    volumes:
      - lmnp_data:/data
      - ./fiscal_constants:/app/fiscal_constants:ro
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build: ./frontend
    container_name: lmnp-frontend
    restart: unless-stopped
    environment:
      - VITE_API_URL=http://localhost:8000
    ports:
      - "3000:80"
    depends_on:
      backend:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    container_name: lmnp-nginx
    restart: unless-stopped
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
    depends_on:
      - frontend
      - backend

volumes:
  lmnp_data:
    driver: local
```

### 8.2 `Makefile`

```makefile
.PHONY: up down build test lint migrate seed

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

test:
	docker compose run --rm backend pytest tests/ -v
	docker compose run --rm frontend npm run test

lint:
	docker compose run --rm backend ruff check app/
	docker compose run --rm frontend npm run lint

migrate:
	docker compose run --rm backend alembic upgrade head

seed:
	docker compose run --rm backend python -m app.db.seed

logs:
	docker compose logs -f

shell-backend:
	docker compose exec backend bash

shell-frontend:
	docker compose exec frontend sh
```

### 8.3 Instructions de démarrage rapide

```bash
# 1. Cloner le dépôt
git clone https://github.com/<org>/lmnp-open source
cd lmnp-open-source

# 2. Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env : SECRET_KEY, ANTHROPIC_API_KEY (optionnel)

# 3. Construire et démarrer
make build
make migrate
make up

# 4. Accéder à l'application
# Frontend : http://localhost:3000
# API docs : http://localhost:8000/docs

# 5. (Optionnel) Charger le jeu de données de test
make seed
```

---

## 9. Maintenance et mises à jour

### 9.1 Mise à jour annuelle des barèmes fiscaux

1. Créer `fiscal_constants/AAAA.yaml` en copiant l'année précédente
2. Mettre à jour les seuils, abattements et informations des CERFA
3. Mettre à jour les gabarits PDF dans `backend/app/core/cerfa_templates/`
4. Exécuter la suite de tests : `make test`
5. Tagger la version : `git tag v<AAAA>.0.0`

### 9.2 Mise à jour des formulaires CERFA

- Les formulaires CERFA sont disponibles sur service-public.fr
- Les gabarits PDF sont stockés dans `backend/app/assets/cerfa/`
- Les champs sont mappés dans des fichiers de configuration JSON dédiés
- En cas de changement de structure, mettre à jour le mapping et les tests

### 9.3 Sauvegarde des données utilisateur

- Les données sont dans le volume Docker `lmnp_data`
- Sauvegarder régulièrement : `docker run --rm -v lmnp_data:/data -v $(pwd):/backup alpine tar czf /backup/lmnp_backup_$(date +%Y%m%d).tar.gz /data`

### 9.4 Gestion des migrations de base de données

- Utiliser Alembic pour toutes les migrations : `docker compose run --rm backend alembic revision --autogenerate -m "description"`
- Ne jamais modifier les migrations existantes une fois en production
- Tester la migration sur une copie de la DB avant de l'appliquer

---

## 10. Suivi de progression (`PROGRESS.md`)

> Ce fichier est créé et maintenu automatiquement par Claude Code. Il doit être mis à jour après chaque session de développement.

```markdown
# PROGRESS.md — Suivi d'avancement LMNP

Dernière mise à jour : [DATE]

## Phases complétées
- [ ] Phase 0 : Initialisation du projet (structure, Docker, CI)
- [ ] Phase 1 : Saisie guidée (biens, revenus, charges)
- [ ] Phase 2 : Moteur comptable (amortissements, grand livre, comparatif)
- [ ] Phase 3 : Liasse fiscale (2031, 2033-A à G, PDF, XML)
- [ ] Phase 4 : Assistant fiscal (vérifications, suggestions, aide)
- [ ] Phase 5 : Sauvegarde et export
- [ ] Phase 6 : Interface utilisateur (design, accessibilité, wizard)
- [ ] Phase 7 : Bonus (IA, API impots.gouv)

## Prochaine tâche
[À remplir par Claude Code]

## Blocages en cours
[À remplir si applicable]

## Tests passants
[Liste des tests verts]

## Tests échoués
[Liste des tests rouges avec raison]
```

---

## 11. Règles de développement pour Claude Code

1. **Toujours commencer par lire `PROGRESS.md`** pour savoir où reprendre.
2. **Mettre à jour `PROGRESS.md`** à la fin de chaque session ou tâche complétée.
3. **Ne jamais marquer une phase comme complète** sans avoir tous ses tests au vert.
4. **Utiliser Docker exclusivement** pour exécuter les tests, les migrations et le serveur de développement. Ne pas installer de dépendances localement.
5. **Committer fréquemment** avec des messages de commit conventionnels (`feat:`, `fix:`, `test:`, `chore:`).
6. **Respecter les constantes fiscales** du fichier YAML versionné — ne jamais hardcoder de valeurs fiscales dans le code.
7. **Documenter tout écart légal** en commentaire avec référence à l'article du CGI concerné.
8. **Ne jamais contourner les tests** — si un test échoue, corriger le code, pas le test (sauf si le test est manifestement incorrect).
9. **Itérer jusqu'à complétion totale** — toutes les phases doivent être implémentées, tous les tests doivent passer avant de considérer le projet terminé.

---

## 12. Checklist de validation finale

Avant de considérer le projet prêt pour une première release :

- [ ] Tous les tests unitaires backend passent (`pytest` à 100 %)
- [ ] Tous les tests unitaires frontend passent (`vitest` à 100 %)
- [ ] Tests E2E Playwright : parcours complet du wizard sans erreur
- [ ] Liasse fiscale générée conforme au CERFA officiel (vérification manuelle)
- [ ] XML exporté valide contre le schéma XSD EDI-TDFC
- [ ] Score Lighthouse ≥ 90 sur toutes les métriques
- [ ] Aucune vulnérabilité critique dans les dépendances (`pip audit`, `npm audit`)
- [ ] Documentation README complète
- [ ] Jeu de données de test seed fonctionnel
- [ ] Déploiement fresh depuis zéro documenté et testé
- [ ] `PROGRESS.md` indique 100 % des phases complétées
