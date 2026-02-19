# PROGRESS.md — Suivi d'avancement LMNP

Dernière mise à jour : 2026-02-19

## Phases complétées
- [x] Phase 0 : Initialisation du projet (structure, Docker, CI)
- [x] Phase 1 : Saisie guidée (biens, revenus, charges) — API + modèles
- [x] Phase 2 : Moteur comptable (amortissements, grand livre, comparatif)
- [x] Phase 3 : Liasse fiscale (2031, 2033-A à G, PDF, XML, ZIP)
- [x] Phase 4 : Assistant fiscal (vérifications, suggestions, aide contextuelle, FAQ)
- [x] Phase 5 : Sauvegarde SQLite (Docker volume persistant)
- [x] Phase 6 : Interface utilisateur React (dashboard, wizard, toutes pages)
- [x] Phase 6.1 : UX améliorée (décomposition patrimoniale %, remplissage rapide revenus, auto-amortissement, progression déclaration)
- [ ] Phase 7 : Bonus (IA assistant avec clé API, API impots.gouv)

## Tests passants
- 55/55 tests backend (pytest) ✅
- Frontend build TypeScript OK ✅
- Stack Docker Compose démarrée OK ✅
- Smoke test end-to-end (property → revenues → expenses → depreciation → fiscal summary → PDF/XML/ZIP) ✅

## Tests à compléter
- [ ] Tests Vitest frontend (unitaires)
- [ ] Tests Playwright E2E

## Prochaine tâche
Phase 7 optionnelle — Assistant IA (nécessite ANTHROPIC_API_KEY)
Ou amélioration continue des formulaires CERFA (fidélité accrue au CERFA officiel 2026)

## Blocages en cours
Aucun

## URLs locales
- Frontend : http://localhost:3000
- Backend API : http://localhost:8000
- API Docs (Swagger) : http://localhost:8000/docs
