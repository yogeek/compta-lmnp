import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, TrendingUp, Receipt, FileText, ArrowRight,
  AlertCircle, CheckCircle, Circle, BarChart3, AlertTriangle,
} from "lucide-react";
import {
  propertiesApi, fiscalApi, revenuesApi, expensesApi, depreciationApi,
  type Property, type FiscalSummary,
} from "../lib/api";
import { useLmnpStore } from "../store";

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}

interface StepStatus {
  label: string;
  done: boolean;
  href: string;
  detail?: string;
}

export default function Dashboard() {
  const { selectedYear, selectedPropertyId, setSelectedProperty } = useLmnpStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState<FiscalSummary | null>(null);
  const [validation, setValidation] = useState<{ has_errors: boolean; issues: { level: string; message: string }[] } | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [propertyAlerts, setPropertyAlerts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    propertiesApi.list().then((r) => {
      setProperties(r.data);
      if (r.data.length > 0 && !selectedPropertyId) {
        setSelectedProperty(r.data[0].id);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) return;

    Promise.all([
      fiscalApi.summary(selectedPropertyId, selectedYear),
      fiscalApi.validate(selectedPropertyId, selectedYear),
      revenuesApi.list(selectedPropertyId, selectedYear),
      expensesApi.list(selectedPropertyId, selectedYear),
      depreciationApi.list(selectedPropertyId, selectedYear),
    ])
      .then(([s, v, rev, exp, dep]) => {
        setSummary(s.data);
        setValidation(v.data);

        const prop = properties.find((p) => p.id === selectedPropertyId);
        const revenueCount = rev.data.filter((r) => r.amount > 0).length;
        const expCount = exp.data.length;
        const depCount = dep.data.length;
        const allocated = prop
          ? prop.land_value + prop.building_value + prop.furniture_value + prop.acquisition_costs
          : 0;
        const decomposed =
          prop != null &&
          Math.abs(prop.total_price - allocated) < 1 &&
          prop.total_price > 0;
        const landPct = prop && prop.total_price > 0 ? (prop.land_value / prop.total_price) * 100 : 0;

        // Compute property-level alerts surfaced to dashboard
        const alerts: string[] = [];
        if (prop && landPct > 0 && landPct < 15) {
          alerts.push(
            `Terrain à ${landPct.toFixed(1)} % du prix total (${prop.name}) — une valeur inférieure à 15–20 % peut être contestée lors d'un contrôle fiscal. Vérifiez avec un notaire.`
          );
        }
        if (prop && prop.total_price > 0 && !decomposed && allocated < prop.total_price - 1) {
          const unventilated = prop.total_price - allocated;
          alerts.push(
            `Décomposition patrimoniale incomplète (${prop.name}) : ${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(unventilated)} non ventilé(s). Chaque euro non ventilé est non amortissable.`
          );
        }
        setPropertyAlerts(alerts);

        setSteps([
          {
            label: "Bien immobilier créé",
            done: true,
            href: "/properties",
            detail: prop ? prop.name : undefined,
          },
          {
            label: "Décomposition patrimoniale complète",
            done: decomposed,
            href: "/properties",
            detail: decomposed ? "Terrain + bâtiment + mobilier + frais ventilés" : "Répartissez le prix total entre les composants",
          },
          {
            label: "Revenus saisis",
            done: revenueCount > 0,
            href: "/revenues",
            detail: revenueCount > 0 ? `${revenueCount} mois renseignés — ${formatEuro(s.data.total_revenue)} au total` : "Aucun loyer saisi pour cette année",
          },
          {
            label: "Charges saisies",
            done: expCount > 0,
            href: "/expenses",
            detail: expCount > 0 ? `${expCount} charge(s) — ${formatEuro(s.data.total_expenses)} déductible(s)` : "Aucune charge enregistrée",
          },
          {
            label: "Amortissements configurés",
            done: depCount > 0,
            href: "/depreciation",
            detail: depCount > 0 ? `${depCount} composant(s)` : "Aucun plan d'amortissement",
          },
          {
            label: "Déclaration prête à exporter",
            done: !v.data.has_errors && revenueCount > 0 && depCount > 0,
            href: "/export",
            detail: v.data.has_errors ? "Des erreurs de validation doivent être corrigées" : "PDF, XML et liasse disponibles",
          },
        ]);
      })
      .catch(() => {
        setSummary(null);
        setValidation(null);
      });
  }, [selectedPropertyId, selectedYear, properties]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Bienvenue sur LMNP Réel</h2>
          <p className="text-gray-600 mb-6">
            Application open-source pour déclarer vos revenus locatifs meublés au régime réel simplifié.
            Commencez par ajouter votre premier bien immobilier.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/wizard" className="btn-primary">
              Démarrer pas à pas <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/properties" className="btn-secondary">
              Ajouter un bien
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const doneCount = steps.filter((s) => s.done).length;
  const progressPct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Tableau de bord — {selectedYear}</h2>
        <p className="text-gray-500 mt-1">Vue d'ensemble de votre déclaration LMNP</p>
      </div>

      {/* Property selector */}
      {properties.length > 1 && (
        <div className="mb-6">
          <label className="form-label">Bien sélectionné</label>
          <select
            value={selectedPropertyId ?? ""}
            onChange={(e) => setSelectedProperty(Number(e.target.value))}
            className="form-input max-w-xs"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* KPI cards */}
        {summary && (
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            <div className="card">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Revenus</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatEuro(summary.total_revenue)}</p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <Receipt className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Charges</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatEuro(summary.total_expenses)}</p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <BarChart3 className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Amort. déduits</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatEuro(summary.total_depreciation_deductible)}</p>
            </div>
            <div className="card">
              <div
                className="flex items-center gap-2 mb-2"
                style={{ color: summary.fiscal_result >= 0 ? "#16a34a" : "#dc2626" }}
              >
                <FileText className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Résultat fiscal</span>
              </div>
              <p className={`text-2xl font-bold ${summary.fiscal_result >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatEuro(summary.fiscal_result)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {summary.fiscal_result <= 0 ? "Déficit reportable" : "Bénéfice imposable"}
              </p>
            </div>
          </div>
        )}

        {/* Completion checklist */}
        {steps.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">Progression</h3>
              <span className="text-xs font-bold text-primary-600">{progressPct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progressPct === 100 ? "bg-green-500" : "bg-primary-500"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ul className="space-y-2.5">
              {steps.map((step, i) => (
                <li key={i}>
                  <Link
                    to={step.href}
                    className="flex items-start gap-2 group"
                  >
                    {step.done ? (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`text-xs font-medium group-hover:text-primary-600 ${step.done ? "text-gray-700" : "text-gray-400"}`}>
                        {step.label}
                      </p>
                      {step.detail && (
                        <p className={`text-xs ${step.done ? "text-gray-400" : "text-amber-600"}`}>
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Validation status */}
      {validation && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-3">
            {validation.has_errors ? (
              <AlertCircle className="w-5 h-5 text-red-500" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
            <h3 className="font-semibold text-gray-900">
              {validation.has_errors ? "Erreurs détectées" : "Déclaration valide"}
            </h3>
          </div>
          {validation.issues.length > 0 ? (
            <ul className="space-y-2">
              {validation.issues.map((issue, i) => (
                <li
                  key={i}
                  className={`text-sm px-3 py-2 rounded-lg ${
                    issue.level === "error"
                      ? "bg-red-50 text-red-700"
                      : issue.level === "warning"
                      ? "bg-yellow-50 text-yellow-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">Aucun problème détecté pour {selectedYear}.</p>
          )}
        </div>
      )}

      {/* Property-level alerts (terrain %, decomposition) */}
      {propertyAlerts.length > 0 && (
        <div className="card mb-6 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900">
              Alertes sur le bien sélectionné
            </h3>
            <Link to="/properties" className="ml-auto text-xs text-primary-600 hover:underline font-medium">
              Aller aux biens →
            </Link>
          </div>
          <ul className="space-y-2">
            {propertyAlerts.map((alert, i) => (
              <li key={i} className="text-sm px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Saisir revenus", href: "/revenues", icon: TrendingUp, color: "text-green-600" },
          { label: "Saisir charges", href: "/expenses", icon: Receipt, color: "text-red-600" },
          { label: "Amortissements", href: "/depreciation", icon: BarChart3, color: "text-blue-600" },
          { label: "Exporter liasse", href: "/export", icon: ArrowRight, color: "text-primary-600" },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link key={href} to={href} className="card hover:shadow-md transition-shadow cursor-pointer group">
            <Icon className={`w-6 h-6 ${color} mb-2`} />
            <p className="text-sm font-medium text-gray-700 group-hover:text-primary-600">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
