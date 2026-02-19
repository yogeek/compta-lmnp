# LMNP Réel — Application de déclaration fiscale

Application open-source pour déclarer les revenus locatifs meublés au **régime réel simplifié (LMNP)**.

## Fonctionnalités

- Gestion des biens immobiliers avec décomposition patrimoniale (terrain / bâtiment / mobilier / frais)
- Saisie des revenus locatifs mensuels
- Saisie des charges déductibles (avec catégories et descriptions)
- Plans d'amortissement par composant avec prorata temporis automatique
- Calcul du résultat fiscal (bénéfice ou déficit reportable)
- Validation des données avant déclaration
- Export PDF, XML CERFA 2033 (liasse fiscale LMNP)
- Assistant guidé pas-à-pas (wizard)
- Estimation de la valeur vénale via DVF officiel (CEREMA) et outils tiers
- Sélecteur de situation fiscale (achat direct / bien converti / passage Micro→Réel)
- Tableaux de bord avec alertes fiscales (terrain < 15 %, décomposition incomplète…)

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend   | FastAPI + SQLAlchemy + SQLite |
| Frontend  | React 18 + TypeScript + Vite + TailwindCSS |
| Infra     | Docker Compose |

## Lancement rapide

### Prérequis
- Docker & Docker Compose
- `gh` CLI (GitHub CLI) pour la gestion du dépôt

### Démarrer l'application

```bash
make up
# ou
docker compose up -d
```

- Frontend : http://localhost:3000
- Backend API : http://localhost:8000
- Docs API (Swagger) : http://localhost:8000/docs

### Commandes utiles

```bash
make build          # Rebuild toutes les images
make test           # Lancer tous les tests
make test-backend   # Tests backend uniquement (pytest)
make test-frontend  # Tests frontend uniquement (vitest)
make lint           # Lint backend (ruff) + frontend (eslint)
make logs           # Suivre les logs
make backup         # Sauvegarder la base SQLite
make clean          # Supprimer containers + volumes
```

## Structure du projet

```
.
├── backend/
│   ├── app/
│   │   ├── api/          # Routes FastAPI (properties, revenues, expenses, depreciation, fiscal)
│   │   ├── core/         # Moteur comptable, amortissements, générateur CERFA, validateur
│   │   ├── db/           # Modèles SQLAlchemy, session, seed
│   │   ├── models/       # Schémas Pydantic
│   │   └── utils/        # Chargeur de constantes fiscales (YAML)
│   ├── fiscal_constants/ # Barèmes fiscaux par année (2025.yaml, 2026.yaml…)
│   └── tests/            # Tests pytest (55 tests)
├── frontend/
│   └── src/
│       ├── components/   # Layout, Tooltip
│       ├── pages/        # Dashboard, Properties, Revenues, Expenses, Depreciation, Export…
│       ├── lib/          # Client API axios
│       └── store/        # État global Zustand (année, bien sélectionné)
├── fiscal_constants/     # Constantes fiscales partagées (lien symbolique ou copie)
├── nginx/                # Config nginx reverse proxy
├── docker-compose.yml
└── Makefile
```

## Constantes fiscales

Les barèmes sont dans `backend/fiscal_constants/{année}.yaml`. Pour ajouter une nouvelle année fiscale, dupliquer le fichier de l'année précédente et mettre à jour les taux.

## Tests

```bash
# Backend (depuis la racine)
docker compose run --rm backend pytest tests/ -v

# Frontend
docker compose run --rm frontend npm run test -- --run
```

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | URL de l'API backend |
| `FISCAL_YEAR` | Année courante | Année fiscale active |
| `FISCAL_CONSTANTS_PATH` | `fiscal_constants/` | Chemin vers les YAML de barèmes |

## Contribuer

Les contributions sont bienvenues ! Ouvrir une issue ou une PR.

## Licence

MIT
