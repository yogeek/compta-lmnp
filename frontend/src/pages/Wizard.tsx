import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { useLmnpStore } from "../store";
import clsx from "clsx";

const STEPS = [
  {
    id: 0,
    title: "Bienvenue",
    subtitle: "Comprendre le régime réel LMNP",
  },
  {
    id: 1,
    title: "Votre bien",
    subtitle: "Créez votre bien immobilier",
    href: "/properties",
  },
  {
    id: 2,
    title: "Revenus",
    subtitle: "Saisissez vos loyers",
    href: "/revenues",
  },
  {
    id: 3,
    title: "Charges",
    subtitle: "Déduisez vos charges",
    href: "/expenses",
  },
  {
    id: 4,
    title: "Amortissements",
    subtitle: "Décomposez votre bien",
    href: "/depreciation",
  },
  {
    id: 5,
    title: "Vérification",
    subtitle: "Contrôles de cohérence",
    href: "/summary",
  },
  {
    id: 6,
    title: "Export",
    subtitle: "Téléchargez votre liasse",
    href: "/export",
  },
];

const STEP_CONTENT = [
  {
    title: "Bienvenue dans LMNP Réel",
    body: `Le régime LMNP (Loueur Meublé Non Professionnel) réel simplifié vous permet de déduire vos charges réelles et d'amortir votre bien immobilier, ce qui est souvent plus avantageux que le régime Micro-BIC.

Ce guide vous accompagne pas à pas pour :
• Saisir vos revenus locatifs de l'année
• Déclarer toutes vos charges déductibles
• Calculer vos amortissements
• Générer la liasse fiscale complète (CERFA 2031 + 2033)

⚠️ Ces informations sont à titre indicatif. Consultez un expert-comptable pour votre situation personnelle.`,
  },
  {
    title: "Étape 1 — Créez votre bien",
    body: `Renseignez les informations patrimoniales de votre bien :

• Adresse et date d'acquisition
• Prix total (acte notarié)
• Décomposition : terrain / bâtiment / mobilier / frais d'acquisition

💡 Le terrain n'est jamais amortissable. Indiquez sa valeur avec précision.
💡 La décomposition en composants (bâtiment, toiture, équipements, mobilier) permet d'optimiser vos amortissements annuels.`,
  },
  {
    title: "Étape 2 — Revenus locatifs",
    body: `Saisissez vos loyers mois par mois pour l'exercice fiscal sélectionné.

• Loyers nus ou charges comprises
• Indemnités d'assurance le cas échéant

💡 Si le bien était vacant un mois, saisissez 0 €. Cela permet de valider que l'exercice est complet.`,
  },
  {
    title: "Étape 3 — Charges déductibles",
    body: `Toutes les charges liées à votre bien meublé sont déductibles :

• Intérêts d'emprunt (réf. CGI art. 39-1-3°)
• Taxe foncière (réf. CGI art. 39-1-4°)
• Primes d'assurance PNO
• Frais de gestion locative
• Travaux d'entretien et réparation
• Charges de copropriété non récupérables
• CFE (Cotisation Foncière des Entreprises)

💡 Conservez vos justificatifs pendant 6 ans.`,
  },
  {
    title: "Étape 4 — Amortissements",
    body: `L'amortissement est la déduction progressive de la valeur de votre bien sur sa durée d'utilisation.

Composants typiques :
• Structure / Gros œuvre : 50 ans
• Toiture : 25 ans
• Équipements : 10 ans
• Mobilier : 7 ans
• Frais d'acquisition : 5 ans

⚠️ Le terrain ne s'amortit jamais.
💡 L'excédent d'amortissement (si > résultat) est reporté sans limite de durée.`,
  },
  {
    title: "Étape 5 — Vérification",
    body: `Avant d'exporter, vérifiez la cohérence de votre déclaration :

• Bilan équilibré (actif = passif)
• Absence de revenus négatifs
• Exercice complet (12 mois)
• Plan d'amortissement présent

L'application détecte automatiquement les incohérences et vous propose des suggestions d'optimisation.`,
  },
  {
    title: "Étape 6 — Export",
    body: `Votre liasse fiscale est prête ! Vous pouvez télécharger :

• Formulaire 2031 (déclaration de résultats BIC)
• Formulaires 2033-A à 2033-G (annexes)
• Export XML compatible impots.gouv.fr
• Fiche récapitulative pour archivage

📤 Pour déposer sur impots.gouv.fr : connectez-vous à votre espace professionnel et importez l'XML dans la rubrique "Déclaration de résultats".`,
  },
];

export default function Wizard() {
  const navigate = useNavigate();
  const { wizardStep, setWizardStep, setWizardCompleted } = useLmnpStore();
  const [localStep, setLocalStep] = useState(wizardStep);

  const isLast = localStep === STEPS.length - 1;

  const goNext = () => {
    const next = localStep + 1;
    if (next >= STEPS.length) {
      setWizardCompleted(true);
      const step = STEPS[localStep];
      if (step.href) navigate(step.href);
    } else {
      setLocalStep(next);
      setWizardStep(next);
      if (STEPS[next].href) navigate(STEPS[next].href);
    }
  };

  const goPrev = () => {
    if (localStep > 0) {
      const prev = localStep - 1;
      setLocalStep(prev);
      setWizardStep(prev);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Guide pas à pas</h2>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => { setLocalStep(i); setWizardStep(i); }}
              className={clsx(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                i < localStep ? "bg-green-500 text-white" :
                i === localStep ? "bg-primary-600 text-white" :
                "bg-gray-200 text-gray-500"
              )}
            >
              {i < localStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={clsx("w-8 h-0.5 mx-1", i < localStep ? "bg-green-400" : "bg-gray-200")} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="card mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{STEP_CONTENT[localStep].title}</h3>
        <p className="text-gray-600 whitespace-pre-wrap leading-relaxed text-sm">
          {STEP_CONTENT[localStep].body}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={goPrev}
          disabled={localStep === 0}
          className="btn-secondary"
        >
          <ChevronLeft className="w-4 h-4" /> Précédent
        </button>
        <div className="text-sm text-gray-500 self-center">
          Étape {localStep + 1} / {STEPS.length}
        </div>
        <button onClick={goNext} className="btn-primary">
          {isLast ? "Terminer" : "Suivant"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
